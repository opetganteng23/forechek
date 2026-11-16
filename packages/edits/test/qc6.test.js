'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { parseManuscript } = require('@publication-prepare/manuscript')
const { createEditService } = require('../index')

const MD = '# T\n\n## Abstract\nAbstrak lama yang cukup.\n\n## Introduction\nPendahuluan lama.\n\n## Methods\nMetode lama.\n\n## References\n[1] A. Author, "Title," 2020.\n'
const TEX = '\\documentclass{article}\n\\begin{document}\n\\begin{abstract}\nAbstrak lama yang cukup.\n\\end{abstract}\n\\section{Introduction}\nPendahuluan lama.\n\\section{Methods}\nMetode lama.\n\\end{document}\n'

function env({ source = MD, format = 'markdown', now = () => new Date('2026-11-16T00:00:10Z') } = {}) {
  const st = { source, id: 'v1', number: 1, revision: 1, rows: [], saves: 0, failTransitionTo: null, logFail: false }
  let seq = 0
  const cur = () => ({ project: { revision: st.revision }, version: { id: st.id, number: st.number, format, source: st.source, parse: parseManuscript(st.source, format) } })
  const store = {
    async insert(d) { const r = { ...d, id: `e${++seq}`, createdAt: new Date() }; st.rows.push(r); return { ...r } },
    async findById(u, p, id) { const r = st.rows.find((x) => x.id === id && x.userId === u && x.projectId === p); return r ? { ...r } : null },
    async list(u, p) { return st.rows.filter((x) => x.userId === u && x.projectId === p).map((x) => ({ ...x })) },
    async countPending(u, p) { return st.rows.filter((x) => x.userId === u && x.projectId === p && x.status === 'pending').length },
    async staleOthers(u, p, versionId) { let n = 0; for (const r of st.rows) if (r.userId === u && r.projectId === p && r.status === 'pending' && r.baseVersionId !== versionId) { r.status = 'stale'; n++ } return n },
    async transition(id, from, patch) { if (st.failTransitionTo && patch.status === st.failTransitionTo) throw new Error('db down'); const r = st.rows.find((x) => x.id === id && x.status === from); if (!r) return null; Object.assign(r, patch); return { ...r } }
  }
  const svc = createEditService({
    current: { async getCurrent() { return cur() } },
    store,
    versions: { async save({ source: s, baseRevision }) { if (baseRevision !== st.revision) { const e = new Error('c'); e.code = 'VERSION_CONFLICT'; throw e } st.saves++; st.source = s; st.id = `v${++st.number}`; st.revision++; return { version: { number: st.number }, project: { revision: st.revision } } } },
    refs: { listForContext: async () => [] },
    log: async () => { if (st.logFail) throw new Error('log down') },
    now
  })
  return { svc, st }
}
const P = { userId: 'u', projectId: 'p' }
const code = async (fn) => { try { await fn(); return 'ok' } catch (e) { return (e.details && e.details.code) || e.code } }

test('QC6-4: usulan yang mengubah struktur naskah ditolak (heading baru, pagar kode tak tertutup, \\end{document})', async () => {
  const md = env()
  assert.equal(await code(() => md.svc.propose({ ...P, section: 'introduction', newText: 'baru\n\n## Conclusion\n\nteks', reason: 'alasan' })), 'STRUCTURE_CHANGED')
  assert.equal(await code(() => md.svc.propose({ ...P, section: 'introduction', newText: 'baru\n```\nunclosed', reason: 'alasan' })), 'STRUCTURE_CHANGED')
  assert.equal(await code(() => md.svc.propose({ ...P, section: 'introduction', newText: 'Pendahuluan baru yang aman.', reason: 'alasan' })), 'ok')
  const tex = env({ source: TEX, format: 'latex' })
  assert.equal(await code(() => tex.svc.propose({ ...P, section: 'introduction', newText: 'x \\end{document} y', reason: 'alasan' })), 'STRUCTURE_CHANGED')
  assert.equal(await code(() => tex.svc.propose({ ...P, section: 'introduction', newText: 'x \\input{/etc/passwd} y', reason: 'alasan' })), 'DANGEROUS_LATEX')
  assert.equal(await code(() => tex.svc.propose({ ...P, section: 'introduction', newText: 'x \\section{Evil} z', reason: 'alasan' })), 'STRUCTURE_CHANGED')
  assert.equal(await code(() => tex.svc.propose({ ...P, section: 'introduction', newText: 'x \\begin{itemize} tanpa end', reason: 'alasan' })), 'STRUCTURE_CHANGED')
  assert.equal(await code(() => tex.svc.propose({ ...P, section: 'introduction', newText: 'Pendahuluan baru yang aman.', reason: 'alasan' })), 'ok')
})

test('QC6-5: proposal accepting yang macet dipulihkan: tanpa versi tersimpan -> pending; versi tersimpan -> accepted', async () => {
  let t = new Date('2026-11-16T00:00:10Z')
  const a = env({ now: () => t })
  const e = await a.svc.propose({ ...P, section: 'abstract', newText: 'Abstrak baru.', reason: 'alasan' })
  Object.assign(a.st.rows[0], { status: 'accepting', claimedAt: t }) // proses mati setelah klaim, sebelum simpan
  t = new Date(t.getTime() + 5 * 60 * 1000)
  assert.equal((await a.svc.get({ ...P, editId: e.id })).status, 'pending')
  assert.equal((await a.svc.accept({ ...P, editId: e.id, baseRevision: 1 })).edit.status, 'accepted')

  const b = env({ now: () => t })
  const e2 = await b.svc.propose({ ...P, section: 'abstract', newText: 'Abstrak baru.', reason: 'alasan' })
  b.st.failTransitionTo = 'accepted'
  await assert.rejects(b.svc.accept({ ...P, editId: e2.id, baseRevision: 1 })) // versi tersimpan, transisi akhir gagal
  b.st.failTransitionTo = null
  assert.equal(b.st.saves, 1)
  t = new Date(t.getTime() + 5 * 60 * 1000)
  const g = await b.svc.get({ ...P, editId: e2.id })
  assert.equal(g.status, 'accepted')
  assert.equal(g.resultVersionNumber, 2)
})

test('QC6-5b: kegagalan log setelah versi tersimpan tidak menjadi galat bagi pengguna', async () => {
  const a = env()
  const e = await a.svc.propose({ ...P, section: 'abstract', newText: 'Abstrak baru.', reason: 'alasan' })
  a.st.logFail = true
  assert.equal((await a.svc.accept({ ...P, editId: e.id, baseRevision: 1 })).edit.status, 'accepted')
})

test('QC6-6: usulan stale tidak mengisi batas pending setelah versi baru', async () => {
  const a = env()
  for (let i = 0; i < 20; i++) await a.svc.propose({ ...P, section: 'abstract', newText: `Abstrak varian ${i}.`, reason: 'alasan' })
  a.st.source += '\nCatatan.\n'; a.st.id = 'v2'; a.st.number = 2; a.st.revision = 2
  assert.equal(await code(() => a.svc.propose({ ...P, section: 'abstract', newText: 'Abstrak setelah versi baru.', reason: 'alasan' })), 'ok')
})

test('QC6-mut: usulan stale bila teks pada rentang berubah walau id versi sama (cek rentang berdiri sendiri)', async () => {
  const a = env()
  const e = await a.svc.propose({ ...P, section: 'abstract', newText: 'Abstrak baru.', reason: 'alasan' })
  a.st.source = a.st.source.replace('Abstrak lama yang cukup.', 'Abstrak diubah diam-diam.') // id versi tidak berubah
  assert.equal(await code(() => a.svc.accept({ ...P, editId: e.id, baseRevision: 1 })), 'EDIT_STALE')
})

test('QC6-mut: klaim CAS menghentikan accept kedua SEBELUM menyimpan versi (penyimpanan versi tidak pernah dipanggil dua kali)', async () => {
  const a = env()
  const e = await a.svc.propose({ ...P, section: 'abstract', newText: 'Abstrak baru.', reason: 'alasan' })
  const saves = []
  const orig = a.st
  const res = await Promise.allSettled([a.svc.accept({ ...P, editId: e.id, baseRevision: 1 }), a.svc.accept({ ...P, editId: e.id, baseRevision: 1 })])
  saves.push(orig.saves)
  assert.equal(res.filter((r) => r.status === 'fulfilled').length, 1)
  assert.equal(saves[0], 1)
})

test('T6-02: propose menolak LaTeX berbahaya (\write18, \input, \include, \openin) pada naskah LaTeX', async () => {
  const tex = env({ source: TEX, format: 'latex' })
  for (const bad of ['x \\immediate\\write18{ls} y', 'x \\input{/etc/passwd} y', 'x \\include{evil} y', 'x \\openin5=/etc/passwd y']) {
    assert.equal(await code(() => tex.svc.propose({ ...P, section: 'introduction', newText: bad, reason: 'alasan' })), 'DANGEROUS_LATEX', bad)
  }
})

test('T6-03: mengganti bagian yang memiliki subbagian tanpa mempertahankannya ditolak; mempertahankannya diterima', async () => {
  const src = '# T\n\n## Methods\nIsi metode.\n\n### Data\nIsi data.\n\n### Model\nIsi model.\n\n## References\n[1] A.\n'
  const a = env({ source: src })
  assert.equal(await code(() => a.svc.propose({ ...P, section: 'methods', newText: 'Metode ringkas tanpa subbagian.', reason: 'alasan' })), 'STRUCTURE_CHANGED')
  assert.equal(await code(() => a.svc.propose({ ...P, section: 'methods', newText: 'Metode baru.\n\n### Data\nData baru.\n\n### Model\nModel baru.', reason: 'alasan' })), 'ok')
})

test('F-02: gerbang usulan edit menolak atribusi naratif karangan (tanpa kurung, bertanda siku, tanpa tahun)', async () => {
  const a = env()
  for (const bad of ['Zhang 2022 melaporkan peningkatan akurasi.', 'Seperti ditunjukkan [ 3 ] dan lainnya.', 'Menurut Fiction, metodenya baik.', 'Smith et al. 2020 reported gains.']) {
    assert.equal(await code(() => a.svc.propose({ ...P, section: 'introduction', newText: bad, reason: 'alasan' })), 'CITATION_NOT_VERIFIED', bad)
  }
})
