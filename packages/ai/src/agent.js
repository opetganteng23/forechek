'use strict'

// Agent runtime (MTS 7.1, 38.2 B): model -> tool_use -> hasil -> model, dengan batas iterasi, tool call, waktu, token.
// Provider hanya perlu menyediakan provider.stream(request) -> async iterable event:
//   { type:'text_delta', text } | { type:'tool_use', id, name, input } |
//   { type:'message_end', stopReason, usage:{inputTokens,outputTokens,cacheReadTokens,cacheWriteTokens}, model }
class ProviderError extends Error {
  constructor(code, message, { retryable = false } = {}) {
    super(message)
    this.name = 'ProviderError'
    this.code = code // PROVIDER_ERROR | PROVIDER_TIMEOUT | PROVIDER_RATE_LIMITED | PROVIDER_REFUSAL | PROVIDER_NOT_CONFIGURED
    this.retryable = retryable
  }
}

const zeroUsage = () => ({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })
const addUsage = (a, b = {}) => ({
  inputTokens: a.inputTokens + (b.inputTokens || 0),
  outputTokens: a.outputTokens + (b.outputTokens || 0),
  cacheReadTokens: a.cacheReadTokens + (b.cacheReadTokens || 0),
  cacheWriteTokens: a.cacheWriteTokens + (b.cacheWriteTokens || 0)
})
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const DEFAULT_LIMITS = { maxIterations: 8, maxToolCalls: 12, timeoutMs: 90000, maxOutputTokens: 4096, maxTotalTokens: 60000 }

async function runAgent({
  provider,
  model,
  system,
  messages,
  registry,
  toolCtx = {},
  limits = {},
  signal,
  onEvent = () => {},
  finalize, // opsional: validator keluaran (mis. validator sitasi Tahap 4) -> { text, flags }
  providerRetries = 1,
  sleepFn = sleep
}) {
  const lim = { ...DEFAULT_LIMITS, ...limits }
  const convo = messages.map((m) => ({ ...m }))
  const toolLog = []
  let usage = zeroUsage()
  let usedModel = model
  const textParts = []
  let iterations = 0

  const ac = new AbortController()
  const onAbort = () => ac.abort()
  if (signal) signal.aborted ? ac.abort() : signal.addEventListener('abort', onAbort, { once: true })
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    ac.abort()
  }, lim.timeoutMs)

  const result = (status, extra = {}) => ({
    status,
    text: textParts.join('\n\n'),
    usage,
    toolCalls: toolLog,
    iterations,
    model: usedModel,
    errorCode: null,
    errorMessage: null,
    truncated: false,
    flags: [],
    ...extra
  })
  const stopped = () => (timedOut ? result('failed', { errorCode: 'PROVIDER_TIMEOUT', errorMessage: 'Batas waktu giliran terlampaui' }) : result('cancelled'))

  try {
    for (iterations = 1; iterations <= lim.maxIterations; iterations++) {
      if (ac.signal.aborted) return stopped()

      const turn = { text: '', toolUses: [], stopReason: null, ended: false }
      let attempt = 0
      for (;;) {
        try {
          const stream = provider.stream({ model, system, messages: convo, tools: registry.definitions(), maxTokens: lim.maxOutputTokens, signal: ac.signal })
          for await (const ev of stream) {
            if (ev.type === 'text_delta') {
              turn.text += ev.text
              onEvent({ type: 'content_delta', text: ev.text })
            } else if (ev.type === 'tool_use') {
              turn.toolUses.push({ id: ev.id, name: ev.name, input: ev.input })
            } else if (ev.type === 'message_end') {
              turn.ended = true
              turn.stopReason = ev.stopReason
              usage = addUsage(usage, ev.usage)
              if (ev.model) usedModel = ev.model
              onEvent({ type: 'usage', usage: ev.usage || {} })
            }
          }
          break
        } catch (err) {
          if (ac.signal.aborted) {
            if (turn.text) textParts.push(turn.text) // teks parsial yang sudah diterima tidak boleh hilang
            return stopped()
          }
          // Satu percobaan ulang hanya bila belum ada keluaran dari provider pada iterasi ini.
          if (err && err.retryable && attempt < providerRetries && !turn.text && turn.toolUses.length === 0) {
            attempt++
            await sleepFn(500 * attempt)
            continue
          }
          if (turn.text) textParts.push(turn.text)
          const code = err && err.code && err.name === 'ProviderError' ? err.code : 'PROVIDER_ERROR'
          return result('failed', { errorCode: code, errorMessage: code === 'PROVIDER_ERROR' ? 'Penyedia AI mengalami gangguan' : err.message })
        }
      }

      if (turn.text) textParts.push(turn.text)
      const total = usage.inputTokens + usage.outputTokens
      if (turn.stopReason === 'refusal') {
        return result('failed', { errorCode: 'PROVIDER_REFUSAL', errorMessage: 'Penyedia AI menolak permintaan ini' })
      }
      // Stream yang berakhir tanpa message_end atau tanpa isi bukan jawaban sukses (MTS 23.2).
      if (!turn.ended || (turn.toolUses.length === 0 && !turn.text.trim())) {
        return result('failed', { errorCode: 'PROVIDER_ERROR', errorMessage: 'Penyedia AI mengakhiri respons tanpa jawaban lengkap' })
      }
      if (turn.toolUses.length === 0) {
        let text = textParts.join('\n\n')
        let flags = []
        if (finalize) {
          const fin = await finalize(text)
          text = fin.text
          flags = fin.flags || []
          textParts.length = 0
          textParts.push(text)
        }
        return result('completed', { truncated: turn.stopReason === 'max_tokens', flags })
      }
      if (iterations === lim.maxIterations || total >= lim.maxTotalTokens) {
        return result('failed', { errorCode: 'AGENT_LIMIT_REACHED', errorMessage: 'Batas iterasi/token giliran tercapai' })
      }

      const assistantBlocks = []
      if (turn.text) assistantBlocks.push({ type: 'text', text: turn.text })
      for (const u of turn.toolUses) assistantBlocks.push({ type: 'tool_use', id: u.id, name: u.name, input: u.input })
      convo.push({ role: 'assistant', content: assistantBlocks })

      const toolResults = []
      for (const u of turn.toolUses) {
        let r
        if (toolLog.length >= lim.maxToolCalls) {
          r = { name: u.name, ok: false, error: { code: 'TOOL_LIMIT', message: 'Batas jumlah panggilan tool tercapai' }, latencyMs: 0, inputHash: null }
        } else {
          onEvent({ type: 'tool_start', name: u.name })
          r = await registry.execute(u.name, u.input, toolCtx)
        }
        toolLog.push({ name: r.name, inputHash: r.inputHash, ok: r.ok, latencyMs: r.latencyMs, errorCode: r.ok ? undefined : r.error.code })
        onEvent({ type: 'tool_result', name: r.name, ok: r.ok })
        toolResults.push({
          type: 'tool_result',
          tool_use_id: u.id,
          is_error: !r.ok,
          content: JSON.stringify(r.ok ? { data: r.output } : { error: r.error })
        })
      }
      convo.push({ role: 'user', content: toolResults })
    }
    return result('failed', { errorCode: 'AGENT_LIMIT_REACHED', errorMessage: 'Batas iterasi tercapai' })
  } finally {
    clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', onAbort)
  }
}

module.exports = { runAgent, ProviderError, zeroUsage, addUsage }
