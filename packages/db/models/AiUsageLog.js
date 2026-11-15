const mongoose = require('mongoose')

// Jejak penggunaan AI untuk pernyataan disclosure (MTS 6.7). Hanya ringkasan: TIDAK menyimpan isi naskah/prompt.
const AiUsageLogSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    at: { type: Date, default: Date.now },
    kind: {
      type: String,
      enum: ['chat', 'edit_suggested', 'edit_accepted', 'references_found', 'report'],
      required: true
    },
    sections: [String],
    summary: { type: String, maxlength: 300 },
    messageId: { type: mongoose.Schema.Types.ObjectId, default: null }
  },
  { timestamps: false }
)

AiUsageLogSchema.index({ projectId: 1, at: -1 })
AiUsageLogSchema.index({ messageId: 1, kind: 1 }, { unique: true, partialFilterExpression: { messageId: { $type: 'objectId' } } })

module.exports = mongoose.models.AiUsageLog || mongoose.model('AiUsageLog', AiUsageLogSchema)
