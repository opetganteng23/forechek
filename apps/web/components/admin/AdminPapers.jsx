'use client'
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../lib/clientApi'
import { Alert } from '../auth/ui'
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from '../ui'
import Pager from '../ui/Pager'

const LANG = { indonesia: 'Indonesia', english: 'English' }
const TYPE = { conference: 'Konferensi', journal: 'Jurnal', unspecified: 'Belum ditentukan' }
const STATUS = { active: ['Aktif', 'badge-ok'], archived: ['Diarsipkan', 'badge-warn'], deletion_pending: ['Menunggu hapus', 'badge-bad'] }
const LIMIT = 15
const fmt = (iso) => {
  try { return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) } catch { return '' }
}

// Pemantauan paper semua pengguna (khusus admin). Hanya METADATA (judul, pemilik, jenis, bahasa, venue, versi, status, waktu);
// isi naskah tidak ditampilkan. Pencarian dan filter ditegakkan server.
export default function AdminPapers() {
  const [data, setData] = useState(null)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [type, setType] = useState('')
  const [language, setLanguage] = useState('')
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const [denied, setDenied] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      const p = new URLSearchParams({ q, page: String(page), limit: String(LIMIT), status, type, language })
      setData(await apiFetch(`/api/admin/projects?${p}`))
    } catch (e) {
      if (e.code === 'FORBIDDEN') setDenied(true)
      else setError(e.message)
      setData({ projects: [], total: 0, page: 1, limit: LIMIT })
    }
  }, [q, page, status, type, language])

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0)
    return () => clearTimeout(t)
  }, [load, q])

  const filtered = Boolean(q || status || type || language)
  const reset = () => { setQ(''); setStatus(''); setType(''); setLanguage(''); setPage(1) }
  if (denied) return <div className="mx-auto max-w-xl py-10"><Alert>Halaman ini khusus admin.</Alert></div>

  return (
    <div>
      <PageHeader title="Paper pengguna" description="Pantau paper yang dibuat semua pengguna. Hanya metadata yang ditampilkan; isi naskah tetap privat bagi pemiliknya." />

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <label htmlFor="pq" className="mb-1 block text-xs font-medium text-ink-faint">Cari</label>
          <input id="pq" type="search" className="field" placeholder="Judul paper, nama, atau email pemilik" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
        </div>
        <div>
          <label htmlFor="p-status" className="mb-1 block text-xs font-medium text-ink-faint">Status</label>
          <select id="p-status" className="field" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
            <option value="">Semua status</option>
            <option value="active">Aktif</option>
            <option value="archived">Diarsipkan</option>
            <option value="deletion_pending">Menunggu hapus</option>
          </select>
        </div>
        <div>
          <label htmlFor="p-type" className="mb-1 block text-xs font-medium text-ink-faint">Jenis publikasi</label>
          <select id="p-type" className="field" value={type} onChange={(e) => { setType(e.target.value); setPage(1) }}>
            <option value="">Semua jenis</option>
            <option value="journal">Jurnal</option>
            <option value="conference">Konferensi</option>
            <option value="unspecified">Belum ditentukan</option>
          </select>
        </div>
        <div>
          <label htmlFor="p-lang" className="mb-1 block text-xs font-medium text-ink-faint">Bahasa</label>
          <select id="p-lang" className="field" value={language} onChange={(e) => { setLanguage(e.target.value); setPage(1) }}>
            <option value="">Semua bahasa</option>
            <option value="indonesia">Indonesia</option>
            <option value="english">English</option>
          </select>
        </div>
      </div>
      {filtered && <div className="mb-3"><button type="button" className="btn-ghost btn-sm" onClick={reset}>Atur ulang filter</button></div>}

      {error && <ErrorState message={error} onRetry={load} />}
      {!data && !error && <ListSkeleton rows={4} />}
      {data && !error && data.projects.length === 0 && <EmptyState title="Tidak ada paper">{filtered ? 'Tidak ada paper yang cocok dengan pencarian atau filter.' : 'Belum ada paper yang dibuat pengguna.'}</EmptyState>}

      {data && data.projects.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="table-base min-w-[640px]" data-testid="papers-table">
            <thead>
              <tr>
                <th scope="col">Paper</th>
                <th scope="col" className="hidden md:table-cell">Pemilik</th>
                <th scope="col" className="hidden lg:table-cell">Jenis</th>
                <th scope="col" className="hidden lg:table-cell">Bahasa</th>
                <th scope="col" className="hidden xl:table-cell">Venue</th>
                <th scope="col">Versi</th>
                <th scope="col">Status</th>
                <th scope="col" className="hidden md:table-cell">Diubah</th>
              </tr>
            </thead>
            <tbody>
              {data.projects.map((p) => {
                const [label, cls] = STATUS[p.status] || [p.status, 'badge']
                return (
                  <tr key={p.id} data-testid={`paper-row-${p.id}`}>
                    <td>
                      <div className="max-w-xs break-words font-medium text-ink">{p.title}</div>
                      <div className="mt-0.5 break-all text-xs text-ink-faint md:hidden">{p.owner ? p.owner.email : '-'}</div>
                    </td>
                    <td className="hidden min-w-[14rem] md:table-cell">
                      {p.owner ? (
                        <>
                          <div className="text-ink">{p.owner.name}</div>
                          <button type="button" className="break-all text-left text-xs text-ink-faint underline" title="Lihat semua paper pemilik ini" onClick={() => { setQ(p.owner.email); setPage(1) }}>{p.owner.email}</button>
                        </>
                      ) : (
                        <span className="text-ink-faint">Akun dihapus</span>
                      )}
                    </td>
                    <td className="hidden lg:table-cell">{TYPE[p.publicationType]}</td>
                    <td className="hidden lg:table-cell">{LANG[p.language]}</td>
                    <td className="hidden text-xs xl:table-cell">{p.venueSlug || '-'}</td>
                    <td>{p.versionCount}</td>
                    <td><span className={cls}>{label}</span></td>
                    <td className="hidden whitespace-nowrap text-xs text-ink-faint md:table-cell">{fmt(p.updatedAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {data && <Pager page={page} limit={LIMIT} total={data.total} onPage={setPage} />}
    </div>
  )
}
