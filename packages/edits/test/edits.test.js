'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { parseManuscript } = require('@publication-prepare/manuscript')
const { createEditService, createEditTools, diffLines, MAX_PENDING } = require('../index')

const SRC = `# Judul Naskah

## Abstract
Abstrak awal yang cukup panjang untuk uji. Baris dua.

## Introduction
Pendahuluan lama dengan klaim (Wulandari, 2021).

## References
[1] A. Author, "Title," 2020.
`
const REFS = [{ citeKey: 'wulandari2021adaptive', title: 'Adaptive Sparse Attention for Low-Resource Language Modeling', year: 2021, authors: [{ family: 'Wulandari' }, { family: 'Mei' }], doi: '10.99999/fx.2021.001', verificationStatus: 'verified', verification: { status: 'verified' } }]

function env({ owner = 'u1', source = SRC, refs = REFS } = {}) {
  const state = { source, id: 'v1', number: 1, revision: 1, rows: [], logs: [], saves: 0 }
  const cur = () => ({ project: { revision: state.revision }, version: { id: state.id, number: state.number, format: 'markdown', source: state.source, parse: parseManuscript(state.source, 'markdown') } })
  let seq = 0
  const store = {
    async insert(d) { const r = { ...d, id: `e${++seq}`, createdAt: new Date() }; state.rows.push(r); return { ...r } },
    async findById(u, p, id) { const r = state.rows.find((x) => x.id === id && x.userId === u && x.projectId === p); return r ? { ...r } : null },
    async list(u, p) { return state.rows.filter((x) => x.userId === u && x.projectId === p).map((x) => ({ ...x })) },
    async staleOthers(u, p, versionId) { let n = 0; for (const r of state.rows) if (r.userId === u && r.projectId === p && r.status === 'pending' && r.baseVersionId !== versionId) { r.status = 'stale'; n++ } return n },
    async countPending(u, p) { return state.rows.filter((x) => x.userId === u && x.projectId === p && x.status === 'pending').length },
    async transition(id, from, patch) { const r = state.rows.find((x) => x.id === id && x.status === from); if (!r) return null; Object.assign(r, patch); return { ...r } }
  }
  const svc = createEditService({
    current: { async getCurrent(u, p) { return u === owner && p === 'p1' ? cur() : null } },
    store,
    versions: {
      async save({ source: s, baseRevision }) {
        if (baseRevision !== state.revision) { const e = new Error('x'); e.code = 'VERSION_CONFLICT'; throw e }
        state.saves++; state.source = s; state.id = `v${++state.number}`; state.revision++
        return { version: { number: state.number }, project: { revision: state.revision } }
      }
    },
    refs: { listForContext: async () => refs },
    log: async (e) => { state.logs.push(e) }
  })
  return { svc, state }
}
const P = { userId: 'u1', projectId: 'p1' }

test('diffLines: eq/del/add benar dan deterministik', () => {
  const d = diffLines('a\nb\nc', 'a\nx\nc')
  assert.deepEqual(d.map((x) => x.op), ['eq', 'del', 'add', 'eq'])
  assert.deepEqual(diffLines('', 'a'), [{ op: 'add', text: 'a' }])
})

test('propose: membuat usulan pending TANPA mengubah naskah; before = teks bagian persis', async () => {
  const { svc, state } = env()
  const e = await svc.propose({ ...P, section: 'abstract', newText: 'Abstrak baru yang lebih baik.', reason: 'Lebih ringkas' })
  assert.equal(e.status, 'pending')
  assert.equal(e.before, '\nAbstrak awal yang cukup panjang untuk uji. Baris dua.\n\n')
  assert.ok(e.after.endsWith('\n\n'), 'pemisah akhir bagian dipertahankan')
  assert.ok(e.diff.some((d) => d.op === 'add'))
  assert.equal(state.source, SRC)
  assert.equal(state.saves, 0)
  assert.equal(state.logs[0].kind, 'edit_suggested')
})

test('propose: validasi - bagian tidak ada, references dilindungi, tanpa perubahan, alasan wajib, naskah kosong, bukan pemilik', async () => {
  const { svc } = env()
  const code = async (p) => { try { await svc.propose({ ...P, ...p }); return 'ok' } catch (e) { return (e.details && e.details.code) || e.code } }
  assert.equal(await code({ section: 'tidak-ada', newText: 'x y z', reason: 'alasan' }), 'SECTION_NOT_FOUND')
  assert.equal(await code({ section: 'references', newText: 'x y z', reason: 'alasan' }), 'SECTION_PROTECTED')
  assert.equal(await code({ section: 'abstract', newText: 'Abstrak awal yang cukup panjang untuk uji. Baris dua.', reason: 'alasan' }), 'NO_CHANGE')
  assert.equal(await code({ section: 'abstract', newText: 'baru', reason: 'x' }), 'VALIDATION_ERROR')
  assert.equal(await code({ section: 'abstract', newText: 'a'.repeat(30001), reason: 'alasan' }), 'VALIDATION_ERROR')
  assert.equal(await code({ userId: 'u2', section: 'abstract', newText: 'baru', reason: 'alasan' }), 'NOT_FOUND')
})

test('propose: sitasi karangan baru ditolak (fail-closed); sitasi terverifikasi dan sitasi lama yang sudah ada tidak menghalangi', async () => {
  const { svc } = env()
  const bad = svc.propose({ ...P, section: 'introduction', newText: 'Klaim baru (Karangan, 2024) dan \\cite{palsu2024}.', reason: 'tambah sitasi' })
  await assert.rejects(bad, (e) => e.details.code === 'CITATION_NOT_VERIFIED')
  const ok = await svc.propose({ ...P, section: 'introduction', newText: 'Klaim baru (Wulandari, 2021) lebih kuat.', reason: 'perkuat klaim' })
  assert.equal(ok.status, 'pending')
  const withOrphan = env({ source: SRC.replace('(Wulandari, 2021)', '(Orang, 1999)') })
  const keep = await withOrphan.svc.propose({ ...P, section: 'introduction', newText: 'Pendahuluan lama dengan klaim (Orang, 1999) dan tambahan.', reason: 'tambah kalimat' })
  assert.equal(keep.status, 'pending', 'sitasi bermasalah yang sudah ada pada naskah bukan kesalahan usulan')
})

test('accept: membuat versi baru dengan teks persis; status accepted; tercatat di log; tidak bisa diterima dua kali', async () => {
  const { svc, state } = env()
  const e = await svc.propose({ ...P, section: 'abstract', newText: 'Abstrak baru.', reason: 'ringkas' })
  const r = await svc.accept({ ...P, editId: e.id, baseRevision: 1 })
  assert.equal(r.edit.status, 'accepted')
  assert.equal(r.edit.resultVersionNumber, 2)
  assert.equal(state.source, SRC.replace('Abstrak awal yang cukup panjang untuk uji. Baris dua.', 'Abstrak baru.'))
  assert.deepEqual(state.logs.map((l) => l.kind), ['edit_suggested', 'edit_accepted'])
  await assert.rejects(svc.accept({ ...P, editId: e.id, baseRevision: 2 }), (x) => x.details.code === 'EDIT_DECIDED')
  assert.equal(state.saves, 1)
})

test('accept bersamaan: tepat satu versi dibuat', async () => {
  const { svc, state } = env()
  const e = await svc.propose({ ...P, section: 'abstract', newText: 'Abstrak baru.', reason: 'ringkas' })
  const res = await Promise.allSettled([svc.accept({ ...P, editId: e.id, baseRevision: 1 }), svc.accept({ ...P, editId: e.id, baseRevision: 1 })])
  assert.equal(res.filter((r) => r.status === 'fulfilled').length, 1)
  assert.equal(state.saves, 1)
})

test('accept: versi dasar berubah -> ditolak sebagai stale, naskah tidak berubah, usulan ditandai stale', async () => {
  const { svc, state } = env()
  const e = await svc.propose({ ...P, section: 'abstract', newText: 'Abstrak baru.', reason: 'ringkas' })
  state.source += '\nTambahan pengguna.\n'; state.id = 'v2'; state.number = 2; state.revision = 2
  const before = state.source
  await assert.rejects(svc.accept({ ...P, editId: e.id, baseRevision: 2 }), (x) => x.details.code === 'EDIT_STALE')
  assert.equal(state.source, before)
  assert.equal((await svc.get({ ...P, editId: e.id })).status, 'stale')
  await assert.rejects(svc.accept({ ...P, editId: e.id, baseRevision: 2 }), (x) => x.details.code === 'EDIT_STALE')
})

test('accept: konflik revisi klien mengembalikan usulan ke pending (dapat dicoba lagi)', async () => {
  const { svc, state } = env()
  const e = await svc.propose({ ...P, section: 'abstract', newText: 'Abstrak baru.', reason: 'ringkas' })
  await assert.rejects(svc.accept({ ...P, editId: e.id, baseRevision: 0 }), (x) => x.code === 'VERSION_CONFLICT')
  assert.equal((await svc.get({ ...P, editId: e.id })).status, 'pending')
  assert.equal(state.saves, 0)
  assert.equal((await svc.accept({ ...P, editId: e.id, baseRevision: 1 })).edit.status, 'accepted')
})

test('accept: baseRevision wajib; sitasi yang menjadi tidak terverifikasi sejak usulan menghentikan penerapan', async () => {
  const e1 = env()
  const e = await e1.svc.propose({ ...P, section: 'abstract', newText: 'Klaim baru (Wulandari, 2021) lebih kuat.', reason: 'perkuat' })
  await assert.rejects(e1.svc.accept({ ...P, editId: e.id }), (x) => x.code === 'VALIDATION_ERROR')
  const refs = [...REFS]
  const e2 = env({ refs })
  const p = await e2.svc.propose({ ...P, section: 'abstract', newText: 'Klaim baru (Wulandari, 2021) lebih kuat.', reason: 'perkuat' })
  refs.length = 0 // referensi dihapus
  await assert.rejects(e2.svc.accept({ ...P, editId: p.id, baseRevision: 1 }), (x) => x.details.code === 'CITATION_NOT_VERIFIED')
  assert.equal(e2.state.saves, 0)
})

test('reject: status rejected, tercatat, tidak mengubah naskah, tidak dapat diterima sesudahnya', async () => {
  const { svc, state } = env()
  const e = await svc.propose({ ...P, section: 'abstract', newText: 'Abstrak baru.', reason: 'ringkas' })
  assert.equal((await svc.reject({ ...P, editId: e.id })).status, 'rejected')
  assert.equal(state.source, SRC)
  assert.equal(state.logs.at(-1).kind, 'edit_rejected')
  await assert.rejects(svc.accept({ ...P, editId: e.id, baseRevision: 1 }), (x) => x.details.code === 'EDIT_DECIDED')
  await assert.rejects(svc.reject({ ...P, editId: e.id }), (x) => x.details.code === 'EDIT_DECIDED')
})

test('IDOR: pengguna/proyek lain tidak dapat melihat, menerima, atau menolak usulan', async () => {
  const { svc } = env()
  const e = await svc.propose({ ...P, section: 'abstract', newText: 'Abstrak baru.', reason: 'ringkas' })
  for (const who of [{ userId: 'u2', projectId: 'p1' }, { userId: 'u1', projectId: 'p2' }]) {
    await assert.rejects(svc.get({ ...who, editId: e.id }), (x) => x.code === 'NOT_FOUND')
    await assert.rejects(svc.accept({ ...who, editId: e.id, baseRevision: 1 }), (x) => x.code === 'NOT_FOUND')
    await assert.rejects(svc.reject({ ...who, editId: e.id }), (x) => x.code === 'NOT_FOUND')
  }
})

test('batas usulan pending per proyek', async () => {
  const { svc } = env()
  for (let i = 0; i < MAX_PENDING; i++) await svc.propose({ ...P, section: 'abstract', newText: `Abstrak varian ${i}.`, reason: 'varian' })
  await assert.rejects(svc.propose({ ...P, section: 'abstract', newText: 'Satu lagi.', reason: 'varian' }), (x) => x.details.code === 'TOO_MANY_PENDING')
})

test('tool propose_edit: parameter asing ditolak skema, galat layanan menjadi ToolError berkode', async () => {
  const [tool] = createEditTools()
  assert.equal(tool.inputSchema.additionalProperties, false)
  const { svc } = env()
  const out = await tool.handler({ section: 'abstract', new_text: 'Abstrak baru.', reason: 'ringkas' }, { edits: svc, ...P })
  assert.equal(out.status, 'pending')
  await assert.rejects(tool.handler({ section: 'references', new_text: 'x y', reason: 'alasan' }, { edits: svc, ...P }), (x) => x.name === 'ToolError' && x.code === 'SECTION_PROTECTED')
})
