const mongoose = require('mongoose')

// Daftar referensi per proyek (MTS 6.4, 39.2 D). Referensi masuk hanya lewat verifikasi; status dan riwayatnya dicatat.
const ReferenceSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    citeKey: { type: String, required: true },
    // Kunci duplikat (doi:<doi> atau t:<judul>|<tahun>): indeks unik membuat penolakan duplikat atomik walau permintaan berlomba.
    dedupKey: { type: String, required: true },
    doi: { type: String, default: null },
    title: { type: String, required: true },
    authors: [{ _id: false, given: String, family: String }],
    year: { type: Number, default: null },
    venueName: { type: String, default: null },
    type: { type: String, default: null },
    url: { type: String, default: null },
    abstract: { type: String, default: null },
    source: { type: String, default: 'user_provided' }, // openalex | crossref | semanticscholar | fixture | user_provided
    rawMetadata: { type: mongoose.Schema.Types.Mixed, default: null },
    verification: {
      status: { type: String, enum: ['verified', 'partial', 'unverified', 'retracted'], default: 'unverified' },
      checkedAt: { type: String },
      matchedFields: [String],
      mismatches: [String],
      notes: [String],
      provider: { type: String, default: null },
      providers: [String]
    },
    statusHistory: [{ _id: false, status: String, at: String, reason: String }]
  },
  { timestamps: true }
)

ReferenceSchema.index({ projectId: 1, citeKey: 1 }, { unique: true })
ReferenceSchema.index({ projectId: 1, dedupKey: 1 }, { unique: true })
ReferenceSchema.index({ userId: 1, projectId: 1 })

module.exports = mongoose.models.Reference || mongoose.model('Reference', ReferenceSchema)
