'use client'
import { useCallback, useEffect, useState } from 'react'
import { signIn, signOut } from 'next-auth/react'
import { apiFetch } from '../../lib/clientApi'
import { Alert, Field, inputClass } from '../auth/ui'
import { useConfirm } from '../providers/ConfirmProvider'
import { Card, ErrorState, PageHeader, Skeleton } from '../ui'

const PLAN = { admin: 'Admin', free: 'Trial', pro: 'Pro', institutional: 'Institusi' }

// Akun: profil, ganti password (butuh password lama), dan hapus akun (tidak dapat dibatalkan; MTS 14, QA-09).
// Akun Google-only: harus masuk Google ulang (maks. 5 menit) sebelum penghapusan; tombol verifikasi ulang muncul bila server meminta (REAUTH_REQUIRED).
export default function AccountPanel() {
  const confirm = useConfirm()
  const [me, setMe] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [form, setForm] = useState({ confirmEmail: '', confirmText: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [needReauth, setNeedReauth] = useState(false)
  const [pw, setPw] = useState({ current: '', next: '', again: '' })
  const [pwMsg, setPwMsg] = useState({ kind: 'error', text: '' })
  const [pwBusy, setPwBusy] = useState(false)

  const load = useCallback(() => {
    setLoadError('')
    apiFetch('/api/auth/me').then(setMe).catch((e) => setLoadError(e.message))
  }, [])
  useEffect(() => { load() }, [load])

  async function changePassword(e) {
    e.preventDefault()
    setPwMsg({ kind: 'error', text: '' })
    if (pw.next !== pw.again) return setPwMsg({ kind: 'error', text: 'Konfirmasi password baru tidak sama.' })
    if (!(await confirm({ title: 'Ganti password?', message: 'Semua sesi Anda akan berakhir dan Anda perlu masuk kembali dengan password baru.', confirmText: 'Ya, ganti password' }))) return
    setPwBusy(true)
    try {
      await apiFetch('/api/account/password', { method: 'PATCH', body: { currentPassword: pw.current, newPassword: pw.next } })
      await signOut({ redirect: false })
      window.location.assign('/login?reason=password')
    } catch (err) {
      setPwMsg({ kind: 'error', text: err.message })
      setPwBusy(false)
    }
  }

  async function remove(e) {
    e.preventDefault()
    if (!(await confirm({ title: 'Hapus akun permanen?', message: 'Seluruh paper, versi naskah, chat, referensi, laporan, dan usulan Anda akan dihapus dan tidak dapat dikembalikan.', confirmText: 'Ya, hapus akun saya', tone: 'danger' }))) return
    setBusy(true)
    setError('')
    try {
      await apiFetch('/api/account', { method: 'DELETE', body: { confirmEmail: form.confirmEmail, confirmText: form.confirmText, ...(me.hasPassword ? { password: form.password } : {}) } })
      await signOut({ callbackUrl: '/' })
    } catch (err) {
      if (err.details?.code === 'REAUTH_REQUIRED') setNeedReauth(true)
      else setError(err.message)
      setBusy(false)
    }
  }

  if (loadError) return <div><PageHeader title="Akun" /><ErrorState message={loadError} onRetry={load} /></div>
  if (!me) return <div><PageHeader title="Akun" /><Skeleton className="h-32 w-full" /></div>

  return (
    <div className="max-w-2xl">
      <PageHeader title="Akun" description="Profil, keamanan, dan penghapusan akun." />

      <div className="space-y-6">
        <Card title="Profil">
          <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
            <dt className="text-ink-faint">Nama</dt>
            <dd className="text-ink">{me.name}</dd>
            <dt className="text-ink-faint">Email</dt>
            <dd className="break-all text-ink">{me.email}</dd>
            <dt className="text-ink-faint">Paket</dt>
            <dd className="text-ink">{me.trial ? PLAN[me.trial.plan] || me.trial.plan : '-'}</dd>
          </dl>
        </Card>

        <Card title="Ganti password" description="Wajib memasukkan password lama. Semua sesi akan berakhir setelah password diganti.">
          {me.hasPassword ? (
            <form onSubmit={changePassword} className="space-y-4">
              <Alert kind={pwMsg.kind}>{pwMsg.text}</Alert>
              <Field label="Password lama" id="pw-current">
                <input id="pw-current" type="password" required autoComplete="current-password" className={inputClass} value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
              </Field>
              <Field label="Password baru" id="pw-next" hint="Minimal 8 karakter.">
                <input id="pw-next" type="password" required minLength={8} autoComplete="new-password" className={inputClass} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
              </Field>
              <Field label="Ulangi password baru" id="pw-again">
                <input id="pw-again" type="password" required minLength={8} autoComplete="new-password" className={inputClass} value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} />
              </Field>
              <button type="submit" disabled={pwBusy || !pw.current || !pw.next || !pw.again} className="btn-primary">{pwBusy ? 'Menyimpan...' : 'Ganti password'}</button>
            </form>
          ) : (
            <p className="text-sm text-ink-soft">Akun ini masuk dengan Google dan belum memiliki password. Gunakan Lupa password di halaman masuk bila ingin menetapkannya.</p>
          )}
        </Card>

        <section className="rounded-xl border border-red-200 bg-white shadow-card" aria-labelledby="hapus-akun">
          <header className="border-b border-red-200 px-5 py-3.5">
            <h2 id="hapus-akun" className="text-sm font-semibold text-red-800">Hapus akun</h2>
          </header>
          <div className="p-5">
            <p className="text-sm text-ink-soft">
              Menghapus akun menghapus <strong>semua paper, versi naskah, chat, referensi, laporan, dan usulan</strong> Anda secara permanen. Tidak dapat dibatalkan.
              Salinan di backup tetap ada sampai backup kedaluwarsa. Catatan pemakaian teknis dan pembayaran dipertahankan untuk audit (tanpa isi naskah).
            </p>
            <form onSubmit={remove} className="mt-4 space-y-4">
              <Alert>{error}</Alert>
              <Field label="Ketik alamat email akun Anda" id="a-email">
                <input id="a-email" type="email" required autoComplete="off" className={inputClass} value={form.confirmEmail} onChange={(e) => setForm({ ...form, confirmEmail: e.target.value })} />
              </Field>
              <Field label="Ketik HAPUS" id="a-text">
                <input id="a-text" required autoComplete="off" className={inputClass} value={form.confirmText} onChange={(e) => setForm({ ...form, confirmText: e.target.value })} />
              </Field>
              {me.hasPassword ? (
                <Field label="Password" id="a-pass">
                  <input id="a-pass" type="password" required autoComplete="current-password" className={inputClass} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                </Field>
              ) : (
                <p className="text-xs text-ink-faint">Akun ini masuk dengan Google. Untuk keamanan, Anda perlu masuk Google ulang (maks. 5 menit) sebelum menghapus akun.</p>
              )}
              {needReauth && (
                <div className="space-y-2">
                  <Alert kind="info">Verifikasi ulang diperlukan. Masuk Google ulang, lalu kembali ke halaman ini dan ulangi penghapusan.</Alert>
                  <button type="button" onClick={() => signIn('google', { callbackUrl: '/dashboard/account' }, { prompt: 'login' })} className="btn-secondary">Verifikasi ulang dengan Google</button>
                </div>
              )}
              <button type="submit" disabled={busy || form.confirmText !== 'HAPUS'} className="btn-danger">
                {busy ? 'Menghapus...' : 'Hapus akun saya'}
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  )
}
