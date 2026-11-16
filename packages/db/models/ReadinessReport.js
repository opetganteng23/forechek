const mongoose = require('mongoose')

// Laporan kesiapan (MTS 6.6, 40.2 E). Dapat ditelusuri ke versi naskah, venue (slug+versi), rubrik, prompt, model, rumus.
// Status job: queued | running | completed | failed | cancelled (MTS 21.2). Hasil disimpan sebagai dokumen tunggal.
const ReadinessReportSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    versionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    versionNumber: { type: Number, required: true },
    status: { type: String, enum: ['queued', 'running', 'completed', 'failed', 'cancelled'], default: 'queued' },
    venueSlug: { type: String, default: null },
    venueVersion: { type: Number, default: null },
    errorCode: { type: String, default: null },
    billingFailed: { type: Boolean, default: false }, // laporan selesai tetapi pencatatan usage gagal: perlu rekonsiliasi
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    // Isi laporan (hasil buildReport): deterministic, criteria, overall, limitations, versions, venue, model.
    result: { type: mongoose.Schema.Types.Mixed, default: null }
  },
  { timestamps: true }
)

ReadinessReportSchema.index({ projectId: 1, createdAt: -1 })
ReadinessReportSchema.index({ userId: 1, projectId: 1 })
// Satu laporan aktif per proyek, ditegakkan atomik oleh basis data (bukan hanya pemeriksaan di aplikasi).
ReadinessReportSchema.index({ projectId: 1 }, { unique: true, partialFilterExpression: { status: { $in: ['queued', 'running'] } } })

module.exports = mongoose.models.ReadinessReport || mongoose.model('ReadinessReport', ReadinessReportSchema)
