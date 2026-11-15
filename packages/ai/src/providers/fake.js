'use strict'
const { ProviderError } = require('../agent')

// Provider PALSU untuk tes (MTS: tahap harus bisa diverifikasi tanpa kredensial). Bukan Claude.
// script: array spesifikasi giliran, atau fungsi (request, callIndex) -> spesifikasi.
//   spec = { text?, chunks?, toolUses?:[{name,input,id?}], stopReason?, usage?, error?:{code,message,retryable}, delayMs?, model? }
function createFakeProvider({ script = [], model = 'fake-model-1' } = {}) {
  const calls = []
  let n = 0
  async function* stream(request) {
    const call = n++
    calls.push(JSON.parse(JSON.stringify({ ...request, signal: undefined })))
    const spec = typeof script === 'function' ? script(request, call) : script[Math.min(call, script.length - 1)]
    if (!spec) throw new Error('Skrip provider palsu habis')
    const check = () => {
      if (request.signal && request.signal.aborted) {
        const e = new Error('aborted')
        e.name = 'AbortError'
        throw e
      }
    }
    if (spec.delayMs) await new Promise((r) => setTimeout(r, spec.delayMs))
    check()
    if (spec.error) throw new ProviderError(spec.error.code || 'PROVIDER_ERROR', spec.error.message || 'galat provider palsu', { retryable: !!spec.error.retryable })
    const chunks = spec.chunks || (spec.text ? spec.text.match(/.{1,12}/gs) : [])
    for (const c of chunks) {
      check()
      yield { type: 'text_delta', text: c }
      if (spec.chunkDelayMs) await new Promise((r) => setTimeout(r, spec.chunkDelayMs))
    }
    for (const [i, u] of (spec.toolUses || []).entries()) yield { type: 'tool_use', id: u.id || `toolu_fake_${call}_${i}`, name: u.name, input: u.input }
    const tokensIn = Math.ceil(JSON.stringify(request.messages).length / 4)
    yield {
      type: 'message_end',
      stopReason: spec.stopReason || ((spec.toolUses || []).length ? 'tool_use' : 'end_turn'),
      model: spec.model || model,
      usage: spec.usage || { inputTokens: tokensIn, outputTokens: Math.ceil((spec.text || '').length / 4), cacheReadTokens: 0, cacheWriteTokens: 0 }
    }
  }
  return { name: 'fake', stream, calls }
}

module.exports = { createFakeProvider }
