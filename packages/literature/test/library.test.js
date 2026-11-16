'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { createReferenceService, createFixtureProvider, CORPUS, createLiteratureTools, uniqueCiteKey, baseKey, sanitizeCitations } = require('../index')
const { createToolRegistry, createFakeProvider, runAgent } = require('@publication-prepare/ai')

let seq = 0
function mem({ owner = { p1: 'u1' }, judge } = {}) {
  const refRows = []
  const candRows = []
  const refs = {
    async list(userId, projectId) { return refRows.filter((r) => r.userId === userId && r.projectId === projectId) },
    async findById(userId, projectId, id) { return refRows.find((r) => r.id === id && r.userId === userId && r.projectId === projectId) || null },
    async findByCiteKey(userId, projectId, key) { return refRows.find((r) => r.citeKey === key && r.userId === userId && r.projectId === projectId) || null },
    async insert(doc) {
      if (refRows.some((r) => r.projectId === doc.projectId && r.citeKey === doc.citeKey)) throw Object.assign(new Error('dup'), { duplicate: true })
      const row = { ...doc, id: `r${++seq}` }
      refRows.push(row)
      return row
    },
    async update(id, patch) { Object.assign(refRows.find((r) => r.id === id), patch); return refRows.find((r) => r.id === id) },
    async remove(userId, projectId, id) {
      const i = refRows.findIndex((r) => r.id === id && r.userId === userId && r.projectId === projectId)
      if (i < 0) return false
      refRows.splice(i, 1)
      return true
    }
  }
  const candidates = {
    async insertMany(userId, projectId, list) { return list.map((c) => { const row = { ...c, candidateId: `cand${++seq}xxxx`, userId, projectId }; candRows.push(row); return row }) },
    async get(userId, projectId, id) { return candRows.find((c) => c.candidateId === id && c.userId === userId && c.projectId === projectId) || null }
  }
  const assertOwned = async (userId, projectId) => {
    if (owner[projectId] !== userId) throw Object.assign(new Error('nf'), { code: 'NOT_FOUND', name: 'AppError', status: 404 })
  }
  const providers = [createFixtureProvider(CORPUS)]
  return { refRows, candRows, svc: createReferenceService({ refs, candidates, assertOwned, providers, judge }) }
}

const A1 = '10.99999/fx.2021.001'

test('citeKey: penulis + tahun + kata judul; unik per proyek (a, b, ...)', () => {
  assert.equal(baseKey({ authors: [{ family: 'Wulandari' }], year: 2021, title: 'The Adaptive Sparse' }), 'wulandari2021adaptive')
  const set = new Set(['x2020graph'])
  assert.equal(uniqueCiteKey({ authors: [{ family: 'X' }], year: 2020, title: 'Graph nets' }, set), 'x2020grapha')
  assert.equal(baseKey({ authors: [], year: null, title: '' }), 'anonndref')
})

test('alur kandidat: search -> candidateId -> add menghasilkan referensi verified dengan asal dan waktu pemeriksaan', async () => {
  const { svc } = mem()
  const s = await svc.search({ userId: 'u1', projectId: 'p1', params: { query: 'adaptive sparse attention' } })
  const cand = s.candidates.find((c) => c.doi === A1)
  assert.ok(cand.candidateId)
  const ref = await svc.addCandidate({ userId: 'u1', projectId: 'p1', candidateId: cand.candidateId })
  assert.equal(ref.verification.status, 'verified')
  assert.equal(ref.citeKey, 'wulandari2021adaptive')
  assert.equal(ref.provider, 'fixture')
  assert.ok(ref.verification.checkedAt)
  assert.equal(ref.hasAbstract, true)
  assert.equal(ref.statusHistory.length, 1)
  assert.equal((await svc.list('u1', 'p1')).length, 1)
})

test('duplikat ditolak (CONFLICT, REFERENCE_DUPLICATE) berdasarkan DOI dan judul+tahun', async () => {
  const { svc } = mem()
  const s = await svc.search({ userId: 'u1', projectId: 'p1', params: { query: 'adaptive sparse attention' } })
  const id = s.candidates.find((c) => c.doi === A1).candidateId
  await svc.addCandidate({ userId: 'u1', projectId: 'p1', candidateId: id })
  await assert.rejects(() => svc.addCandidate({ userId: 'u1', projectId: 'p1', candidateId: id }), (e) => e.code === 'CONFLICT' && e.details.code === 'REFERENCE_DUPLICATE')
  await assert.rejects(() => svc.verifyManual({ userId: 'u1', projectId: 'p1', input: { doi: A1, title: 'Adaptive Sparse Attention for Low-Resource Language Modeling', authors: ['Ratna Wulandari'], year: 2021 }, add: true }), (e) => e.details.code === 'REFERENCE_DUPLICATE')
})

test('kandidat yang tidak lolos verifikasi server TIDAK dapat ditambahkan (candidate dimanipulasi / tanpa DOI)', async () => {
  const { svc, candRows } = mem()
  const [forged] = await svc.search({ userId: 'u1', projectId: 'p1', params: { query: 'adaptive sparse attention' } }).then(() => candRows.splice(0, 1).map((c) => ({ ...c })))
  candRows.push({ ...forged, doi: '10.99999/fx.9999.999', candidateId: 'forged-cand-1' })
  await assert.rejects(() => svc.addCandidate({ userId: 'u1', projectId: 'p1', candidateId: 'forged-cand-1' }), (e) => e.details.code === 'REFERENCE_NOT_VERIFIED' && e.details.status === 'unverified')
  const notes = (await svc.search({ userId: 'u1', projectId: 'p1', params: { query: 'reproducibility pipelines' } })).candidates.find((c) => !c.doi)
  await assert.rejects(() => svc.addCandidate({ userId: 'u1', projectId: 'p1', candidateId: notes.candidateId }), (e) => e.details.code === 'REFERENCE_NOT_VERIFIED')
  assert.equal((await svc.list('u1', 'p1')).length, 0)
})

test('retracted: ditolak pada jalur biasa; diterima hanya bila allowRetracted dan tersimpan berstatus retracted', async () => {
  const { svc } = mem()
  const id = (await svc.search({ userId: 'u1', projectId: 'p1', params: { query: 'training giant models gradients' } })).candidates.find((c) => c.doi === '10.99999/fx.2018.077').candidateId
  await assert.rejects(() => svc.addCandidate({ userId: 'u1', projectId: 'p1', candidateId: id }), (e) => e.details.status === 'retracted')
  const ref = await svc.addCandidate({ userId: 'u1', projectId: 'p1', candidateId: id, allowRetracted: true })
  assert.equal(ref.verification.status, 'retracted')
})

test('IDOR: pengguna lain tidak dapat mencari, menambah, membaca, mengedit, memverifikasi ulang, atau menghapus', async () => {
  const { svc } = mem()
  const s = await svc.search({ userId: 'u1', projectId: 'p1', params: { query: 'adaptive sparse attention' } })
  const ref = await svc.addCandidate({ userId: 'u1', projectId: 'p1', candidateId: s.candidates.find((c) => c.doi === A1).candidateId })
  const nf = (e) => e.code === 'NOT_FOUND'
  await assert.rejects(() => svc.list('u2', 'p1'), nf)
  await assert.rejects(() => svc.search({ userId: 'u2', projectId: 'p1', params: { query: 'adaptive sparse' } }), nf)
  await assert.rejects(() => svc.addCandidate({ userId: 'u2', projectId: 'p1', candidateId: 'x' }), nf)
  await assert.rejects(() => svc.updateMetadata({ userId: 'u2', projectId: 'p1', refId: ref.id, patch: { year: 2000 } }), nf)
  await assert.rejects(() => svc.reverify({ userId: 'u2', projectId: 'p1', refId: ref.id }), nf)
  await assert.rejects(() => svc.remove({ userId: 'u2', projectId: 'p1', refId: ref.id }), nf)
  await assert.rejects(() => svc.checkClaim({ userId: 'u2', projectId: 'p1', claim: 'klaim', citeKey: ref.citeKey }), nf)
  // kandidat milik proyek/pengguna lain tidak dapat dipakai
  const cid = s.candidates[0].candidateId
  const other = mem({ owner: { p2: 'u2' } })
  await assert.rejects(() => other.svc.addCandidate({ userId: 'u2', projectId: 'p2', candidateId: cid }), (e) => e.code === 'NOT_FOUND')
})

test('edit metadata manual MENURUNKAN status ke unverified dan mencatat riwayat; reverify memulihkan hanya bila cocok', async () => {
  const { svc } = mem()
  const s = await svc.search({ userId: 'u1', projectId: 'p1', params: { query: 'adaptive sparse attention' } })
  const ref = await svc.addCandidate({ userId: 'u1', projectId: 'p1', candidateId: s.candidates.find((c) => c.doi === A1).candidateId })
  const edited = await svc.updateMetadata({ userId: 'u1', projectId: 'p1', refId: ref.id, patch: { year: 2015 } })
  assert.equal(edited.verification.status, 'unverified')
  assert.deepEqual(edited.verification.notes, ['METADATA_EDITED_REVERIFY_REQUIRED'])
  assert.equal(edited.hasAbstract, false, 'abstrak tidak dipercaya setelah edit')
  assert.deepEqual(edited.statusHistory.map((h) => h.status), ['verified', 'unverified'])
  const bad = await svc.reverify({ userId: 'u1', projectId: 'p1', refId: ref.id })
  assert.equal(bad.verification.status, 'partial', 'tahun salah tidak kembali verified')
  await svc.updateMetadata({ userId: 'u1', projectId: 'p1', refId: ref.id, patch: { year: 2021 } })
  const good = await svc.reverify({ userId: 'u1', projectId: 'p1', refId: ref.id })
  assert.equal(good.verification.status, 'verified')
  assert.equal(good.statusHistory.at(-1).reason, 'reverified')
})

test('edit metadata: field tidak boleh diubah diabaikan; nilai tidak valid ditolak', async () => {
  const { svc } = mem()
  const s = await svc.search({ userId: 'u1', projectId: 'p1', params: { query: 'adaptive sparse attention' } })
  const ref = await svc.addCandidate({ userId: 'u1', projectId: 'p1', candidateId: s.candidates.find((c) => c.doi === A1).candidateId })
  await assert.rejects(() => svc.updateMetadata({ userId: 'u1', projectId: 'p1', refId: ref.id, patch: { citeKey: 'x', verification: { status: 'verified' } } }), (e) => e.code === 'VALIDATION_ERROR')
  await assert.rejects(() => svc.updateMetadata({ userId: 'u1', projectId: 'p1', refId: ref.id, patch: { doi: 'bukan-doi' } }), (e) => e.code === 'VALIDATION_ERROR')
  await assert.rejects(() => svc.updateMetadata({ userId: 'u1', projectId: 'p1', refId: ref.id, patch: { year: 'abc' } }), (e) => e.code === 'VALIDATION_ERROR')
})

test('jalur manual: DOI palsu tersimpan sebagai unverified (bukan verified) dan ditolak validator sitasi', async () => {
  const { svc } = mem()
  const out = await svc.verifyManual({ userId: 'u1', projectId: 'p1', input: { doi: '10.99999/palsu.1', title: 'Makalah Karangan', authors: ['Orang Fiktif'], year: 2022 }, add: true })
  assert.equal(out.verification.status, 'unverified')
  assert.equal(out.added.verification.status, 'unverified')
  assert.equal(out.added.source, 'user_provided')
  const ctx = await svc.listForContext('u1', 'p1')
  const r = sanitizeCitations(`Klaim \\cite{${out.added.citeKey}}.`, ctx)
  assert.ok(r.text.includes('[referensi belum terverifikasi]'))
  assert.ok(!r.text.includes(out.added.citeKey))
})

test('verifikasi manual tanpa menambah tidak menyimpan apa pun', async () => {
  const { svc } = mem()
  const out = await svc.verifyManual({ userId: 'u1', projectId: 'p1', input: { doi: A1, title: 'Adaptive Sparse Attention for Low-Resource Language Modeling', authors: ['Ratna Wulandari'], year: 2021 } })
  assert.equal(out.verification.status, 'verified')
  assert.equal(out.added, null)
  assert.equal((await svc.list('u1', 'p1')).length, 0)
})

test('checkClaim lewat layanan: referensi verified dengan abstrak + juri berkutipan sah -> supports; kunci tidak ada -> unknown', async () => {
  const judge = async () => ({ verdict: 'supports', quote: 'reduces memory use by 38 percent' })
  const { svc } = mem({ judge })
  const s = await svc.search({ userId: 'u1', projectId: 'p1', params: { query: 'adaptive sparse attention' } })
  const ref = await svc.addCandidate({ userId: 'u1', projectId: 'p1', candidateId: s.candidates.find((c) => c.doi === A1).candidateId })
  assert.equal((await svc.checkClaim({ userId: 'u1', projectId: 'p1', claim: 'Metode mengurangi memori hingga sekitar 38 persen.', citeKey: ref.citeKey })).verdict, 'supports')
  assert.equal((await svc.checkClaim({ userId: 'u1', projectId: 'p1', claim: 'Klaim apa saja di sini', citeKey: 'tidakada' })).reason, 'REFERENCE_NOT_FOUND')
})

// ---------------- tool + agen ----------------
test('tool literatur lewat registry agen: parameter asing/projectId ditolak; add_reference hanya kandidat milik sesi', async () => {
  const { svc } = mem()
  const registry = createToolRegistry(createLiteratureTools())
  const ctx = { userId: 'u1', projectId: 'p1', literature: svc }
  const hijack = await registry.execute('search_literature', { query: 'adaptive sparse', projectId: 'p2' }, ctx)
  assert.equal(hijack.error.code, 'TOOL_INVALID_INPUT')
  const found = await registry.execute('search_literature', { query: 'adaptive sparse attention' }, ctx)
  assert.equal(found.ok, true)
  assert.ok(found.output.limitations.length >= 3)
  const cand = found.output.candidates.find((c) => c.doi === A1)
  assert.ok(cand.candidateId && cand.abstract.length <= 403)
  const added = await registry.execute('add_reference', { candidateId: cand.candidateId }, ctx)
  assert.equal(added.output.status, 'verified')
  const ver = await registry.execute('verify_reference', { doi: '10.99999/fx.9999.999', title: 'Karangan' }, ctx)
  assert.equal(ver.output.status, 'unverified')
  const other = await registry.execute('add_reference', { candidateId: cand.candidateId }, { userId: 'u2', projectId: 'p1', literature: svc })
  assert.equal(other.ok, false)
})

test('agen + tool literatur + finalize: jawaban model dengan sitasi karangan disanitasi, sitasi referensi nyata proyek dipertahankan', async () => {
  const { svc } = mem()
  const registry = createToolRegistry(createLiteratureTools())
  const provider = createFakeProvider({
    script: [
      { toolUses: [{ name: 'search_literature', input: { query: 'adaptive sparse attention' } }] },
      (null, { text: 'Lihat \\cite{wulandari2021adaptive} dan \\cite{karanganmodel2025x}.' })
    ].map((s, i) => s)
  })
  // langkah 2 mengandalkan candidateId nyata: skrip dinamis
  const dynamic = createFakeProvider({
    script: (req, call) => {
      if (call === 0) return { toolUses: [{ name: 'search_literature', input: { query: 'adaptive sparse attention' } }] }
      if (call === 1) {
        const body = JSON.parse(req.messages.at(-1).content[0].content)
        const cand = body.data.candidates.find((c) => c.doi === A1)
        return { toolUses: [{ name: 'add_reference', input: { candidateId: cand.candidateId } }] }
      }
      return { text: 'Lihat \\cite{wulandari2021adaptive} dan \\cite{karanganmodel2025x}.' }
    }
  })
  const r = await runAgent({
    provider: dynamic,
    model: 'm',
    system: 's',
    messages: [{ role: 'user', content: 'cari referensi' }],
    registry,
    toolCtx: { userId: 'u1', projectId: 'p1', literature: svc },
    finalize: async (text) => {
      const refs = await svc.listForContext('u1', 'p1')
      const s = sanitizeCitations(text, refs)
      return { text: s.text, flags: s.flags }
    }
  })
  assert.equal(r.status, 'completed')
  assert.ok(r.text.includes('\\cite{wulandari2021adaptive}'))
  assert.ok(!r.text.includes('karanganmodel2025x'))
  assert.ok(r.text.includes('[referensi belum terverifikasi]'))
  assert.ok(r.flags.some((f) => f.type === 'orphan'))
  void provider
})

test('QC6: listForExport memuat tipe, venue, dan url (listForContext tidak) tanpa abstrak', async () => {
  const { createReferenceService, createFixtureProvider, CORPUS } = require('../index')
  const rows = [{ id: 'r1', userId: 'u', projectId: 'p', citeKey: 'k1', type: 'journal-article', title: 'T', year: 2021, authors: [{ family: 'A' }], venueName: 'Jurnal X', doi: '10.99999/x', url: 'https://x.org', abstract: 'abs', rawMetadata: { x: 1 }, verification: { status: 'verified' } }]
  const svc = createReferenceService({ refs: { list: async () => rows }, candidates: {}, assertOwned: async () => {}, providers: [createFixtureProvider(CORPUS)] })
  const full = (await svc.listForExport('u', 'p'))[0]
  assert.equal(full.type, 'journal-article')
  assert.equal(full.venueName, 'Jurnal X')
  assert.equal(full.url, 'https://x.org')
  assert.equal(full.abstract, undefined)
  assert.equal(full.rawMetadata, undefined)
  assert.equal((await svc.listForContext('u', 'p'))[0].venueName, undefined)
})
