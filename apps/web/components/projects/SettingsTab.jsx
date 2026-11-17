'use client'
import { useState } from 'react'
import { apiFetch } from '../../lib/clientApi'
import { useConfirm } from '../providers/ConfirmProvider'
import { Alert, Field, inputClass } from '../auth/ui'

export default function SettingsTab({ project, onChange }) {
  const confirm = useConfirm()
  const [form, setForm] = useState({
    title: project.title,
    fieldOfStudy: project.fieldOfStudy || '',
    language: project.language,
    publicationType: project.publicationType
  })
  const [msg, setMsg] = useState({ kind: 'info', text: '' })
  const [busy, setBusy] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  async function patch(body, okText) {
    setBusy(true)
    setMsg({ kind: 'info', text: '' })
    try {
      const d = await apiFetch(`/api/projects/${project._id}`, { method: 'PATCH', body })
      onChange(d.project)
      setMsg({ kind: 'success', text: okText })
    } catch (e) {
      setMsg({ kind: 'error', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  async function save(e) {
    e.preventDefault()
    patch({ ...form, fieldOfStudy: form.fieldOfStudy.trim() || null }, 'Pengaturan disimpan.')
  }

  async function remove() {
    if (!(await confirm({ title: 'Hapus proyek permanen?', message: `Proyek "${project.title}" beserta seluruh versi, chat, referensi, laporan, dan usulannya akan dihapus dan TIDAK dapat dikembalikan. Jatah paper trial tidak kembali.`, confirmText: 'Ya, hapus permanen', tone: 'danger' }))) return
    setBusy(true)
    try {
      await apiFetch(`/api/projects/${project._id}`, { method: 'DELETE' })
      window.location.href = '/dashboard/projects'
    } catch (e) {
      setMsg({ kind: 'error', text: e.message })
      setBusy(false)
    }
  }

  const archived = project.status !== 'active'
  return (
    <section className="mt-5 max-w-xl space-y-8">
      <form onSubmit={save} className="space-y-4">
        <Field label="Judul proyek" id="s-title">
          <input id="s-title" required maxLength={200} className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label="Bidang ilmu" id="s-field" hint="Opsional, maksimal 120 karakter.">
          <input id="s-field" maxLength={120} className={inputClass} value={form.fieldOfStudy} onChange={(e) => setForm({ ...form, fieldOfStudy: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Bahasa naskah" id="s-lang">
            <select id="s-lang" className={inputClass} value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
              <option value="indonesia">Indonesia</option>
              <option value="english">English</option>
            </select>
          </Field>
          <Field label="Jenis publikasi" id="s-type">
            <select id="s-type" className={inputClass} value={form.publicationType} onChange={(e) => setForm({ ...form, publicationType: e.target.value })}>
              <option value="unspecified">Belum ditentukan</option>
              <option value="conference">Konferensi</option>
              <option value="journal">Jurnal</option>
            </select>
          </Field>
        </div>
        <Alert kind={msg.kind}>{msg.text}</Alert>
        <button disabled={busy || !form.title.trim()} className="btn-primary">Simpan pengaturan</button>
      </form>

      <div className="rounded-xl border border-base-border p-5">
        <h2 className="text-sm font-semibold text-ink">{archived ? 'Pulihkan proyek' : 'Arsipkan proyek'}</h2>
        <p className="mt-1 text-xs text-ink-faint">
          {archived ? 'Proyek akan aktif kembali dan naskah dapat diubah.' : 'Proyek disembunyikan dari daftar aktif dan naskah tidak dapat diubah sampai dipulihkan.'}
        </p>
        <button disabled={busy} onClick={async () => { if (await confirm({ title: archived ? 'Pulihkan proyek?' : 'Arsipkan proyek?', message: archived ? 'Proyek akan aktif kembali dan naskah dapat diubah.' : 'Proyek disembunyikan dari daftar aktif dan naskah tidak dapat diubah sampai dipulihkan.', confirmText: archived ? 'Ya, pulihkan' : 'Ya, arsipkan' })) patch({ status: archived ? 'active' : 'archived' }, archived ? 'Proyek dipulihkan.' : 'Proyek diarsipkan.') }} className="btn-secondary mt-3">
          {archived ? 'Pulihkan' : 'Arsipkan'}
        </button>
      </div>

      <div className="rounded-xl border border-red-200 p-5">
        <h2 className="text-sm font-semibold text-red-800">Hapus permanen</h2>
        <p className="mt-1 text-xs text-ink-faint">Menghapus proyek beserta seluruh riwayat versinya. Tindakan ini tidak dapat dibatalkan.</p>
        <label htmlFor="del" className="mt-3 block text-xs text-ink-soft">Ketik judul proyek untuk konfirmasi:</label>
        <input id="del" className={`${inputClass} mt-1`} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={project.title} />
        <button disabled={busy || confirmText !== project.title} onClick={remove} className="btn-danger mt-3">Hapus proyek</button>
      </div>
    </section>
  )
}
