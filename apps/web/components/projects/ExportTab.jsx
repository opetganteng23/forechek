'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '../../lib/clientApi'
import { Alert } from '../auth/ui'

const ERR = {
  NO_MANUSCRIPT: 'Proyek belum memiliki naskah tersimpan. Simpan naskah di tab Naskah dulu.',
  RATE_LIMITED: 'Terlalu banyak permintaan. Tunggu sebentar.'
}
const errText = (e) => ERR[e.details?.code] || ERR[e.code] || e.message

export default function ExportTab({ projectId, revision }) {
  const [info, setInfo] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setInfo(null)
    setError('')
    apiFetch(`/api/projects/${projectId}/export?format=json`)
      .then((d) => alive && setInfo(d))
      .catch((e) => alive && setError(errText(e)))
    return () => { alive = false }
  }, [projectId, revision])

  return (
    <section className="mt-5 max-w-3xl space-y-5">
      <p className="text-sm text-ink-soft">
        Paket ZIP berisi <code>main.tex</code>, <code>references.bib</code> (hanya referensi <strong>terverifikasi</strong>), README, dan manifest versi/venue. Paket dibuat saat Anda mengunduh dan tidak disimpan di server. Hanya naskah yang sudah DISIMPAN (versi tersimpan) yang diekspor; teks editor yang belum disimpan tidak ikut.
      </p>
      <Alert kind="error">{error}</Alert>
      {!info && !error && <p className="text-sm text-ink-faint">Memeriksa paket...</p>}
      {info && (
        <>
          <div className="rounded-2xl border border-base-border p-4">
            <h3 className="text-sm font-semibold text-ink">Peringatan sebelum submit ({info.warnings.length})</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-ink-soft">
              {info.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
            <p className="mt-3 text-xs text-ink-faint">
              Versi naskah {info.manifest.manuscriptVersion.number}, {info.manifest.references.exported} referensi terverifikasi diekspor
              {info.manifest.references.excluded ? `, ${info.manifest.references.excluded} dikecualikan` : ''}.
            </p>
          </div>
          <a href={`/api/projects/${projectId}/export`} download className="inline-block rounded-xl bg-ink px-4 py-2 text-sm font-medium text-base">Unduh paket ZIP</a>
          <div className="rounded-2xl border border-base-border p-4">
            <h3 className="text-sm font-semibold text-ink">Overleaf</h3>
            <p className="mt-1 text-xs text-ink-soft">Impor satu klik belum tersedia. Gunakan unggah manual:</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-ink-soft">
              {info.overleaf.steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
            <p className="mt-2 text-xs text-ink-faint">{info.overleaf.note}</p>
          </div>
        </>
      )}
    </section>
  )
}
