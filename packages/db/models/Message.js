const mongoose = require('mongoose')

// Pesan chat per proyek (MTS 6.3). Yang disimpan: teks akhir + metadata tool (nama, hash input, hasil, latensi).
// Blok tool_use/tool_result perantara TIDAK disimpan (hindari payload sensitif berlebihan, MTS 38.2 B).
const MessageSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    text: { type: String, default: '' },
    status: { type: String, enum: ['completed', 'streaming', 'failed', 'cancelled'], default: 'completed' },
    // ID dari client untuk idempotensi (MTS 23.3). Pesan user dan balasan assistant berbagi nilai yang sama.
    clientRequestId: { type: String, default: null },
    requestId: { type: String, default: null },
    attempts: { type: Number, default: 1 },
    versionId: { type: mongoose.Schema.Types.ObjectId, default: null }, // versi naskah aktif saat giliran ini
    provider: { type: String, default: null },
    model: { type: String, default: null }, // ID model aktual yang dilaporkan provider
    promptVersion: { type: String, default: null },
    usage: {
      inputTokens: { type: Number, default: 0 },
      outputTokens: { type: Number, default: 0 },
      cacheReadTokens: { type: Number, default: 0 },
      cacheWriteTokens: { type: Number, default: 0 }
    },
    toolCalls: [{ _id: false, name: String, inputHash: String, ok: Boolean, latencyMs: Number, errorCode: String }],
    errorCode: { type: String, default: null }
  },
  { timestamps: true }
)

MessageSchema.index({ projectId: 1, createdAt: 1 })
// Satu pesan per (proyek, peran, clientRequestId): mencegah pesan ganda saat client mengulang.
MessageSchema.index(
  { projectId: 1, role: 1, clientRequestId: 1 },
  { unique: true, partialFilterExpression: { clientRequestId: { $type: 'string' } } }
)

module.exports = mongoose.models.Message || mongoose.model('Message', MessageSchema)
