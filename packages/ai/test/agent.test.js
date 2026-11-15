'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { runAgent, createToolRegistry, createFakeProvider, readSectionTool, ProviderError } = require('../index')

const reader = { async getCurrentVersion() { return { number: 1, source: '# T\n\n## Abstract\nIsi abstrak.\n', parse: require('@publication-prepare/manuscript').parseManuscript('# T\n\n## Abstract\nIsi abstrak.\n', 'markdown') } } }
const toolCtx = { userId: 'u1', projectId: 'p1', reader }
const base = (provider, extra = {}) => ({ provider, model: 'm', system: 'sys', messages: [{ role: 'user', content: 'hai' }], registry: createToolRegistry([readSectionTool]), toolCtx, sleepFn: async () => {}, ...extra })

test('multi-turn dengan tool: tool dijalankan, hasilnya dikembalikan sebagai tool_result data, jawaban akhir', async () => {
  const p = createFakeProvider({ script: [{ text: 'Saya baca. ', toolUses: [{ name: 'read_section', input: { section: 'abstract' } }] }, { text: 'Abstrak berisi: Isi abstrak.' }] })
  const events = []
  const r = await runAgent(base(p, { onEvent: (e) => events.push(e.type) }))
  assert.equal(r.status, 'completed')
  assert.match(r.text, /Saya baca\./)
  assert.match(r.text, /Isi abstrak/)
  assert.equal(r.iterations, 2)
  assert.deepEqual(r.toolCalls.map((t) => [t.name, t.ok]), [['read_section', true]])
  assert.ok(events.includes('tool_start') && events.includes('tool_result') && events.includes('content_delta') && events.includes('usage'))
  const second = p.calls[1].messages
  assert.equal(second[second.length - 1].role, 'user')
  assert.equal(second[second.length - 1].content[0].type, 'tool_result')
  assert.match(second[second.length - 1].content[0].content, /Isi abstrak/)
  assert.equal(r.usage.inputTokens > 0 && r.usage.outputTokens > 0, true)
})

test('injeksi prompt: model "patuh" memanggil tool tak dikenal / parameter asing -> ditolak, tak ada efek samping', async () => {
  const p = createFakeProvider({
    script: [
      { toolUses: [{ name: 'delete_project', input: { projectId: 'p1' } }, { name: 'read_section', input: { section: 'abstract', projectId: 'p-lain' } }] },
      { text: 'Selesai.' }
    ]
  })
  const r = await runAgent(base(p))
  assert.equal(r.status, 'completed')
  assert.deepEqual(r.toolCalls.map((t) => t.errorCode), ['TOOL_NOT_FOUND', 'TOOL_INVALID_INPUT'])
  const results = p.calls[1].messages.at(-1).content
  assert.ok(results.every((b) => b.is_error === true))
})

test('batas iterasi: loop tool tanpa akhir berhenti dengan AGENT_LIMIT_REACHED', async () => {
  const p = createFakeProvider({ script: () => ({ toolUses: [{ name: 'read_section', input: { section: 'abstract' } }] }) })
  const r = await runAgent(base(p, { limits: { maxIterations: 3 } }))
  assert.equal(r.status, 'failed')
  assert.equal(r.errorCode, 'AGENT_LIMIT_REACHED')
  assert.equal(p.calls.length, 3)
})

test('batas jumlah tool call: panggilan melebihi batas dijawab TOOL_LIMIT tanpa dieksekusi', async () => {
  const p = createFakeProvider({ script: [{ toolUses: Array.from({ length: 4 }, () => ({ name: 'read_section', input: { section: 'abstract' } })) }, { text: 'ok' }] })
  const r = await runAgent(base(p, { limits: { maxToolCalls: 2 } }))
  assert.equal(r.status, 'completed')
  assert.deepEqual(r.toolCalls.map((t) => t.errorCode), [undefined, undefined, 'TOOL_LIMIT', 'TOOL_LIMIT'])
})

test('batas token per giliran menghentikan loop', async () => {
  const p = createFakeProvider({ script: () => ({ toolUses: [{ name: 'read_section', input: { section: 'abstract' } }], usage: { inputTokens: 700, outputTokens: 400 } }) })
  const r = await runAgent(base(p, { limits: { maxTotalTokens: 1000, maxIterations: 8 } }))
  assert.equal(r.errorCode, 'AGENT_LIMIT_REACHED')
  assert.equal(p.calls.length, 1)
})

test('timeout total giliran -> PROVIDER_TIMEOUT', async () => {
  const p = createFakeProvider({ script: [{ text: 'a'.repeat(60), chunks: ['a', 'b', 'c', 'd', 'e', 'f'], chunkDelayMs: 80 }] })
  const r = await runAgent(base(p, { limits: { timeoutMs: 120 } }))
  assert.equal(r.status, 'failed')
  assert.equal(r.errorCode, 'PROVIDER_TIMEOUT')
})

test('pembatalan oleh pengguna -> cancelled dengan teks parsial dan usage 0', async () => {
  const ac = new AbortController()
  const p = createFakeProvider({ script: [{ chunks: ['satu ', 'dua ', 'tiga ', 'empat '], chunkDelayMs: 50 }] })
  setTimeout(() => ac.abort(), 70)
  const r = await runAgent(base(p, { signal: ac.signal }))
  assert.equal(r.status, 'cancelled')
})

test('galat provider retryable dicoba ulang sekali; berhasil pada percobaan kedua', async () => {
  const p = createFakeProvider({ script: [{ error: { code: 'PROVIDER_RATE_LIMITED', retryable: true } }, { text: 'berhasil' }] })
  const r = await runAgent(base(p))
  assert.equal(r.status, 'completed')
  assert.equal(r.text, 'berhasil')
  assert.equal(p.calls.length, 2)
})

test('galat provider tidak disamarkan sebagai jawaban sukses', async () => {
  const p = createFakeProvider({ script: [{ error: { code: 'PROVIDER_TIMEOUT', retryable: true } }] })
  const r = await runAgent(base(p, { providerRetries: 1 }))
  assert.equal(r.status, 'failed')
  assert.equal(r.errorCode, 'PROVIDER_TIMEOUT')
  assert.equal(r.text, '')
  const generic = createFakeProvider({ script: () => { throw new Error('detail internal: sk-ant-rahasia') } })
  const r2 = await runAgent(base(generic))
  assert.equal(r2.errorCode, 'PROVIDER_ERROR')
  assert.ok(!JSON.stringify(r2).includes('sk-ant'))
})

test('refusal dari provider -> failed PROVIDER_REFUSAL', async () => {
  const p = createFakeProvider({ script: [{ text: '', stopReason: 'refusal' }] })
  const r = await runAgent(base(p))
  assert.equal(r.errorCode, 'PROVIDER_REFUSAL')
})

test('finalize (validator keluaran) dipanggil pada jawaban akhir dan bisa mengubah teks', async () => {
  const p = createFakeProvider({ script: [{ text: 'klaim \\cite{karangan}' }] })
  const r = await runAgent(base(p, { finalize: async (t) => ({ text: t.replace('\\cite{karangan}', '[referensi belum terverifikasi]'), flags: ['UNVERIFIED_CITATION'] }) }))
  assert.equal(r.text, 'klaim [referensi belum terverifikasi]')
  assert.deepEqual(r.flags, ['UNVERIFIED_CITATION'])
})

test('ProviderError membawa kode yang dipakai agen', () => {
  assert.equal(new ProviderError('PROVIDER_ERROR', 'x').code, 'PROVIDER_ERROR')
})

test('regresi: pembatalan dan timeout di tengah stream mempertahankan teks parsial yang sudah diterima', async () => {
  const ac = new AbortController()
  const p = createFakeProvider({ script: [{ chunks: ['satu ', 'dua ', 'tiga ', 'empat '], chunkDelayMs: 60 }] })
  setTimeout(() => ac.abort(), 150)
  const r = await runAgent(base(p, { signal: ac.signal }))
  assert.equal(r.status, 'cancelled')
  assert.ok(r.text.startsWith('satu'), `teks parsial hilang: ${JSON.stringify(r.text)}`)
  assert.ok(!r.text.includes('empat'))

  const p2 = createFakeProvider({ script: [{ chunks: ['aa ', 'bb ', 'cc ', 'dd ', 'ee '], chunkDelayMs: 80 }] })
  const t = await runAgent(base(p2, { limits: { timeoutMs: 200 } }))
  assert.equal(t.errorCode, 'PROVIDER_TIMEOUT')
  assert.ok(t.text.startsWith('aa'), `teks parsial hilang saat timeout: ${JSON.stringify(t.text)}`)
})

test('regresi QC: stream tanpa message_end atau dengan teks kosong tidak boleh berstatus completed', async () => {
  const noEnd = { name: 'x', async *stream() { yield { type: 'text_delta', text: 'setengah' } } }
  const r1 = await runAgent(base(noEnd))
  assert.equal(r1.status, 'failed')
  assert.equal(r1.errorCode, 'PROVIDER_ERROR')
  assert.equal(r1.text, 'setengah')
  const empty = createFakeProvider({ script: [{ text: '' }] })
  const r2 = await runAgent(base(empty))
  assert.equal(r2.status, 'failed')
  assert.equal(r2.errorCode, 'PROVIDER_ERROR')
})
