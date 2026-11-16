'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { createProjectService, MAX_PROJECTS_PER_USER } = require('../src/service')

// ---------- model palsu di memori (cukup untuk operasi yang dipakai service) ----------
let oidCounter = 0
const newObjectId = () => (++oidCounter).toString(16).padStart(24, '0')
let tick = 0
const clock = () => new Date(1700000000000 + ++tick * 1000)

function matches(doc, filter) {
  return Object.entries(filter).every(([k, v]) => String(doc[k]) === String(v))
}
function applyUpdate(doc, update) {
  if (update.$set) Object.assign(doc, update.$set)
  if (update.$inc) for (const [k, v] of Object.entries(update.$inc)) doc[k] = (doc[k] || 0) + v
  doc.updatedAt = clock()
}
function makeModel({ uniqueKeys = [], failCreate } = {}) {
  const docs = []
  const model = {
    docs,
    failCreate,
    async create(data) {
      if (model.failCreate) throw new Error('db down')
      const doc = { _id: newObjectId(), createdAt: clock(), updatedAt: clock(), ...data }
      if (uniqueKeys.length && docs.some((d) => uniqueKeys.every((k) => String(d[k]) === String(doc[k])))) {
        const e = new Error('E11000 duplicate key')
        e.code = 11000
        throw e
      }
      docs.push(doc)
      return { ...doc, toObject: () => ({ ...doc }) }
    },
    findOne(filter) { return query(() => docs.filter((d) => matches(d, filter)).slice(0, 1)).first() },
    find(filter) { return query(() => docs.filter((d) => matches(d, filter))) },
    async countDocuments(filter) { return docs.filter((d) => matches(d, filter)).length },
    findOneAndUpdate(filter, update) {
      const doc = docs.find((d) => matches(d, filter))
      if (doc) applyUpdate(doc, update)
      return query(() => (doc ? [{ ...doc }] : [])).first()
    },
    async updateOne(filter, update) {
      const doc = docs.find((d) => matches(d, filter))
      if (doc) applyUpdate(doc, update)
      return { matchedCount: doc ? 1 : 0 }
    },
    async deleteMany(filter) {
      for (let i = docs.length - 1; i >= 0; i--) if (matches(docs[i], filter)) docs.splice(i, 1)
    },
    async deleteOne(filter) {
      const i = docs.findIndex((d) => matches(d, filter))
      if (i >= 0) docs.splice(i, 1)
    }
  }
  return model
}
function query(run) {
  let sortSpec = null, omit = null, lim = null, single = false
  const q = {
    sort(s) { sortSpec = s; return q },
    select(s) { omit = String(s).split(/\s+/).filter((x) => x.startsWith('-')).map((x) => x.slice(1)); return q },
    limit(n) { lim = n; return q },
    first() { single = true; return q },
    lean() { return q },
    then(res, rej) {
      let out = run().map((d) => ({ ...d }))
      if (sortSpec) {
        const [[k, dir]] = Object.entries(sortSpec)
        out.sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * dir)
      }
      if (lim) out = out.slice(0, lim)
      if (omit) out = out.map((d) => { omit.forEach((f) => delete d[f]); return d })
      return Promise.resolve(single ? out[0] || null : out).then(res, rej)
    }
  }
  return q
}

function setup(opts = {}) {
  const Project = makeModel()
  const ManuscriptVersion = makeModel({ uniqueKeys: ['projectId', 'number'] })
  const svc = createProjectService({ Project, ManuscriptVersion, newObjectId, now: clock, ...opts })
  return { Project, ManuscriptVersion, svc }
}
const U1 = 'a'.repeat(24)
const U2 = 'b'.repeat(24)
const MD = '# Judul\n\n## Abstract\nIsi abstrak yang cukup.\n\n## Introduction\nHalo.\n\n## Conclusion\nSelesai.\n'

test('createProject: validasi dan nilai awal', async () => {
  const { svc } = setup()
  const p = await svc.createProject(U1, { title: '  Proyek A  ', language: 'english' })
  assert.equal(p.title, 'Proyek A')
  assert.equal(p.revision, 0)
  assert.equal(p.versionCount, 0)
  await assert.rejects(svc.createProject(U1, { title: '' }), { code: 'VALIDATION_ERROR' })
  await assert.rejects(svc.createProject(U1, { title: 'x', language: 'klingon' }), { code: 'VALIDATION_ERROR' })
  await assert.rejects(svc.createProject(U1, { title: 'x', venueSlug: 'Bad Slug!' }), { code: 'VALIDATION_ERROR' })
  await assert.rejects(svc.createProject(U1, { title: 'x', retentionDays: 3 }), { code: 'VALIDATION_ERROR' })
  await assert.rejects(svc.createProject('bukan-id', { title: 'x' }), { code: 'NOT_FOUND' })
})

test('batas proyek aktif per pengguna', async () => {
  const { svc } = setup({ maxProjects: 2 })
  await svc.createProject(U1, { title: 'a' })
  await svc.createProject(U1, { title: 'b' })
  await assert.rejects(svc.createProject(U1, { title: 'c' }), { code: 'QUOTA_EXCEEDED' })
  await svc.createProject(U2, { title: 'milik user lain' }) // kuota per pengguna
  assert.equal(MAX_PROJECTS_PER_USER, 50)
})

test('saveVersion: versi 1, revision naik, versi tersimpan dengan parse', async () => {
  const { svc } = setup()
  const p = await svc.createProject(U1, { title: 'P' })
  const r = await svc.saveVersion(U1, p._id, { source: MD, baseRevision: 0, origin: 'paste' })
  assert.equal(r.unchanged, false)
  assert.equal(r.project.revision, 1)
  assert.equal(r.version.number, 1)
  assert.equal(r.version.format, 'markdown')
  assert.equal(r.version.parse.title, 'Judul')
  assert.equal(r.version.source, undefined) // metadata tanpa isi
  const got = await svc.getProject(U1, p._id)
  assert.equal(got.currentVersion.source, MD)
  assert.equal(got.project.currentVersionId, r.version._id)
})

test('saveVersion: baseRevision usang -> VERSION_CONFLICT dengan currentRevision', async () => {
  const { svc } = setup()
  const p = await svc.createProject(U1, { title: 'P' })
  await svc.saveVersion(U1, p._id, { source: MD, baseRevision: 0 })
  await assert.rejects(svc.saveVersion(U1, p._id, { source: MD + '\nbaru', baseRevision: 0 }), (e) => {
    assert.equal(e.code, 'VERSION_CONFLICT')
    assert.equal(e.details.currentRevision, 1)
    return true
  })
  await assert.rejects(svc.saveVersion(U1, p._id, { source: MD }), { code: 'VALIDATION_ERROR' }) // baseRevision wajib
})

test('saveVersion: isi sama (checksum) tidak membuat versi baru', async () => {
  const { svc, ManuscriptVersion } = setup()
  const p = await svc.createProject(U1, { title: 'P' })
  await svc.saveVersion(U1, p._id, { source: MD, baseRevision: 0 })
  const r = await svc.saveVersion(U1, p._id, { source: MD.replace(/\n/g, '\r\n'), baseRevision: 1 })
  assert.equal(r.unchanged, true)
  assert.equal(ManuscriptVersion.docs.length, 1)
  assert.equal(r.project.revision, 1)
})

test('konkurensi: dua penyimpanan dengan baseRevision sama -> tepat satu menang', async () => {
  const { svc, ManuscriptVersion } = setup()
  const p = await svc.createProject(U1, { title: 'P' })
  await svc.saveVersion(U1, p._id, { source: MD, baseRevision: 0 })
  const results = await Promise.allSettled([
    svc.saveVersion(U1, p._id, { source: MD + '\nA', baseRevision: 1 }),
    svc.saveVersion(U1, p._id, { source: MD + '\nB', baseRevision: 1 })
  ])
  const ok = results.filter((r) => r.status === 'fulfilled')
  const failed = results.filter((r) => r.status === 'rejected')
  assert.equal(ok.length, 1)
  assert.equal(failed.length, 1)
  assert.equal(failed[0].reason.code, 'VERSION_CONFLICT')
  assert.equal(ManuscriptVersion.docs.length, 2)
  assert.deepEqual(ManuscriptVersion.docs.map((d) => d.number).sort(), [1, 2])
})

test('kompensasi: gagal membuat versi -> currentVersionId dikembalikan, versi lama tetap terbaca', async () => {
  const { svc, ManuscriptVersion, Project } = setup()
  const p = await svc.createProject(U1, { title: 'P' })
  const v1 = await svc.saveVersion(U1, p._id, { source: MD, baseRevision: 0 })
  ManuscriptVersion.failCreate = true
  await assert.rejects(svc.saveVersion(U1, p._id, { source: MD + '\nbaru', baseRevision: 1 }), /db down/)
  ManuscriptVersion.failCreate = false
  const proj = Project.docs[0]
  assert.equal(String(proj.currentVersionId), String(v1.version._id))
  const got = await svc.getProject(U1, p._id)
  assert.equal(got.currentVersion.source, MD)
  // revision berubah (klaim + kompensasi) sehingga klien harus memuat ulang; setelahnya bisa menyimpan lagi
  const fresh = await svc.saveVersion(U1, p._id, { source: MD + '\nbaru', baseRevision: proj.revision })
  assert.equal(fresh.unchanged, false)
})

test('fallback: currentVersionId menunjuk dokumen hilang -> pakai versi bernomor tertinggi', async () => {
  const { svc, Project } = setup()
  const p = await svc.createProject(U1, { title: 'P' })
  await svc.saveVersion(U1, p._id, { source: MD, baseRevision: 0 })
  Project.docs[0].currentVersionId = 'f'.repeat(24)
  const got = await svc.getProject(U1, p._id)
  assert.equal(got.currentVersion.source, MD)
})

test('isolasi kepemilikan: pengguna lain mendapat NOT_FOUND di semua operasi', async () => {
  const { svc } = setup()
  const p = await svc.createProject(U1, { title: 'Rahasia' })
  await svc.saveVersion(U1, p._id, { source: MD, baseRevision: 0 })
  const id = p._id
  await assert.rejects(svc.getProject(U2, id), { code: 'NOT_FOUND' })
  await assert.rejects(svc.updateProject(U2, id, { title: 'x' }), { code: 'NOT_FOUND' })
  await assert.rejects(svc.deleteProject(U2, id), { code: 'NOT_FOUND' })
  await assert.rejects(svc.saveVersion(U2, id, { source: MD, baseRevision: 1 }), { code: 'NOT_FOUND' })
  await assert.rejects(svc.listVersions(U2, id), { code: 'NOT_FOUND' })
  await assert.rejects(svc.getVersion(U2, id, 1), { code: 'NOT_FOUND' })
  await assert.rejects(svc.restoreVersion(U2, id, 1, 1), { code: 'NOT_FOUND' })
  assert.deepEqual(await svc.listProjects(U2), [])
  assert.equal((await svc.listProjects(U1)).length, 1)
})

test('listVersions: tanpa isi naskah, terbaru dulu, penanda isCurrent', async () => {
  const { svc } = setup()
  const p = await svc.createProject(U1, { title: 'P' })
  await svc.saveVersion(U1, p._id, { source: MD, baseRevision: 0 })
  await svc.saveVersion(U1, p._id, { source: MD + '\nv2', baseRevision: 1 })
  const { versions, revision } = await svc.listVersions(U1, p._id)
  assert.equal(revision, 2)
  assert.deepEqual(versions.map((v) => v.number), [2, 1])
  assert.deepEqual(versions.map((v) => v.isCurrent), [true, false])
  assert.ok(versions.every((v) => v.source === undefined))
})

test('restoreVersion: membuat versi baru berisi teks lama, riwayat tidak dihapus', async () => {
  const { svc } = setup()
  const p = await svc.createProject(U1, { title: 'P' })
  await svc.saveVersion(U1, p._id, { source: MD, baseRevision: 0 })
  await svc.saveVersion(U1, p._id, { source: MD + '\nv2', baseRevision: 1 })
  const r = await svc.restoreVersion(U1, p._id, 1, 2)
  assert.equal(r.version.number, 3)
  assert.equal(r.version.origin, 'restore')
  const got = await svc.getProject(U1, p._id)
  assert.equal(got.currentVersion.source, MD)
  assert.equal((await svc.listVersions(U1, p._id)).versions.length, 3)
  await assert.rejects(svc.restoreVersion(U1, p._id, 99, 3), { code: 'NOT_FOUND' })
})

test('validasi naskah: kosong, NUL, terlalu besar', async () => {
  const { svc } = setup()
  const p = await svc.createProject(U1, { title: 'P' })
  await assert.rejects(svc.saveVersion(U1, p._id, { source: '   \n', baseRevision: 0 }), { code: 'VALIDATION_ERROR' })
  await assert.rejects(svc.saveVersion(U1, p._id, { source: 'a\u0000b', baseRevision: 0 }), { code: 'VALIDATION_ERROR' })
  await assert.rejects(svc.saveVersion(U1, p._id, { source: 'x'.repeat(1000001), baseRevision: 0 }), { code: 'PAYLOAD_TOO_LARGE' })
  await assert.rejects(svc.saveVersion(U1, p._id, { source: 123, baseRevision: 0 }), { code: 'VALIDATION_ERROR' })
})

test('updateProject: hanya field yang diizinkan; arsip memblokir penyimpanan naskah', async () => {
  const { svc } = setup()
  const p = await svc.createProject(U1, { title: 'P' })
  const u = await svc.updateProject(U1, p._id, { title: 'Baru', userId: U2, revision: 99, status: 'archived' })
  assert.equal(u.title, 'Baru')
  assert.equal(u.status, 'archived')
  assert.equal(String(u.userId), U1)
  assert.equal(u.revision, 0)
  await assert.rejects(svc.saveVersion(U1, p._id, { source: MD, baseRevision: 0 }), { code: 'CONFLICT' })
  await svc.updateProject(U1, p._id, { status: 'active' })
  await svc.saveVersion(U1, p._id, { source: MD, baseRevision: 0 })
  await assert.rejects(svc.updateProject(U1, p._id, {}), { code: 'VALIDATION_ERROR' })
  await assert.rejects(svc.updateProject(U1, p._id, { status: 'deletion_pending' }), { code: 'VALIDATION_ERROR' })
})

test('deleteProject: menghapus proyek dan semua versinya, milik pengguna lain tak tersentuh', async () => {
  const { svc, ManuscriptVersion, Project } = setup()
  const a = await svc.createProject(U1, { title: 'A' })
  const b = await svc.createProject(U2, { title: 'B' })
  await svc.saveVersion(U1, a._id, { source: MD, baseRevision: 0 })
  await svc.saveVersion(U2, b._id, { source: MD, baseRevision: 0 })
  await svc.deleteProject(U1, a._id)
  assert.equal(Project.docs.length, 1)
  assert.equal(ManuscriptVersion.docs.length, 1)
  assert.equal(String(ManuscriptVersion.docs[0].userId), U2)
})

test('QA-10: pembuatan proyek paralel tidak melampaui batas (cek ulang setelah membuat; kelebihan dibatalkan)', async () => {
  const { svc, Project } = setup({ maxProjects: 2 })
  const res = await Promise.allSettled([1, 2, 3, 4, 5].map((i) => svc.createProject(U1, { title: `p${i}` })))
  const ok = res.filter((r) => r.status === 'fulfilled').length
  assert.equal(ok, 2, `hanya 2 yang boleh berhasil, berhasil ${ok}`)
  assert.equal(res.filter((r) => r.status === 'rejected' && r.reason.code === 'QUOTA_EXCEEDED').length, 3)
  assert.equal((await Project.countDocuments({ userId: U1, status: 'active' })), 2, 'jumlah proyek aktif tidak melebihi batas')
})

test('indicatorsEnabled: default mati, hanya boolean, dapat diubah lewat updateProject', async () => {
  const { svc } = setup()
  const p = await svc.createProject(U1, { title: 'x' })
  assert.notEqual(p.indicatorsEnabled, true)
  await assert.rejects(svc.updateProject(U1, String(p._id), { indicatorsEnabled: 'ya' }), { code: 'VALIDATION_ERROR' })
  await assert.rejects(svc.updateProject(U1, String(p._id), { indicatorsEnabled: 1 }), { code: 'VALIDATION_ERROR' })
  const u = await svc.updateProject(U1, String(p._id), { indicatorsEnabled: true })
  assert.equal(u.indicatorsEnabled, true)
})
