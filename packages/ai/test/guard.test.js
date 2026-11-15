'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { makeEnv, runTurn } = require('./helpers')

// Sanitizer sederhana untuk tes (produksi memakai @publication-prepare/literature): mengganti \cite{...} apa pun.
const sanitize = (text) => {
  const flags = []
  const out = text.replace(/\\cite\{([^}]*)\}/g, (m, k) => (flags.push({ type: 'orphan', detail: k }), '[referensi belum terverifikasi]'))
  return { text: out, flags }
}
const finalizeOutput = async (text) => sanitize(text)
// Guard stream: kirim hanya bagian yang berakhir di spasi dan tidak memuat kurung kurawal terbuka.
const createStreamGuard = async () => {
  let raw = ''
  let emitted = ''
  return {
    push(t) {
      raw += t
      const cut = raw.lastIndexOf(' ') + 1
      const open = raw.slice(0, cut).split('{').length > raw.slice(0, cut).split('}').length
      if (!cut || open) return ''
      const s = sanitize(raw.slice(0, cut)).text
      if (!s.startsWith(emitted)) return ''
      const d = s.slice(emitted.length)
      emitted = s
      return d
    }
  }
}

const args = { userId: 'u1', projectId: 'p1', clientRequestId: 'guard-req-0001', content: 'tanya' }
const FAKE = 'Sesuai \\cite{karangan2025x} dan seterusnya selesai.'

test('stream: delta yang sampai ke client TIDAK PERNAH memuat sitasi karangan (disanitasi sebelum tampil)', async () => {
  const env = makeEnv({ script: [{ chunks: ['Sesuai ', '\\ci', 'te{karang', 'an2025x} dan ', 'seterusnya ', 'selesai.'], text: FAKE }], finalizeOutput, createStreamGuard })
  const { events } = await runTurn(env.chat, args)
  const shown = events.filter((e) => e.type === 'content_delta').map((e) => e.text).join('')
  assert.ok(!shown.includes('karangan2025x'), `bocor di stream: ${shown}`)
  assert.ok(!shown.includes('\\cite'))
  assert.ok(events.at(-1).text.includes('[referensi belum terverifikasi]'))
  assert.ok(!events.at(-1).text.includes('karangan2025x'))
})

test('pembatalan di tengah stream: teks parsial yang DISIMPAN dan dikirim sudah disanitasi', async () => {
  const env = makeEnv({ script: [{ chunks: ['Awal \\cite{karangan2025x} ', 'lanjut ', 'lagi ', 'dan lagi '], chunkDelayMs: 60 }], finalizeOutput, createStreamGuard })
  const ac = new AbortController()
  setTimeout(() => ac.abort(), 130)
  const { result, events } = await runTurn(env.chat, { ...args, signal: ac.signal })
  assert.equal(result.status, 'cancelled')
  const a = env.msgs.find((m) => m.role === 'assistant')
  assert.ok(a.text.includes('Awal'))
  assert.ok(!a.text.includes('karangan2025x'), `tersimpan mentah: ${a.text}`)
  assert.ok(a.text.includes('[referensi belum terverifikasi]'))
  assert.ok(!events.at(-1).text.includes('karangan2025x'))
})

test('kegagalan provider di tengah stream: teks parsial yang tersimpan juga disanitasi', async () => {
  const env = makeEnv({ script: [(null, { chunks: ['Awal \\cite{karangan2025x} '], error: undefined, stopReason: undefined })], finalizeOutput, createStreamGuard })
  // provider yang melempar setelah mengirim teks
  env.provider.stream = async function* () {
    yield { type: 'text_delta', text: 'Awal \\cite{karangan2025x} ' }
    const { ProviderError } = require('../index')
    throw new ProviderError('PROVIDER_ERROR', 'putus')
  }
  const { result } = await runTurn(env.chat, args)
  assert.equal(result.status, 'failed')
  const a = env.msgs.find((m) => m.role === 'assistant')
  assert.ok(!a.text.includes('karangan2025x'))
  assert.ok(a.text.includes('[referensi belum terverifikasi]'))
})

test('batas agen tercapai: teks parsial disanitasi', async () => {
  const env = makeEnv({ script: () => ({ text: 'Lihat \\cite{karangan2025x}. ', toolUses: [{ name: 'read_section', input: { section: 'abstract' } }] }), finalizeOutput, aiEnv: { AI_MAX_ITERATIONS: '2' } })
  const { result } = await runTurn(env.chat, args)
  assert.equal(result.errorCode, 'AGENT_LIMIT_REACHED')
  const a = env.msgs.find((m) => m.role === 'assistant')
  assert.ok(!a.text.includes('karangan2025x'))
  assert.ok(a.text.includes('[referensi belum terverifikasi]'))
})

test('validator melempar: gagal TERTUTUP (tidak ada teks mentah tersimpan atau dikirim), status failed', async () => {
  const env = makeEnv({ script: [{ text: FAKE }], finalizeOutput: async () => { throw new Error('validator rusak') } })
  const { result, events } = await runTurn(env.chat, args)
  assert.equal(result.status, 'failed')
  const a = env.msgs.find((m) => m.role === 'assistant')
  assert.equal(a.text, '')
  assert.ok(!JSON.stringify(events.at(-1)).includes('karangan2025x'))
})

test('guard stream gagal (melempar saat dibuat): tidak ada delta mentah yang dikirim', async () => {
  const env = makeEnv({ script: [{ text: FAKE }], finalizeOutput, createStreamGuard: async () => { throw new Error('guard rusak') } })
  const { events } = await runTurn(env.chat, args)
  const shown = events.filter((e) => e.type === 'content_delta').map((e) => e.text).join('')
  assert.ok(!shown.includes('karangan2025x'))
})
