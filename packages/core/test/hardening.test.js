'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { createRateLimiter, createRedisRateLimiter, createResilientLimiter, bootProblems, assertBootEnv } = require('../index')

function fakeRedis() {
  const kv = new Map()
  const ttl = new Map()
  return {
    kv, ttl,
    async incr(k) { kv.set(k, (kv.get(k) || 0) + 1); return kv.get(k) },
    async pexpire(k, ms) { ttl.set(k, ms); return 1 },
    async pttl(k) { return ttl.has(k) ? ttl.get(k) : -1 }
  }
}

test('Redis limiter: menghitung lintas "instance" yang berbagi klien, memblokir di atas batas, TTL dipasang sekali', async () => {
  const client = fakeRedis()
  const a = createRedisRateLimiter({ client, windowMs: 1000, max: 2 })
  const b = createRedisRateLimiter({ client, windowMs: 1000, max: 2 }) // instance lain, store sama
  assert.equal((await a.check('ip1')).allowed, true)
  assert.equal((await b.check('ip1')).allowed, true)
  const blocked = await a.check('ip1')
  assert.equal(blocked.allowed, false)
  assert.equal(blocked.retryAfterMs, 1000)
  assert.equal((await b.check('ip2')).allowed, true, 'kunci lain tidak terpengaruh')
})

test('Redis limiter: kunci tanpa TTL (crash setelah incr) dipulihkan, tidak mengunci selamanya', async () => {
  const client = fakeRedis()
  client.kv.set('rl:x', 99)
  const l = createRedisRateLimiter({ client, windowMs: 500, max: 2 })
  const r = await l.check('x')
  assert.equal(r.allowed, false)
  assert.equal(client.ttl.get('rl:x'), 500)
})

test('Resilient limiter: store utama gagal -> jatuh ke memory dan melapor; batas tetap ditegakkan', async () => {
  const errors = []
  const primary = { async check() { throw new Error('redis down') } }
  const l = createResilientLimiter({ primary, fallback: createRateLimiter({ windowMs: 1000, max: 1 }), onError: (e) => errors.push(e.message) })
  assert.equal((await l.check('k')).allowed, true)
  assert.equal((await l.check('k')).allowed, false)
  assert.equal(errors.length, 2)
})

test('bootProblems: produksi tanpa env wajib -> error berisi NAMA variabel saja; secret pendek; provider palsu; TRUST_PROXY', () => {
  const p = bootProblems({ NODE_ENV: 'production' })
  for (const n of ['MONGODB_URI', 'NEXTAUTH_SECRET', 'NEXTAUTH_URL', 'BASE_URL']) assert.ok(p.errors.some((e) => e.startsWith(n)), n)
  const ok = { NODE_ENV: 'production', MONGODB_URI: 'mongodb://h/db', NEXTAUTH_SECRET: 'Zk9qLm2VbT7pQw4RxY8nCd6HfJ1sAeUg', NEXTAUTH_URL: 'https://app.example.org', BASE_URL: 'https://app.example.org', TRUST_PROXY: 'true' }
  assert.deepEqual(bootProblems(ok).errors, [])
  assert.ok(bootProblems({ ...ok, NEXTAUTH_SECRET: 'pendek' }).errors.some((e) => /terlalu pendek/.test(e)))
  assert.ok(bootProblems({ ...ok, AI_PROVIDER: 'fake' }).errors.some((e) => /AI_ALLOW_FAKE/.test(e)))
  assert.deepEqual(bootProblems({ ...ok, AI_PROVIDER: 'fake', AI_ALLOW_FAKE: 'true' }).errors, [])
  assert.ok(bootProblems({ ...ok, AI_PROVIDER: 'anthropic' }).errors.some((e) => /ANTHROPIC_API_KEY/.test(e)))
  assert.ok(bootProblems({ ...ok, TRUST_PROXY: 'ya' }).errors.some((e) => /TRUST_PROXY/.test(e)))
  assert.ok(bootProblems(ok).warnings.some((w) => /REDIS_URL/.test(w)) && bootProblems({ ...ok, TRUST_PROXY: 'false' }).warnings.some((w) => /TRUST_PROXY/.test(w)))
  assert.ok(!JSON.stringify(bootProblems({ ...ok, NEXTAUTH_SECRET: 'rahasia-pendek-xyz' })).includes('rahasia-pendek-xyz'), 'nilai tidak pernah dilaporkan')
})

test('assertBootEnv: melempar di produksi saja; non-produksi hanya mengembalikan masalah', () => {
  assert.throws(() => assertBootEnv({ NODE_ENV: 'production' }), /MONGODB_URI/)
  assert.doesNotThrow(() => assertBootEnv({ NODE_ENV: 'development' }))
  assert.ok(assertBootEnv({ NODE_ENV: 'test' }).errors.length > 0)
})

test('resolveClientIp: tanpa TRUST_PROXY header diabaikan; dengan TRUST_PROXY memakai entri dari KANAN (tidak bisa dipalsukan dari kiri)', () => {
  const { resolveClientIp } = require('../index')
  assert.equal(resolveClientIp({ forwardedFor: '1.2.3.4', trustProxy: false }), 'unknown')
  assert.equal(resolveClientIp({ forwardedFor: '6.6.6.6, 9.9.9.9', trustProxy: true }), '9.9.9.9', 'klien memalsukan entri kiri; proxy menambah kanan')
  assert.equal(resolveClientIp({ forwardedFor: '6.6.6.6, 8.8.8.8, 10.0.0.1', trustProxy: true, hops: 2 }), '8.8.8.8')
  assert.equal(resolveClientIp({ realIp: '7.7.7.7', trustProxy: true }), '7.7.7.7')
  assert.equal(resolveClientIp({ trustProxy: true }), 'unknown')
  assert.equal(resolveClientIp({ forwardedFor: 'x'.repeat(500), trustProxy: true }).length, 64)
})

test('H1: produksi mewajibkan TRUST_PROXY eksplisit true|false (tanpa itu satu klien dapat mengunci login seluruh situs)', () => {
  const ok = { NODE_ENV: 'production', MONGODB_URI: 'mongodb://h/db', NEXTAUTH_SECRET: 'Zk9qLm2VbT7pQw4RxY8nCd6HfJ1sAeUg', NEXTAUTH_URL: 'https://a.example.org', BASE_URL: 'https://a.example.org' }
  assert.ok(bootProblems(ok).errors.some((e) => /TRUST_PROXY/.test(e)), 'tanpa TRUST_PROXY harus error')
  assert.ok(!bootProblems({ ...ok, TRUST_PROXY: 'true' }).errors.some((e) => /TRUST_PROXY/.test(e)))
  assert.ok(!bootProblems({ ...ok, TRUST_PROXY: 'false' }).errors.some((e) => /TRUST_PROXY/.test(e)))
  assert.ok(bootProblems({ ...ok, TRUST_PROXY: 'false' }).warnings.some((w) => /bucket/.test(w)))
  assert.ok(bootProblems({ ...ok, TRUST_PROXY: 'TRUE' }).errors.some((e) => /TRUST_PROXY/.test(e)))
  assert.ok(bootProblems({ ...ok, TRUST_PROXY: 'true', TRUST_PROXY_HOPS: 'abc' }).errors.some((e) => /TRUST_PROXY_HOPS/.test(e)))
  assert.ok(bootProblems({ ...ok, TRUST_PROXY: 'true', TRUST_PROXY_HOPS: '0' }).errors.some((e) => /TRUST_PROXY_HOPS/.test(e)))
  assert.ok(!bootProblems({ ...ok, TRUST_PROXY: 'true', TRUST_PROXY_HOPS: '2' }).errors.some((e) => /TRUST_PROXY_HOPS/.test(e)))
  assert.ok(!bootProblems({ NODE_ENV: 'development' }).errors.some((e) => /TRUST_PROXY/.test(e)), 'dev tidak mewajibkan')
})

test('M5: Redis limiter memakai EVAL atomik bila tersedia (satu round-trip, TTL selalu terpasang)', async () => {
  const kv = new Map(); const ttl = new Map(); const calls = []
  const client = {
    async eval(script, n, key, windowMs) {
      calls.push('eval')
      const c = (kv.get(key) || 0) + 1; kv.set(key, c)
      if (c === 1 || !ttl.has(key)) ttl.set(key, Number(windowMs))
      return [c, ttl.get(key)]
    }
  }
  const { createRedisRateLimiter } = require('../index')
  const l = createRedisRateLimiter({ client, windowMs: 1000, max: 2 })
  assert.equal((await l.check('a')).allowed, true)
  assert.equal((await l.check('a')).allowed, true)
  const r = await l.check('a')
  assert.equal(r.allowed, false)
  assert.equal(r.retryAfterMs, 1000)
  assert.deepEqual(calls, ['eval', 'eval', 'eval'])
})

test('L3: alamat IPv4-mapped IPv6 dan huruf besar dinormalkan ke satu kunci', () => {
  const { resolveClientIp } = require('../index')
  assert.equal(resolveClientIp({ forwardedFor: '::ffff:1.2.3.4', trustProxy: true }), '1.2.3.4')
  assert.equal(resolveClientIp({ forwardedFor: '2001:DB8::1', trustProxy: true }), '2001:db8::1')
})

test('T7-01: kunci "unknown" (tanpa IP tepercaya) memakai batas yang diskalakan sehingga 15 pengguna berbeda dapat login', () => {
  const { createRateLimiter, effectiveMax } = require('../index')
  const max = 10
  const rl = createRateLimiter({ windowMs: 15 * 60 * 1000, max: effectiveMax('unknown', max) })
  const results = []
  for (let i = 0; i < 15; i++) results.push(rl.check('ip:unknown').allowed)
  assert.ok(results.every(Boolean), '15 login dari bucket bersama harus lolos')
  assert.equal(effectiveMax('203.0.113.9', max), max, 'IP nyata tidak diskalakan')
  assert.ok(effectiveMax('unknown', max) > 15)
})

test('T7-03: banjir kunci baru tidak membuang penghitung aktif korban; kunci baru berbagi bucket luapan', () => {
  const { createRateLimiter } = require('../index')
  let t = 1000
  const rl = createRateLimiter({ windowMs: 60000, max: 3, maxKeys: 50, now: () => t })
  assert.equal(rl.check('korban').allowed, true)
  assert.equal(rl.check('korban').allowed, true)
  assert.equal(rl.check('korban').allowed, true)
  assert.equal(rl.check('korban').allowed, false, 'korban sudah di batas')
  for (let i = 0; i < 500; i++) rl.check(`penyerang-${i}`) // banjir kunci baru
  assert.equal(rl.check('korban').allowed, false, 'penghitung korban TIDAK boleh tereset oleh banjir kunci')
  assert.ok(rl._size() <= 51, 'memori tetap terbatas')
})

test('T7-04: bootProblems - verifikasi email tanpa kredensial mailer, REDIS_URL tanpa ioredis, AI_PROVIDER kosong', () => {
  const base = { NODE_ENV: 'production', MONGODB_URI: 'mongodb://h/db', NEXTAUTH_SECRET: 'Zk9qLm2VbT7pQw4RxY8nCd6HfJ1sAeUg', NEXTAUTH_URL: 'https://a.example.org', BASE_URL: 'https://a.example.org', TRUST_PROXY: 'true' }
  assert.ok(bootProblems({ ...base, REQUIRE_EMAIL_VERIFICATION: 'true' }).errors.some((e) => /GMAIL_USER/.test(e)))
  const mail = { GMAIL_USER: 'a@b.co', GMAIL_CLIENT_ID: 'id-1234567890.apps.googleusercontent.com', GMAIL_CLIENT_SECRET: 'Zk9qLm2VbT7pQw4R', GMAIL_REFRESH_TOKEN: '1//0gZk9qLm2VbT7pQw4R' }
  assert.ok(!bootProblems({ ...base, ...mail, REQUIRE_EMAIL_VERIFICATION: 'true' }).errors.some((e) => /GMAIL/.test(e)))
  assert.ok(bootProblems({ ...base, REDIS_URL: 'redis://h:6379' }, { hasModule: () => false }).errors.some((e) => /ioredis/.test(e)))
  assert.ok(!bootProblems({ ...base, REDIS_URL: 'redis://h:6379' }, { hasModule: () => true }).errors.some((e) => /ioredis/.test(e)))
  assert.ok(bootProblems(base).warnings.some((w) => /AI_PROVIDER/.test(w)), 'AI belum dikonfigurasi di produksi harus diperingatkan')
  assert.ok(!bootProblems({ ...base, AI_PROVIDER: 'fake', AI_ALLOW_FAKE: 'true' }).warnings.some((w) => /AI_PROVIDER kosong/.test(w)))
})
