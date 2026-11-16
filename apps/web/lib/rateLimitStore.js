import { createRateLimiter, createRedisRateLimiter, createResilientLimiter, createLogger, resolveClientIp } from '@publication-prepare/core'

// Fabrik batas laju (QA-05): memory per proses (default) atau Redis bila REDIS_URL diisi dan paket `ioredis` terpasang.
// Redis gagal/tidak tersedia -> jatuh ke memory per instance (dicatat; batas efektif menjadi N x). Pemakaian Redis NYATA
// TIDAK DIVERIFIKASI di repo ini (hanya klien palsu pada tes core); `ioredis` sengaja bukan dependensi wajib.
const log = createLogger()
let redisPromise

function getRedis() {
  if (!process.env.REDIS_URL) return Promise.resolve(null)
  if (!redisPromise) {
    redisPromise = (async () => {
      try {
        const mod = await import(/* webpackIgnore: true */ 'ioredis')
        const IORedis = mod.default || mod
        const client = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false })
        client.on('error', () => {})
        return client
      } catch (err) {
        log.warn('redis_unavailable_using_memory', { err })
        return null
      }
    })()
  }
  return redisPromise
}

// Cache menyimpan PROMISE (bukan instance) agar dua pemanggilan pertama yang bersamaan memakai limiter yang sama;
// kunci mencakup konfigurasi sehingga nama yang sama dengan jendela/batas berbeda tidak saling menimpa.
const cache = new Map()
export function limiterFor({ name, windowMs, max }) {
  const id = `${name}|${windowMs}|${max}`
  if (!cache.has(id)) {
    cache.set(id, (async () => {
      const memory = createRateLimiter({ windowMs, max })
      const client = await getRedis()
      return client
        ? createResilientLimiter({ primary: createRedisRateLimiter({ client, windowMs, max, prefix: `pp:rl:${name}` }), fallback: memory, onError: (err) => log.warn('redis_ratelimit_error', { err }) })
        : memory
    })())
  }
  return cache.get(id)
}

export const trustProxy = () => process.env.TRUST_PROXY === 'true'
export const proxyHops = () => Math.max(1, Number.parseInt(process.env.TRUST_PROXY_HOPS || '1', 10) || 1)

// Alamat klien dari objek header serupa Headers (get) atau objek Node (properti huruf kecil).
export function clientIpFromHeaders(get) {
  return resolveClientIp({ forwardedFor: get('x-forwarded-for'), realIp: get('x-real-ip'), trustProxy: trustProxy(), hops: proxyHops() })
}
