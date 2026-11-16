'use client'
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../lib/clientApi'
import { useConfirm } from '../providers/ConfirmProvider'
import { Alert, Field, inputClass } from '../auth/ui'

const PLAN = { free: 'Gratis/trial', pro: 'Pro', institutional: 'Institusi' }
const when = (iso) => {
  try { return new Date(iso).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' }) } catch { return '' }
}

// Kelola pengguna (khusus admin; server memeriksa peran dari database pada setiap permintaan). SETIAP tindakan meminta konfirmasi lebih dulu.
export default function AdminUsers() {
  const confirm = useConfirm()
  const [data, setData] = useState(null)
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [notice, setNotice] = useState({ kind: 'error', text: '' })
  const [busy, setBusy] = useState('')
  const [denied, setDenied] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'user' })
  const [pw, setPw] = useState({}) // kata sandi baru per pengguna

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
    } finally {
      setBusy('')
    }
  }

  const patch = (u, body) => apiFetch(`/api/admin/users/${u.id}`, { method: 'PATCH', body })

  const toggleActive = (u) =>
    act(`act-${u.id}`, { title: u.isActive ? `Nonaktifkan ${u.email}?` : `Aktifkan ${u.email}?`, message: u.isActive ? 'Pengguna tidak dapat masuk dan sesinya dicabut.' : 'Pengguna dapat masuk kembali.', confirmText: u.isActive ? 'Ya, nonaktifkan' : 'Ya, aktifkan', tone: u.isActive ? 'danger' : 'default' }, () => patch(u, { isActive: !u.isActive }), u.isActive ? 'Pengguna dinonaktifkan.' : 'Pengguna diaktifkan.')
  const toggleRole = (u) =>
    act(`role-${u.id}`, { title: u.role === 'admin' ? `Jadikan ${u.email} pengguna biasa?` : `Jadikan ${u.email} admin?`, message: u.role === 'admin' ? 'Akses admin dicabut dan sesinya dicabut.' : 'Admin dapat mengelola semua pengguna.', confirmText: 'Ya, ubah peran', tone: 'danger' }, () => patch(u, { role: u.role === 'admin' ? 'user' : 'admin' }), 'Peran diubah.')
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
    act(`del-${u.id}`, { title: `Hapus akun ${u.email}?`, message: `Akun dan SEMUA datanya (${u.projects} proyek, versi, chat, referensi, laporan) dihapus permanen dan tidak dapat dikembalikan.`, confirmText: 'Ya, hapus akun', tone: 'danger' }, () => apiFetch(`/api/admin/users/${u.id}`, { method: 'DELETE', body: { confirmEmail: u.email } }), 'Akun dihapus.')

  function create(e) {
    e.preventDefault()
    return act('create', { title: 'Buat pengguna baru?', message: `Akun ${form.email} (${form.role === 'admin' ? 'admin' : 'pengguna'}) akan dibuat dan langsung terverifikasi.`, confirmText: 'Ya, buat akun' }, async () => {
      await apiFetch('/api/admin/users', { method: 'POST', body: form })
      setForm({ name: '', email: '', password: '', role: 'user' })
    }, 'Pengguna dibuat.')
  }

  if (denied) return <main className="mx-auto max-w-xl px-4 py-16 text-center"><Alert>Halaman ini khusus admin.</Alert></main>

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1
  const btn = 'rounded-full border border-base-border px-3 py-1 text-xs font-medium text-ink-soft transition hover:bg-sky-50 hover:text-sky-800 disabled:opacity-50'
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink">Kelola pengguna</h1>
      <p className="mt-1 text-sm text-ink-faint">Khusus admin. Setiap tindakan meminta konfirmasi dan dicatat di log server (tanpa isi naskah).</p>

      <div className="mt-4"><Alert kind={notice.kind}>{notice.text}</Alert></div>

      <form onSubmit={create} className="mt-6 grid gap-3 rounded-2xl border border-base-border bg-white p-5 shadow-sm sm:grid-cols-5" aria-label="Buat pengguna">
        <Field label="Nama" id="nu-name"><input id="nu-name" required className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Email" id="nu-email"><input id="nu-email" type="email" required className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Password" id="nu-pass"><input id="nu-pass" type="password" required minLength={8} autoComplete="new-password" className={inputClass} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        <Field label="Peran" id="nu-role">
          <select id="nu-role" className={inputClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="user">Pengguna</option>
            <option value="admin">Admin</option>
          </select>
        </Field>
        <div className="flex items-end"><button disabled={!!busy} className="w-full rounded-full bg-sky-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-60">Buat pengguna</button></div>
      </form>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <label htmlFor="q" className="sr-only">Cari pengguna</label>
        <input id="q" className={`${inputClass} max-w-xs`} placeholder="Cari nama atau email" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
        <span className="text-sm text-ink-faint">{data ? `${data.total} pengguna` : 'Memuat...'}</span>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-base-border bg-white shadow-sm">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-sky-50/70 text-xs uppercase tracking-wide text-ink-faint">
            <tr><th className="px-4 py-3">Pengguna</th><th className="px-4 py-3">Peran</th><th className="px-4 py-3">Paket</th><th className="px-4 py-3">Proyek / trial</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Tindakan</th></tr>
          </thead>
          <tbody>
            {(data ? data.users : []).map((u) => (
              <tr key={u.id} className="border-t border-base-border align-top transition-colors hover:bg-sky-50/40" data-testid={`user-row-${u.email}`}>
                <td className="px-4 py-3"><div className="font-medium text-ink">{u.name}</div><div className="text-xs text-ink-faint break-all">{u.email}</div><div className="text-xs text-ink-faint">sejak {when(u.createdAt)}{u.oauth ? ` · ${u.oauth}` : ''}</div></td>
                <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${u.role === 'admin' ? 'bg-indigo-100 text-indigo-800' : 'bg-base-muted text-ink-soft'}`}>{u.role === 'admin' ? 'Admin' : 'Pengguna'}</span></td>
                <td className="px-4 py-3">
                  <select aria-label={`Paket ${u.email}`} className="rounded-lg border border-base-border bg-white px-2 py-1 text-xs" value={u.plan === 'admin' ? 'free' : u.plan} onChange={(e) => setPlan(u, e.target.value)} disabled={!!busy}>
                    {Object.entries(PLAN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  {u.subscriptionEnd && u.plan !== 'free' && <div className="mt-1 text-xs text-ink-faint">sampai {when(u.subscriptionEnd)}</div>}
                </td>
                <td className="px-4 py-3 text-xs text-ink-soft">{u.projects} proyek<br />trial terpakai {u.trialPapersCreated}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${u.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{u.isActive ? 'Aktif' : 'Nonaktif'}</span>{!u.emailVerified && <div className="mt-1 text-xs text-amber-700">email belum terverifikasi</div>}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    <button className={btn} disabled={!!busy} onClick={() => toggleActive(u)}>{u.isActive ? 'Nonaktifkan' : 'Aktifkan'}</button>
                    <button className={btn} disabled={!!busy} onClick={() => toggleRole(u)}>{u.role === 'admin' ? 'Jadikan pengguna' : 'Jadikan admin'}</button>
                    <button className={btn} disabled={!!busy} onClick={() => resetTrial(u)}>Reset trial</button>
                    <button className={`${btn} border-red-200 text-red-700 hover:bg-red-50`} disabled={!!busy} onClick={() => remove(u)}>Hapus</button>
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    <input type="password" aria-label={`Password baru ${u.email}`} autoComplete="new-password" placeholder="Password baru" className="w-32 rounded-lg border border-base-border px-2 py-1 text-xs" value={pw[u.id] || ''} onChange={(e) => setPw((p) => ({ ...p, [u.id]: e.target.value }))} />
                    <button className={btn} disabled={!!busy} onClick={() => setPassword(u)}>Ganti</button>
                  </div>
                </td>
              </tr>
            ))}
            {data && !data.users.length && <tr><td colSpan="6" className="px-4 py-8 text-center text-ink-faint">Tidak ada pengguna.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-ink-soft">
        <button className={btn} disabled={page <= 1 || !!busy} onClick={() => setPage((p) => p - 1)}>&larr; Sebelumnya</button>
        <span>Halaman {page} dari {pages}</span>
        <button className={btn} disabled={page >= pages || !!busy} onClick={() => setPage((p) => p + 1)}>Berikutnya &rarr;</button>
      </div>
    </main>
  )
}
