'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '../../lib/clientApi'
import { useConfirm } from '../providers/ConfirmProvider'
import { Alert, Field, inputClass } from '../auth/ui'
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from '../ui'
import Pager from '../ui/Pager'

const PLAN = { free: 'Trial', pro: 'Pro', institutional: 'Institusi' }
const ROLE = { user: 'Pengguna', admin: 'Admin', superadmin: 'Superadmin' }
const when = (iso) => {
  try { return new Date(iso).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' }) } catch { return '' }
}
const isAdminRole = (r) => r === 'admin' || r === 'superadmin'
const LIMIT = 15

// Kelola pengguna (CRUD): daftar bertabel dengan pencarian dan filter, tambah, ubah (nama, email, peran, paket, reset trial, password), hapus.
// Admin biasa hanya mengelola pengguna biasa; SUPERADMIN juga mengelola akun admin. SETIAP tindakan meminta konfirmasi.
// Pengaman diri: baris akun sendiri nonaktif ("Ini akun Anda"); server juga menolak (SELF_ACTION). Ubah peran dan hapus wajib mengetik email target.
export default function AdminUsers() {
  const confirm = useConfirm()
  const [data, setData] = useState(null)
  const [me, setMe] = useState({ id: '', role: '' })
  const [q, setQ] = useState('')
  const [fRole, setFRole] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fPlan, setFPlan] = useState('')
  const [page, setPage] = useState(1)
  const [notice, setNotice] = useState({ kind: 'error', text: '' })
  const [busy, setBusy] = useState('')
  const [denied, setDenied] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'user' })
  const [edit, setEdit] = useState(null)

  const isSuper = me.role === 'superadmin'

  useEffect(() => {
    apiFetch('/api/auth/me').then((d) => setMe({ id: d.id, role: d.role })).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoadError('')
    try {
      const p = new URLSearchParams({ q, page: String(page), limit: String(LIMIT), role: fRole, status: fStatus, plan: fPlan })
      setData(await apiFetch(`/api/admin/users?${p}`))
      setDenied(false)
    } catch (e) {
      if (e.code === 'FORBIDDEN') setDenied(true)
      else setLoadError(e.message)
      setData({ users: [], total: 0, page: 1, limit: LIMIT })
    }
  }, [q, page, fRole, fStatus, fPlan])

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0)
    return () => clearTimeout(t)
  }, [load, q])

  async function act(key, ask, call, okText) {
    if (busy) return false
    if (!(await confirm(ask))) return false
    setBusy(key)
    setNotice({ kind: 'error', text: '' })
    try {
      await call()
      setNotice({ kind: 'success', text: okText })
      await load()
      return true
    } catch (e) {
      setNotice({ kind: 'error', text: e.message })
      await load()
      return false
    } finally {
      setBusy('')
    }
  }

  const patch = (u, body) => apiFetch(`/api/admin/users/${u.id}`, { method: 'PATCH', body })
  const locked = (u) => u.id === me.id || (isAdminRole(u.role) && !isSuper) // akun sendiri, atau akun admin bagi admin biasa

  const toggleActive = (u) =>
    act(`act-${u.id}`, { title: u.isActive ? `Nonaktifkan ${u.email}?` : `Aktifkan ${u.email}?`, message: u.isActive ? 'Pengguna tidak dapat masuk dan sesinya dicabut.' : 'Pengguna dapat masuk kembali.', confirmText: u.isActive ? 'Ya, nonaktifkan' : 'Ya, aktifkan', tone: u.isActive ? 'danger' : 'default' }, () => patch(u, { isActive: !u.isActive }), u.isActive ? 'Pengguna dinonaktifkan.' : 'Pengguna diaktifkan.')
  const remove = (u) =>
    act(`del-${u.id}`, { title: `Hapus akun ${u.email}?`, message: `Akun dan SEMUA datanya (${u.projects} paper, versi, chat, referensi, laporan) dihapus permanen dan tidak dapat dikembalikan.`, confirmText: 'Ya, hapus akun', tone: 'danger', expectText: u.email, inputLabel: 'Ketik email pengguna ini untuk mengonfirmasi' }, () => apiFetch(`/api/admin/users/${u.id}`, { method: 'DELETE', body: { confirmEmail: u.email } }), 'Akun dihapus.')

  function create(e) {
    e.preventDefault()
    return act('create', { title: 'Buat pengguna baru?', message: `Akun ${form.email} (${ROLE[form.role]}) akan dibuat dan langsung terverifikasi.`, confirmText: 'Ya, buat akun' }, async () => {
      await apiFetch('/api/admin/users', { method: 'POST', body: form })
      setForm({ name: '', email: '', password: '', role: 'user' })
      setShowCreate(false)
    }, 'Pengguna dibuat.')
  }

  const resetFilters = () => { setQ(''); setFRole(''); setFStatus(''); setFPlan(''); setPage(1) }
  const filtered = Boolean(q || fRole || fStatus || fPlan)

  if (denied) return <div className="mx-auto max-w-xl py-10"><Alert>Halaman ini khusus admin.</Alert></div>

  return (
    <div>
      <PageHeader
        title="Kelola pengguna"
        description={isSuper ? 'Superadmin: kelola semua akun, termasuk admin. Setiap tindakan meminta konfirmasi dan dicatat di log server.' : 'Kelola akun pengguna. Akun admin hanya dapat dikelola superadmin. Setiap tindakan meminta konfirmasi.'}
        actions={<button type="button" className="btn-primary" onClick={() => setShowCreate((v) => !v)} aria-expanded={showCreate} data-testid="toggle-create">{showCreate ? 'Tutup formulir' : 'Tambah pengguna'}</button>}
      />

      <div className="mb-4"><Alert kind={notice.kind}>{notice.text}</Alert></div>

      {showCreate && (
        <form onSubmit={create} className="card mb-6 grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-5" aria-label="Tambah pengguna">
          <Field label="Nama" id="nu-name"><input id="nu-name" required className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Email" id="nu-email"><input id="nu-email" type="email" required className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Password" id="nu-pass"><input id="nu-pass" type="password" required minLength={8} autoComplete="new-password" className={inputClass} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          <Field label="Peran" id="nu-role">
            <select id="nu-role" className={inputClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="user">Pengguna</option>
              {isSuper && <option value="admin">Admin</option>}
              {isSuper && <option value="superadmin">Superadmin</option>}
            </select>
          </Field>
          <div className="flex items-end"><button disabled={!!busy} className="btn-primary w-full">Buat pengguna</button></div>
        </form>
      )}

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <label htmlFor="q" className="mb-1 block text-xs font-medium text-ink-faint">Cari</label>
          <input id="q" type="search" className="field" placeholder="Nama atau email" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
        </div>
        <div>
          <label htmlFor="f-role" className="mb-1 block text-xs font-medium text-ink-faint">Peran</label>
          <select id="f-role" className="field" value={fRole} onChange={(e) => { setFRole(e.target.value); setPage(1) }}>
            <option value="">Semua peran</option>
            <option value="user">Pengguna</option>
            <option value="admin">Admin dan superadmin</option>
          </select>
        </div>
        <div>
          <label htmlFor="f-status" className="mb-1 block text-xs font-medium text-ink-faint">Status</label>
          <select id="f-status" className="field" value={fStatus} onChange={(e) => { setFStatus(e.target.value); setPage(1) }}>
            <option value="">Semua status</option>
            <option value="active">Aktif</option>
            <option value="inactive">Nonaktif</option>
          </select>
        </div>
        <div>
          <label htmlFor="f-plan" className="mb-1 block text-xs font-medium text-ink-faint">Paket</label>
          <select id="f-plan" className="field" value={fPlan} onChange={(e) => { setFPlan(e.target.value); setPage(1) }}>
            <option value="">Semua paket</option>
            <option value="free">Trial</option>
            <option value="pro">Pro</option>
            <option value="institutional">Institusi</option>
          </select>
        </div>
      </div>
      {filtered && <div className="mb-3"><button type="button" className="btn-ghost btn-sm" onClick={resetFilters}>Atur ulang filter</button></div>}

      {loadError && <ErrorState message={loadError} onRetry={load} />}
      {!data && !loadError && <ListSkeleton rows={4} />}
      {data && !loadError && data.users.length === 0 && <EmptyState title="Tidak ada pengguna">{filtered ? 'Tidak ada pengguna yang cocok dengan pencarian atau filter.' : 'Belum ada pengguna.'}</EmptyState>}

      {data && data.users.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="table-base min-w-[640px]" data-testid="users-table">
            <thead>
              <tr>
                <th scope="col">Pengguna</th>
                <th scope="col" className="hidden md:table-cell">Peran</th>
                <th scope="col" className="hidden md:table-cell">Status</th>
                <th scope="col" className="hidden lg:table-cell">Paket</th>
                <th scope="col" className="hidden lg:table-cell">Paper</th>
                <th scope="col" className="hidden xl:table-cell">Terdaftar</th>
                <th scope="col" className="text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => {
                const self = u.id === me.id
                const lock = locked(u)
                return (
                  <tr key={u.id} data-testid={`user-row-${u.email}`}>
                    <td className="min-w-[13rem]">
                      <div className="font-medium text-ink">{u.name}{self && <span className="badge ml-2">Ini akun Anda</span>}</div>
                      <div className="break-all text-xs text-ink-faint">{u.email}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5 md:hidden">
                        <span className={isAdminRole(u.role) ? 'badge-warn' : 'badge'}>{ROLE[u.role] || u.role}</span>
                        <span className={u.isActive ? 'badge-ok' : 'badge-bad'}>{u.isActive ? 'Aktif' : 'Nonaktif'}</span>
                      </div>
                    </td>
                    <td className="hidden md:table-cell"><span className={isAdminRole(u.role) ? 'badge-warn' : 'badge'}>{ROLE[u.role] || u.role}</span></td>
                    <td className="hidden md:table-cell">
                      <span className={u.isActive ? 'badge-ok' : 'badge-bad'}>{u.isActive ? 'Aktif' : 'Nonaktif'}</span>
                      {!u.emailVerified && <div className="mt-1 text-xs text-amber-800">Email belum terverifikasi</div>}
                    </td>
                    <td className="hidden lg:table-cell">
                      {PLAN[u.plan] || u.plan}
                      {u.subscriptionEnd && u.plan !== 'free' && <div className="text-xs text-ink-faint">sampai {when(u.subscriptionEnd)}</div>}
                    </td>
                    <td className="hidden lg:table-cell">{u.projects}</td>
                    <td className="hidden whitespace-nowrap text-xs text-ink-faint xl:table-cell">{when(u.createdAt)}</td>
                    <td>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <button className="btn-secondary btn-sm" disabled={!!busy || lock} title={self ? 'Ini akun Anda' : lock ? 'Hanya superadmin yang dapat mengelola akun admin' : undefined} onClick={() => setEdit(u)}>Ubah</button>
                        <button className="btn-secondary btn-sm" disabled={!!busy || lock} onClick={() => toggleActive(u)}>{u.isActive ? 'Nonaktifkan' : 'Aktifkan'}</button>
                        <button className="btn btn-sm border-red-200 bg-white text-red-700 hover:bg-red-50" disabled={!!busy || lock} onClick={() => remove(u)}>Hapus</button>
                      </div>
                      {self && <p className="mt-1 text-right text-xs text-ink-faint" data-testid="self-note">Ini akun Anda. Ganti password di halaman Akun.</p>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {data && <Pager page={page} limit={LIMIT} total={data.total} onPage={setPage} busy={!!busy} />}

      {edit && <EditUserModal user={edit} isSuper={isSuper} confirm={confirm} onClose={() => setEdit(null)} onDone={async (msg) => { setNotice({ kind: 'success', text: msg }); await load() }} />}
    </div>
  )
}

// Formulir ubah pengguna (modal). Perubahan nama/email/paket disimpan sekali; peran, reset trial, dan password memakai konfirmasi sendiri.
function EditUserModal({ user, isSuper, confirm, onClose, onDone }) {
  const [f, setF] = useState({ name: user.name, email: user.email, plan: user.plan === 'admin' ? 'free' : user.plan, planDays: 30, role: user.role, password: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const first = useRef(null)
  useEffect(() => {
    first.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('[role=alertdialog]')) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const patch = (body) => apiFetch(`/api/admin/users/${user.id}`, { method: 'PATCH', body })
  const run = async (fn, msg) => {
    setBusy(true)
    setErr('')
    try {
      await fn()
      await onDone(msg)
      return true
    } catch (e) {
      setErr(e.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function save(e) {
    e.preventDefault()
    const body = {}
    if (f.name.trim() !== user.name) body.name = f.name.trim()
    if (f.email.trim().toLowerCase() !== user.email) body.email = f.email.trim()
    const planChanged = f.plan !== (user.plan === 'admin' ? 'free' : user.plan)
    if (planChanged) { body.plan = f.plan; body.planDays = Number(f.planDays) || 30 }
    if (!Object.keys(body).length) return setErr('Tidak ada perubahan untuk disimpan.')
    const emailNote = body.email ? ' Mengubah email mencabut sesi pengguna ini.' : ''
    if (!(await confirm({ title: `Simpan perubahan ${user.email}?`, message: `Perubahan: ${Object.keys(body).filter((k) => k !== 'planDays').join(', ')}.${emailNote}`, confirmText: 'Ya, simpan' }))) return
    if (await run(() => patch(body), 'Perubahan disimpan.')) onClose()
  }

  async function changeRole() {
    if (f.role === user.role) return setErr('Peran belum diubah.')
    const ok = await confirm({ title: `Ubah peran ${user.email} menjadi ${ROLE[f.role]}?`, message: 'Sesi pengguna ini dicabut dan hak aksesnya berubah.', confirmText: 'Ya, ubah peran', tone: 'danger', expectText: user.email, inputLabel: 'Ketik email pengguna ini untuk mengonfirmasi' })
    if (ok && (await run(() => patch({ role: f.role, confirmEmail: user.email }), 'Peran diubah.'))) onClose()
  }

  async function resetTrial() {
    if (!(await confirm({ title: `Reset jatah trial ${user.email}?`, message: 'Pengguna dapat membuat paper trial lagi.', confirmText: 'Ya, reset jatah' }))) return
    if (await run(() => patch({ resetTrial: true }), 'Jatah trial direset.')) onClose()
  }

  async function setPassword() {
    if (f.password.length < 8) return setErr('Password baru minimal 8 karakter.')
    if (!(await confirm({ title: `Ganti password ${user.email}?`, message: 'Password diganti dan semua sesi pengguna dicabut.', confirmText: 'Ya, ganti password', tone: 'danger' }))) return
    if (await run(() => patch({ newPassword: f.password }), 'Password diganti.')) onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center" data-testid="edit-modal">
      <div className="fc-fade fixed inset-0 bg-slate-900/40" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-labelledby="edit-title" className="fc-pop relative my-6 w-full max-w-lg rounded-xl border border-base-border bg-white p-6 shadow-pop">
        <h2 id="edit-title" className="text-lg font-semibold text-ink">Ubah pengguna</h2>
        <p className="mt-1 break-all text-sm text-ink-faint">{user.email}</p>
        <div className="mt-4"><Alert>{err}</Alert></div>

        <form onSubmit={save} className="mt-4 space-y-4">
          <Field label="Nama" id="ed-name"><input id="ed-name" ref={first} required className={inputClass} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Email" id="ed-email"><input id="ed-email" type="email" required className={inputClass} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Paket" id="ed-plan">
              <select id="ed-plan" className={inputClass} value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })}>
                {Object.entries(PLAN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Lama langganan (hari)" id="ed-days" hint="Berlaku untuk paket berbayar.">
              <input id="ed-days" type="number" min={1} max={3650} disabled={f.plan === 'free'} className={inputClass} value={f.planDays} onChange={(e) => setF({ ...f, planDays: e.target.value })} />
            </Field>
          </div>
          <button type="submit" disabled={busy} className="btn-primary">Simpan perubahan</button>
        </form>

        <div className="mt-6 space-y-5 border-t border-base-border pt-5">
          {isSuper && (
            <div>
              <Field label="Peran" id="ed-role">
                <select id="ed-role" className={inputClass} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
                  <option value="user">Pengguna</option>
                  <option value="admin">Admin</option>
                  <option value="superadmin">Superadmin</option>
                </select>
              </Field>
              <button type="button" disabled={busy || f.role === user.role} className="btn-secondary mt-2" onClick={changeRole}>Terapkan peran</button>
            </div>
          )}
          <div>
            <Field label="Password baru" id="ed-pass" hint="Minimal 8 karakter. Semua sesi pengguna dicabut.">
              <input id="ed-pass" type="password" autoComplete="new-password" className={inputClass} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
            </Field>
            <button type="button" disabled={busy || !f.password} className="btn-secondary mt-2" onClick={setPassword}>Ganti password</button>
          </div>
          <div>
            <p className="text-sm text-ink-soft">Jatah trial terpakai: {user.trialPapersCreated}.</p>
            <button type="button" disabled={busy} className="btn-secondary mt-2" onClick={resetTrial}>Reset jatah trial</button>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button type="button" className="btn-secondary" onClick={onClose}>Tutup</button>
        </div>
      </div>
    </div>
  )
}
