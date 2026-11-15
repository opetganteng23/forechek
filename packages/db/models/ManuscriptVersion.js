const mongoose = require('mongoose')

// Versi naskah bersifat append-only; isi (source) adalah sumber kebenaran (keputusan D0-06).
const ManuscriptVersionSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    number: { type: Number, required: true },
    format: { type: String, enum: ['latex', 'markdown'], required: true },
    source: { type: String, required: true },
    checksum: { type: String, required: true },
    origin: {
      type: String,
      enum: ['paste', 'upload', 'user_edit', 'ai_edit_accepted', 'restore'],
      default: 'user_edit'
    },
    note: { type: String, maxlength: 200, default: null },
    status: { type: String, enum: ['parsed', 'parse_warning'], default: 'parsed' },
    parse: { type: mongoose.Schema.Types.Mixed, default: null }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

ManuscriptVersionSchema.index({ projectId: 1, number: 1 }, { unique: true })
ManuscriptVersionSchema.index({ userId: 1, projectId: 1 })

module.exports = mongoose.models.ManuscriptVersion || mongoose.model('ManuscriptVersion', ManuscriptVersionSchema)
