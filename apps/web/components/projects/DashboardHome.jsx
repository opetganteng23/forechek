'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { apiFetch } from '../../lib/clientApi'

const SOON = [
  { title: 'Asisten Penulisan', desc: 'Chat AI per naskah' },
  { title: 'Referensi Terverifikasi', desc: 'Cari dan validasi sitasi' },
  { title: 'Kesiapan Publikasi', desc: 'Pemeriksaan sesuai venue' }
]

export default function DashboardHome() {
  const [state, setState] = useState({ loading: true, projects: [], error: '' })

  useEffect(() => {
    let alive = true
    apiFetch('/api/projects')
      .then((d) => alive && setState({ loading: false, projects: d.projects, error: '' }))
      .catch((e) => alive && setState({ loading: false, projects: [], error: e.message }))
    return () => {
      alive = false
    }
  }, [])

  const recent = state.projects.slice(0, 5)
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Dashboard</h1>
      <p className="mt-2 text-sm text-ink-faint sm:text-base">Kelola proyek naskah publikasi Anda.</p>

      {state.error && (
        <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.error}
        </p>
      )}

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-base-border bg-base-soft p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Proyek aktif</p>
          <p className="mt-2 text-3xl font-bold text-ink">{state.loading ? '…' : state.projects.length}</p>
        </div>
        <Link
          href="/dashboard/projects"
          className="rounded-2xl border border-base-border bg-base p-5 shadow-sm transition-colors hover:bg-base-soft sm:col-span-2"
        >
          <span className="text-sm font-semibold text-ink">Proyek Saya →</span>
          <span className="mt-1.5 block text-sm text-ink-faint">Buat proyek baru, tempel atau unggah naskah, dan lihat riwayat versi.</span>
        </Link>
      </div>

      <h2 className="mt-10 text-lg font-semibold text-ink">Terakhir diubah</h2>
      {!state.loading && recent.length === 0 && !state.error && (
        <p className="mt-3 text-sm text-ink-faint">Belum ada proyek.</p>
      )}
      <ul className="mt-3 divide-y divide-base-border rounded-2xl border border-base-border bg-base">
        {recent.map((p) => (
          <li key={p._id}>
            <Link href={`/dashboard/projects/${p._id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-base-soft">
              <span className="font-medium text-ink">{p.title}</span>
              <span className="text-xs text-ink-faint">{new Date(p.updatedAt).toLocaleDateString('id-ID')}</span>
            </Link>
          </li>
        ))}
      </ul>

      <h2 className="mt-10 text-lg font-semibold text-ink">Segera hadir</h2>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {SOON.map((s) => (
          <div key={s.title} className="rounded-2xl border border-dashed border-base-border p-5 opacity-70">
            <span className="text-sm font-semibold text-ink">{s.title}</span>
            <span className="mt-1.5 block text-xs text-ink-faint">{s.desc}</span>
          </div>
        ))}
      </div>
    </main>
  )
}
