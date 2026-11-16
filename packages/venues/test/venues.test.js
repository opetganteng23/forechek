'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { loadBuiltinProfiles, evaluateFreshness, summarizeProfile, validateVenueProfile, DEFAULT_MAX_AGE_DAYS } = require('../index')

const clone = (o) => JSON.parse(JSON.stringify(o))

test('profil bawaan: 4 profil valid, slug unik, semua needs_review dan unverified (jujur: belum diverifikasi manusia)', () => {
  const ps = loadBuiltinProfiles()
  assert.deepEqual(ps.map((p) => p.slug).sort(), ['ieee-conference-generic', 'ieee-journal-generic', 'scopus-generic', 'sinta-generic'])
  assert.equal(new Set(ps.map((p) => p.slug)).size, ps.length)
  for (const p of ps) {
    assert.equal(p.status, 'needs_review')
    assert.equal(p.verification, 'unverified')
    assert.equal(p.checkedAt, null)
    assert.match(p.provenance, /BUKAN hasil pembacaan sumber resmi/)
    assert.ok(p.sources.every((s) => /^https:\/\//.test(s.url) && s.verifiedAt === null))
  }
})

test('profil bawaan tidak menebak aturan yang bergantung venue spesifik (halaman/blind policy dibiarkan kosong)', () => {
  for (const p of loadBuiltinProfiles()) {
    assert.equal(p.format.pages, null, `${p.slug}: batas halaman tidak boleh ditebak`)
    assert.equal(p.reviewPolicy, 'unknown')
  }
})

test('validasi: kasus tidak valid ditolak dengan pesan', () => {
  const base = loadBuiltinProfiles()[0]
  const bad = (mut) => validateVenueProfile(mut(clone(base)))
  assert.ok(bad((p) => ((p.slug = 'X'), p)).some((e) => /slug/.test(e)))
  assert.ok(bad((p) => ((p.kind = 'blog'), p)).some((e) => /kind/.test(e)))
  assert.ok(bad((p) => ((p.status = 'active'), p)).some((e) => /checkedAt/.test(e)), 'active wajib punya checkedAt')
  assert.ok(bad((p) => ((p.verification = 'verified'), p)).some((e) => /verified wajib/.test(e)))
  assert.ok(bad((p) => ((p.format.requiredSections = ['abstract', 'bab-ajaib']), p)).some((e) => /requiredSections/.test(e)))
  assert.ok(bad((p) => ((p.sources = []), p)).some((e) => /sources/.test(e)))
  assert.ok(bad((p) => ((p.sources = [{ url: 'javascript:alert(1)', title: 'x' }]), p)).some((e) => /sources/.test(e)))
  assert.ok(bad((p) => ((p.references.style = 'chicago'), p)).some((e) => /style/.test(e)))
  assert.ok(bad((p) => ((p.requiredDeclarations = ['rahasia']), p)).some((e) => /requiredDeclarations/.test(e)))
  assert.ok(bad((p) => ((p.format.abstractWords = { min: 'a' }), p)).some((e) => /abstractWords/.test(e)))
  assert.ok(validateVenueProfile(null).length)
  assert.deepEqual(validateVenueProfile(clone(base)), [])
})

test('kesegaran: belum diverifikasi -> needs_review; terverifikasi baru -> ok; terlalu lama -> stale; deprecated', () => {
  const base = loadBuiltinProfiles()[0]
  const now = new Date('2026-11-15T00:00:00Z')
  assert.equal(evaluateFreshness(base, now).state, 'needs_review')
  assert.equal(evaluateFreshness(base, now).trustworthy, false)
  const fresh = { ...clone(base), status: 'active', verification: 'verified', checkedAt: '2026-10-01T00:00:00Z' }
  assert.deepEqual(evaluateFreshness(fresh, now), { state: 'ok', trustworthy: true, reasons: [] })
  const old = { ...fresh, checkedAt: '2025-01-01T00:00:00Z' }
  assert.equal(evaluateFreshness(old, now).state, 'stale')
  assert.match(evaluateFreshness(old, now).reasons.join(' '), new RegExp(`batas ${DEFAULT_MAX_AGE_DAYS} hari`))
  assert.equal(evaluateFreshness({ ...fresh, status: 'deprecated' }, now).state, 'deprecated')
})

test('summarizeProfile: memuat freshness dan sumber; menjadi dasar tampilan UI', () => {
  const s = summarizeProfile(loadBuiltinProfiles()[3], new Date('2026-11-15T00:00:00Z'))
  assert.equal(s.slug, 'sinta-generic')
  assert.equal(s.freshness.state, 'needs_review')
  assert.ok(s.sources.length >= 1)
  assert.equal(s.referenceStyle, 'custom')
})

test('QC5-schema: checkedAt harus tanggal ISO dan tidak di masa depan; provenance, bobot, dan rentang divalidasi', () => {
  const base = loadBuiltinProfiles()[0]
  const bad = (patch) => validateVenueProfile({ ...clone(base), ...patch })
  assert.ok(bad({ checkedAt: 'garbage 1' }).length)
  assert.ok(bad({ checkedAt: 5 }).length)
  assert.ok(bad({ checkedAt: '2999-01-01', status: 'active', verification: 'verified' }).length, 'tanggal masa depan ditolak')
  assert.equal(bad({ checkedAt: '2026-01-15', status: 'active', verification: 'verified' }).length, 0)
  assert.ok(bad({ provenance: undefined }).length)
  assert.ok(bad({ rubric: { weights: { novelty: 'x' } } }).length)
  assert.ok(bad({ rubric: { weights: { novelty: -1 } } }).length)
  assert.ok(bad({ format: { ...base.format, abstractWords: { min: 300, max: 100 } } }).length)
})

test('QC5-schema: kesegaran - checkedAt di masa depan tidak pernah dipercaya', () => {
  const p = { ...clone(loadBuiltinProfiles()[0]), status: 'active', verification: 'verified', checkedAt: '2999-01-01' }
  assert.equal(evaluateFreshness(p, new Date('2026-11-15')).trustworthy, false)
})
