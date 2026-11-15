'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '../../lib/clientApi'
import { Alert } from '../auth/ui'

const ERRORS = {
  QUOTA_EXCEEDED: 'Kuota pemakaian AI bulan ini habis (batas sementara). Coba lagi bulan depan atau hubungi admin.',
  PROVIDER_NOT_CONFIGURED: 'Layanan AI belum dikonfigurasi di server ini.',
  PROVIDER_RATE_LIMITED: 'Penyedia AI sedang membatasi permintaan. Coba lagi sebentar.',
  PROVIDER_TIMEOUT: 'Penyedia AI tidak merespons tepat waktu.',
  PROVIDER_ERROR: 'Penyedia AI sedang mengalami gangguan.',
  PROVIDER_REFUSAL: 'Penyedia AI menolak permintaan ini.',
  AGENT_LIMIT_REACHED: 'Batas langkah/token untuk satu giliran tercapai. Jawaban di atas mungkin belum lengkap.',
  RATE_LIMITED: 'Terlalu banyak pesan. Tunggu sebentar.',
  REQUEST_IN_PROGRESS: 'Permintaan yang sama masih diproses. Tunggu sebentar lalu coba lagi.',
  PAYLOAD_TOO_LARGE: 'Pesan terlalu panjang (maksimal 8000 karakter).',
  INTERNAL_ERROR: 'Terjadi kesalahan pada server.'
}
const msgFor = (code, fallback) => ERRORS[code] || fallback || 'Terjadi kesalahan.'

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `r${Date.now()}${Math.random().toString(36).slice(2, 10)}`
}

// Pengurai SSE: event dipisah baris kosong; tiap blok berisi `event:` dan `data:`.
function parseSse(buffer) {
  const events = []
  const parts = buffer.split('\n\n')
  const rest = parts.pop()
  for (const block of parts) {
    let type = 'message'
    let data = ''
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) type = line.slice(6).trim()
      else if (line.startsWith('data:')) data += line.slice(5).trim()
    }
    try {
      events.push({ type, ...JSON.parse(data) })
    } catch {
      /* blok rusak diabaikan */
    }
  }
  return { events, rest }
}

export default function ChatTab({ projectId }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState({ kind: 'error', text: '' })
  const [retry, setRetry] = useState(null) // { clientRequestId, content } untuk "Coba lagi"
  const [usage, setUsage] = useState(null)
  const abortRef = useRef(null)
  const endRef = useRef(null)

  const refreshUsage = useCallback(() => apiFetch('/api/usage').then(setUsage).catch(() => {}), [])

  useEffect(() => {
    let alive = true
    Promise.all([apiFetch(`/api/projects/${projectId}/messages?limit=50`), apiFetch('/api/usage').catch(() => null)])
      .then(([d, u]) => {
        if (!alive) return
        setItems(d.messages)
        setUsage(u)
        setLoading(false)
      })
      .catch((e) => {
        if (!alive) return
        setLoadError(e.message)
        setLoading(false)
      })
    return () => {
      alive = false
      if (abortRef.current) abortRef.current.abort()
    }
  }, [projectId])

  useEffect(() => {
    if (endRef.current && endRef.current.scrollIntoView) endRef.current.scrollIntoView({ block: 'end' })
  }, [items])

  async function send(content, clientRequestId, { isRetry = false } = {}) {
    if (sending) return
    setSending(true)
    setNotice({ kind: 'error', text: '' })
    setRetry(null)
    const ac = new AbortController()
    abortRef.current = ac
    const localId = `local-${clientRequestId}`
    if (!isRetry) {
      setItems((cur) => [...cur, { id: `u-${clientRequestId}`, role: 'user', text: content, status: 'completed' }, { id: localId, role: 'assistant', text: '', status: 'streaming', provider: null, toolCalls: [] }])
    } else {
      setItems((cur) => cur.map((m) => (m.id === localId ? { ...m, status: 'streaming', text: '', errorCode: null } : m)))
    }
    const patch = (fn) => setItems((cur) => cur.map((m) => (m.id === localId ? fn(m) : m)))

    let completed = false
    try {
      const res = await fetch(`/api/projects/${projectId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientRequestId, content }),
        signal: ac.signal
      })
      if (!res.ok || !(res.headers.get('content-type') || '').includes('text/event-stream')) {
        let code = 'UNKNOWN'
        let message = ''
        try {
          const j = await res.json()
          code = j.error?.code || code
          message = j.error?.message || ''
        } catch {
          /* bukan JSON */
        }
        // Galat pra-pemeriksaan. Yang dapat dicoba lagi: gelembung lokal dipertahankan (ditandai gagal) agar "Coba lagi"
        // punya sasaran; selain itu pesan lokal dibuang.
        const retryable = code === 'REQUEST_IN_PROGRESS' || code === 'RATE_LIMITED' || code === 'PROVIDER_RATE_LIMITED'
        if (retryable) {
          patch((m) => ({ ...m, status: 'failed', errorCode: code }))
          setRetry({ clientRequestId, content })
        } else {
          setItems((cur) => cur.filter((m) => m.id !== localId && m.id !== `u-${clientRequestId}`))
          if (code === 'VALIDATION_ERROR' || code === 'PAYLOAD_TOO_LARGE') setInput(content)
        }
        setNotice({ kind: 'error', text: msgFor(code, message) })
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const { events, rest } = parseSse(buffer)
        buffer = rest
        for (const ev of events) {
          if (ev.type === 'message_start') patch((m) => ({ ...m, provider: ev.provider || null }))
          else if (ev.type === 'content_delta') patch((m) => ({ ...m, text: m.text + ev.text }))
          else if (ev.type === 'tool_start') patch((m) => ({ ...m, toolCalls: [...(m.toolCalls || []), { name: ev.name, ok: null }] }))
          else if (ev.type === 'tool_result') patch((m) => ({ ...m, toolCalls: (m.toolCalls || []).map((t) => (t.name === ev.name && t.ok === null ? { ...t, ok: ev.ok } : t)) }))
          else if (ev.type === 'error') setNotice({ kind: 'error', text: msgFor(ev.code, ev.message) })
          else if (ev.type === 'message_complete') {
            completed = true
            patch((m) => ({ ...m, text: ev.text ?? m.text, status: ev.status, errorCode: ev.errorCode || null, truncated: ev.truncated }))
            if (ev.status === 'failed') setRetry({ clientRequestId, content })
            if (ev.truncated) setNotice({ kind: 'info', text: 'Jawaban terpotong karena batas panjang keluaran.' })
          }
        }
      }
      if (!completed) throw new Error('stream-ended')
    } catch (err) {
      if (err && err.name === 'AbortError') {
        patch((m) => ({ ...m, status: 'cancelled' }))
        setNotice({ kind: 'info', text: 'Dihentikan. Teks yang sudah diterima tetap disimpan.' })
      } else if (!completed) {
        patch((m) => ({ ...m, status: 'failed', errorCode: 'NETWORK' }))
        setNotice({ kind: 'error', text: 'Koneksi terputus sebelum jawaban selesai. Coba lagi; pesan yang sama tidak akan terkirim dua kali.' })
        setRetry({ clientRequestId, content })
      }
    } finally {
      setSending(false)
      abortRef.current = null
      refreshUsage()
    }
  }

  function onSubmit(e) {
    e.preventDefault()
    const content = input.trim()
    if (!content || sending) return
    setInput('')
    send(content, newId())
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) onSubmit(e)
  }

  if (loading) return <p className="mt-5 text-sm text-ink-faint">Memuat percakapan...</p>
  if (loadError) return <div className="mt-5"><Alert>{loadError}</Alert></div>

  return (
    <section className="mt-5 max-w-3xl">
      <div role="log" aria-live="polite" aria-label="Percakapan" className="h-[50vh] space-y-3 overflow-y-auto rounded-xl border border-base-border bg-base p-3">
        {items.length === 0 && <p className="text-sm text-ink-faint">Belum ada percakapan. Tanyakan tentang struktur, bahasa, atau kesiapan naskah Anda. AI tidak akan mengarang sitasi.</p>}
        {items.map((m) => (
          <div key={m.id} className={m.role === 'user' ? 'text-right' : ''}>
            <div className={`inline-block max-w-[92%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-left text-sm ${m.role === 'user' ? 'bg-ink text-base' : 'border border-base-border bg-base-muted text-ink'}`}>
              {m.text || (m.status === 'streaming' ? 'Menulis...' : '')}
            </div>
            {m.role === 'assistant' && (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
                {m.provider === 'fake' && <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-900">Provider palsu (uji), bukan Claude</span>}
                {m.status === 'streaming' && <span>sedang mengetik</span>}
                {m.status === 'cancelled' && <span>dihentikan</span>}
                {m.status === 'failed' && <span className="text-red-700">gagal{m.errorCode ? ` (${m.errorCode})` : ''}</span>}
                {(m.toolCalls || []).length > 0 && <span>tool: {m.toolCalls.map((t) => `${t.name}${t.ok === false ? ' gagal' : ''}`).join(', ')}</span>}
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="mt-3 space-y-2">
        <Alert kind={notice.kind}>{notice.text}</Alert>
        {retry && !sending && (
          <button onClick={() => send(retry.content, retry.clientRequestId, { isRetry: true })} className="rounded-full border border-base-border px-4 py-1.5 text-sm text-ink-soft">
            Coba lagi
          </button>
        )}
        <form onSubmit={onSubmit} className="flex items-end gap-2">
          <label htmlFor="chat-input" className="sr-only">Pesan untuk asisten</label>
          <textarea
            id="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            maxLength={8000}
            placeholder="Tulis pesan (Enter kirim, Shift+Enter baris baru)"
            className="w-full resize-y rounded-xl border border-base-border bg-base p-2.5 text-sm text-ink focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
          {sending ? (
            <button type="button" onClick={() => abortRef.current && abortRef.current.abort()} className="rounded-full border border-base-border px-4 py-2 text-sm text-ink-soft">
              Hentikan
            </button>
          ) : (
            <button type="submit" disabled={!input.trim()} className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-base disabled:opacity-50">
              Kirim
            </button>
          )}
        </form>
        {usage && (
          <p className="text-xs text-ink-faint">
            Pemakaian bulan ini: {usage.used.messages}/{usage.limit.messagesPerMonth} pesan, {usage.used.tokens.toLocaleString('id-ID')}/{usage.limit.tokensPerMonth.toLocaleString('id-ID')} token (paket {usage.plan}; batas sementara, belum final).
          </p>
        )}
      </div>
    </section>
  )
}
