'use strict'
const { ProviderError } = require('../agent')

// Provider NYATA (Anthropic Messages API, streaming). TIDAK DIVERIFIKASI terhadap API sungguhan di lingkungan
// tanpa kunci: dipetakan lewat tes dengan klien palsu yang meniru bentuk stream SDK.
// Catatan kebijakan model: tanpa temperature/top_p, tanpa tool_choice paksa, `thinking` tidak dikirim eksplisit.
function mapError(err) {
  const status = err && err.status
  if (err && (err.name === 'AbortError' || err.name === 'APIUserAbortError')) return err
  if (status === 429) return new ProviderError('PROVIDER_RATE_LIMITED', 'Penyedia AI sedang membatasi permintaan', { retryable: true })
  if (status === 408 || (err && /timeout/i.test(err.name || ''))) return new ProviderError('PROVIDER_TIMEOUT', 'Penyedia AI tidak merespons tepat waktu', { retryable: true })
  if (status >= 500 || status === 529) return new ProviderError('PROVIDER_ERROR', 'Penyedia AI mengalami gangguan', { retryable: true })
  return new ProviderError('PROVIDER_ERROR', 'Permintaan ke penyedia AI gagal', { retryable: false })
}

// promptCache: MTS 38.2 E melarang caching sebelum kompatibilitas dan biaya diverifikasi; default MATI (AI_PROMPT_CACHE=true untuk menyalakan).
function createAnthropicProvider({ apiKey, client, promptCache = false } = {}) {
  let sdk = client
  function getClient() {
    if (!sdk) {
      const Anthropic = require('@anthropic-ai/sdk')
      sdk = new Anthropic({ apiKey })
    }
    return sdk
  }

  async function* stream({ model, system, messages, tools, maxTokens, signal }) {
    let s
    try {
      s = getClient().messages.stream(
        {
          model,
          max_tokens: maxTokens,
          system: [promptCache ? { type: 'text', text: system, cache_control: { type: 'ephemeral' } } : { type: 'text', text: system }],
          messages,
          tools
        },
        { signal }
      )
      for await (const event of s) {
        if (event.type === 'content_block_delta' && event.delta && event.delta.type === 'text_delta') {
          yield { type: 'text_delta', text: event.delta.text }
        }
      }
      const final = await s.finalMessage()
      for (const block of final.content || []) {
        if (block.type === 'tool_use') yield { type: 'tool_use', id: block.id, name: block.name, input: block.input }
      }
      const u = final.usage || {}
      yield {
        type: 'message_end',
        stopReason: final.stop_reason,
        model: final.model,
        usage: {
          inputTokens: u.input_tokens || 0,
          outputTokens: u.output_tokens || 0,
          cacheReadTokens: u.cache_read_input_tokens || 0,
          cacheWriteTokens: u.cache_creation_input_tokens || 0
        }
      }
    } catch (err) {
      throw mapError(err)
    }
  }

  return { name: 'anthropic', stream }
}

module.exports = { createAnthropicProvider, mapError }
