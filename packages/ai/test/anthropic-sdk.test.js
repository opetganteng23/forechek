'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const Anthropic = require('@anthropic-ai/sdk')
const { createAnthropicProvider } = require('../src/providers/anthropic')

// SDK Anthropic NYATA (versi terpasang) dijalankan terhadap server HTTP lokal yang meniru format SSE Messages API. Tidak ada panggilan
// ke jaringan luar dan tidak ada kunci nyata. Ini memverifikasi pemetaan stream/tool_use/usage dan penanganan galat pada SDK terpasang;
// kecocokan dengan API Anthropic sungguhan TETAP TIDAK DIVERIFIKASI (butuh ANTHROPIC_API_KEY).
const sse = (events) => events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('')

function server(handler) {
  return new Promise((resolve) => {
    const s = http.createServer(handler)
    s.listen(0, '127.0.0.1', () => resolve({ s, url: `http://127.0.0.1:${s.address().port}` }))
  })
}

const STREAM = [
  { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'model-uji', content: [], stop_reason: null, usage: { input_tokens: 12, output_tokens: 1, cache_read_input_tokens: 3, cache_creation_input_tokens: 2 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Halo ' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'dunia.' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'tu_1', name: 'read_section', input: {} } },
  { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"section":' } },
  { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '"abstract"}' } },
  { type: 'content_block_stop', index: 1 },
  { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 21 } },
  { type: 'message_stop' }
]

test('SDK nyata: stream teks, tool_use (input JSON terakumulasi), dan usage dipetakan benar; permintaan berisi model/tools/system', async () => {
  let seen
  const { s, url } = await server((req, res) => {
    let b = ''
    req.on('data', (c) => (b += c))
    req.on('end', () => {
      seen = { path: req.url, auth: req.headers.authorization, apiVersion: req.headers['anthropic-version'], body: JSON.parse(b) }
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.end(sse(STREAM))
    })
  })
  try {
    const provider = createAnthropicProvider({ client: new Anthropic({ apiKey: 'kunci-uji-palsu', baseURL: url, maxRetries: 0 }) })
    const events = []
    for await (const e of provider.stream({ model: 'model-uji', system: 'Sistem.', messages: [{ role: 'user', content: 'hai' }], tools: [{ name: 'read_section', description: 'x', input_schema: { type: 'object', properties: {} } }], maxTokens: 100 })) events.push(e)
    assert.equal(events.filter((e) => e.type === 'text_delta').map((e) => e.text).join(''), 'Halo dunia.')
    const tu = events.find((e) => e.type === 'tool_use')
    assert.deepEqual({ id: tu.id, name: tu.name, input: tu.input }, { id: 'tu_1', name: 'read_section', input: { section: 'abstract' } })
    const end = events.at(-1)
    assert.equal(end.type, 'message_end')
    assert.equal(end.stopReason, 'tool_use')
    assert.deepEqual(end.usage, { inputTokens: 12, outputTokens: 21, cacheReadTokens: 3, cacheWriteTokens: 2 })
    assert.equal(seen.path, '/v1/messages')
    assert.equal(seen.auth, 'Bearer kunci-uji-palsu') // SDK 1.x mengirim Authorization: Bearer (bukan x-api-key)
    assert.ok(seen.apiVersion, 'SDK mengirim header anthropic-version')
    assert.equal(seen.body.model, 'model-uji')
    assert.equal(seen.body.stream, true)
    assert.equal(seen.body.max_tokens, 100)
    assert.equal(seen.body.system[0].text, 'Sistem.')
    assert.ok(!('temperature' in seen.body) && !('top_p' in seen.body), 'kebijakan model: tanpa temperature/top_p')
  } finally {
    s.close()
  }
})

test('SDK nyata: 429 dan 500 dipetakan ke galat penyedia yang dapat diulang; 400 tidak', async () => {
  let status = 429
  const { s, url } = await server((req, res) => {
    req.resume()
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ type: 'error', error: { type: 'x', message: 'rahasia-internal' } }))
  })
  try {
    const provider = createAnthropicProvider({ client: new Anthropic({ apiKey: 'k', baseURL: url, maxRetries: 0 }) })
    const run = async () => {
      try {
        for await (const _ of provider.stream({ model: 'm', system: 's', messages: [{ role: 'user', content: 'x' }], tools: [], maxTokens: 10 })) void _
        return null
      } catch (e) {
        return e
      }
    }
    let e = await run()
    assert.equal(e.code, 'PROVIDER_RATE_LIMITED')
    assert.equal(e.retryable, true)
    assert.ok(!/rahasia-internal/.test(e.message), 'pesan galat penyedia tidak diteruskan')
    status = 500
    e = await run()
    assert.equal(e.code, 'PROVIDER_ERROR')
    assert.equal(e.retryable, true)
    status = 400
    e = await run()
    assert.equal(e.code, 'PROVIDER_ERROR')
    assert.equal(e.retryable, false)
  } finally {
    s.close()
  }
})
