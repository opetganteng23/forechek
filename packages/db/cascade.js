// Penghapusan data terkait (MTS 14, D0-10, D7-02). Satu-satunya tempat daftar koleksi terkait proyek/pengguna dipelihara:
// hapus proyek, hapus akun, dan pekerja retensi memakai fungsi yang sama.
// UsageLedger SENGAJA dipertahankan (hanya angka pemakaian teknis tanpa isi naskah; dibutuhkan untuk audit tagihan) dan
// Payment dipertahankan (catatan keuangan). Keduanya hanya mereferensikan userId.
const Message = require('./models/Message')
const Reference = require('./models/Reference')
const ReferenceCandidate = require('./models/ReferenceCandidate')
const AiUsageLog = require('./models/AiUsageLog')
const ReadinessReport = require('./models/ReadinessReport')
const EditProposal = require('./models/EditProposal')
const ManuscriptVersion = require('./models/ManuscriptVersion')
const Project = require('./models/Project')
const Manuscript = require('./models/Manuscript')
const Analysis = require('./models/Analysis')
const KumCalculation = require('./models/KumCalculation')
const User = require('./models/User')

// Data turunan sebuah proyek (tanpa dokumen Project dan versi naskah).
async function deleteProjectData(userId, projectId) {
  await Promise.all([
    Message.deleteMany({ userId, projectId }),
    Reference.deleteMany({ userId, projectId }),
    ReferenceCandidate.deleteMany({ userId, projectId }),
    AiUsageLog.deleteMany({ userId, projectId }),
    ReadinessReport.deleteMany({ userId, projectId }),
    EditProposal.deleteMany({ userId, projectId })
  ])
}

// Hapus proyek beserta seluruh isinya. Mengembalikan true bila dokumen proyek ada dan terhapus.
async function deleteProjectCompletely(userId, projectId) {
  await deleteProjectData(userId, projectId)
  await ManuscriptVersion.deleteMany({ projectId, userId })
  const r = await Project.deleteOne({ _id: projectId, userId })
  return r.deletedCount === 1
}

// Seluruh koleksi yang menyimpan data pengguna dengan kunci userId (disapu per pengguna, bukan per proyek, agar data yatim
// akibat pekerjaan yang masih berjalan ikut terhapus). UsageLedger dan Payment sengaja tidak termasuk.
const USER_SCOPED = [Message, Reference, ReferenceCandidate, AiUsageLog, ReadinessReport, EditProposal, ManuscriptVersion, Project, Manuscript, Analysis, KumCalculation]

// Hapus akun (QA-09). Urutan: (1) nonaktifkan akun dan cabut sesi lebih dulu sehingga tidak ada permintaan baru yang lolos,
// (2) sapu semua koleksi per userId, (3) hapus pengguna, (4) sapu lagi untuk pekerjaan latar (chat/laporan) yang selesai
// setelah sapuan pertama. Penulisan oleh pekerjaan yang MASIH berjalan setelah sapuan kedua tidak dijamin terhapus (diterima, D7-01).
async function deleteAccountCompletely(userId) {
  await User.updateOne({ _id: userId }, { $set: { isActive: false, sessionsValidAfter: new Date() } })
  const projects = await Project.countDocuments({ userId })
  await Promise.all(USER_SCOPED.map((M) => M.deleteMany({ userId })))
  const r = await User.deleteOne({ _id: userId })
  await new Promise((resolve) => setTimeout(resolve, 250))
  await Promise.all(USER_SCOPED.map((M) => M.deleteMany({ userId })))
  return { projects, userDeleted: r.deletedCount === 1 }
}

// Penyimpanan untuk layanan retensi (packages/manuscript retention): proyek yang diberi retentionDays oleh pengguna dan sudah kedaluwarsa.
// deleteProject KLAIM dulu secara atomik (findOneAndUpdate -> status 'deletion_pending', hanya bila MASIH kedaluwarsa pada saat ini):
// proyek yang diperpanjang pengguna setelah pencarian tidak terklaim, dan proyek terklaim tidak dapat lagi ditulis (saveVersion menolak
// selain status 'active'). Lalu data turunan dan dokumen proyek dihapus. Bila cascade gagal, proyek tetap 'deletion_pending' dan
// ditemukan lagi pada putaran berikutnya (dapat dicoba ulang; tidak ada data yatim tanpa penanda).
const DELETABLE = ['active', 'archived', 'deletion_pending']
const retentionStore = {
  async findExpired({ before, limit }) {
    const rows = await Project.find({ status: { $in: DELETABLE }, retentionExpiresAt: { $ne: null, $lt: before } }).select('_id userId').limit(limit).lean()
    return rows.map((r) => ({ id: String(r._id), userId: String(r.userId) }))
  },
  async deleteProject(userId, projectId, before) {
    const claimed = await Project.findOneAndUpdate(
      { _id: projectId, userId, status: { $in: DELETABLE }, retentionExpiresAt: { $ne: null, $lt: before } },
      { $set: { status: 'deletion_pending' } }
    )
    if (!claimed) return false
    await deleteProjectData(userId, projectId)
    await ManuscriptVersion.deleteMany({ projectId, userId })
    await Project.deleteOne({ _id: projectId, userId, status: 'deletion_pending' })
    return true
  }
}

module.exports = { deleteProjectData, deleteProjectCompletely, deleteAccountCompletely, retentionStore }
