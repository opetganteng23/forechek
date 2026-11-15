'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { AppError } = require('@publication-prepare/core')
const { makeEnv, runTurn } = require('./helpers')
const { createChatService } = require('../index')

const CRID = 'req-aaaaaaaa-1'
const args = (over = {}) => ({ userId: 'u1', projectId: 'p1', clientRequestId: CRID, content: 'Apa isi abstrak saya?', ...over })

test('giliran chat penuh: pesan user disimpan lebih dulu, assistant selesai, usage dan buku besar tercatat, log AI ditulis', async () => {
  const env = makeEnv({ script: [{ text: 'Jawaban uji.', usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 } }] })
  const { events, result } = await runTurn(env.chat, args())
  assert.equal(result.status, 'completed')
  const [u, a] = env.msgs
  assert.equal(u.role, 'user')
  assert.equal(a.role, 'assistant')
  assert.equal(a.status, 'completed')
  assert.equal(a.text, 'Jawaban uji.')
  assert.equal(a.model, 'fake-model-1')
  assert.equal(a.promptVersion, 'chat-2026-11-v1')
  assert.equal(env.ledgerRows.length, 1)
  assert.equal(env.ledgerRows[0].billedTokens, 120)
  assert.deepEqual(env.users.u1.usage.tokensUsed, 120)
  assert.equal(env.users.u1.usage.messagesUsed, 1)
  assert.equal(env.logs.length, 1)
  assert.ok(!JSON.stringify(env.logs).includes('abstrak'), 'log jejak AI tidak memuat isi pesan')
  const types = events.map((e) => e.type)
  assert.equal(types[0], 'message_start')
  assert.equal(types.at(-1), 'message_complete')
})

test('pesan user tersimpan SEBELUM agen berjalan (provider melihat pesan sudah ada di penyimpanan)', async () => {
  let userStoredWhenProviderCalled = false
  const env = makeEnv({ script: (req) => { userStoredWhenProviderCalled = env.msgs.some((m) => m.role === 'user'); return { text: 'ok' } } })
  await runTurn(env.chat, args())
  assert.equal(userStoredWhenProviderCalled, true)
})

test('IDOR: pengguna lain mendapat NOT_FOUND, tak ada pesan atau tagihan tersimpan', async () => {
  const env = makeEnv({ script: [{ text: 'x' }] })
  await assert.rejects(() => env.chat.begin({ ...args({ userId: 'u2' }), requestId: 'r' }), (e) => e.code === 'NOT_FOUND')
  await assert.rejects(() => env.chat.begin({ ...args({ projectId: 'tidak-ada' }), requestId: 'r' }), (e) => e.code === 'NOT_FOUND')
  await assert.rejects(() => env.chat.listMessages({ userId: 'u2', projectId: 'p1' }), (e) => e.code === 'NOT_FOUND')
  assert.equal(env.msgs.length, 0)
  assert.equal(env.ledgerRows.length, 0)
})

test('validasi: pesan kosong, terlalu panjang, NUL, clientRequestId buruk', async () => {
  const env = makeEnv({ script: [{ text: 'x' }] })
  const bad = [{ content: '   ' }, { content: 'a'.repeat(8001) }, { content: 'a\u0000b' }, { content: 123 }, { clientRequestId: 'pendek' }, { clientRequestId: 'ada spasi di sini!' }, { clientRequestId: undefined }]
  for (const b of bad) await assert.rejects(() => env.chat.begin({ ...args(b), requestId: 'r' }), (e) => e instanceof AppError && ['VALIDATION_ERROR', 'PAYLOAD_TOO_LARGE'].includes(e.code))
  assert.equal(env.msgs.length, 0)
})

test('provider belum dikonfigurasi: galat jelas SEBELUM pesan disimpan', async () => {
  const env = makeEnv({ script: [{ text: 'x' }] })
  const chat = createChatService({ messages: env.messages, ledger: env.ledger, usageStore: env.usageStore, logStore: env.logStore, projects: env.projectsApi, reader: {}, registry: env.registry, getProvider: () => { throw new AppError('PROVIDER_NOT_CONFIGURED', 'belum') }, aiConfig: env.aiConfig, quota: { free: { tokensPerMonth: 1e6, messagesPerMonth: 100 } } })
  await assert.rejects(() => chat.begin({ ...args(), requestId: 'r' }), (e) => e.code === 'PROVIDER_NOT_CONFIGURED')
  assert.equal(env.msgs.length, 0)
})

test('model belum dikonfigurasi (AI_MODEL_CHAT kosong): ditolak tanpa menebak nama model', async () => {
  const env = makeEnv({ script: [{ text: 'x' }], aiEnv: { AI_MODEL_CHAT: '' } })
  await assert.rejects(() => env.chat.begin({ ...args(), requestId: 'r' }), (e) => e.code === 'PROVIDER_NOT_CONFIGURED')
  assert.equal(env.msgs.length, 0)
})

test('idempotensi: clientRequestId yang sama setelah selesai -> replay tanpa pesan ganda dan tanpa tagihan ganda', async () => {
  const env = makeEnv({ script: [{ text: 'Jawaban pertama.' }] })
  await runTurn(env.chat, args())
  const before = { msgs: env.msgs.length, ledger: env.ledgerRows.length, used: env.users.u1.usage.tokensUsed, calls: env.provider.calls.length }
  const { turn, events } = await runTurn(env.chat, args())
  assert.equal(turn.replayed, true)
  assert.equal(events.at(-1).text, 'Jawaban pertama.')
  assert.equal(events.at(-1).replayed, true)
  assert.deepEqual({ msgs: env.msgs.length, ledger: env.ledgerRows.length, used: env.users.u1.usage.tokensUsed, calls: env.provider.calls.length }, before)
})

test('permintaan sama yang masih diproses -> REQUEST_IN_PROGRESS; tidak ada pesan ganda', async () => {
  const env = makeEnv({ script: [{ text: 'lambat', chunkDelayMs: 100, chunks: ['a', 'b', 'c'] }] })
  const first = await env.chat.begin({ ...args(), requestId: 'r1' })
  const running = first.run(() => {})
  await assert.rejects(() => env.chat.begin({ ...args(), requestId: 'r2' }), (e) => e.code === 'REQUEST_IN_PROGRESS')
  await running
  assert.equal(env.msgs.filter((m) => m.role === 'user').length, 1)
  assert.equal(env.msgs.filter((m) => m.role === 'assistant').length, 1)
})

test('retry setelah gagal: pesan user dipakai ulang, percobaan kedua ditagih sekali, percobaan gagal tidak ditagih', async () => {
  const env = makeEnv({ script: [{ error: { code: 'PROVIDER_ERROR', retryable: false } }, { text: 'berhasil di percobaan kedua', usage: { inputTokens: 50, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 } }] })
  const r1 = await runTurn(env.chat, args())
  assert.equal(r1.result.status, 'failed')
  assert.equal(env.users.u1.usage, null, 'kegagalan penyedia tidak mengurangi kuota')
  assert.ok(r1.events.some((e) => e.type === 'error' && e.code === 'PROVIDER_ERROR'))
  const r2 = await runTurn(env.chat, args())
  assert.equal(r2.result.status, 'completed')
  assert.equal(env.msgs.filter((m) => m.role === 'user').length, 1)
  assert.equal(env.msgs.filter((m) => m.role === 'assistant').length, 1)
  assert.equal(env.msgs.find((m) => m.role === 'assistant').attempts, 2)
  assert.deepEqual(env.ledgerRows.map((r) => [r.attempt, r.billedTokens]), [[1, 0], [2, 60]])
  assert.equal(env.users.u1.usage.tokensUsed, 60)
  assert.equal(env.users.u1.usage.messagesUsed, 1)
})

test('pembatalan: pesan berstatus cancelled, teks parsial tersimpan, ditagih sesuai usage yang dilaporkan', async () => {
  const env = makeEnv({ script: [{ chunks: ['satu ', 'dua ', 'tiga ', 'empat '], chunkDelayMs: 60 }] })
  const ac = new AbortController()
  setTimeout(() => ac.abort(), 90)
  const { result } = await runTurn(env.chat, args({ signal: ac.signal }))
  assert.equal(result.status, 'cancelled')
  const a = env.msgs.find((m) => m.role === 'assistant')
  assert.equal(a.status, 'cancelled')
  assert.notEqual(a.status, 'completed')
})

test('kuota habis (pesan): QUOTA_EXCEEDED dengan detail provisional, tidak ada pesan tersimpan', async () => {
  const env = makeEnv({ script: [{ text: 'x' }], quota: { free: { tokensPerMonth: 1000000, messagesPerMonth: 1 } } })
  await runTurn(env.chat, args())
  await assert.rejects(() => env.chat.begin({ ...args({ clientRequestId: 'req-bbbbbbbb-2' }), requestId: 'r' }), (e) => e.code === 'QUOTA_EXCEEDED' && e.details.reason === 'messages' && e.details.provisional === true)
  assert.equal(env.msgs.filter((m) => m.role === 'user').length, 1)
})

test('kuota token: estimasi konteks melebihi sisa -> ditolak', async () => {
  const env = makeEnv({ script: [{ text: 'x' }], quota: { free: { tokensPerMonth: 10, messagesPerMonth: 100 } } })
  await assert.rejects(() => env.chat.begin({ ...args(), requestId: 'r' }), (e) => e.code === 'QUOTA_EXCEEDED' && e.details.reason === 'tokens')
})

test('periode kuota lewat -> penghitung di-reset sebelum dipakai', async () => {
  const env = makeEnv({ script: [{ text: 'x' }], userDoc: { subscription: { plan: 'free' }, usage: { periodStart: new Date('2020-01-01'), tokensUsed: 999999, messagesUsed: 999 } }, quota: { free: { tokensPerMonth: 100000, messagesPerMonth: 5 } } })
  const { result } = await runTurn(env.chat, args())
  assert.equal(result.status, 'completed')
  assert.equal(env.users.u1.usage.messagesUsed, 1)
})

test('konteks: kebijakan sistem + ringkasan naskah; tool read_section tersedia; riwayat user/assistant masuk', async () => {
  const env = makeEnv({ script: [{ text: 'jawab 1' }, { text: 'jawab 2' }] })
  await runTurn(env.chat, args())
  await runTurn(env.chat, args({ clientRequestId: 'req-cccccccc-3', content: 'Pertanyaan lanjutan' }))
  const second = env.provider.calls[1]
  assert.match(second.system, /DATA/)
  assert.match(second.system, /Bagian terdeteksi/)
  assert.ok(!second.system.includes('Ini abstrak uji'), 'isi naskah tidak ikut dikirim penuh; hanya ringkasan')
  assert.deepEqual(second.messages.map((m) => m.role), ['user', 'assistant', 'user'])
  assert.deepEqual(second.tools.map((t) => t.name), ['read_section'])
  assert.equal(second.model, 'test-model')
})

test('injeksi lewat isi naskah: tool hasil read_section memuat instruksi, tetapi kebijakan tool tidak berubah', async () => {
  const env = makeEnv({ script: [{ toolUses: [{ name: 'read_section', input: { section: 'abstract' } }] }, { toolUses: [{ name: 'delete_project', input: {} }] }, { text: 'Saya tidak menjalankan instruksi di dalam naskah.' }] })
  const { result } = await runTurn(env.chat, args())
  assert.equal(result.status, 'completed')
  assert.deepEqual(result.toolCalls.map((t) => [t.name, t.ok]), [['read_section', true], ['delete_project', false]])
  assert.equal(env.msgs.find((m) => m.role === 'assistant').toolCalls.length, 2)
  const toolResult = env.provider.calls[1].messages.at(-1).content[0].content
  assert.match(toolResult, /IGNORE ALL PREVIOUS INSTRUCTIONS/, 'hasil tool memuat teks injeksi apa adanya sebagai data')
})

test('kegagalan penyedia terlihat jelas: status failed + kode galat tersimpan, bukan jawaban sukses', async () => {
  const env = makeEnv({ script: [{ error: { code: 'PROVIDER_TIMEOUT', retryable: false } }] })
  const { result, events } = await runTurn(env.chat, args())
  assert.equal(result.status, 'failed')
  const a = env.msgs.find((m) => m.role === 'assistant')
  assert.equal(a.status, 'failed')
  assert.equal(a.errorCode, 'PROVIDER_TIMEOUT')
  assert.ok(events.some((e) => e.type === 'error'))
  assert.equal(env.logs.length, 0, 'jejak AI hanya untuk giliran yang selesai')
})

test('getUsage menampilkan paket, batas provisional dan pemakaian', async () => {
  const env = makeEnv({ script: [{ text: 'x' }] })
  await runTurn(env.chat, args())
  const u = await env.chat.getUsage('u1')
  assert.equal(u.plan, 'free')
  assert.equal(u.provisional, true)
  assert.equal(u.used.messages, 1)
})

test('retry dengan clientRequestId sama tetapi isi berbeda: yang dipakai adalah pesan tersimpan (idempotensi tidak bisa dibelokkan)', async () => {
  const env = makeEnv({ script: [{ error: { code: 'PROVIDER_ERROR' } }, { text: 'ok' }] })
  await runTurn(env.chat, args({ content: 'Pertanyaan asli' }))
  await runTurn(env.chat, args({ content: 'Isi yang berbeda sama sekali' }))
  const lastCall = env.provider.calls.at(-1)
  assert.equal(lastCall.messages.at(-1).content, 'Pertanyaan asli')
  assert.equal(env.msgs.find((m) => m.role === 'user').text, 'Pertanyaan asli')
})

test('regresi QC: kegagalan persistensi/penagihan setelah agen selesai tetap menutup stream dengan message_complete', async () => {
  const env = makeEnv({ script: [{ text: 'jawaban' }] })
  env.ledger.insertOnce = async () => { throw new Error('db turun') }
  const { events } = await runTurn(env.chat, args())
  assert.equal(events.at(-1).type, 'message_complete')
  assert.ok(events.some((e) => e.type === 'error' && e.code === 'INTERNAL_ERROR'))
})

test('regresi QC: dua retry paralel pada pesan gagal -> hanya satu yang berjalan (compare-and-set)', async () => {
  const env = makeEnv({ script: [{ error: { code: 'PROVIDER_ERROR' } }, { text: 'ok', chunkDelayMs: 40, chunks: ['o', 'k'] }, { text: 'ok2' }] })
  await runTurn(env.chat, args())
  const settled = await Promise.allSettled([env.chat.begin({ ...args(), requestId: 'a' }), env.chat.begin({ ...args(), requestId: 'b' })])
  const ok = settled.filter((s) => s.status === 'fulfilled')
  const rejected = settled.filter((s) => s.status === 'rejected')
  assert.equal(ok.length, 1)
  assert.equal(rejected.length, 1)
  assert.equal(rejected[0].reason.code, 'REQUEST_IN_PROGRESS')
  assert.equal(env.msgs.find((m) => m.role === 'assistant').attempts, 2)
})

test('regresi QC: pembatalan tercatat di buku besar dan kuota sesuai aturan cancelled', async () => {
  const env = makeEnv({ script: [{ chunks: ['satu ', 'dua ', 'tiga ', 'empat '], chunkDelayMs: 60 }] })
  const ac = new AbortController()
  setTimeout(() => ac.abort(), 100)
  await runTurn(env.chat, args({ signal: ac.signal }))
  assert.equal(env.ledgerRows.length, 1)
  assert.equal(env.ledgerRows[0].status, 'cancelled')
  assert.equal(env.ledgerRows[0].billedMessages, 1)
})
