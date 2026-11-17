'use client'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../lib/clientApi'
import { Card, EmptyState, ErrorState, PageHeader, Skeleton } from '../ui'

const PLAN = { admin: 'Admin', free: 'Trial', pro: 'Pro', institutional: 'Institusi' }

export default function DashboardHome() {
  const [state, setState] = useState({ loading: true, projects: [], me: null, error: '' })

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: '' }))
    try {
      const [p, me] = await Promise.all([apiFetch('/api/projects'), apiFetch('/api/auth/me')])
      setState({ loading: false, projects: p.projects, me, error: '' })
    } catch (e) {
      setState({ loading: false, projects: [], me: null, error: e.message })
    }
  }, [])

  useEffect(() => { load() }, [load])

  const { projects, me, loading } = state
  const recent = projects.slice(0, 5)
  const latest = projects[0]
  const trial = me && me.trial
  const planLabel = trial ? PLAN[trial.plan] || trial.plan : ''
  const quotaText = !trial ? '' : trial.trial ? (trial.remaining > 0 ? `${trial.remaining} dari ${trial.limit} paper trial tersisa` : `Jatah ${trial.limit} paper trial sudah terpakai`) : trial.plan === 'admin' ? 'Tanpa batas jumlah paper' : 'Paper tidak dibatasi jumlahnya'

  let next
  if (loading) next = null
  else if (projects.length === 0) next = { text: 'Buat paper pertama Anda, lalu tempel atau unggah naskahnya.', href: '/dashboard/projects', label: 'Buat paper' }
  else if (latest.versionCount === 0) next = { text: `Paper "${latest.title}" belum punya naskah. Tambahkan naskah agar dapat diperiksa.`, href: `/dashboard/projects/${latest._id}`, label: 'Buka paper' }
  else next = { text: `Lanjutkan paper terakhir Anda: "${latest.title}". Periksa kesiapan atau perbarui referensi.`, href: `/dashboard/projects/${latest._id}`, label: 'Buka paper' }

  return (
    <div>
      <PageHeader title="Beranda" description={me ? `Selamat datang, ${me.name}.` : 'Ringkasan akun dan paper Anda.'} actions={<Link href="/dashboard/projects" className="btn-primary">Kelola paper</Link>} />

      {state.error && <ErrorState message={state.error} onRetry={load} />}

      {!state.error && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="card p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Paper aktif</p>
              {loading ? <Skeleton className="mt-3 h-8 w-16" /> : <p className="mt-2 text-3xl font-semibold text-ink">{projects.length}</p>}
            </div>
            <div className="card p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Paket</p>
              {loading ? <Skeleton className="mt-3 h-8 w-24" /> : <p className="mt-2 text-xl font-semibold text-ink">{planLabel || '-'}</p>}
              {!loading && <p className="mt-1 text-xs text-ink-faint">{quotaText}</p>}
            </div>
            <div className="card p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Aktivitas terakhir</p>
              {loading ? <Skeleton className="mt-3 h-8 w-32" /> : <p className="mt-2 text-xl font-semibold text-ink">{latest ? new Date(latest.updatedAt).toLocaleDateString('id-ID') : '-'}</p>}
              {!loading && <p className="mt-1 truncate text-xs text-ink-faint">{latest ? latest.title : 'Belum ada aktivitas'}</p>}
            </div>
          </div>

          <div className="mt-6">
            <Card title="Langkah berikutnya">
              {next ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-ink-soft">{next.text}</p>
                  <Link href={next.href} className="btn-primary flex-none">{next.label}</Link>
                </div>
              ) : (
                <Skeleton className="h-5 w-2/3" />
              )}
            </Card>
          </div>

          <div className="mt-6">
            <Card title="Paper terakhir diubah" actions={<Link href="/dashboard/projects" className="btn-ghost btn-sm">Lihat semua</Link>}>
              {loading && <Skeleton className="h-16 w-full" />}
              {!loading && recent.length === 0 && (
                <EmptyState title="Belum ada paper" action={<Link href="/dashboard/projects" className="btn-primary">Buat paper pertama</Link>}>
                  Paper adalah wadah untuk naskah, referensi, laporan kesiapan, dan versi Anda.
                </EmptyState>
              )}
              {!loading && recent.length > 0 && (
                <ul className="-my-2 divide-y divide-base-border">
                  {recent.map((p) => (
                    <li key={p._id}>
                      <Link href={`/dashboard/projects/${p._id}`} className="flex items-center justify-between gap-3 py-3 text-sm hover:text-ink">
                        <span className="truncate font-medium text-ink">{p.title}</span>
                        <span className="flex-none text-xs text-ink-faint">{new Date(p.updatedAt).toLocaleDateString('id-ID')}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
