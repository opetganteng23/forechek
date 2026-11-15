'use strict'
const { periodStartOf } = require('@publication-prepare/core')

// Aturan penagihan kuota (PROVISIONAL, keputusan D3-03; belum disetujui pemilik produk):
//  - token tertagih = input + output + cacheWrite + ceil(cacheRead / 10)  (cache read dihitung 10%)
//  - selesai (completed)            : token penuh, 1 pesan
//  - dibatalkan pengguna (cancelled): token yang sudah dilaporkan, 1 pesan bila sudah ada teks
//  - gagal karena penyedia (timeout/error/refusal/rate limit): 0 token, 0 pesan (pengguna tidak membayar kegagalan)
//  - gagal karena batas agen (AGENT_LIMIT_REACHED): token penuh (sudah terpakai), 1 pesan
//  - retry/reconnect: dicatat per (messageId, attempt) dan tidak pernah menggandakan satu percobaan
const FREE_OF_CHARGE_FAILURES = new Set(['PROVIDER_ERROR', 'PROVIDER_TIMEOUT', 'PROVIDER_RATE_LIMITED', 'PROVIDER_REFUSAL', 'PROVIDER_NOT_CONFIGURED', 'INTERNAL_ERROR'])

function tokensOf(u = {}) {
  return (u.inputTokens || 0) + (u.outputTokens || 0) + (u.cacheWriteTokens || 0) + Math.ceil((u.cacheReadTokens || 0) / 10)
}

function billedFor({ status, usage, hasText, errorCode }) {
  if (status === 'completed') return { tokens: tokensOf(usage), messages: 1 }
  if (status === 'cancelled') return { tokens: tokensOf(usage), messages: hasText ? 1 : 0 }
  if (status === 'failed' && !FREE_OF_CHARGE_FAILURES.has(errorCode)) return { tokens: tokensOf(usage), messages: 1 }
  return { tokens: 0, messages: 0 }
}

// Mencatat ke buku besar secara idempoten lalu memperbarui penghitung kuota secara atomik (hanya bila baris baru).
async function recordUsage({ ledger, usageStore, userId, projectId, messageId, attempt = 1, requestId, provider, model, status, usage, hasText, errorCode, task = 'chat', now = new Date() }) {
  const billed = billedFor({ status, usage, hasText, errorCode })
  const inserted = await ledger.insertOnce({
    userId,
    projectId,
    messageId,
    attempt,
    requestId,
    task,
    provider,
    model,
    status,
    inputTokens: usage.inputTokens || 0,
    outputTokens: usage.outputTokens || 0,
    cacheReadTokens: usage.cacheReadTokens || 0,
    cacheWriteTokens: usage.cacheWriteTokens || 0,
    billedTokens: billed.tokens,
    billedMessages: billed.messages
  })
  if (!inserted) return { duplicate: true, billed: { tokens: 0, messages: 0 } }
  if (billed.tokens || billed.messages) await usageStore.applyUsage(userId, { tokens: billed.tokens, messages: billed.messages }, periodStartOf(now))
  return { duplicate: false, billed }
}

module.exports = { billedFor, tokensOf, recordUsage }
