const mongoose = require('mongoose')

// Buku besar pemakaian teknis (MTS 38.2 F). Terpisah dari unit penagihan yang ditampilkan ke pengguna.
// Unik per (messageId, attempt): pencatatan ulang untuk percobaan yang sama tidak menggandakan penghitungan kuota.
const UsageLedgerSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', required: true },
    attempt: { type: Number, default: 1 },
    requestId: { type: String },
    task: { type: String, enum: ['chat', 'report'], default: 'chat' },
    provider: String,
    model: String,
    status: { type: String, enum: ['completed', 'failed', 'cancelled'], required: true },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    cacheReadTokens: { type: Number, default: 0 },
    cacheWriteTokens: { type: Number, default: 0 },
    billedTokens: { type: Number, default: 0 }, // unit kuota (aturan provisional D3-03)
    billedMessages: { type: Number, default: 0 }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

UsageLedgerSchema.index({ messageId: 1, attempt: 1 }, { unique: true })
UsageLedgerSchema.index({ userId: 1, createdAt: -1 })

module.exports = mongoose.models.UsageLedger || mongoose.model('UsageLedger', UsageLedgerSchema)
