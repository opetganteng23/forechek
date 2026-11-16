'use strict'
const crypto = require('crypto')
const { AppError, ownedFilter, assertObjectId } = require('@publication-prepare/core')
const { parseManuscript } = require('./parser')
const { validateProjectInput, validateSaveInput } = require('./validate')

const MAX_PROJECTS_PER_USER = 50
const DAY_MS = 24 * 60 * 60 * 1000

function checksumOf(source) {
  return crypto.createHash('sha256').update(source).digest('hex')
}

function notFound() {
  return new AppError('NOT_FOUND', 'Data tidak ditemukan')
}

// Strategi konsistensi TANPA transaksi (MTS Bagian 26):
//  1. Klaim nomor versi lewat compare-and-swap atomik pada Project.revision (sekaligus mengisi
//     currentVersionId dengan _id yang sudah dibuat di muka). Hanya satu penyimpan yang menang.
//  2. Buat dokumen versi. Jika gagal, kompensasi: kembalikan currentVersionId ke nilai sebelumnya
//     (hanya bila revision belum berubah lagi). Nomor versi boleh bolong; tidak pernah dipakai ulang.
//  3. Pembaca memakai resolveCurrentVersion(), yang jatuh ke versi bernomor tertinggi bila
//     currentVersionId menunjuk dokumen yang tidak ada (sisa crash di antara langkah 1 dan 2).
// Status "superseded" sengaja diturunkan (versi != project.currentVersionId), bukan disimpan,
// agar tidak perlu menulis banyak dokumen sekaligus.
function createProjectService({ Project, ManuscriptVersion, newObjectId, now = () => new Date(), maxProjects = MAX_PROJECTS_PER_USER }) {
  if (!Project || !ManuscriptVersion || !newObjectId) throw new Error('createProjectService: dependensi tidak lengkap')

  const retentionFrom = (days, from) => (days ? new Date(from.getTime() + days * DAY_MS) : null)

  async function findOwnedProject(userId, projectId) {
    const project = await Project.findOne(ownedFilter(userId, projectId)).lean()
    if (!project) throw notFound()
    return project
  }

  async function resolveCurrentVersion(project, { withSource = false } = {}) {
    let version = null
    if (project.currentVersionId) {
      let q = ManuscriptVersion.findOne({ _id: project.currentVersionId, projectId: project._id })
      if (!withSource) q = q.select('-source')
      version = await q.lean()
    }
    if (!version && project.versionCount > 0) {
      let q = ManuscriptVersion.find({ projectId: project._id }).sort({ number: -1 }).limit(1)
      if (!withSource) q = q.select('-source')
      const list = await q.lean()
      version = list[0] || null
    }
    return version
  }

  // Pembuatan proyek diserialkan per pengguna di proses ini (QA-10); lintas instance, cek ulang setelah membuat membatasi
  // kelebihan (celah sempit yang diterima: dapat melebihi batas paling banyak sejumlah permintaan lintas-instance bersamaan).
  const creating = new Map()
  async function createProject(userId, input) {
    const key = String(userId)
    const run = (creating.get(key) || Promise.resolve()).catch(() => {}).then(() => createProjectUnlocked(userId, input))
    creating.set(key, run)
    try {
      return await run
    } finally {
      if (creating.get(key) === run) creating.delete(key)
    }
  }

  async function createProjectUnlocked(userId, input) {
    assertObjectId(userId, 'userId')
    const data = validateProjectInput(input)
    const count = await Project.countDocuments({ userId, status: 'active' })
    if (count >= maxProjects) throw new AppError('QUOTA_EXCEEDED', `Batas ${maxProjects} proyek aktif tercapai. Arsipkan atau hapus proyek lama.`)
    const t = now()
    const project = await Project.create({
      userId,
      ...data,
      status: 'active',
      revision: 0,
      versionCount: 0,
      currentVersionId: null,
      lastActivityAt: t,
      retentionExpiresAt: retentionFrom(data.retentionDays, t)
    })
    // Cek ulang setelah membuat (QA-10): pembuatan paralel dapat melewati cek di atas. Hanya `maxProjects` proyek aktif PERTAMA
    // (urut _id) yang dipertahankan; kelebihan dibatalkan sehingga jumlah akhir tidak pernah melampaui batas.
    const kept = await Project.find({ userId, status: 'active' }).sort({ _id: 1 }).limit(maxProjects).lean()
    if (!kept.some((p) => String(p._id) === String(project._id))) {
      await Project.deleteOne({ _id: project._id, userId }).catch(() => {})
      throw new AppError('QUOTA_EXCEEDED', `Batas ${maxProjects} proyek aktif tercapai. Arsipkan atau hapus proyek lama.`)
    }
    return plain(project)
  }

  async function listProjects(userId, { status = 'active' } = {}) {
    if (!['active', 'archived'].includes(status)) throw new AppError('VALIDATION_ERROR', 'status tidak valid')
    assertObjectId(userId, 'userId')
    return Project.find({ userId, status }).sort({ updatedAt: -1 }).lean()
  }

  async function getProject(userId, projectId) {
    const project = await findOwnedProject(userId, projectId)
    const currentVersion = await resolveCurrentVersion(project, { withSource: true })
    return { project, currentVersion }
  }

  async function updateProject(userId, projectId, patch) {
    const filter = ownedFilter(userId, projectId)
    const data = validateProjectInput(patch, { partial: true })
    const set = { ...data }
    if (patch.status !== undefined) {
      if (!['active', 'archived'].includes(patch.status)) throw new AppError('VALIDATION_ERROR', 'status tidak valid')
      if (patch.status === 'active') {
        const count = await Project.countDocuments({ userId, status: 'active' })
        if (count >= maxProjects) throw new AppError('QUOTA_EXCEEDED', `Batas ${maxProjects} proyek aktif tercapai.`)
      }
      set.status = patch.status
    }
    if (data.retentionDays !== undefined) set.retentionExpiresAt = retentionFrom(data.retentionDays, now())
    if (!Object.keys(set).length) throw new AppError('VALIDATION_ERROR', 'Tidak ada perubahan yang diberikan')
    const updated = await Project.findOneAndUpdate(filter, { $set: set }, { new: true }).lean()
    if (!updated) throw notFound()
    return updated
  }

  // Hapus permanen langsung (tanpa masa tenggang) - lihat decision log D0-10.
  async function deleteProject(userId, projectId) {
    const filter = ownedFilter(userId, projectId)
    const project = await Project.findOne(filter).lean()
    if (!project) throw notFound()
    await ManuscriptVersion.deleteMany({ projectId: project._id, userId })
    await Project.deleteOne(filter)
    return { deleted: true }
  }

  async function saveVersion(userId, projectId, input) {
    const v = validateSaveInput(input)
    const filter = ownedFilter(userId, projectId)
    const project = await Project.findOne(filter).lean()
    if (!project) throw notFound()
    if (project.status !== 'active') throw new AppError('CONFLICT', 'Proyek diarsipkan. Pulihkan proyek sebelum mengubah naskah.')

    const conflict = () =>
      new AppError('VERSION_CONFLICT', 'Naskah sudah diubah dari tempat lain. Muat versi terbaru sebelum menyimpan.', {
        details: { currentRevision: project.revision }
      })
    if (project.revision !== v.baseRevision) throw conflict()

    const parsed = parseManuscript(v.source, v.format)
    const { source, ...parse } = parsed
    const checksum = checksumOf(source)

    // Tidak ada perubahan -> jangan membuat versi duplikat.
    const current = await resolveCurrentVersion(project)
    if (current && current.checksum === checksum) {
      return { project, version: current, unchanged: true }
    }

    const versionId = newObjectId()
    const t = now()
    const claimed = await Project.findOneAndUpdate(
      { ...filter, revision: v.baseRevision, status: 'active' },
      {
        $inc: { revision: 1, versionCount: 1 },
        $set: {
          currentVersionId: versionId,
          lastActivityAt: t,
          retentionExpiresAt: retentionFrom(project.retentionDays, t)
        }
      },
      { new: true }
    ).lean()
    if (!claimed) throw conflict()

    let version
    try {
      version = await ManuscriptVersion.create({
        _id: versionId,
        projectId: project._id,
        userId,
        number: claimed.versionCount,
        format: parse.format,
        source,
        checksum,
        origin: v.origin,
        note: v.note,
        status: parse.warnings.some((w) => w.severity === 'warn') ? 'parse_warning' : 'parsed',
        parse
      })
    } catch (err) {
      // Kompensasi best-effort; gagal pun tidak fatal karena pembaca punya fallback.
      await Project.updateOne(
        { ...filter, revision: claimed.revision },
        { $set: { currentVersionId: project.currentVersionId || null }, $inc: { revision: 1 } }
      ).catch(() => {})
      throw err
    }

    const { source: _omit, ...versionMeta } = plain(version)
    return { project: claimed, version: versionMeta, unchanged: false }
  }

  async function listVersions(userId, projectId) {
    const project = await findOwnedProject(userId, projectId)
    const versions = await ManuscriptVersion.find({ projectId: project._id, userId }).sort({ number: -1 }).select('-source').lean()
    const currentId = project.currentVersionId ? String(project.currentVersionId) : versions[0] && String(versions[0]._id)
    return {
      revision: project.revision,
      versions: versions.map((x) => ({ ...x, isCurrent: String(x._id) === currentId }))
    }
  }

  async function getVersion(userId, projectId, number) {
    const project = await findOwnedProject(userId, projectId)
    if (!Number.isInteger(number) || number < 1) throw notFound()
    const version = await ManuscriptVersion.findOne({ projectId: project._id, userId, number }).lean()
    if (!version) throw notFound()
    return version
  }

  async function restoreVersion(userId, projectId, number, baseRevision) {
    const old = await getVersion(userId, projectId, number)
    return saveVersion(userId, projectId, {
      source: old.source,
      format: old.format,
      origin: 'restore',
      note: `Dipulihkan dari versi ${number}`,
      baseRevision
    })
  }

  return {
    createProject,
    listProjects,
    getProject,
    updateProject,
    deleteProject,
    saveVersion,
    listVersions,
    getVersion,
    restoreVersion
  }
}

function plain(doc) {
  return doc && typeof doc.toObject === 'function' ? doc.toObject() : doc
}

module.exports = { createProjectService, checksumOf, MAX_PROJECTS_PER_USER }
