import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import {
  AppError,
  isAppError,
  errorBody,
  okBody,
  newRequestId,
  createLogger,
  effectiveMax
} from '@publication-prepare/core'
import { authOptions } from './auth'
import { limiterFor, clientIpFromHeaders, trustProxy } from './rateLimitStore'

const logger = createLogger()

const MAX_JSON_BYTES = 1024 * 1024

// X-Forwarded-For HANYA dipercaya bila TRUST_PROXY=true (lihat core resolveClientIp); tanpa itu semua klien berbagi bucket.
export function clientIp(request) {
  return clientIpFromHeaders((n) => request.headers.get(n))
}

// Async: store batas laju dapat berupa Redis (opsional). Selalu `await` pada pemanggilan.
export async function enforceLimit({ name, key, windowMs, max }) {
  const limit = effectiveMax(key, max) // kunci 'unknown' mewakili semua klien: batas diskalakan
  const limiter = await limiterFor({ name, windowMs, max: limit })
  const res = await limiter.check(key)
  if (!res.allowed) {
    throw new AppError('RATE_LIMITED', 'Terlalu banyak permintaan. Coba lagi beberapa saat lagi.', {
      details: { retryAfterSec: Math.ceil(res.retryAfterMs / 1000) }
    })
  }
}

// Batas ukuran ditegakkan pada byte yang BENAR-BENAR dibaca (bukan hanya Content-Length, QA-11): aliran dihentikan saat melewati batas.
async function readBodyText(request, maxBytes) {
  const declared = Number(request.headers.get('content-length') || 0)
  if (declared > maxBytes) throw new AppError('PAYLOAD_TOO_LARGE', 'Ukuran permintaan terlalu besar')
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      try { await reader.cancel() } catch { /* aliran sudah tertutup */ }
      throw new AppError('PAYLOAD_TOO_LARGE', 'Ukuran permintaan terlalu besar')
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8').replace(/^﻿/, '') // BOM tidak boleh merusak JSON (perilaku request.json() sebelumnya)
}

// Pemeriksaan Origin (QA-18): permintaan pengubah-status dari browser dengan Origin asing ditolak. Tanpa header Origin
// (klien non-browser, webhook server-ke-server) diizinkan; cookie SameSite=Lax tetap menjadi lapisan pertama.
function assertSameOrigin(request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return
  const origin = request.headers.get('origin')
  if (!origin) return
  let host
  try { host = new URL(origin).host } catch { throw new AppError('FORBIDDEN', 'Origin tidak valid') }
  const own = (trustProxy() && request.headers.get('x-forwarded-host')) || request.headers.get('host')
  const extra = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)
  if (host === own || extra.includes(origin)) return
  throw new AppError('FORBIDDEN', 'Permintaan lintas-origin ditolak')
}

export async function readJson(request, maxBytes = MAX_JSON_BYTES) {
  let body
  try {
    body = JSON.parse(await readBodyText(request, maxBytes))
  } catch (err) {
    if (err instanceof AppError) throw err
    throw new AppError('VALIDATION_ERROR', 'Body harus berupa JSON yang valid')
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError('VALIDATION_ERROR', 'Body harus berupa objek JSON')
  }
  return body
}

export const created = (data) => ({ __status: 201, __data: data })

// Pembungkus standar semua route: requestId, autentikasi, rate limit, envelope respons, logging.
export function withApi(handler, { auth = true, rateLimit } = {}) {
  return async function route(request, context) {
    const requestId = newRequestId()
    const started = Date.now()
    const log = logger.child({ requestId, method: request.method, path: new URL(request.url).pathname })
    let response

    try {
      let session = null
      if (auth) {
        session = await getServerSession(authOptions)
        if (!session?.user?.id) throw new AppError('UNAUTHENTICATED', 'Belum login')
      }
      assertSameOrigin(request)
      const ip = clientIp(request)
      if (rateLimit) await enforceLimit({ ...rateLimit, key: session?.user?.id || ip })

      const params = context?.params ? await context.params : {}
      const result = await handler({ request, params, session, requestId, log, ip })

      if (result instanceof Response) {
        response = result
      } else if (result && result.__status) {
        response = NextResponse.json(okBody(result.__data, requestId), { status: result.__status })
      } else {
        response = NextResponse.json(okBody(result, requestId))
      }
    } catch (err) {
      const { status, body } = errorBody(err, requestId)
      if (!isAppError(err) || status >= 500) log.error('request_failed', { err })
      response = NextResponse.json(body, { status })
      if (isAppError(err) && err.code === 'RATE_LIMITED' && err.details?.retryAfterSec) {
        response.headers.set('Retry-After', String(err.details.retryAfterSec))
      }
    }

    response.headers.set('x-request-id', requestId)
    log.info('request', { status: response.status, ms: Date.now() - started })
    return response
  }
}
