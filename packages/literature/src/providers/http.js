'use strict'

// Galat provider yang sudah dinormalisasi. code: PROVIDER_TIMEOUT | PROVIDER_RATE_LIMITED | PROVIDER_ERROR
class LiteratureProviderError extends Error {
  constructor(provider, code, message, { retryable = false } = {}) {
    super(message)
    this.name = 'LiteratureProviderError'
    this.provider = provider
    this.code = code
    this.retryable = retryable
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Klien HTTP JSON dengan timeout, retry terbatas, jarak minimum antar permintaan (rate limit sopan), dan cache TTL.
// fetchFn dapat diganti pada tes. Tidak pernah memanggil jaringan kecuali dipanggil oleh adapter nyata.
function createHttp({ provider, fetchFn = (...a) => fetch(...a), timeoutMs = 8000, retries = 1, minIntervalMs = 0, cacheTtlMs = 0, userAgent, sleepFn = sleep, now = () => Date.now() }) {
  const cache = new Map()
  let nextSlot = 0

  async function throttle() {
    if (!minIntervalMs) return
    const t = now()
    const wait = Math.max(0, nextSlot - t)
    nextSlot = Math.max(t, nextSlot) + minIntervalMs
    if (wait) await sleepFn(wait)
  }

  // Mengembalikan JSON, atau null untuk 404. Galat lain dilempar sebagai LiteratureProviderError.
  async function getJson(url, { headers = {} } = {}) {
    if (cacheTtlMs) {
      const hit = cache.get(url)
      if (hit && hit.expires > now()) return hit.value
    }
    let lastErr
    for (let attempt = 0; attempt <= retries; attempt++) {
      await throttle()
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), timeoutMs)
      try {
        const res = await fetchFn(url, { headers: { Accept: 'application/json', ...(userAgent ? { 'User-Agent': userAgent } : {}), ...headers }, signal: ac.signal })
        if (res.status === 404) return null
        if (res.status === 429) {
          lastErr = new LiteratureProviderError(provider, 'PROVIDER_RATE_LIMITED', `${provider} membatasi permintaan`, { retryable: true })
          const ra = Number(res.headers && res.headers.get && res.headers.get('retry-after'))
          if (attempt < retries) await sleepFn(Math.min(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1000, 5000))
          continue
        }
        if (res.status >= 500) {
          lastErr = new LiteratureProviderError(provider, 'PROVIDER_ERROR', `${provider} mengalami gangguan (${res.status})`, { retryable: true })
          continue
        }
        if (!res.ok) throw new LiteratureProviderError(provider, 'PROVIDER_ERROR', `${provider} menolak permintaan (${res.status})`)
        const value = await res.json()
        if (cacheTtlMs) {
          if (cache.size >= 500) cache.delete(cache.keys().next().value) // batas ukuran cache (tanpa ini tumbuh tak terbatas)
          cache.set(url, { value, expires: now() + cacheTtlMs })
        }
        return value
      } catch (err) {
        if (err instanceof LiteratureProviderError && !err.retryable) throw err
        if (err && err.name === 'AbortError') lastErr = new LiteratureProviderError(provider, 'PROVIDER_TIMEOUT', `${provider} tidak merespons tepat waktu`, { retryable: true })
        else if (!(err instanceof LiteratureProviderError)) lastErr = new LiteratureProviderError(provider, 'PROVIDER_ERROR', `${provider} tidak dapat dihubungi`, { retryable: true })
        else lastErr = err
      } finally {
        clearTimeout(timer)
      }
    }
    throw lastErr
  }

  return { getJson, _cache: cache }
}

module.exports = { createHttp, LiteratureProviderError }
