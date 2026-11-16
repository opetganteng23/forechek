'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { isSameOrigin, bootProblems } = require('../index')

const base = { host: '127.0.0.1:3000' }

test('tanpa Origin diizinkan; Origin "null" dan tak valid ditolak', () => {
  assert.equal(isSameOrigin({ ...base, origin: undefined }), true)
  assert.equal(isSameOrigin({ ...base, origin: 'null' }), false)
  assert.equal(isSameOrigin({ ...base, origin: '::bukan-url' }), false)
})

test('langsung (tanpa proxy): Origin harus sama dengan Host; header X-Forwarded-* DIABAIKAN', () => {
  assert.equal(isSameOrigin({ ...base, origin: 'http://127.0.0.1:3000' }), true)
  assert.equal(isSameOrigin({ ...base, origin: 'https://forechek.ailo.ai.id' }), false)
  assert.equal(isSameOrigin({ ...base, origin: 'https://evil.example', forwardedHost: 'evil.example', forwardedProto: 'https' }), false, 'tanpa TRUST_PROXY XFH dipalsukan tidak berlaku')
})

test('di belakang proxy tepercaya: host dan skema dari X-Forwarded-Host/Proto', () => {
  const p = { ...base, trustProxy: true, forwardedHost: 'forechek.ailo.ai.id', forwardedProto: 'https' }
  assert.equal(isSameOrigin({ ...p, origin: 'https://forechek.ailo.ai.id' }), true)
  assert.equal(isSameOrigin({ ...p, origin: 'http://forechek.ailo.ai.id' }), false, 'skema berbeda (downgrade) ditolak')
  assert.equal(isSameOrigin({ ...p, origin: 'https://evil.example' }), false)
  assert.equal(isSameOrigin({ ...p, origin: 'HTTPS://FORECHEK.AILO.AI.ID' }), true, 'huruf besar/kecil tidak berpengaruh')
})

test('X-Forwarded-Host bernilai ganda: entri TERAKHIR (proxy tepercaya) dipakai, bukan yang dapat dipalsukan klien', () => {
  const p = { ...base, trustProxy: true, forwardedHost: 'evil.example, forechek.ailo.ai.id', forwardedProto: 'https' }
  assert.equal(isSameOrigin({ ...p, origin: 'https://forechek.ailo.ai.id' }), true)
  assert.equal(isSameOrigin({ ...p, origin: 'https://evil.example' }), false)
})

test('ALLOWED_ORIGINS: Origin persis yang terdaftar diizinkan', () => {
  assert.equal(isSameOrigin({ ...base, origin: 'https://app.example.org', allowed: ['https://app.example.org'] }), true)
  assert.equal(isSameOrigin({ ...base, origin: 'https://app.example.org.evil.com', allowed: ['https://app.example.org'] }), false)
})

test('boot: produksi tanpa ALLOWED_ORIGINS memberi peringatan jelas; terisi -> tanpa peringatan itu', () => {
  const ok = { NODE_ENV: 'production', MONGODB_URI: 'mongodb://h/db', NEXTAUTH_SECRET: 'Zk9qLm2VbT7pQw4RxY8nCd6HfJ1sAeUg', NEXTAUTH_URL: 'https://a.example.org', BASE_URL: 'https://a.example.org', TRUST_PROXY: 'true' }
  assert.ok(bootProblems(ok).warnings.some((w) => /ALLOWED_ORIGINS/.test(w)))
  assert.ok(!bootProblems({ ...ok, ALLOWED_ORIGINS: 'https://a.example.org' }).warnings.some((w) => /ALLOWED_ORIGINS/.test(w)))
})

test('re-autentikasi segar: hanya sign-in Google dalam 5 menit; sesi lama, kredensial, atau tanpa authAt ditolak', () => {
  const { isFreshGoogleAuth } = require('../index')
  const now = 1_700_000_000
  assert.equal(isFreshGoogleAuth({ authProvider: 'google', authAt: now - 60 }, now), true)
  assert.equal(isFreshGoogleAuth({ authProvider: 'google', authAt: now - 301 }, now), false)
  assert.equal(isFreshGoogleAuth({ authProvider: 'credentials', authAt: now - 1 }, now), false)
  assert.equal(isFreshGoogleAuth({ authProvider: 'google' }, now), false)
  assert.equal(isFreshGoogleAuth({ authProvider: 'google', authAt: now + 3600 }, now), false, 'waktu di masa depan ditolak')
  assert.equal(isFreshGoogleAuth(null, now), false)
})
