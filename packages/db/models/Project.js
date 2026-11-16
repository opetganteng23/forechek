const mongoose = require('mongoose')

// Satu proyek = satu naskah dengan riwayat versi (MTS Bagian 26).
const ProjectSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    fieldOfStudy: { type: String, trim: true, maxlength: 120, default: null },
    language: { type: String, enum: ['indonesia', 'english'], default: 'indonesia' },
    publicationType: { type: String, enum: ['conference', 'journal', 'unspecified'], default: 'unspecified' },
    venueSlug: { type: String, default: null },
    indicatorsEnabled: { type: Boolean, default: false }, // indikator kemiripan/gaya (Tahap 8) opsional per proyek, default mati
    status: { type: String, enum: ['active', 'archived', 'deletion_pending'], default: 'active' },
    currentVersionId: { type: mongoose.Schema.Types.ObjectId, default: null },
    // Penghitung untuk optimistic concurrency (compare-and-swap) dan penomoran versi.
    revision: { type: Number, default: 0 },
    versionCount: { type: Number, default: 0 },
    retentionDays: { type: Number, default: null },
    retentionExpiresAt: { type: Date, default: null },
    lastActivityAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
)

ProjectSchema.index({ retentionExpiresAt: 1 }, { partialFilterExpression: { retentionExpiresAt: { $type: 'date' } } }) // pekerja retensi: hanya proyek ber-retensi
ProjectSchema.index({ userId: 1, status: 1, updatedAt: -1 })

module.exports = mongoose.models.Project || mongoose.model('Project', ProjectSchema)
