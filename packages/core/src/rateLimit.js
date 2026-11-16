// Rate limiter jendela-tetap dengan store yang dapat diganti (antarmuka: check(key) -> hasil, boleh sinkron atau Promise).
//  - createRateLimiter: in-memory, per proses (default). KETERBATASAN: tiap instance punya penghitung sendiri.
//  - createRedisRateLimiter: terbagi antar instance. Klien Redis DIINJEKSI (butuh incr, pexpire, pttl) sehingga paket ini
//    tidak bergantung pustaka tertentu; pemakaian dengan Redis nyata TIDAK DIVERIFIKASI di repo ini (hanya klien palsu).
//  - createResilientLimiter: bila store utama gagal, jatuh ke store cadangan (memory) dan memanggil onError (fail-open terbatas).
// Kunci 'unknown' (tidak ada IP klien tepercaya) mewakili SEMUA klien; batasnya diskalakan agar satu klien tidak mengunci pengguna lain
// dan pengguna sah yang berbeda tetap dapat masuk. Pembatasan per-akun (email) tetap berlaku di lapisan lain.
const UNKNOWN_IP_MULTIPLIER = 50
function effectiveMax(key, max) {
  return /^(ip:)?unknown$/.test(String(key)) ? max * UNKNOWN_IP_MULTIPLIER : max
}

function createRateLimiter({ windowMs, max, now = () => Date.now(), maxKeys = 10000, overflowFactor = 20 }) {
  const hits = new Map() // key -> { count, resetAt }
  let overflow = null // bucket bersama untuk kunci BARU saat tabel penuh (entri aktif tidak pernah dibuang)

  function sweep(t) {
    for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k)
  }

  function take(entry, limit, t) {
    if (entry.count >= limit) return { allowed: false, remaining: 0, retryAfterMs: entry.resetAt - t }
    entry.count += 1
    return { allowed: true, remaining: limit - entry.count, retryAfterMs: 0 }
  }

  function check(key) {
    const t = now()
    let entry = hits.get(key)
    if (!entry || entry.resetAt <= t) {
      if (hits.size >= maxKeys) sweep(t) // hanya entri KEDALUWARSA yang dibuang
      if (hits.size >= maxKeys) {
        // Penuh dengan entri aktif: banjir kunci baru tidak boleh menggusur penghitung korban. Kunci baru berbagi satu bucket luapan.
        if (!overflow || overflow.resetAt <= t) overflow = { count: 0, resetAt: t + windowMs }
        return take(overflow, max * overflowFactor, t)
      }
      entry = { count: 0, resetAt: t + windowMs }
      hits.set(key, entry)
    }
    return take(entry, max, t)
  }

  return { check, _size: () => hits.size }
}

// Skrip Lua atomik: INCR + PEXPIRE (hanya bila belum ada TTL) + PTTL dalam satu round-trip; tidak ada kunci tanpa TTL.
const LUA = "local c=redis.call('INCR',KEYS[1]) local t=redis.call('PTTL',KEYS[1]) if c==1 or t<0 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) t=tonumber(ARGV[1]) end return {c,t}"

function createRedisRateLimiter({ client, windowMs, max, prefix = 'rl' }) {
  async function check(key) {
    const k = `${prefix}:${key}`
    let count
    let ttl
    if (typeof client.eval === 'function') {
      ;[count, ttl] = (await client.eval(LUA, 1, k, String(windowMs))).map(Number)
    } else {
      count = await client.incr(k) // jalur cadangan non-atomik (klien tanpa eval)
      if (count === 1) await client.pexpire(k, windowMs)
      ttl = count > max ? await client.pttl(k) : windowMs
      if (!(ttl > 0)) { await client.pexpire(k, windowMs); ttl = windowMs }
    }
    if (count <= max) return { allowed: true, remaining: max - count, retryAfterMs: 0 }
    return { allowed: false, remaining: 0, retryAfterMs: ttl > 0 ? ttl : windowMs }
  }
  return { check }
}

function createResilientLimiter({ primary, fallback, onError = () => {} }) {
  return {
    async check(key) {
      try {
        return await primary.check(key)
      } catch (err) {
        onError(err)
        return fallback.check(key)
      }
    }
  }
}

module.exports = { createRateLimiter, createRedisRateLimiter, createResilientLimiter, effectiveMax, UNKNOWN_IP_MULTIPLIER }

// Alamat klien untuk kunci batas laju. X-Forwarded-For hanya dipercaya bila TRUST_PROXY=true (aplikasi di belakang proxy yang
// MENAMBAHKAN alamat klien). Entri yang dipakai adalah ke-`hops` dari KANAN (ditambahkan proxy tepercaya), bukan yang paling kiri
// (dapat dipalsukan klien). Tanpa kepercayaan: semua klien berbagi bucket 'unknown' (aman tetapi kasar).
// IPv4-mapped IPv6 (::ffff:1.2.3.4) dan huruf besar/kecil dinormalkan agar satu klien tidak punya banyak kunci.
function normalizeIp(v) {
  return String(v).trim().toLowerCase().replace(/^::ffff:/, '').slice(0, 64)
}

function resolveClientIp({ forwardedFor, realIp, trustProxy = false, hops = 1 }) {
  if (!trustProxy) return 'unknown'
  if (forwardedFor) {
    const parts = String(forwardedFor).split(',').map((p) => p.trim()).filter(Boolean)
    if (parts.length) return normalizeIp(parts[Math.max(0, parts.length - Math.max(1, hops))])
  }
  return (realIp ? normalizeIp(realIp) : '') || 'unknown'
}

module.exports.resolveClientIp = resolveClientIp
