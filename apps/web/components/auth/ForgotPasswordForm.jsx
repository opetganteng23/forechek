'use client'

import { useState } from 'react'
import { apiFetch } from '../../lib/clientApi'
import { AuthShell, Field, inputClass, Alert, SubmitButton, TextLink } from './ui'

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await apiFetch('/api/auth/forgot-password', { method: 'POST', body: { email } })
      setSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Lupa password"
      subtitle="Masukkan email akun Anda untuk menerima tautan reset."
      footer={<TextLink href="/login">Kembali ke halaman masuk</TextLink>}
    >
      {sent ? (
        <Alert kind="success">Jika email terdaftar, instruksi reset telah dikirim. Tautan berlaku 1 jam.</Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Alert>{error}</Alert>
          <Field label="Email" id="email">
            <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          </Field>
          <SubmitButton loading={loading} loadingText="Mengirim...">Kirim tautan reset</SubmitButton>
        </form>
      )}
    </AuthShell>
  )
}
