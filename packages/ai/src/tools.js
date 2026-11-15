'use strict'
const crypto = require('node:crypto')
const { validateSchema } = require('./validate')

// Registry tool (MTS 38.2 C): tiap tool punya nama, deskripsi, JSON schema input, izin, timeout, retry, audit.
// Hasil tool dikembalikan ke model sebagai DATA terstruktur; kegagalan tidak dihaluskan.
const MAX_OUTPUT_CHARS = 20000

function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`
}

// Hash input untuk log audit: payload mentah tidak disimpan.
function hashInput(input) {
  return crypto.createHash('sha256').update(stableStringify(input === undefined ? null : input)).digest('hex').slice(0, 16)
}

class ToolError extends Error {
  constructor(code, message, { retryable = false } = {}) {
    super(message)
    this.name = 'ToolError'
    this.code = code
    this.retryable = retryable
  }
}

function withTimeout(promiseFactory, ms) {
  return new Promise((resolve, reject) => {
    const ac = new AbortController()
    const timer = setTimeout(() => {
      ac.abort()
      reject(new ToolError('TOOL_TIMEOUT', `Tool melewati batas waktu ${ms} ms`, { retryable: true }))
    }, ms)
    Promise.resolve()
      .then(() => promiseFactory(ac.signal))
      .then(
        (v) => (clearTimeout(timer), resolve(v)),
        (e) => (clearTimeout(timer), reject(e))
      )
  })
}

function createToolRegistry(tools = []) {
  const byName = new Map()
  for (const t of tools) {
    if (!t || !t.name || !t.description || !t.inputSchema || typeof t.handler !== 'function') {
      throw new Error(`Definisi tool tidak lengkap: ${t && t.name}`)
    }
    if (t.inputSchema.type !== 'object') throw new Error(`inputSchema tool ${t.name} harus bertipe object`)
    if (byName.has(t.name)) throw new Error(`Nama tool ganda: ${t.name}`)
    byName.set(t.name, { timeoutMs: 10000, retries: 0, ...t })
  }

  // Definisi yang dikirim ke provider (format Anthropic: name, description, input_schema).
  function definitions() {
    return [...byName.values()].map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: { additionalProperties: false, ...t.inputSchema }
    }))
  }

  async function execute(name, input, ctx = {}) {
    const started = Date.now()
    const base = { name, inputHash: hashInput(input) }
    const fail = (code, message) => ({ ...base, ok: false, error: { code, message }, latencyMs: Date.now() - started })

    const tool = byName.get(name)
    if (!tool) return fail('TOOL_NOT_FOUND', `Tool tidak dikenal: ${String(name).slice(0, 60)}`)

    // Otorisasi di server: konteks (userId, projectId) berasal dari sesi, bukan dari model.
    const allowed = tool.permission ? await tool.permission(ctx) : Boolean(ctx.userId && ctx.projectId)
    if (!allowed) return fail('TOOL_FORBIDDEN', 'Tidak diizinkan menjalankan tool ini')

    const errors = validateSchema(tool.inputSchema, input === undefined ? {} : input)
    if (errors.length) return fail('TOOL_INVALID_INPUT', errors.slice(0, 5).join('; '))

    let lastErr
    for (let attempt = 0; attempt <= tool.retries; attempt++) {
      try {
        const out = await withTimeout((signal) => tool.handler(input || {}, { ...ctx, signal }), tool.timeoutMs)
        let serialized = JSON.stringify(out === undefined ? null : out)
        let truncated = false
        if (serialized.length > MAX_OUTPUT_CHARS) {
          truncated = true
          serialized = JSON.stringify({ truncated: true, preview: serialized.slice(0, MAX_OUTPUT_CHARS - 100) })
        }
        return { ...base, ok: true, output: JSON.parse(serialized), truncated, latencyMs: Date.now() - started }
      } catch (err) {
        lastErr = err
        if (!(err && err.retryable) || attempt === tool.retries) break
      }
    }
    if (lastErr instanceof ToolError) return fail(lastErr.code, lastErr.message)
    // Galat tak terduga: pesan internal tidak diteruskan ke model.
    return fail('TOOL_ERROR', 'Tool gagal dijalankan')
  }

  return { definitions, execute, names: () => [...byName.keys()] }
}

module.exports = { createToolRegistry, ToolError, hashInput, stableStringify }
