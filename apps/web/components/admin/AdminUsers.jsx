'use client'
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../lib/clientApi'
import { useConfirm } from '../providers/ConfirmProvider'
import { Alert, Field, inputClass } from '../auth/ui'
import { Card, EmptyState, ListSkeleton, PageHeader } from '../ui'

const PLAN = { free: 'Gratis/trial', pro: 'Pro', institutional: 'Institusi' }
const when = (iso) => {
  try { return new Date(iso).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' }) } catch { return '' }
}

// Kelola pengguna (khusus admin; server memeriksa peran dari database pada setiap permintaan). SETIAP tindakan meminta konfirmasi.
// Pengaman diri: baris akun sendiri menampilkan kontrol nonaktif ("ini akun Anda"); server juga menolak (SELF_ACTION).
// Ubah peran dan hapus pengguna wajib mengetik email target. Server menolak keadaan tanpa admin aktif (LAST_ADMIN).
export default function AdminUsers() {
  const confirm = useConfirm()
  const [data, setData] = useState(null)
  const [meId, setMeId] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [notice, setNotice] = useState({ kind: 'error', text: '' })
  const [busy, setBusy] = useState('')
  const [denied, setDenied] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'user' })
  const [pw, setPw] = useState({}) // password baru per pengguna

  useEffect(() => {
    apiFetch('/api/auth/me').then((d) => setMeId(d.id)).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    try {
      setData(await apiFetch(`/api/admin/users?q=${encodeURIComponent(q)}&page=${page}&limit=20`))
      setDenied(false)
    } catch (e) {
      if (e.code === 'FORBIDDEN') setDenied(true)
      else setNotice({ kind: 'error', text: e.message })
      setData({ users: [], total: 0, page: 1, limit: 20 })
    }
  }, [q, page])

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0)
    return () => clearTimeout(t)
  }, [load, q])

  async function act(key, ask, call, okText) {
    if (busy) return
    if (!(await confirm(ask))) return
    setBusy(key)
    setNotice({ kind: 'error', text: '' })
    try {
      await call()
      setNotice({ kind: 'success', text: okText })
      await load()
    } catch (e) {
      setNotice({ kind: 'error', text: e.message })
      await load()
    } finally {
      setBusy('')
    }
  }

  const patch = (u, body) => apiFetch(`/api/admin/users/${u.id}`, { method: 'PATCH', body })

  const toggleActive = (u) =>
    act(`act-${u.id}`, { title: u.isActive ? `Nonaktifkan ${u.email}?` : `Aktifkan ${u.email}?`, message: u.isActive ? 'Pengguna tidak dapat masuk dan sesinya dicabut.' : 'Pengguna dapat masuk kembali.', confirmText: u.isActive ? 'Ya, nonaktifkan' : 'Ya, aktifkan', tone: u.isActive ? 'danger' : 'default' }, () => patch(u, { isActive: !u.isActive }), u.isActive ? 'Pengguna dinonaktifkan.' : 'Pengguna diaktifkan.')
  const toggleRole = (u) => {
    const to = u.role === 'admin' ? 'user' : 'admin'
    return act(`role-${u.id}`, { title: to === 'admin' ? `Jadikan ${u.email} admin?` : `Jadikan ${u.email} pengguna biasa?`, message: to === 'admin' ? 'Admin dapat mengelola semua pengguna.' : 'Akses admin dicabut dan sesi pengguna ini dicabut.', confirmText: 'Ya, ubah peran', tone: 'danger', expectText: u.email, inputLabel: 'Ketik email pengguna ini untuk mengonfirmasi' }, () => patch(u, { role: to, confirmEmail: u.email }), 'Peran diubah.')
  }
  const setPlan = (u, plan) =>
    act(`plan-${u.id}`, { title: `Ubah paket ${u.email}?`, message: plan === 'free' ? 'Langganan dibatalkan; akun kembali ke trial.' : `Paket ${PLAN[plan]} aktif selama 30 hari.`, confirmText: 'Ya, ubah paket' }, () => patch(u, { plan, planDays: 30 }), 'Paket diubah.')
  const resetTrial = (u) =>
    act(`trial-${u.id}`, { title: `Reset jatah trial ${u.email}?`, message: 'Pengguna dapat membuat paper trial lagi.', confirmText: 'Ya, reset jatah' }, () => patch(u, { resetTrial: true }), 'Jatah trial direset.')
  const setPassword = (u) => {
    const v = pw[u.id] || ''
    if (v.length < 8) { setNotice({ kind: 'error', text: 'Password baru minimal 8 karakter.' }); return Promise.resolve() }
    return act(`pw-${u.id}`, { title: `Ganti password ${u.email}?`, message: 'Password diganti dan semua sesi pengguna dicabut.', confirmText: 'Ya, ganti password', tone: 'danger' }, async () => { await patch(u, { newPassword: v }); setPw((p) => ({ ...p, [u.id]: '' })) }, 'Password diganti.')
  }
  const remove = (u) =>
    act(`del-${u.id}`, { title: `Hapus akun ${u.email}?`, message: `Akun dan SEMUA datanya (${u.projects} paper, versi, chat, referensi, laporan) dihapus permanen dan tidak dapat dikembalikan.`, confirmText: 'Ya, hapus akun', tone: 'danger', expectText: u.email, inputLabel: 'Ketik email pengguna ini untuk mengonfirmasi' }, () => apiFetch(`/api/admin/users/${u.id}`, { method: 'DELETE', body: { confirmEmail: u.email } }), 'Akun dihapus.')

  function create(e) {
    e.preventDefault()
    return act('create', { title: 'Buat pengguna baru?', message: `Akun ${form.email} (${form.role === 'admin' ? 'admin' : 'pengguna'}) akan dibuat dan langsung terverifikasi.`, confirmText: 'Ya, buat akun' }, async () => {
      await apiFetch('/api/admin/users', { method: 'POST', body: form })
      setForm({ name: '', email: '', password: '', role: 'user' })
    }, 'Pengguna dibuat.')
  }

  if (denied) return <div className="mx-auto max-w-xl py-10"><Alert>Halaman ini khusus admin.</Alert></div>

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1
  return (
    <div>
      <PageHeader title="Kelola pengguna" description="Khusus admin. Setiap tindakan meminta konfirmasi dan dicatat di log server (tanpa isi naskah)." />

      <div className="mb-4"><Alert kind={notice.kind}>{notice.text}</Alert></div>

      <Card title="Buat pengguna">
        <form onSubmit={create} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Buat pengguna">
          <Field label="Nama" id="nu-name"><input id="nu-name" required className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Email" id="nu-email"><input id="nu-email" type="email" required className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Password" id="nu-pass"><input id="nu-pass" type="password" required minLength={8} autoComplete="new-password" className={inputClass} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          <Field label="Peran" id="nu-role">
            <select id="nu-role" className={inputClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="user">Pengguna</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
          <div className="flex items-end"><button disabled={!!busy} className="btn-primary w-full">Buat pengguna</button></div>
        </form>
      </Card>

      <div className="mb-4 mt-8 flex flex-wrap items-center gap-3">
        <label htmlFor="q" className="sr-only">Cari pengguna</label>
        <input id="q" type="search" className={`${inputClass} max-w-xs`} placeholder="Cari nama atau email" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
        <span className="text-sm text-ink-faint">{data ? `${data.total} pengguna` : 'Memuat...'}</span>
      </div>

      {!data && <ListSkeleton rows={3} />}
      {data && !data.users.length && <EmptyState title="Tidak ada pengguna">Tidak ada pengguna yang cocok dengan pencarian.</EmptyState>}
      <ul className="space-y-3">
        {(data ? data.users : []).map((u) => {
          const self = u.id === meId
          return (
            <li key={u.id} className="card p-4" data-testid={`user-row-${u.email}`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{u.name}</p>
                  <p className="break-all text-sm text-ink-soft">{u.email}</p>
                  <p className="mt-1 text-xs text-ink-faint">Sejak {when(u.createdAt)}{u.oauth ? `, ${u.oauth}` : ''}. {u.projects} paper, trial terpakai {u.trialPapersCreated}.</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className={u.role === 'admin' ? 'badge-warn' : 'badge'}>{u.role === 'admin' ? 'Admin' : 'Pengguna'}</span>
                    <span className={u.isActive ? 'badge-ok' : 'badge-bad'}>{u.isActive ? 'Aktif' : 'Nonaktif'}</span>
                    {!u.emailVerified && <span className="badge-warn">Email belum terverifikasi</span>}
                    {self && <span className="badge">Ini akun Anda</span>}
                  </div>
                </div>

                <div className="space-y-2 lg:w-[26rem]">
                  {self ? (
                    <p className="rounded-lg border border-base-border bg-base px-3 py-2 text-xs text-ink-faint" data-testid="self-note">
                      Ini akun Anda. Admin tidak dapat mengubah peran, status, paket, atau menghapus akunnya sendiri. Ganti password di halaman Akun.
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="sr-only" htmlFor={`plan-${u.id}`}>Paket {u.email}</label>
                    <select id={`plan-${u.id}`} className="field w-auto py-1.5 text-xs" value={u.plan === 'admin' ? 'free' : u.plan} onChange={(e) => setPlan(u, e.target.value)} disabled={!!busy || self}>
                      {Object.entries(PLAN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    {u.subscriptionEnd && u.plan !== 'free' && <span className="text-xs text-ink-faint">sampai {when(u.subscriptionEnd)}</span>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-secondary btn-sm" disabled={!!busy || self} onClick={() => toggleActive(u)}>{u.isActive ? 'Nonaktifkan' : 'Aktifkan'}</button>
                    <button className="btn-secondary btn-sm" disabled={!!busy || self} onClick={() => toggleRole(u)}>{u.role === 'admin' ? 'Jadikan pengguna' : 'Jadikan admin'}</button>
                    <button className="btn-secondary btn-sm" disabled={!!busy || self} onClick={() => resetTrial(u)}>Reset trial</button>
                    <button className="btn btn-sm border-red-200 bg-white text-red-700 hover:bg-red-50" disabled={!!busy || self} onClick={() => remove(u)}>Hapus</button>
                  </div>
                  <div className="flex gap-2">
                    <label className="sr-only" htmlFor={`pw-${u.id}`}>Password baru {u.email}</label>
                    <input id={`pw-${u.id}`} type="password" autoComplete="new-password" placeholder="Password baru" disabled={self} className="field w-44 py-1.5 text-xs" value={pw[u.id] || ''} onChange={(e) => setPw((p) => ({ ...p, [u.id]: e.target.value }))} />
                    <button className="btn-secondary btn-sm" disabled={!!busy || self} onClick={() => setPassword(u)}>Ganti password</button>
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      <div className="mt-4 flex items-center justify-between text-sm text-ink-soft">
        <button className="btn-secondary btn-sm" disabled={page <= 1 || !!busy} onClick={() => setPage((p) => p - 1)}>Sebelumnya</button>
        <span>Halaman {page} dari {pages}</span>
        <button className="btn-secondary btn-sm" disabled={page >= pages || !!busy} onClick={() => setPage((p) => p + 1)}>Berikutnya</button>
      </div>
    </div>
  )
}
