'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { createFixtureProvider, CORPUS, verifyReference, checkClaimSupport, createReferenceService, LiteratureProviderError, dedupe, normalizeFamily, compareAuthors } = require('../index')

const A1 = { doi: '10.99999/fx.2021.001', title: 'Adaptive Sparse Attention for Low-Resource Language Modeling', authors: ['Ratna Wulandari', 'Chen Mei'], year: 2021 }
const fx = (opts) => createFixtureProvider(CORPUS, opts)
const verify = (input, providers) => verifyReference({ input, resolvers: providers, searchers: providers })

// ---- E. gangguan provider tidak boleh menyembunyikan retraction ----
test('QC-E: provider pendeteksi-retraction gagal + provider lain berhasil -> TIDAK verified (partial PARTIAL_PROVIDER_OUTAGE)', async () => {
  const down = fx({ name: 'crossref-down', failWith: new LiteratureProviderError('crossref-down', 'PROVIDER_TIMEOUT', 'x') })
  const up = fx({ name: 'openalex-up' })
  const v = await verify(A1, [down, up])
  assert.equal(v.status, 'partial')
  assert.ok(v.notes.includes('PARTIAL_PROVIDER_OUTAGE'))
})

test('QC-E: provider TANPA deteksi retraction yang gagal tidak mengubah verified; hanya provider tanpa deteksi yang berhasil -> partial', async () => {
  const noRetractionDown = Object.assign(fx({ name: 's2-down', failWith: new LiteratureProviderError('s2-down', 'PROVIDER_ERROR', 'x') }), { detectsRetraction: false })
  const up = fx({ name: 'openalex-up' })
  assert.equal((await verify(A1, [noRetractionDown, up])).status, 'verified')
  const onlyS2 = Object.assign(fx({ name: 's2' }), { detectsRetraction: false })
  const v = await verify(A1, [onlyS2])
  assert.equal(v.status, 'partial')
  assert.ok(v.notes.includes('RETRACTION_CHECK_UNAVAILABLE'))
})

// ---- F. perbandingan metadata lebih ketat ----
test('QC-F: penulis pendamping karangan pada daftar penulis menurunkan status (authors mismatch)', async () => {
  const v = await verify({ ...A1, authors: ['Ratna Wulandari', 'Orang Karangan', 'Nama Fiktif'] }, [fx()])
  assert.equal(v.status, 'partial')
  assert.ok(v.mismatches.includes('authors'))
})

test('QC-F: nama non-Latin tidak lagi dinormalkan menjadi kosong dan dibandingkan dengan benar', () => {
  assert.equal(normalizeFamily('王'), '王')
  assert.equal(normalizeFamily('Müller-Åström'), 'muller-astrom')
  assert.equal(compareAuthors([{ family: '王' }], [{ family: '李' }]).firstAuthorMatch, false)
  assert.equal(compareAuthors([{ family: '王' }], [{ family: '王' }]).firstAuthorMatch, true)
})

test('QC-F: judul terlalu pendek tidak dapat berstatus verified', async () => {
  const p = createFixtureProvider([{ doi: '10.99999/short.1', title: 'Editorial', authors: [{ given: 'A', family: 'Penulis' }], year: 2020 }])
  const v = await verify({ doi: '10.99999/short.1', title: 'Editorial', authors: ['A Penulis'], year: 2020 }, [p])
  assert.equal(v.status, 'partial')
  assert.ok(v.notes.includes('TITLE_TOO_SHORT'))
})

// ---- D. verifyManual tidak menyimpan data pengguna sebagai milik rekaman terverifikasi ----
function memService() {
  const rows = []
  let n = 0
  const refs = {
    list: async (u, p) => rows.filter((r) => r.userId === u && r.projectId === p),
    findById: async (u, p, id) => rows.find((r) => r.id === id && r.userId === u && r.projectId === p) || null,
    findByCiteKey: async (u, p, k) => rows.find((r) => r.citeKey === k) || null,
    insert: async (d) => { if (rows.some((r) => r.projectId === d.projectId && r.citeKey === d.citeKey)) throw Object.assign(new Error('d'), { duplicate: true }); if (rows.some((r) => r.projectId === d.projectId && r.dedupKey === d.dedupKey)) throw Object.assign(new Error('d'), { duplicateRef: true }); const r = { ...d, id: `r${++n}` }; rows.push(r); return r },
    update: async (id, set) => Object.assign(rows.find((r) => r.id === id), set),
    remove: async () => true
  }
  const cands = { insertMany: async (u, p, l) => l, get: async () => null }
  return { rows, svc: createReferenceService({ refs, candidates: cands, assertOwned: async () => {}, providers: [fx()] }) }
}

test('QC-D: verifyManual(add) yang verified menyimpan metadata KANONIS (penulis/tahun dari sumber), bukan input pengguna', async () => {
  const { svc } = memService()
  const out = await svc.verifyManual({ userId: 'u', projectId: 'p', input: { ...A1, authors: ['Ratna Wulandari', 'Chen Mei'], year: 2022 }, add: true })
  assert.equal(out.added.verification.status, 'verified')
  assert.equal(out.added.year, 2021, 'tahun dari sumber, bukan input (2022)')
  assert.deepEqual(out.added.authors.map((a) => a.family), ['Wulandari', 'Mei', 'Berg'])
  assert.equal(out.added.doi, A1.doi)
})

test('QC-D: verifyManual(add) yang unverified menyimpan input apa adanya dan tetap unverified', async () => {
  const { svc } = memService()
  const out = await svc.verifyManual({ userId: 'u', projectId: 'p', input: { doi: '10.99999/fx.9999.999', title: 'Makalah Karangan Pengguna', authors: ['Fiktif Nama'], year: 2022 }, add: true })
  assert.equal(out.added.verification.status, 'unverified')
  assert.equal(out.added.year, 2022)
})

test('QC-H: penambahan duplikat yang berlomba ditolak secara atomik lewat dedupKey (bukan hanya pemeriksaan di muka)', async () => {
  const { svc, rows } = memService()
  const input = { ...A1, add: true }
  const results = await Promise.allSettled([svc.verifyManual({ userId: 'u', projectId: 'p', input, add: true }), svc.verifyManual({ userId: 'u', projectId: 'p', input, add: true })])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
  assert.equal(results.find((r) => r.status === 'rejected').reason.details.code, 'REFERENCE_DUPLICATE')
  assert.equal(rows.length, 1)
})

test('QC-H: reverify saat provider tidak tersedia TIDAK menurunkan status referensi yang sudah verified', async () => {
  const { svc, rows } = memService()
  const out = await svc.verifyManual({ userId: 'u', projectId: 'p', input: A1, add: true })
  const down = createReferenceService({ refs: { findById: async () => rows[0], update: async () => { throw new Error('tidak boleh dipanggil') } }, candidates: {}, assertOwned: async () => {}, providers: [fx({ failWith: new LiteratureProviderError('fixture', 'PROVIDER_TIMEOUT', 'x') })] })
  await assert.rejects(() => down.reverify({ userId: 'u', projectId: 'p', refId: out.added.id }), (e) => e.code === 'PROVIDER_ERROR')
  assert.equal(rows[0].verification.status, 'verified')
})

test('QC-H: updateMetadata memvalidasi struktur authors/venue/url (tidak ada URL berbahaya)', async () => {
  const { svc } = memService()
  const out = await svc.verifyManual({ userId: 'u', projectId: 'p', input: A1, add: true })
  const bad = [{ authors: [{ family: 123 }] }, { authors: 'x' }, { url: 'javascript:alert(1)' }, { venueName: { $ne: 1 } }, { authors: Array.from({ length: 101 }, () => ({ family: 'A' })) }]
  for (const patch of bad) await assert.rejects(() => svc.updateMetadata({ userId: 'u', projectId: 'p', refId: out.added.id, patch }), (e) => e.code === 'VALIDATION_ERROR', JSON.stringify(patch).slice(0, 40))
  const ok = await svc.updateMetadata({ userId: 'u', projectId: 'p', refId: out.added.id, patch: { url: 'https://contoh.test/x', venueName: 'Jurnal Baru' } })
  assert.equal(ok.verification.status, 'unverified')
})

test('QC-H: dedup tahap kedua (tanpa DOI) mewarisi flag retracted', () => {
  const base = { doi: null, authors: [{ family: 'Moreau' }], year: 2020, abstract: null }
  const out = dedupe([{ ...base, provider: 'a', title: 'Notes on Reproducibility', retracted: false }, { ...base, provider: 'b', title: 'Nótes on Reproducibílity', retracted: true, authors: [{ family: 'Moreau-X' }] }])
  assert.equal(out.length, 1)
  assert.equal(out[0].retracted, true)
})

// ---- G. klaim: kutipan harus relevan dengan klaim; bukti hanya bila ada verbatim ----
const LONG = 'We introduce an adaptive sparse attention mechanism for language modeling in low-resource settings. Experiments on three synthetic benchmarks show that the proposed method reduces memory use by 38 percent while keeping perplexity within 2 percent of dense attention. We also analyze failure cases for very short sequences.'
const ref = { citeKey: 'k', abstract: LONG, verification: { status: 'verified' } }

test('QC-G: kutipan verbatim tetapi TIDAK relevan dengan klaim -> unknown (QUOTE_NOT_RELEVANT)', async () => {
  for (const quote of ['We introduce an adaptive sparse attention', 'Experiments on three synthetic benchmarks']) {
    const r = await checkClaimSupport({ claim: 'Quantum cats cure cancer in humans', reference: ref, judge: async () => ({ verdict: 'supports', quote }) })
    assert.equal(r.verdict, 'unknown', quote)
    assert.equal(r.reason, 'QUOTE_NOT_RELEVANT')
  }
})

test('QC-G: kutipan relevan (angka/istilah bersama klaim) tetap diterima', async () => {
  const r = await checkClaimSupport({ claim: 'Metode mengurangi memori sekitar 38 persen', reference: ref, judge: async () => ({ verdict: 'supports', quote: 'reduces memory use by 38 percent' }) })
  assert.equal(r.verdict, 'supports')
})

test('QC-G: unsupported/unknown tidak mengembalikan "bukti" yang tidak ada pada abstrak', async () => {
  const r = await checkClaimSupport({ claim: 'klaim apa saja di sini', reference: ref, judge: async () => ({ verdict: 'unsupported', quote: 'KUTIPAN KARANGAN YANG TIDAK ADA' }) })
  assert.equal(r.verdict, 'unsupported')
  assert.equal(r.evidence, null)
})
