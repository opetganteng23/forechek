// Rate limiter jendela-tetap, in-memory, per proses.
// KETERBATASAN: pada deployment serverless/multi-instance setiap instance punya penghitung sendiri.
// Untuk produksi multi-instance, ganti store dengan Redis/Upstash (antarmuka check(key) tetap sama).
function createRateLimiter({ windowMs, max, now = () => Date.now(), maxKeys = 10000 }) {
  const hits = new Map() // key -> { count, resetAt }

  function sweep(t) {
    if (hits.size < maxKeys) return
    for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k)
    // Bila masih penuh, buang entri tertua agar memori tidak tumbuh tanpa batas.
    while (hits.size >= maxKeys) hits.delete(hits.keys().next().value)
  }

  function check(key) {
    const t = now()
    const entry = hits.get(key)
    if (!entry || entry.resetAt <= t) {
      sweep(t)
      hits.set(key, { count: 1, resetAt: t + windowMs })
      return { allowed: true, remaining: max - 1, retryAfterMs: 0 }
    }
    if (entry.count >= max) {
      return { allowed: false, remaining: 0, retryAfterMs: entry.resetAt - t }
    }
    entry.count += 1
    return { allowed: true, remaining: max - entry.count, retryAfterMs: 0 }
  }

  return { check, _size: () => hits.size }
}

module.exports = { createRateLimiter }
