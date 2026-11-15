import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import {
  AppError,
  isAppError,
  errorBody,
  okBody,
  newRequestId,
  createLogger,
  createRateLimiter
} from '@publication-prepare/core'
import { authOptions } from './auth'

const logger = createLogger()
const limiters = new Map()

const MAX_JSON_BYTES = 1024 * 1024

// Catatan: X-Forwarded-For hanya tepercaya bila aplikasi berjalan di belakang proxy/hosting yang
// menimpanya (mis. Vercel). Jika di-host sendiri, pastikan reverse proxy menetapkan header ini.
export function clientIp(request) {
  const xff = request.headers.get('x-forwarded-for')
  return (xff ? xff.split(',')[0].trim() : request.headers.get('x-real-ip')) || 'unknown'
}

export function enforceLimit({ name, key, windowMs, max }) {
  let limiter = limiters.get(name)
  if (!limiter) {
    limiter = createRateLimiter({ windowMs, max })
    limiters.set(name, limiter)
  }
  const res = limiter.check(key)
  if (!res.allowed) {
    throw new AppError('RATE_LIMITED', 'Terlalu banyak permintaan. Coba lagi beberapa saat lagi.', {
      details: { retryAfterSec: Math.ceil(res.retryAfterMs / 1000) }
    })
  }
}

export async function readJson(request, maxBytes = MAX_JSON_BYTES) {
  const declared = Number(request.headers.get('content-length') || 0)
  if (declared > maxBytes) throw new AppError('PAYLOAD_TOO_LARGE', 'Ukuran permintaan terlalu besar')
  let body
  try {
    body = await request.json()
  } catch {
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
      const ip = clientIp(request)
      if (rateLimit) enforceLimit({ ...rateLimit, key: session?.user?.id || ip })

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
