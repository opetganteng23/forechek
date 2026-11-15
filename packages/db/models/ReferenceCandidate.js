const mongoose = require('mongoose')

// Kandidat hasil pencarian literatur, dipegang sementara agar dapat ditambahkan lewat candidateId (MTS 39.2 D).
// Kedaluwarsa otomatis setelah 24 jam (indeks TTL). Selalu terikat userId + projectId.
const ReferenceCandidateSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    createdAt: { type: Date, default: Date.now }
  },
  { timestamps: false }
)

ReferenceCandidateSchema.index({ createdAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 })
ReferenceCandidateSchema.index({ userId: 1, projectId: 1 })

module.exports = mongoose.models.ReferenceCandidate || mongoose.model('ReferenceCandidate', ReferenceCandidateSchema)
