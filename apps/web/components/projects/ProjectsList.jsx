'use client'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../lib/clientApi'
import { useConfirm } from '../providers/ConfirmProvider'
import { Alert, Field, inputClass } from '../auth/ui'
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from '../ui'
import Pager from '../ui/Pager'

const PAGE = 10
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
  const [q, setQ] = useState('')
  const [fType, setFType] = useState('')
  const [fLang, setFLang] = useState('')
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)

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

  const trialBlocked = trial && trial.trial && trial.remaining === 0
  const shown = (items || []).filter((p) => (!q.trim() || p.title.toLowerCase().includes(q.trim().toLowerCase())) && (!fType || p.publicationType === fType) && (!fLang || p.language === fLang))
  const paged = shown.slice((page - 1) * PAGE, page * PAGE)

  return (
    <div>
      <PageHeader
        title="Paper"
        description="Setiap paper menyimpan naskah, versi, referensi, dan laporan kesiapan Anda."
        actions={status === 'active' && <button type="button" className="btn-primary" onClick={() => setShowForm((v) => !v)} aria-expanded={showForm} data-testid="toggle-new">{showForm ? 'Tutup formulir' : 'Paper baru'}</button>}
      />

      {trial && trial.trial && (
        <div role="status" className="mb-6 rounded-xl border border-base-border bg-white px-4 py-3 text-sm text-ink-soft">
          <strong className="text-ink">Akun trial:</strong> {trial.remaining > 0 ? `Anda dapat membuat ${trial.remaining} paper lagi (dari ${trial.limit}).` : `jatah ${trial.limit} paper sudah terpakai. Menghapus paper tidak mengembalikan jatah; berlangganan untuk membuat paper lagi.`}
        </div>
      )}

      {status === 'active' && showForm && (
        <form onSubmit={create} className="card mb-6 space-y-4 p-5">
          <h2 className="text-sm font-semibold text-ink">Paper baru</h2>
          <Field label="Judul paper" id="title">
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
          <button disabled={creating || !form.title.trim() || trialBlocked} className="btn-primary">
            {creating ? 'Membuat...' : 'Buat paper'}
          </button>
        </form>
      )}
      {!(status === 'active' && showForm) && error && <div className="mb-4"><ErrorState message={error} onRetry={load} /></div>}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2" role="tablist" aria-label="Status paper">
          {[['active', 'Aktif'], ['archived', 'Diarsipkan']].map(([k, label]) => (
            <button key={k} role="tab" aria-selected={status === k} onClick={() => { setStatus(k); setPage(1) }} className={status === k ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}>{label}</button>
          ))}
        </div>
        <div className="sm:flex-1 sm:max-w-sm">
          <label htmlFor="cari-paper" className="sr-only">Cari paper</label>
          <input id="cari-paper" type="search" className="field" placeholder="Cari judul paper" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
        </div>
        <div className="flex gap-2">
          <label htmlFor="f-jenis" className="sr-only">Jenis publikasi</label>
          <select id="f-jenis" className="field" value={fType} onChange={(e) => { setFType(e.target.value); setPage(1) }}>
            <option value="">Semua jenis</option>
            <option value="journal">Jurnal</option>
            <option value="conference">Konferensi</option>
            <option value="unspecified">Belum ditentukan</option>
          </select>
          <label htmlFor="f-bahasa" className="sr-only">Bahasa naskah</label>
          <select id="f-bahasa" className="field" value={fLang} onChange={(e) => { setFLang(e.target.value); setPage(1) }}>
            <option value="">Semua bahasa</option>
            <option value="indonesia">Indonesia</option>
            <option value="english">English</option>
          </select>
        </div>
      </div>

      {items === null && <ListSkeleton rows={3} />}
      {items && items.length === 0 && !error && (
        <EmptyState title={status === 'active' ? 'Belum ada paper aktif' : 'Belum ada paper yang diarsipkan'}>
          {status === 'active' ? 'Pilih Paper baru untuk memulai. Anda dapat menempel atau mengunggah naskah setelahnya.' : 'Paper yang Anda arsipkan dari Pengaturan akan muncul di sini.'}
        </EmptyState>
      )}
      {items && items.length > 0 && shown.length === 0 && <EmptyState title="Tidak ada hasil">Tidak ada paper yang cocok dengan pencarian atau filter.</EmptyState>}
      {shown.length > 0 && (
        <>
          <div className="card overflow-x-auto">
            <table className="table-base min-w-[520px]" data-testid="my-papers-table">
              <thead>
                <tr>
                  <th scope="col">Judul</th>
                  <th scope="col" className="hidden sm:table-cell">Jenis</th>
                  <th scope="col" className="hidden md:table-cell">Bahasa</th>
                  <th scope="col">Versi</th>
                  <th scope="col" className="hidden sm:table-cell">Diubah</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((p) => (
                  <tr key={p._id}>
                    <td>
                      <Link href={`/dashboard/projects/${p._id}`} className="block max-w-sm break-words font-medium text-ink underline-offset-2 hover:underline">{p.title}</Link>
                      <span className="mt-0.5 block text-xs text-ink-faint sm:hidden">{TYPE[p.publicationType]} / {LANG[p.language]}</span>
                    </td>
                    <td className="hidden sm:table-cell">{TYPE[p.publicationType]}</td>
                    <td className="hidden md:table-cell">{LANG[p.language]}</td>
                    <td>{p.versionCount}</td>
                    <td className="hidden whitespace-nowrap text-xs text-ink-faint sm:table-cell">{new Date(p.updatedAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} limit={PAGE} total={shown.length} onPage={setPage} />
        </>
      )}
    </div>
  )
}
