'use strict'
const { ToolError } = require('@publication-prepare/ai')
const { isAppError } = require('@publication-prepare/core')

// Tool agen propose_edit (MTS 7.3, 41.2 A). Hanya MEMBUAT usulan berstatus pending; tidak mengubah naskah.
// userId/projectId berasal dari konteks sesi (schema menolak parameter asing).
function createEditTools() {
  return [
    {
      name: 'propose_edit',
      description:
        'Mengusulkan penggantian isi SATU bagian naskah (tanpa heading). Tidak mengubah naskah: pengguna harus menerima usulan lebih dulu. Baca bagian dengan read_section dulu. Jangan menambah sitasi yang belum ada di daftar referensi terverifikasi.',
      inputSchema: {
        type: 'object',
        properties: {
          section: { type: 'string', minLength: 1, maxLength: 120 },
          new_text: { type: 'string', minLength: 1, maxLength: 30000 },
          reason: { type: 'string', minLength: 5, maxLength: 500 }
        },
        required: ['section', 'new_text', 'reason'],
        additionalProperties: false
      },
      timeoutMs: 15000,
      async handler(input, ctx) {
        try {
          const e = await ctx.edits.propose({ userId: ctx.userId, projectId: ctx.projectId, section: input.section, newText: input.new_text, reason: input.reason, messageId: ctx.messageId || null })
          return { editId: e.id, status: e.status, section: e.heading, note: 'Usulan menunggu keputusan pengguna; naskah belum berubah.' }
        } catch (err) {
          if (isAppError(err)) throw new ToolError((err.details && err.details.code) || err.code, err.message)
          throw err
        }
      }
    }
  ]
}

module.exports = { createEditTools }
