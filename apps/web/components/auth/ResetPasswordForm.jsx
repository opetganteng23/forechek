'use client'

import { useState } from 'react'
import { apiFetch } from '../../lib/clientApi'
import { AuthShell, Field, inputClass, Alert, SubmitButton, TextLink } from './ui'

export default function ResetPasswordForm({ token }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 8) return setError('Password minimal 8 karakter.')
    if (password !== confirm) return setError('Konfirmasi password tidak sama.')
    setLoading(true)
    try {
      await apiFetch('/api/auth/reset-password', { method: 'POST', body: { token, password } })
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <AuthShell title="Reset password">
        <Alert>Tautan reset tidak lengkap. Minta tautan baru.</Alert>
        <div className="mt-4 text-sm"><TextLink href="/forgot-password">Minta tautan baru</TextLink></div>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Buat password baru" footer={<TextLink href="/login">Kembali ke halaman masuk</TextLink>}>
      {done ? (
        <>
          <Alert kind="success">Password berhasil diubah.</Alert>
          <div className="mt-5 text-center text-sm"><TextLink href="/login">Masuk dengan password baru</TextLink></div>
        </>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Alert>{error}</Alert>
          <Field label="Password baru" id="password" hint="Minimal 8 karakter.">
            <input id="password" type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Ulangi password" id="confirm">
            <input id="confirm" type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
          </Field>
          <SubmitButton loading={loading} loadingText="Menyimpan...">Simpan password</SubmitButton>
        </form>
      )}
    </AuthShell>
  )
}
