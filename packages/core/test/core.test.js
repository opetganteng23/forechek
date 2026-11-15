'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const core = require('../index')

const {
  AppError, errorBody, okBody, isObjectId, ownedFilter, asString, normalizeEmail, validatePassword,
  validateName, generateToken, hashToken, createRateLimiter, createLogger, redact, missingVars,
  assertEnv, loadConfig, resolveUsage, effectivePlan, checkQuota, periodStartOf, googleLinkUpdate
} = core

// ---------- errors & response ----------
test('AppError memetakan kode ke status HTTP', () => {
  assert.equal(new AppError('NOT_FOUND', 'x').status, 404)
  assert.equal(new AppError('RATE_LIMITED', 'x').status, 429)
  assert.equal(new AppError('VERSION_CONFLICT', 'x').status, 409)
  assert.equal(new AppError('KODE_ASING', 'x').code, 'INTERNAL_ERROR')
})

test('errorBody tidak membocorkan pesan/stack error internal', () => {
  const { status, body } = errorBody(new Error('connection string mongodb://user:pw@host'), 'rid-1')
  assert.equal(status, 500)
  assert.equal(body.success, false)
  assert.equal(body.error.code, 'INTERNAL_ERROR')
  assert.ok(!JSON.stringify(body).includes('mongodb://'))
  assert.equal(body.requestId, 'rid-1')
})

test('errorBody meneruskan AppError apa adanya', () => {
  const { status, body } = errorBody(new AppError('VALIDATION_ERROR', 'Email salah', { details: { f: 'email' } }), 'r')
  assert.equal(status, 400)
  assert.deepEqual(body.error, { code: 'VALIDATION_ERROR', message: 'Email salah', details: { f: 'email' } })
})

test('okBody memakai bentuk envelope standar', () => {
  assert.deepEqual(okBody({ a: 1 }, 'r'), { success: true, data: { a: 1 }, error: null, requestId: 'r' })
  assert.equal(okBody(undefined, 'r').data, null)
})

// ---------- ids / otorisasi ----------
test('isObjectId hanya menerima 24 hex string', () => {
  assert.equal(isObjectId('507f1f77bcf86cd799439011'), true)
  assert.equal(isObjectId('507f1f77bcf86cd79943901'), false)
  assert.equal(isObjectId({ $ne: null }), false)
  assert.equal(isObjectId(undefined), false)
})

test('ownedFilter selalu menyertakan userId dan menolak id tak valid', () => {
  const u = '507f1f77bcf86cd799439011'
  const id = '607f1f77bcf86cd799439022'
  assert.deepEqual(ownedFilter(u, id), { _id: id, userId: u })
  assert.throws(() => ownedFilter(u, 'bukan-id'), (e) => e.code === 'NOT_FOUND')
  assert.throws(() => ownedFilter(u, { $gt: '' }), (e) => e.code === 'NOT_FOUND')
  assert.throws(() => ownedFilter({ $ne: 1 }, id), (e) => e.code === 'NOT_FOUND')
})

test('asString menolak objek operator NoSQL', () => {
  assert.equal(asString('a'), 'a')
  assert.throws(() => asString({ $ne: null }), (e) => e.code === 'VALIDATION_ERROR')
})

// ---------- validators ----------
test('normalizeEmail', () => {
  assert.equal(normalizeEmail('  Foo@Bar.COM '), 'foo@bar.com')
  assert.throws(() => normalizeEmail('bukan-email'), (e) => e.code === 'VALIDATION_ERROR')
  assert.throws(() => normalizeEmail({ $ne: 1 }), (e) => e.code === 'VALIDATION_ERROR')
  assert.throws(() => normalizeEmail('a'.repeat(250) + '@x.io'), (e) => e.code === 'VALIDATION_ERROR')
})

test('validatePassword: panjang minimum dan batas 72 byte bcrypt', () => {
  assert.equal(validatePassword('abcdefgh'), 'abcdefgh')
  assert.throws(() => validatePassword('pendek'), (e) => e.code === 'VALIDATION_ERROR')
  assert.throws(() => validatePassword('a'.repeat(73)), (e) => e.code === 'VALIDATION_ERROR')
  assert.doesNotThrow(() => validatePassword('a'.repeat(72)))
  // 40 karakter 2-byte = 80 byte -> ditolak walau < 72 karakter
  assert.throws(() => validatePassword('é'.repeat(40)), (e) => e.code === 'VALIDATION_ERROR')
})

test('validateName', () => {
  assert.equal(validateName('  Budi '), 'Budi')
  assert.throws(() => validateName('B'), (e) => e.code === 'VALIDATION_ERROR')
})

test('token: hash deterministik, raw tidak sama dengan hash, token jelek ditolak', () => {
  const t = generateToken()
  assert.equal(t.raw.length, 64)
  assert.notEqual(t.raw, t.hash)
  assert.equal(hashToken(t.raw), t.hash)
  assert.notEqual(generateToken().raw, t.raw)
  assert.throws(() => hashToken('x'), (e) => e.code === 'VALIDATION_ERROR')
  assert.throws(() => hashToken({ $ne: null }), (e) => e.code === 'VALIDATION_ERROR')
})

// ---------- rate limit ----------
test('rate limiter memblokir setelah batas dan reset setelah jendela', () => {
  let t = 1000
  const rl = createRateLimiter({ windowMs: 1000, max: 3, now: () => t })
  assert.equal(rl.check('a').allowed, true)
  assert.equal(rl.check('a').allowed, true)
  const third = rl.check('a')
  assert.equal(third.allowed, true)
  assert.equal(third.remaining, 0)
  const blocked = rl.check('a')
  assert.equal(blocked.allowed, false)
  assert.ok(blocked.retryAfterMs > 0 && blocked.retryAfterMs <= 1000)
  assert.equal(rl.check('b').allowed, true) // kunci berbeda tidak terpengaruh
  t += 1001
  assert.equal(rl.check('a').allowed, true)
})

test('rate limiter membatasi ukuran memori', () => {
  const rl = createRateLimiter({ windowMs: 60000, max: 1, maxKeys: 50 })
  for (let i = 0; i < 500; i++) rl.check('k' + i)
  assert.ok(rl._size() <= 50)
})

// ---------- logger ----------
test('redact menyembunyikan secret dan isi naskah, memotong string panjang', () => {
  const out = redact({
    email: 'a@b.c',
    password: 'rahasia',
    nested: { apiKey: 'sk-ant-xxx', manuscriptText: 'isi naskah', ok: 1 },
    authorization: 'Bearer abc',
    source: '\\documentclass{article}',
    note: 'x'.repeat(1000)
  })
  assert.equal(out.email, 'a@b.c')
  assert.equal(out.password, '[REDACTED]')
  assert.equal(out.nested.apiKey, '[REDACTED]')
  assert.equal(out.nested.manuscriptText, '[REDACTED]')
  assert.equal(out.nested.ok, 1)
  assert.equal(out.authorization, '[REDACTED]')
  assert.equal(out.source, '[REDACTED]')
  assert.match(out.note, /^\[TRUNCATED len=1000\]$/)
})

test('logger menulis JSON satu baris dengan field base + redaksi', () => {
  const lines = []
  const log = createLogger({ sink: (l) => lines.push(l), now: () => new Date('2026-01-01T00:00:00Z') }).child({ requestId: 'r1' })
  log.info('login', { email: 'a@b.c', password: 'x' })
  const entry = JSON.parse(lines[0])
  assert.equal(entry.level, 'info')
  assert.equal(entry.requestId, 'r1')
  assert.equal(entry.password, '[REDACTED]')
  assert.equal(entry.ts, '2026-01-01T00:00:00.000Z')
})

test('logger aman terhadap objek Error dan referensi melingkar dalam batas kedalaman', () => {
  const lines = []
  const log = createLogger({ sink: (l) => lines.push(l) })
  const circ = {}
  circ.self = circ
  assert.doesNotThrow(() => log.error('gagal', { err: new Error('boom'), circ }))
  assert.equal(JSON.parse(lines[0]).err.message, 'boom')
})

// ---------- config ----------
test('missingVars hanya melaporkan nama, abaikan placeholder', () => {
  const env = { MONGODB_URI: 'mongodb+srv://u:p@h/db', ANTHROPIC_API_KEY: 'sk-ant-xxxxxxxxxxxxxxxxxx' }
  assert.deepEqual(missingVars(env, ['db']), [])
  assert.deepEqual(missingVars(env, ['ai']), ['ANTHROPIC_API_KEY'])
  // placeholder dari .env.example harus dianggap belum diisi
  assert.deepEqual(missingVars({ MONGODB_URI: 'mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/db' }, ['db']), ['MONGODB_URI'])
  assert.deepEqual(missingVars({ NEXTAUTH_SECRET: 'your-super-secret-key-min-32-chars', BASE_URL: 'http://localhost:3000', NEXTAUTH_URL: 'http://localhost:3000' }, ['app']), ['NEXTAUTH_SECRET'])
  assert.deepEqual(missingVars({ ANTHROPIC_API_KEY: 'sk-ant-api03-Zk9qLm2VbT7' }, ['ai']), [])
  assert.throws(() => missingVars(env, ['tidak-ada']))
  try {
    assertEnv({}, ['db'])
    assert.fail('harus melempar')
  } catch (e) {
    assert.match(e.message, /MONGODB_URI/)
  }
})

test('loadConfig: default, override, dan validasi angka', () => {
  const c = loadConfig({ NODE_ENV: 'production', REQUIRE_EMAIL_VERIFICATION: 'true', QUOTA_FREE_TOKENS: '500' })
  assert.equal(c.isProduction, true)
  assert.equal(c.requireEmailVerification, true)
  assert.equal(c.quota.free.tokensPerMonth, 500)
  assert.equal(loadConfig({}).requireEmailVerification, false)
  assert.throws(() => loadConfig({ QUOTA_FREE_TOKENS: 'abc' }))
  assert.throws(() => loadConfig({ QUOTA_FREE_TOKENS: '-5' }))
  assert.throws(() => { loadConfig({}).quota.free = 1 }, TypeError)
})

// ---------- usage / kuota ----------
test('periodStartOf = tanggal 1 UTC', () => {
  assert.equal(periodStartOf(new Date('2026-11-14T22:00:00Z')).toISOString(), '2026-11-01T00:00:00.000Z')
})

test('resolveUsage me-reset penghitung saat bulan berganti (perbaikan analysisUsed)', () => {
  const old = { periodStart: new Date('2026-10-01T00:00:00Z'), tokensUsed: 999, messagesUsed: 9 }
  const r = resolveUsage(old, new Date('2026-11-02T00:00:00Z'))
  assert.equal(r.wasReset, true)
  assert.equal(r.tokensUsed, 0)
  assert.equal(r.messagesUsed, 0)
  assert.equal(r.periodStart.toISOString(), '2026-11-01T00:00:00.000Z')
})

test('resolveUsage mempertahankan penghitung dalam bulan yang sama dan menangani data kosong', () => {
  const cur = { periodStart: new Date('2026-11-01T00:00:00Z'), tokensUsed: 50, messagesUsed: 2 }
  const r = resolveUsage(cur, new Date('2026-11-20T00:00:00Z'))
  assert.equal(r.wasReset, false)
  assert.equal(r.tokensUsed, 50)
  assert.equal(resolveUsage(undefined, new Date('2026-11-20T00:00:00Z')).wasReset, true)
})

test('effectivePlan: paket berbayar kedaluwarsa dianggap free', () => {
  const now = new Date('2026-11-14T00:00:00Z')
  assert.equal(effectivePlan({ plan: 'pro', isActive: true, endDate: new Date('2026-12-01') }, now), 'pro')
  assert.equal(effectivePlan({ plan: 'pro', isActive: true, endDate: new Date('2026-11-01') }, now), 'free')
  assert.equal(effectivePlan({ plan: 'pro', isActive: false, endDate: new Date('2026-12-01') }, now), 'free')
  assert.equal(effectivePlan(undefined, now), 'free')
})

test('checkQuota: batas pesan, batas token, dan lolos', () => {
  const limits = loadConfig({}).quota
  const now = new Date('2026-11-14T00:00:00Z')
  const base = { periodStart: new Date('2026-11-01T00:00:00Z') }
  const okRes = checkQuota({ plan: 'free', usage: { ...base, tokensUsed: 0, messagesUsed: 0 }, limits, now })
  assert.equal(okRes.allowed, true)
  const msg = checkQuota({ plan: 'free', usage: { ...base, tokensUsed: 0, messagesUsed: limits.free.messagesPerMonth }, limits, now })
  assert.deepEqual([msg.allowed, msg.reason], [false, 'messages'])
  const tok = checkQuota({ plan: 'free', usage: { ...base, tokensUsed: limits.free.tokensPerMonth - 10, messagesUsed: 1 }, limits, estimatedTokens: 11, now })
  assert.deepEqual([tok.allowed, tok.reason], [false, 'tokens'])
  // bulan baru -> reset, lolos lagi
  const next = checkQuota({ plan: 'free', usage: { ...base, tokensUsed: 1e9, messagesUsed: 1e9 }, limits, now: new Date('2026-12-02T00:00:00Z') })
  assert.equal(next.allowed, true)
})

// ---------- oauth ----------
test('googleLinkUpdate: akun belum terverifikasi kehilangan password (anti pre-hijacking)', () => {
  const r = googleLinkUpdate({ emailVerified: false, password: 'hash', oauthId: undefined }, 'g-123')
  assert.equal(r.set.emailVerified, true)
  assert.equal(r.set.oauthId, 'g-123')
  assert.equal(r.set.oauthProvider, 'google')
  assert.ok(r.unset.includes('password'))
  assert.ok(r.unset.includes('emailVerificationToken'))
  assert.ok(r.unset.includes('passwordResetToken'))
})

test('googleLinkUpdate: akun sudah terverifikasi mempertahankan password; oauthId lama tidak ditimpa', () => {
  const r = googleLinkUpdate({ emailVerified: true, password: 'hash', oauthId: 'g-lama' }, 'g-baru')
  assert.deepEqual(r.unset, [])
  assert.equal(r.set.oauthId, undefined)
  const r2 = googleLinkUpdate({ emailVerified: true, password: 'hash' }, 'g-baru')
  assert.equal(r2.set.oauthId, 'g-baru')
})
