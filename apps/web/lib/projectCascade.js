import { Message, Reference, ReferenceCandidate, AiUsageLog, ReadinessReport, EditProposal } from '@publication-prepare/db'

// Penghapusan proyek harus menghapus SEMUA data terkait (MTS 14, D0-10): pesan chat, referensi, kandidat, jejak AI, laporan kesiapan, usulan edit.
// Baris UsageLedger sengaja dipertahankan: hanya angka pemakaian teknis (tanpa isi naskah/pesan), dibutuhkan untuk audit tagihan.
export async function deleteProjectData(userId, projectId) {
  await Promise.all([
    Message.deleteMany({ userId, projectId }),
    Reference.deleteMany({ userId, projectId }),
    ReferenceCandidate.deleteMany({ userId, projectId }),
    AiUsageLog.deleteMany({ userId, projectId }),
    ReadinessReport.deleteMany({ userId, projectId }),
    EditProposal.deleteMany({ userId, projectId })
  ])
}
