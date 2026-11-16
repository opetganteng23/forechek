'use client'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../lib/clientApi'
import { useConfirm } from '../providers/ConfirmProvider'
import { Alert, Field, inputClass } from '../auth/ui'

const LANG = { indonesia: 'Indonesia', english: 'English' }
const TYPE = { conference: 'Konferensi', journal: 'Jurnal', unspecified: 'Belum ditentukan' }

export default function ProjectsList() {
  const [status, setStatus] = useState('active')
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ title: '', language: 'indonesia', publicationType: 'unspecified' })
  const [creating, setCreating] = useState(false)
  const confirm = useConfirm()
  const [trial, setTrial] = useState(null)

  const load = useCallback(async () => {
    setError('')
    try {
      const d = await apiFetch(`/api/projects?status=${status}`)
      setItems(d.projects)
    } catch (e) {
      setError(e.message)
      setItems([])
    }
  }, [status])

  useEffect(() => {
    setItems(null)
    load()
  }, [load])

  // Status trial (jatah paper). Gagal memuat tidak menghalangi halaman; server tetap menegakkan batas.
  useEffect(() => {
    let alive = true
    apiFetch('/api/auth/me').then((d) => alive && setTrial(d.trial)).catch(() => {})
    return () => { alive = false }
  }, [items && items.length])

  async function create(e) {
    e.preventDefault()
    if (creating) return
    const trialNote = trial && trial.trial ? `\n\nAkun trial: jatah ${trial.limit} paper dipakai sekarang dan TIDAK kembali walau paper dihapus.` : ''
    if (!(await confirm({ title: 'Buat paper baru?', message: `Paper "${form.title.trim()}" akan dibuat.${trialNote}`, confirmText: 'Ya, buat paper' }))) return
    setCreating(true)
    setError('')
    try {
      const d = await apiFetch('/api/projects', { method: 'POST', body: form })
      window.location.href = `/dashboard/projects/${d.project._id}`
    } catch (err) {
      setError(err.message)
      setCreating(false)
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink">Proyek Saya</h1>

      {trial && trial.trial && (
        <div role="status" className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
          <strong>Akun trial:</strong> {trial.remaining > 0 ? `Anda dapat membuat ${trial.remaining} paper lagi (dari ${trial.limit}).` : `jatah ${trial.limit} paper sudah terpakai. Menghapus paper tidak mengembalikan jatah; berlangganan untuk membuat paper lain.`}
        </div>
      )}

      {status === 'active' && (
        <form onSubmit={create} className="mt-6 space-y-4 rounded-2xl border border-base-border bg-base-soft p-5">
          <h2 className="text-sm font-semibold text-ink">Proyek baru</h2>
          <Field label="Judul proyek" id="title">
            <input id="title" required maxLength={200} className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="mis. Prediksi keterlambatan penerbangan" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Bahasa naskah" id="language">
              <select id="language" className={inputClass} value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
                <option value="indonesia">Indonesia</option>
                <option value="english">English</option>
              </select>
            </Field>
            <Field label="Jenis publikasi" id="ptype">
              <select id="ptype" className={inputClass} value={form.publicationType} onChange={(e) => setForm({ ...form, publicationType: e.target.value })}>
                <option value="unspecified">Belum ditentukan</option>
                <option value="conference">Konferensi</option>
                <option value="journal">Jurnal</option>
              </select>
            </Field>
          </div>
          <Alert>{error}</Alert>
          <button disabled={creating || !form.title.trim() || (trial && trial.trial && trial.remaining === 0)} className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-base disabled:opacity-60">
            {creating ? 'Membuat...' : 'Buat proyek'}
          </button>
        </form>
      )}
      {status !== 'active' && <div className="mt-4"><Alert>{error}</Alert></div>}

      <div className="mt-8 flex gap-2 text-sm">
        {[['active', 'Aktif'], ['archived', 'Diarsipkan']].map(([k, label]) => (
          <button key={k} onClick={() => setStatus(k)} className={`rounded-full px-4 py-1.5 ${status === k ? 'bg-ink text-base' : 'border border-base-border text-ink-soft'}`}>
            {label}
          </button>
        ))}
      </div>

      {items === null && <p className="mt-6 text-sm text-ink-faint">Memuat...</p>}
      {items && items.length === 0 && <p className="mt-6 text-sm text-ink-faint">Belum ada proyek {status === 'active' ? 'aktif' : 'yang diarsipkan'}.</p>}
      <ul className="mt-4 space-y-3">
        {(items || []).map((p) => (
          <li key={p._id}>
            <Link href={`/dashboard/projects/${p._id}`} className="block rounded-2xl border border-base-border bg-base p-4 shadow-sm transition-colors hover:bg-base-soft">
              <span className="font-semibold text-ink">{p.title}</span>
              <span className="mt-1 block text-xs text-ink-faint">
                {LANG[p.language]} · {TYPE[p.publicationType]} · {p.versionCount} versi · diubah {new Date(p.updatedAt).toLocaleString('id-ID')}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
