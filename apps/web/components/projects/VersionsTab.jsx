'use client'
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../lib/clientApi'
import { Alert } from '../auth/ui'

const ORIGIN = { paste: 'Tempel', upload: 'Unggah', user_edit: 'Edit pengguna', ai_edit_accepted: 'Saran AI diterima', restore: 'Pemulihan' }

export default function VersionsTab({ projectId, revision, archived, dirty, onRestored }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [view, setView] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setData(await apiFetch(`/api/projects/${projectId}/versions`))
    } catch (e) {
      setError(e.message)
    }
  }, [projectId])
  useEffect(() => {
    load()
  }, [load])

  async function open(n) {
    setError('')
    try {
      const d = await apiFetch(`/api/projects/${projectId}/versions/${n}`)
      setView(d.version)
    } catch (e) {
      setError(e.message)
    }
  }

  async function restore(n) {
    const warn = dirty ? ' Perubahan yang belum disimpan di editor akan hilang.' : ''
    if (!window.confirm(`Pulihkan versi ${n}? Isinya menjadi versi baru; riwayat tidak dihapus.${warn}`)) return
    setBusy(true)
    setError('')
    try {
      await apiFetch(`/api/projects/${projectId}/versions/${n}/restore`, { method: 'POST', body: { baseRevision: revision } })
      await onRestored()
    } catch (e) {
      setError(e.code === 'VERSION_CONFLICT' ? 'Naskah berubah dari tempat lain. Buka ulang halaman ini lalu coba lagi.' : e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-5">
      <Alert>{error}</Alert>
      {!data && !error && <p className="text-sm text-ink-faint">Memuat...</p>}
      {data && data.versions.length === 0 && <p className="text-sm text-ink-faint">Belum ada versi. Simpan naskah dari tab Naskah.</p>}
      <ul className="mt-2 divide-y divide-base-border rounded-2xl border border-base-border bg-base">
        {data?.versions.map((v) => (
          <li key={v._id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <span className="font-semibold text-ink">v{v.number}</span>
            {v.isCurrent && <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-800">Saat ini</span>}
            <span className="text-xs text-ink-faint">
              {new Date(v.createdAt).toLocaleString('id-ID')} · {ORIGIN[v.origin] || v.origin} · {v.format === 'latex' ? 'LaTeX' : 'Markdown'} · {v.parse?.stats?.words ?? 0} kata
            </span>
            {v.note && <span className="text-xs text-ink-soft">{v.note}</span>}
            <span className="ml-auto flex gap-2">
              <button onClick={() => open(v.number)} className="rounded-full border border-base-border px-3 py-1 text-xs">Lihat</button>
              {!v.isCurrent && !archived && (
                <button onClick={() => restore(v.number)} disabled={busy} className="rounded-full border border-base-border px-3 py-1 text-xs disabled:opacity-60">Pulihkan</button>
              )}
            </span>
          </li>
        ))}
      </ul>

      {view && (
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Isi versi {view.number} (hanya baca)</h2>
            <button onClick={() => setView(null)} className="text-xs text-ink-faint hover:underline">Tutup</button>
          </div>
          <textarea readOnly value={view.source} wrap="off" aria-label={`Isi versi ${view.number}`} className="h-[50vh] w-full overflow-auto whitespace-pre rounded-xl border border-base-border bg-base-soft p-3 font-mono text-[13px] leading-5 text-ink" />
        </div>
      )}
    </section>
  )
}
