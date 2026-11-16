const mongoose = require('mongoose')

// Usulan edit AI (MTS 6, 41.2 A). Terikat ke versi dasar dan rentang offset; naskah hanya berubah lewat accept eksplisit.
// Status: pending | accepting (klaim sementara saat membuat versi) | accepted | rejected | stale (versi dasar sudah berubah).
const EditProposalSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    baseVersionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    baseVersionNumber: { type: Number, required: true },
    section: { type: String, default: null },
    heading: { type: String, required: true },
    start: { type: Number, required: true },
    end: { type: Number, required: true },
    before: { type: String, required: true },
    after: { type: String, required: true },
    reason: { type: String, required: true, maxlength: 500 },
    status: { type: String, enum: ['pending', 'accepting', 'accepted', 'rejected', 'stale'], default: 'pending' },
    createdBy: { type: String, enum: ['ai', 'user'], default: 'ai' },
    messageId: { type: mongoose.Schema.Types.ObjectId, default: null },
    claimedAt: { type: Date, default: null }, // waktu klaim 'accepting' (untuk pemulihan klaim macet)
    decidedAt: { type: Date, default: null },
    resultVersionNumber: { type: Number, default: null }
  },
  { timestamps: true }
)

EditProposalSchema.index({ projectId: 1, createdAt: -1 })
EditProposalSchema.index({ userId: 1, projectId: 1, status: 1 })

module.exports = mongoose.models.EditProposal || mongoose.model('EditProposal', EditProposalSchema)
