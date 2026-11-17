'use strict'
const { AppError } = require('@publication-prepare/core')
const { sanitizeCitations } = require('@publication-prepare/literature')
const { parseManuscript } = require('@publication-prepare/manuscript')
const { diffLines } = require('./diff')

// Alur usulan edit (MTS 41.2 A). AI hanya MENGUSULKAN; naskah berubah hanya lewat accept eksplisit pengguna, yang membuat
// versi baru (origin ai_edit_accepted). Usulan terikat ke versi dasar (baseVersionId) dan rentang offset; bila versi aktif
// sudah berbeda, penerapan otomatis ditolak (stale) dan pengguna diminta meninjau ulang.
const MAX_SECTION_CHARS = 30000
const MAX_AFTER_CHARS = 30000
const MAX_PENDING = 20
const ACCEPTING_TIMEOUT_MS = 60 * 1000 // klaim 'accepting' lebih lama dari ini dianggap macet (proses mati) dan dipulihkan
// Konstruksi LaTeX yang tidak boleh MUNCUL BARU lewat usulan (membaca berkas, menjalankan perintah, mengubah dokumen).
const DANGEROUS_TEX = /\\(write18|immediate|openout|openin|input|include|read|catcode|directlua|usepackage|documentclass)(?![a-zA-Z])/

// Dependensi (diinjeksi; semua pembacaan wajib difilter kepemilikan oleh implementasinya):
//   current : getCurrent(userId, projectId) -> {project:{revision}, version:{id, number, format, source, parse}} | null
//   store   : insert(doc), findById(userId, projectId, id), list(userId, projectId), countPending(userId, projectId),
//             transition(id, fromStatus, patch) -> dokumen | null  (compare-and-set atas status)
//   versions: save({userId, projectId, source, format, baseRevision, note}) -> {version}
//   refs    : listForContext(userId, projectId)
//   log     : (entry) -> Promise (jejak AI usage; tidak memuat isi naskah)
function createEditService({ current, store, versions, refs, log = async () => {}, now = () => new Date() }) {
  const safeLog = async (e) => { try { await log(e) } catch { /* jejak AI gagal tidak boleh membatalkan hasil yang sudah tersimpan */ } }
  const headingsOf = (source, format) => (parseManuscript(source, format).sections || []).map((x) => x.heading)
  const balanced = (t) => (t.match(/\\begin\{/g) || []).length === (t.match(/\\end\{/g) || []).length

  const view = (p, { full = true } = {}) => ({
    id: p.id,
    status: p.status,
    section: p.section,
    heading: p.heading,
    baseVersionNumber: p.baseVersionNumber,
    reason: p.reason,
    createdBy: p.createdBy,
    createdAt: p.createdAt,
    decidedAt: p.decidedAt || null,
    resultVersionNumber: p.resultVersionNumber || null,
    ...(full ? { before: p.before, after: p.after, diff: diffLines(p.before, p.after) } : {})
  })

  // Sitasi baru pada teks hasil edit yang tidak punya referensi terverifikasi ditolak (fail-closed). Sitasi bermasalah
  // yang SUDAH ada pada teks asli tidak menghalangi edit (itu bukan kesalahan usulan).
  async function assertNoNewUnverifiedCitations(userId, projectId, before, after) {
    const list = await refs.listForContext(userId, projectId)
    let a
    let b
    try {
      a = sanitizeCitations(after, list)
      b = sanitizeCitations(before, list)
    } catch {
      throw new AppError('VALIDATION_ERROR', 'Teks usulan tidak dapat diperiksa sitasinya (terlalu panjang atau tidak valid)', { details: { code: 'CITATION_CHECK_FAILED' } })
    }
    const had = new Set(b.flags.map((f) => `${f.type}|${f.detail}`))
    const fresh = a.flags.filter((f) => !had.has(`${f.type}|${f.detail}`))
    if (fresh.length) throw new AppError('VALIDATION_ERROR', 'Usulan memuat sitasi tanpa referensi terverifikasi; ditolak. Tambahkan dan verifikasi referensinya lebih dulu.', { details: { code: 'CITATION_NOT_VERIFIED', citations: [...new Set(fresh.map((f) => f.detail))].slice(0, 5) } })
  }

  async function propose({ userId, projectId, section, newText, reason, messageId = null, createdBy = 'ai' }) {
    const cur = await current.getCurrent(userId, projectId)
    if (!cur) throw new AppError('NOT_FOUND', 'Data tidak ditemukan')
    if (!cur.version) throw new AppError('CONFLICT', 'Proyek belum memiliki naskah tersimpan', { details: { code: 'NO_MANUSCRIPT' } })
    if (typeof newText !== 'string' || !newText.trim() || newText.length > MAX_AFTER_CHARS) throw new AppError('VALIDATION_ERROR', `Teks usulan wajib diisi dan maksimal ${MAX_AFTER_CHARS} karakter`)
    if (typeof reason !== 'string' || reason.trim().length < 5) throw new AppError('VALIDATION_ERROR', 'Alasan usulan wajib diisi (minimal 5 karakter)')
    const want = String(section || '').trim().toLowerCase()
    const sections = (cur.version.parse && cur.version.parse.sections) || []
    const found = want && (sections.find((s) => s.key === want) || sections.find((s) => String(s.heading).trim().toLowerCase() === want))
    if (!found) throw new AppError('VALIDATION_ERROR', `Bagian tidak ditemukan. Tersedia: ${sections.slice(0, 20).map((s) => s.heading).join(' | ') || '(tidak ada)'}`, { details: { code: 'SECTION_NOT_FOUND' } })
    if (found.key === 'references') throw new AppError('VALIDATION_ERROR', 'Daftar pustaka tidak dapat diedit lewat usulan AI; kelola lewat tab Referensi.', { details: { code: 'SECTION_PROTECTED' } })

    const before = cur.version.source.slice(found.bodyStart, found.end)
    if (before.length > MAX_SECTION_CHARS) throw new AppError('VALIDATION_ERROR', 'Bagian terlalu panjang untuk diusulkan sekaligus', { details: { code: 'SECTION_TOO_LONG' } })
    // Pertahankan pemisah akhir bagian agar heading berikutnya tidak menempel.
    const lead = /^\s*/.exec(before)[0]
    const tail = /\s*$/.exec(before)[0]
    const after = lead + newText.trim() + tail
    if (after === before) throw new AppError('VALIDATION_ERROR', 'Usulan tidak mengubah teks', { details: { code: 'NO_CHANGE' } })
    // Struktur naskah tidak boleh berubah diam-diam: setelah penggantian, daftar heading harus sama persis
    // (mencegah heading/subbagian baru atau hilang, pagar kode tak tertutup, \end{document} sisipan).
    const newSource = cur.version.source.slice(0, found.bodyStart) + after + cur.version.source.slice(found.end)
    const fail = (c, m) => new AppError('VALIDATION_ERROR', m, { details: { code: c } })
    if (cur.version.format === 'latex') {
      const had = DANGEROUS_TEX.exec(before)
      const m = DANGEROUS_TEX.exec(after)
      if (m && (!had || had[1] !== m[1])) throw fail('DANGEROUS_LATEX', 'Usulan memuat perintah LaTeX berbahaya (' + m[0] + '); ditolak.')
      if (!balanced(after)) throw fail('STRUCTURE_CHANGED', 'Usulan memuat \\begin/\\end yang tidak seimbang; ditolak.')
    }
    if ((after.match(/^\s*```/gm) || []).length % 2) throw fail('STRUCTURE_CHANGED', 'Usulan memuat pagar kode yang tidak tertutup; ditolak.')
    const h0 = headingsOf(cur.version.source, cur.version.format)
    const h1 = headingsOf(newSource, cur.version.format)
    if (h0.length !== h1.length || h0.some((h, i) => h !== h1[i])) throw fail('STRUCTURE_CHANGED', 'Usulan mengubah struktur naskah (bagian/subbagian bertambah atau hilang). Pertahankan semua subbagian atau ajukan usulan terpisah.')
    await store.staleOthers(userId, projectId, cur.version.id) // usulan dari versi lama tidak boleh mengisi batas
    if (await store.countPending(userId, projectId) >= MAX_PENDING) throw new AppError('CONFLICT', 'Terlalu banyak usulan menunggu keputusan; terima atau tolak sebagian dulu', { details: { code: 'TOO_MANY_PENDING' } })
    await assertNoNewUnverifiedCitations(userId, projectId, before, after)

    const doc = await store.insert({
      userId, projectId, baseVersionId: cur.version.id, baseVersionNumber: cur.version.number, section: found.key || null, heading: found.heading,
      start: found.bodyStart, end: found.end, before, after, reason: reason.trim().slice(0, 500), status: 'pending', createdBy, messageId
    })
    await safeLog({ userId, projectId, kind: 'edit_suggested', sections: [found.heading], summary: `Usulan edit bagian "${String(found.heading).slice(0, 80)}"`, messageId: null })
    return view(doc)
  }

  async function get({ userId, projectId, editId }) {
    const p = await store.findById(userId, projectId, editId)
    if (!p) throw new AppError('NOT_FOUND', 'Data tidak ditemukan')
    return view(await settleStale(await recover(p)))
  }

  async function list({ userId, projectId }) {
    const cur = await current.getCurrent(userId, projectId)
    if (!cur) throw new AppError('NOT_FOUND', 'Data tidak ditemukan')
    const rows = await store.list(userId, projectId)
    const out = []
    for (const p of rows) out.push(view(await settleStale(await recover(p, cur), cur), { full: false }))
    return out
  }

  // Klaim 'accepting' yang macet (proses mati / transisi akhir gagal): bila versi hasil sudah tersimpan -> accepted,
  // bila belum -> kembali pending. Aman diulang; hanya berlaku setelah ACCEPTING_TIMEOUT_MS.
  async function recover(p, cur) {
    if (p.status !== 'accepting' || now() - new Date(p.claimedAt || p.createdAt) < ACCEPTING_TIMEOUT_MS) return p
    cur = cur || (await current.getCurrent(p.userId, p.projectId))
    const applied = cur && cur.version && cur.version.id !== p.baseVersionId && cur.version.number === p.baseVersionNumber + 1 && cur.version.source.slice(p.start, p.start + p.after.length) === p.after
    const next = applied ? { status: 'accepted', decidedAt: now(), resultVersionNumber: cur.version.number } : { status: 'pending' }
    return (await store.transition(p.id, 'accepting', next)) || (await store.findById(p.userId, p.projectId, p.id)) || p
  }

  // Usulan pending yang versi dasarnya bukan lagi versi aktif ditandai stale (tampilan jujur; tidak pernah diterapkan).
  async function settleStale(p, cur) {
    if (p.status !== 'pending') return p
    cur = cur || (await current.getCurrent(p.userId, p.projectId))
    if (cur && cur.version && cur.version.id === p.baseVersionId) return p
    return (await store.transition(p.id, 'pending', { status: 'stale', decidedAt: now() })) || p
  }

  async function accept({ userId, projectId, editId, baseRevision }) {
    let p0 = await store.findById(userId, projectId, editId)
    if (!p0) throw new AppError('NOT_FOUND', 'Data tidak ditemukan')
    p0 = await recover(p0)
    if (p0.status !== 'pending') throw new AppError('CONFLICT', p0.status === 'stale' ? 'Usulan kedaluwarsa karena naskah berubah. Minta usulan baru.' : 'Usulan sudah diputuskan', { details: { code: p0.status === 'stale' ? 'EDIT_STALE' : 'EDIT_DECIDED', status: p0.status } })
    if (!Number.isInteger(baseRevision) || baseRevision < 0) throw new AppError('VALIDATION_ERROR', 'baseRevision wajib (bilangan bulat)')
    const cur = await current.getCurrent(userId, projectId)
    if (!cur || !cur.version) throw new AppError('NOT_FOUND', 'Data tidak ditemukan')
    const intact = cur.version.id === p0.baseVersionId && cur.version.source.slice(p0.start, p0.end) === p0.before
    if (!intact) {
      await store.transition(p0.id, 'pending', { status: 'stale', decidedAt: now() })
      throw new AppError('CONFLICT', 'Naskah sudah berubah sejak usulan dibuat. Penerapan otomatis ditolak; minta usulan baru atau tinjau ulang.', { details: { code: 'EDIT_STALE' } })
    }
    await assertNoNewUnverifiedCitations(userId, projectId, p0.before, p0.after) // referensi bisa berubah sejak usulan dibuat

    const claimed = await store.transition(p0.id, 'pending', { status: 'accepting', claimedAt: now() })
    if (!claimed) throw new AppError('CONFLICT', 'Usulan sedang atau sudah diputuskan', { details: { code: 'EDIT_DECIDED' } })
    const source = cur.version.source.slice(0, p0.start) + p0.after + cur.version.source.slice(p0.end)
    let saved
    try {
      saved = await versions.save({ userId, projectId, source, format: cur.version.format, baseRevision, note: `Usulan AI diterima: ${String(p0.heading).slice(0, 80)}` })
    } catch (err) {
      await store.transition(p0.id, 'accepting', { status: 'pending' }).catch(() => {})
      throw err
    }
    const done = await store.transition(p0.id, 'accepting', { status: 'accepted', decidedAt: now(), resultVersionNumber: saved.version.number })
    await safeLog({ userId, projectId, kind: 'edit_accepted', sections: [p0.heading], summary: `Usulan edit diterima, menjadi versi ${saved.version.number}`, messageId: null })
    return { edit: view(done || { ...claimed, status: 'accepted', resultVersionNumber: saved.version.number }), version: saved.version, project: saved.project }
  }

  async function reject({ userId, projectId, editId }) {
    let p0 = await store.findById(userId, projectId, editId)
    if (!p0) throw new AppError('NOT_FOUND', 'Data tidak ditemukan')
    p0 = await recover(p0)
    const done = await store.transition(p0.id, 'pending', { status: 'rejected', decidedAt: now() })
    if (!done) throw new AppError('CONFLICT', 'Usulan sudah diputuskan', { details: { code: 'EDIT_DECIDED', status: p0.status } })
    await safeLog({ userId, projectId, kind: 'edit_rejected', sections: [p0.heading], summary: 'Usulan edit ditolak', messageId: null })
    return view(done)
  }

  return { propose, get, list, accept, reject }
}

module.exports = { createEditService, MAX_PENDING, MAX_AFTER_CHARS }
