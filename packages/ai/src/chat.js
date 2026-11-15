'use strict'
const { AppError, checkQuota, effectivePlan } = require('@publication-prepare/core')
const { runAgent } = require('./agent')
const { buildContext } = require('./context')
const { modelFor } = require('./config')
const { recordUsage } = require('./usage')

const MAX_CONTENT_CHARS = 8000
const HISTORY_LIMIT = 30
const CLIENT_REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,64}$/

// Layanan chat per proyek (MTS 38.2 D). Semua akses data lewat penyimpanan terinjeksi, dan SEMUA pembacaan
// berfilter userId (kepemilikan). Penyimpanan yang dibutuhkan:
//   messages : findByClientRequest(userId, projectId, role, crid), insert(doc) (lempar {duplicate:true} bila unik bentrok),
//              update(id, patch), listRecent(userId, projectId, limit), list(userId, projectId, {before, limit})
//   ledger   : insertOnce(entry) -> boolean            usageStore : getUser(userId), applyUsage(userId, delta, periodStart)
//   logStore : insertOnce(entry)                       projects   : getForChat(userId, projectId) -> {project, version, references} | null
//   reader   : getCurrentVersion(userId, projectId)    (dipakai tool read_section)
function createChatService({ messages, ledger, usageStore, logStore, projects, reader, registry, getProvider, aiConfig, quota, now = () => new Date() }) {
  const staleMs = aiConfig.limits.timeoutMs * 2

  function validate({ content, clientRequestId }) {
    if (typeof content !== 'string' || !content.trim()) throw new AppError('VALIDATION_ERROR', 'Pesan tidak boleh kosong')
    if (content.length > MAX_CONTENT_CHARS) throw new AppError('PAYLOAD_TOO_LARGE', `Pesan maksimal ${MAX_CONTENT_CHARS} karakter`)
    if (content.includes('\u0000')) throw new AppError('VALIDATION_ERROR', 'Pesan mengandung karakter tidak valid')
    if (typeof clientRequestId !== 'string' || !CLIENT_REQUEST_ID_RE.test(clientRequestId)) {
      throw new AppError('VALIDATION_ERROR', 'clientRequestId wajib 8-64 karakter (huruf, angka, _ atau -)')
    }
  }

  // Tahap 1: pra-pemeriksaan + persistensi pesan. Semua galat di sini dilempar SEBELUM stream dimulai.
  async function begin({ userId, projectId, clientRequestId, content, requestId }) {
    validate({ content, clientRequestId })
    const ctx = await projects.getForChat(userId, projectId)
    if (!ctx) throw new AppError('NOT_FOUND', 'Data tidak ditemukan')

    const provider = getProvider() // PROVIDER_NOT_CONFIGURED bila belum dikonfigurasi
    const model = modelFor(aiConfig, 'chat')

    // Idempotensi: pesan dengan clientRequestId yang sama tidak membuat pesan ganda atau tagihan ganda.
    const existingAssistant = await messages.findByClientRequest(userId, projectId, 'assistant', clientRequestId)
    const seenAttempts = existingAssistant ? existingAssistant.attempts || 1 : 0 // ditangkap saat dibaca untuk compare-and-set
    if (existingAssistant && existingAssistant.status === 'completed') {
      return { replayed: true, messageId: existingAssistant.id, run: (onEvent) => replay(existingAssistant, onEvent) }
    }
    if (existingAssistant && existingAssistant.status === 'streaming' && now() - new Date(existingAssistant.updatedAt) < staleMs) {
      throw new AppError('REQUEST_IN_PROGRESS', 'Permintaan yang sama masih diproses')
    }

    // Kuota (batas bulanan provisional). Estimasi memakai ukuran konteks.
    const userDoc = await usageStore.getUser(userId)
    const history = (await messages.listRecent(userId, projectId, HISTORY_LIMIT)).filter((m) => m.status === 'completed' && m.clientRequestId !== clientRequestId)
    // Pada retry, teks yang dipakai adalah pesan yang SUDAH tersimpan (idempotensi tidak boleh dibelokkan lewat isi baru).
    let userMsg = await messages.findByClientRequest(userId, projectId, 'user', clientRequestId)
    const text = userMsg ? userMsg.text : content.trim()
    const built = buildContext({
      project: ctx.project,
      version: ctx.version,
      references: ctx.references || [],
      history,
      userMessage: text,
      budgetTokens: aiConfig.limits.contextBudgetTokens
    })
    const q = checkQuota({ plan: effectivePlan(userDoc.subscription, now()), usage: userDoc.usage, limits: quota, estimatedTokens: built.meta.estimatedTokens, now: now() })
    if (!q.allowed) {
      throw new AppError('QUOTA_EXCEEDED', q.reason === 'messages' ? 'Kuota pesan bulan ini habis' : 'Kuota token bulan ini habis', {
        details: { reason: q.reason, limit: q.limit, used: { tokens: q.usage.tokensUsed, messages: q.usage.messagesUsed }, provisional: true }
      })
    }

    // Pesan pengguna disimpan SEBELUM agen berjalan (MTS 38.2 D). Pada retry, pesan pengguna yang ada dipakai ulang.
    if (!userMsg) {
      try {
        userMsg = await messages.insert({ userId, projectId, role: 'user', text, status: 'completed', clientRequestId, requestId, versionId: ctx.version ? ctx.version.id : null })
      } catch (err) {
        if (!err || !err.duplicate) throw err
        userMsg = await messages.findByClientRequest(userId, projectId, 'user', clientRequestId)
      }
    }

    let assistant
    const fresh = { usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, toolCalls: [], text: '', status: 'streaming', errorCode: null, requestId, provider: provider.name, promptVersion: aiConfig.promptVersion, versionId: ctx.version ? ctx.version.id : null }
    if (existingAssistant) {
      // Retry setelah gagal/dibatalkan/usang: pakai ulang dokumen yang sama (indeks unik) dengan nomor percobaan baru.
      const attempts = seenAttempts + 1
      // Compare-and-set pada nomor percobaan: dua retry paralel tidak boleh sama-sama berjalan.
      const claimed = await messages.claimRetry(existingAssistant.id, seenAttempts, { ...fresh, attempts })
      if (!claimed) throw new AppError('REQUEST_IN_PROGRESS', 'Permintaan yang sama masih diproses')
      assistant = { id: existingAssistant.id, attempts }
    } else {
      try {
        const created = await messages.insert({ userId, projectId, role: 'assistant', clientRequestId, attempts: 1, model, ...fresh })
        assistant = { id: created.id, attempts: 1 }
      } catch (err) {
        if (err && err.duplicate) throw new AppError('REQUEST_IN_PROGRESS', 'Permintaan yang sama masih diproses')
        throw err
      }
    }

    return {
      replayed: false,
      messageId: assistant.id,
      run: (onEvent, signal) => execute({ userId, projectId, requestId, ctx, built, provider, model, assistant, signal, onEvent })
    }
  }

  async function replay(msg, onEvent) {
    onEvent({ type: 'message_start', messageId: msg.id, replayed: true, provider: msg.provider || null, model: msg.model || null })
    onEvent({ type: 'message_complete', messageId: msg.id, status: 'completed', text: msg.text, replayed: true })
    return { status: 'completed', replayed: true }
  }

  // Tahap 2: jalankan agen, simpan hasil, catat pemakaian. Tidak melempar: galat dikirim sebagai event `error`.
  async function execute({ userId, projectId, requestId, ctx, built, provider, model, assistant, signal, onEvent }) {
    const emit = (ev) => {
      try {
        onEvent(ev)
      } catch {
        /* client sudah terputus; proses tetap dituntaskan dan disimpan */
      }
    }
    emit({ type: 'message_start', messageId: assistant.id, requestId, attempt: assistant.attempts, provider: provider.name, model })

    let result
    try {
      result = await runAgent({
        provider,
        model,
        system: built.system,
        messages: built.messages,
        registry,
        toolCtx: { userId, projectId, reader },
        limits: aiConfig.limits,
        signal,
        onEvent: emit
      })
    } catch (err) {
      result = { status: 'failed', text: '', usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, toolCalls: [], model, errorCode: 'INTERNAL_ERROR', errorMessage: 'Terjadi kesalahan pada server', flags: [] }
    }

    // Persistensi pasca-agen tidak boleh membiarkan stream menggantung: galat dilaporkan, message_complete tetap dikirim.
    let billed = { tokens: 0, messages: 0 }
    try {
      await messages.update(assistant.id, {
        text: result.text,
        status: result.status,
        usage: result.usage,
        toolCalls: result.toolCalls,
        model: result.model,
        errorCode: result.errorCode
      })
      const rec = await recordUsage({
        ledger,
        usageStore,
        userId,
        projectId,
        messageId: assistant.id,
        attempt: assistant.attempts,
        requestId,
        provider: provider.name,
        model: result.model,
        status: result.status,
        usage: result.usage,
        hasText: Boolean(result.text),
        errorCode: result.errorCode,
        now: now()
      })
      billed = rec.billed
      if (result.status === 'completed') {
        await logStore.insertOnce({ projectId, userId, kind: 'chat', sections: [], summary: `Percakapan chat (${result.toolCalls.length} panggilan tool)`, messageId: assistant.id })
      }
    } catch (err) {
      emit({ type: 'error', code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan saat menyimpan hasil giliran' })
    }
    if (result.status === 'failed') emit({ type: 'error', code: result.errorCode, message: result.errorMessage })
    emit({
      type: 'message_complete',
      messageId: assistant.id,
      status: result.status,
      text: result.text,
      truncated: result.truncated,
      flags: result.flags,
      usage: result.usage,
      billed,
      errorCode: result.errorCode
    })
    return result
  }

  async function listMessages({ userId, projectId, limit = 50, before = null }) {
    const ctx = await projects.getForChat(userId, projectId)
    if (!ctx) throw new AppError('NOT_FOUND', 'Data tidak ditemukan')
    return messages.list(userId, projectId, { limit: Math.min(Math.max(Number(limit) || 50, 1), 100), before })
  }

  async function getUsage(userId) {
    const u = await usageStore.getUser(userId)
    const plan = effectivePlan(u.subscription, now())
    const q = checkQuota({ plan, usage: u.usage, limits: quota, now: now() })
    return { plan, limit: q.limit, used: { tokens: q.usage.tokensUsed, messages: q.usage.messagesUsed }, periodStart: q.usage.periodStart, provisional: true }
  }

  return { begin, listMessages, getUsage }
}

module.exports = { createChatService, MAX_CONTENT_CHARS, CLIENT_REQUEST_ID_RE }
