'use client'
import { useEffect, useState } from 'react'
import { signIn, signOut } from 'next-auth/react'
import { apiFetch } from '../../lib/clientApi'
import { Alert, Field, inputClass } from '../auth/ui'
import { useConfirm } from '../providers/ConfirmProvider'

// Hapus akun (MTS 14, QA-09). Tidak dapat dibatalkan. Akun dengan password: konfirmasi password. Akun Google-only: harus masuk Google ulang
// (maks. 5 menit) sebelum penghapusan; tombol verifikasi ulang muncul bila server meminta (REAUTH_REQUIRED).
export default function AccountPanel() {
  const confirm = useConfirm()
  const [me, setMe] = useState(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ confirmEmail: '', confirmText: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [needReauth, setNeedReauth] = useState(false)

  useEffect(() => {
    let alive = true
    apiFetch('/api/auth/me').then((d) => alive && setMe(d)).catch((e) => alive && setError(e.message))
    return () => { alive = false }
  }, [])

  async function remove(e) {
    e.preventDefault()
    if (!(await confirm({ title: 'Hapus akun PERMANEN?', message: 'Seluruh proyek, versi naskah, chat, referensi, laporan, dan usulan Anda akan dihapus dan TIDAK dapat dikembalikan.', confirmText: 'Ya, hapus akun saya', tone: 'danger' }))) return
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

  if (!me) return <main className="mx-auto max-w-xl px-4 py-10 text-sm text-ink-faint">{error ? <Alert>{error}</Alert> : 'Memuat...'}</main>

  return (
    <main className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink">Akun</h1>
      <p className="mt-1 text-sm text-ink-faint">{me.name} · {me.email}</p>

      <section className="mt-8 rounded-2xl border border-red-200 p-5" aria-labelledby="hapus-akun">
        <h2 id="hapus-akun" className="text-base font-semibold text-red-800">Hapus akun</h2>
        <p className="mt-2 text-sm text-ink-soft">
          Menghapus akun menghapus <strong>semua proyek, versi naskah, chat, referensi, laporan, dan usulan</strong> Anda secara permanen. Tidak dapat dibatalkan.
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
              <button type="button" onClick={() => signIn('google', { callbackUrl: '/dashboard/account' }, { prompt: 'login' })} className="rounded-xl border border-base-border px-4 py-2 text-sm">Verifikasi ulang dengan Google</button>
            </div>
          )}
          <button type="submit" disabled={busy || form.confirmText !== 'HAPUS'} className="rounded-xl bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {busy ? 'Menghapus...' : 'Hapus akun saya'}
          </button>
        </form>
      </section>
    </main>
  )
}
