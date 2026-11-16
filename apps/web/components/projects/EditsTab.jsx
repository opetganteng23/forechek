'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '../../lib/clientApi'
import { useConfirm } from '../providers/ConfirmProvider'
import { Alert } from '../auth/ui'

const STATUS = {
  pending: ['Menunggu keputusan', 'border-amber-300 bg-amber-50 text-amber-900'],
  accepting: ['Diterapkan...', 'border-amber-300 bg-amber-50 text-amber-900'],
  accepted: ['Diterima', 'border-green-300 bg-green-50 text-green-900'],
  rejected: ['Ditolak', 'border-base-border text-ink-faint'],
  stale: ['Kedaluwarsa', 'border-red-300 bg-red-50 text-red-900']
}
const ERR = {
  EDIT_STALE: 'Naskah sudah berubah sejak usulan dibuat, sehingga usulan tidak diterapkan otomatis. Minta usulan baru di tab Chat.',
  EDIT_DECIDED: 'Usulan ini sudah diputuskan.',
  CITATION_NOT_VERIFIED: 'Usulan memuat sitasi tanpa referensi terverifikasi, sehingga tidak diterapkan.',
  VERSION_CONFLICT: 'Naskah diubah dari tempat lain. Muat ulang halaman lalu coba lagi.'
}
const errText = (e) => ERR[e.details?.code] || ERR[e.code] || e.message
const DIFF_CLS = { eq: 'text-ink-soft', del: 'bg-red-50 text-red-900', add: 'bg-green-50 text-green-900' }
const DIFF_MARK = { eq: ' ', del: '-', add: '+' }

function Diff({ diff }) {
  return (
    <pre className="max-h-80 overflow-auto rounded-lg border border-base-border text-xs leading-5" aria-label="Perbandingan sebelum dan sesudah">
      {diff.map((d, i) => (
        <div key={i} className={`whitespace-pre-wrap break-words px-2 ${DIFF_CLS[d.op]}`}>
          <span aria-hidden="true" className="select-none pr-2 text-ink-faint">{DIFF_MARK[d.op]}</span>
          <span className="sr-only">{d.op === 'del' ? 'dihapus: ' : d.op === 'add' ? 'ditambah: ' : ''}</span>
          {d.text || ' '}
        </div>
      ))}
    </pre>
  )
}

export default function EditsTab({ projectId, revision, dirty, onAccepted }) {
  const confirm = useConfirm()
  const [edits, setEdits] = useState(null)
  const [open, setOpen] = useState(null)
  const [notice, setNotice] = useState({ kind: 'error', text: '' })
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)

  const refresh = useCallback(async () => {
    const d = await apiFetch(`/api/projects/${projectId}/edits`)
    if (alive.current) setEdits(d.edits)
  }, [projectId])

  useEffect(() => {
    alive.current = true
    refresh().catch((e) => alive.current && setNotice({ kind: 'error', text: errText(e) }))
    return () => { alive.current = false }
  }, [refresh])

  async function show(id) {
    setNotice({ kind: 'error', text: '' })
    try {
      const d = await apiFetch(`/api/projects/${projectId}/edits/${id}`)
      if (alive.current) setOpen(d.edit)
    } catch (e) {
      setNotice({ kind: 'error', text: errText(e) })
    }
  }

  async function decide(kind) {
    if (busy || !open) return
    const accept = kind === 'accept'
    if (!(await confirm({ title: accept ? 'Terima usulan ini?' : 'Tolak usulan ini?', message: accept ? `Bagian "${open.heading}" diganti sesuai usulan dan disimpan sebagai versi baru.` : 'Usulan ditolak dan naskah tidak berubah.', confirmText: accept ? 'Ya, terima usulan' : 'Ya, tolak', tone: accept ? 'default' : 'danger' }))) return
    setBusy(true)
    setNotice({ kind: 'error', text: '' })
    try {
      const d = await apiFetch(`/api/projects/${projectId}/edits/${open.id}/${kind}`, { method: 'POST', body: kind === 'accept' ? { baseRevision: revision } : {} })
      if (kind === 'accept') {
        try {
          await onAccepted()
          setNotice({ kind: 'success', text: `Usulan diterima. Naskah menjadi versi ${d.version.number}.` })
        } catch {
          // Penerimaan SUDAH berhasil di server; hanya pemuatan ulang editor yang gagal.
          setNotice({ kind: 'info', text: `Usulan diterima (versi ${d.version.number}), tetapi editor gagal dimuat ulang. Muat ulang halaman.` })
        }
      } else setNotice({ kind: 'info', text: 'Usulan ditolak. Naskah tidak berubah.' })
      setOpen(null)
    } catch (e) {
      setNotice({ kind: 'error', text: errText(e) })
      await show(open.id)
    } finally {
      setBusy(false)
      refresh().catch(() => {})
    }
  }

  if (!edits) return <p className="mt-5 text-sm text-ink-faint">Memuat...</p>

  return (
    <section className="mt-5 max-w-3xl space-y-5">
      <p className="text-sm text-ink-soft">
        AI hanya <strong>mengusulkan</strong> perubahan; naskah tidak berubah sampai Anda menerimanya. Menerima usulan membuat versi baru. Usulan dibuat lewat tab Chat (minta AI memperbaiki satu bagian).
      </p>
      <Alert kind={notice.kind}>{notice.text}</Alert>
      {edits.length === 0 && <p className="text-sm text-ink-faint">Belum ada usulan edit.</p>}
      <ul className="space-y-2">
        {edits.map((e) => {
          const [label, cls] = STATUS[e.status] || STATUS.stale
          return (
            <li key={e.id}>
              <button onClick={() => show(e.id)} className="w-full rounded-xl border border-base-border px-3 py-2 text-left text-sm hover:bg-base-soft">
                <span className="flex flex-wrap items-center gap-2">
                  <strong className="break-words text-ink">{e.heading}</strong>
                  <span className={`rounded-full border px-2 py-0.5 text-xs ${cls}`}>{label}</span>
                  <span className="text-xs text-ink-faint">dari versi {e.baseVersionNumber}</span>
                </span>
                <span className="mt-1 block break-words text-xs text-ink-soft">{e.reason}</span>
              </button>
            </li>
          )
        })}
      </ul>
      {open && (
        <div className="space-y-3 rounded-2xl border border-base-border p-4">
          <h3 className="text-sm font-semibold text-ink">Usulan untuk bagian "{open.heading}"</h3>
          <p className="text-xs text-ink-soft">Alasan: {open.reason}</p>
          <Diff diff={open.diff} />
          {open.status === 'stale' && <Alert kind="error">Usulan kedaluwarsa karena naskah berubah sejak usulan dibuat. Usulan tidak dapat diterapkan; minta usulan baru.</Alert>}
          {open.status === 'accepted' && <p className="text-xs text-ink-soft">Diterima menjadi versi {open.resultVersionNumber}.</p>}
          {open.status === 'pending' && (
            <>
              {dirty && <Alert kind="info">Ada perubahan di editor yang belum disimpan. Simpan atau buang dulu sebelum menerima usulan.</Alert>}
              <div className="flex gap-2">
                <button onClick={() => decide('accept')} disabled={busy || dirty} className="rounded-xl bg-ink px-4 py-2 text-sm font-medium text-base disabled:opacity-50">Terima usulan</button>
                <button onClick={() => decide('reject')} disabled={busy} className="rounded-xl border border-base-border px-4 py-2 text-sm disabled:opacity-50">Tolak</button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}
