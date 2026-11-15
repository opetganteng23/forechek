'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { createFixtureProvider, CORPUS, verifyReference, searchLiterature, validateSearch, dedupe, LiteratureProviderError } = require('../index')

const fx = () => createFixtureProvider(CORPUS)
const verify = (input, providers = [fx()]) => verifyReference({ input, resolvers: providers, searchers: providers })
const A1 = { doi: '10.99999/fx.2021.001', title: 'Adaptive Sparse Attention for Low-Resource Language Modeling', authors: ['Ratna Wulandari', 'Chen Mei'], year: 2021 }

test('DOI valid, metadata cocok -> verified, dengan asal provider dan waktu pemeriksaan', async () => {
  const v = await verify(A1)
  assert.equal(v.status, 'verified')
  assert.deepEqual(v.matchedFields.sort(), ['first_author', 'title', 'year'])
  assert.equal(v.provider, 'fixture')
  assert.ok(!Number.isNaN(Date.parse(v.checkedAt)))
  assert.equal(v.canonical.doi, A1.doi)
})

test('toleransi: DOI berbentuk URL, huruf besar, judul beda ejaan kecil, tahun selisih 1 tetap verified', async () => {
  const v = await verify({ ...A1, doi: 'https://doi.org/10.99999/FX.2021.001', title: 'Adaptive sparse attention for low resource language modelling', year: 2022 })
  assert.equal(v.status, 'verified')
})

test('DOI palsu / tidak ditemukan -> unverified (bukan verified)', async () => {
  const v = await verify({ doi: '10.99999/fx.9999.999', title: 'Karangan Model Bahasa', authors: ['Fiktif Nama'], year: 2021 })
  assert.equal(v.status, 'unverified')
  assert.deepEqual(v.notes, ['DOI_NOT_FOUND'])
})

test('DOI valid tetapi judul menunjuk karya lain -> unverified (TITLE_MISMATCH)', async () => {
  const v = await verify({ ...A1, title: 'Quantum Cooking Recipes for Distributed Kitchens' })
  assert.equal(v.status, 'unverified')
  assert.ok(v.notes.includes('TITLE_MISMATCH'))
})

test('DOI valid, judul cocok tetapi penulis atau tahun tidak cocok -> partial dengan daftar mismatch', async () => {
  const a = await verify({ ...A1, authors: ['Orang Lain'] })
  assert.equal(a.status, 'partial')
  assert.ok(a.mismatches.includes('first_author'))
  const y = await verify({ ...A1, year: 2015 })
  assert.equal(y.status, 'partial')
  assert.ok(y.mismatches.includes('year'))
})

test('artikel retracted -> status retracted ditampilkan, bukan verified', async () => {
  const v = await verify({ doi: '10.99999/fx.2018.077', title: 'Retracted: Fast Training of Giant Models Without Gradients', authors: ['Pavel Novak'], year: 2018 })
  assert.equal(v.status, 'retracted')
  assert.deepEqual(v.notes, ['RETRACTION_DETECTED'])
})

test('retraction terdeteksi oleh provider kedua walau provider pertama tidak menandai', async () => {
  const clean = createFixtureProvider(CORPUS.map((r) => ({ ...r, retracted: false })), { name: 'a' })
  const flagged = createFixtureProvider(CORPUS, { name: 'b' })
  const v = await verify({ doi: '10.99999/fx.2018.077', title: 'Retracted: Fast Training of Giant Models Without Gradients', year: 2018, authors: ['Pavel Novak'] }, [clean, flagged])
  assert.equal(v.status, 'retracted')
})

test('metadata tidak lengkap: hanya DOI -> partial (DOI_RESOLVES_ONLY); hanya DOI+judul tanpa pembanding lain -> partial', async () => {
  assert.equal((await verify({ doi: A1.doi })).status, 'partial')
  const t = await verify({ doi: A1.doi, title: A1.title })
  assert.equal(t.status, 'partial')
  assert.ok(t.notes.includes('ONLY_TITLE_COMPARED'))
})

test('judul mirip pada beberapa publikasi: versi diperluas tidak diverifikasi untuk DOI karya awal', async () => {
  const v = await verify({ doi: '10.99999/fx.2020.031', title: 'Graph Neural Networks for Traffic Forecasting in Dense Cities: An Extended Study', authors: ['Budi Santoso'], year: 2022 })
  assert.notEqual(v.status, 'verified')
})

test('tanpa DOI: tidak pernah verified; cocok persis di provider -> partial dengan DOI saran', async () => {
  const v = await verify({ title: 'Efficient Kernel Methods for Large Synthetic Graphs', authors: ['Tomasz Wisniewski'], year: 2017 })
  assert.equal(v.status, 'partial')
  assert.ok(v.notes.includes('FOUND_BY_METADATA_NO_DOI'))
  assert.ok(v.notes.some((n) => n.startsWith('SUGGESTED_DOI:10.99999/')))
  const none = await verify({ title: 'Tulisan yang Sama Sekali Tidak Ada di Mana Pun', authors: ['Siapa Saja'], year: 2020 })
  assert.equal(none.status, 'unverified')
})

test('provider gagal total -> unverified PROVIDER_UNAVAILABLE (bukan verified, bukan DOI palsu)', async () => {
  const down = createFixtureProvider(CORPUS, { failWith: new LiteratureProviderError('fixture', 'PROVIDER_TIMEOUT', 'x') })
  const v = await verify(A1, [down])
  assert.equal(v.status, 'unverified')
  assert.deepEqual(v.notes, ['PROVIDER_UNAVAILABLE'])
})

test('satu provider pendeteksi-retraction gagal, satu berhasil -> partial (retraction belum dapat dikesampingkan; keputusan QC D4-02)', async () => {
  const down = createFixtureProvider(CORPUS, { name: 'down', failWith: new LiteratureProviderError('down', 'PROVIDER_ERROR', 'x') })
  const v = await verify(A1, [down, fx()])
  assert.equal(v.status, 'partial')
  assert.ok(v.notes.includes('PARTIAL_PROVIDER_OUTAGE'))
})

test('validasi input verifikasi: kosong, DOI buruk, tahun buruk, tipe salah', async () => {
  for (const bad of [{}, { doi: 'x' }, { title: 'T', year: 3000 }, { title: { $ne: 1 } }, { title: 'T', authors: 'bukan array' }, null, []]) {
    await assert.rejects(() => verify(bad), (e) => e.code === 'VALIDATION_ERROR')
  }
})

// ---------------- pencarian ----------------
test('search: validasi parameter', () => {
  assert.throws(() => validateSearch({ query: 'ab' }), /minimal 3/)
  assert.throws(() => validateSearch({ query: 'abc', limit: 100 }), /limit/)
  assert.throws(() => validateSearch({ query: 'abc', yearFrom: 1500 }), /yearFrom/)
  assert.throws(() => validateSearch({ query: 'abc', language: 'indonesia' }), /language/)
  assert.deepEqual(validateSearch({ query: '  a   b c ' }), { query: 'a b c', yearFrom: null, limit: 10, language: null })
})

test('search: provenance, keterbatasan, dedup antar provider per DOI', async () => {
  const a = createFixtureProvider(CORPUS, { name: 'a' })
  const b = createFixtureProvider(CORPUS.map((r) => ({ ...r, abstract: r.abstract })), { name: 'b' })
  const r = await searchLiterature({ providers: [a, b], params: { query: 'adaptive sparse attention language' } })
  assert.equal(r.candidates.filter((c) => c.doi === '10.99999/fx.2021.001').length, 1)
  assert.deepEqual(r.candidates[0].providers.sort(), ['a', 'b'])
  assert.ok(r.limitations.some((l) => /KANDIDAT/.test(l)))
  assert.ok(r.limitations.some((l) => /Garuda/.test(l)))
  assert.deepEqual(r.providers.map((p) => [p.name, p.ok]), [['a', true], ['b', true]])
  assert.ok(!Number.isNaN(Date.parse(r.fetchedAt)))
})

test('search: degradasi anggun (satu provider gagal dilaporkan), semua gagal -> galat, tanpa provider -> PROVIDER_NOT_CONFIGURED', async () => {
  const bad = createFixtureProvider(CORPUS, { name: 'bad', failWith: new LiteratureProviderError('bad', 'PROVIDER_RATE_LIMITED', 'x') })
  const r = await searchLiterature({ providers: [bad, fx()], params: { query: 'graph neural traffic' } })
  assert.equal(r.providers.find((p) => p.name === 'bad').ok, false)
  assert.equal(r.providers.find((p) => p.name === 'bad').error.code, 'PROVIDER_RATE_LIMITED')
  assert.ok(r.limitations.some((l) => /Sebagian provider gagal/.test(l)))
  await assert.rejects(() => searchLiterature({ providers: [bad], params: { query: 'graph neural' } }), (e) => e.code === 'PROVIDER_ERROR')
  await assert.rejects(() => searchLiterature({ providers: [], params: { query: 'graph neural' } }), (e) => e.code === 'PROVIDER_NOT_CONFIGURED')
})

test('dedup tanpa DOI: kombinasi metadata; judul hampir sama (diakritik) digabung dengan confidence rendah', () => {
  const base = { doi: null, authors: [{ family: 'Moreau' }], year: 2020, abstract: null, retracted: false }
  const out = dedupe([{ ...base, provider: 'a', title: 'Notes on Reproducibility' }, { ...base, provider: 'b', title: 'Notes on Reproducibility' }, { ...base, provider: 'c', title: 'Nótes on Reproducibílity', authors: [{ family: 'Moreau-X' }] }])
  assert.equal(out.length, 1)
  assert.equal(out[0].providers.length, 3)
  assert.equal(out[0].dedupConfidence, 'low')
})

test('dedup: flag retracted diwariskan dari provider mana pun', () => {
  const c = { doi: '10.99999/x.1', title: 'T', authors: [], year: 2020, abstract: null }
  assert.equal(dedupe([{ ...c, provider: 'a', retracted: false }, { ...c, provider: 'b', retracted: true }])[0].retracted, true)
})
