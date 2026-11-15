'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { apiFetch, safeCallbackUrl } from '../../lib/clientApi'
import { AuthShell, Field, inputClass, Alert, SubmitButton, Divider, TextLink } from './ui'

// Pesan error dari authorize() di lib/auth.js dan dari ?error= bawaan NextAuth.
const MESSAGES = {
  INVALID_CREDENTIALS: 'Email atau password salah.',
  CredentialsSignin: 'Email atau password salah.',
  RATE_LIMITED: 'Terlalu banyak percobaan. Coba lagi dalam beberapa menit.',
  ACCOUNT_DISABLED: 'Akun ini dinonaktifkan. Hubungi dukungan.',
  EMAIL_NOT_VERIFIED: 'Email Anda belum diverifikasi. Periksa kotak masuk Anda.',
  AccessDenied: 'Login Google ditolak. Pastikan email Google Anda sudah terverifikasi.',
  OAuthAccountNotLinked: 'Email ini sudah terdaftar dengan metode lain.',
  Default: 'Login gagal. Coba lagi.'
}

export default function LoginForm({ callbackUrl, initialError }) {
  const target = safeCallbackUrl(callbackUrl)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorCode, setErrorCode] = useState(initialError || '')
  const [loading, setLoading] = useState(false)
  const [resendState, setResendState] = useState('')

  async function onSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setErrorCode('')
    setResendState('')
    const res = await signIn('credentials', { email, password, redirect: false })
    if (res?.error) {
      setErrorCode(res.error)
      setLoading(false)
      return
    }
    window.location.assign(target)
  }

  async function resend() {
    setResendState('sending')
    try {
      await apiFetch('/api/auth/resend-verification', { method: 'POST', body: { email } })
      setResendState('sent')
    } catch (err) {
      setResendState(err.code === 'RATE_LIMITED' ? 'limited' : 'error')
    }
  }

  const message = errorCode ? MESSAGES[errorCode] || MESSAGES.Default : ''

  return (
    <AuthShell
      title="Masuk"
      subtitle="Lanjutkan ke proyek publikasi Anda."
      footer={
        <>
          Belum punya akun? <TextLink href="/register">Daftar gratis</TextLink>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Alert>{message}</Alert>
        {errorCode === 'EMAIL_NOT_VERIFIED' && (
          <div className="text-sm text-ink-soft">
            {resendState === 'sent' ? (
              <Alert kind="success">Jika email terdaftar, tautan verifikasi baru telah dikirim.</Alert>
            ) : (
              <button
                type="button"
                onClick={resend}
                disabled={!email || resendState === 'sending'}
                className="font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-60"
              >
                {resendState === 'sending' ? 'Mengirim...' : 'Kirim ulang email verifikasi'}
              </button>
            )}
            {resendState === 'limited' && <p className="mt-1 text-red-700">Terlalu sering. Coba lagi nanti.</p>}
            {resendState === 'error' && <p className="mt-1 text-red-700">Gagal mengirim. Coba lagi.</p>}
          </div>
        )}

        <Field label="Email" id="email">
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="nama@kampus.ac.id" />
        </Field>
        <Field label="Password" id="password">
          <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        </Field>

        <div className="flex justify-end">
          <TextLink href="/forgot-password">Lupa password?</TextLink>
        </div>

        <SubmitButton loading={loading} loadingText="Masuk...">Masuk</SubmitButton>
      </form>

      <Divider>atau</Divider>
      <button
        type="button"
        onClick={() => signIn('google', { callbackUrl: target })}
        className="w-full rounded-full border border-base-border bg-base px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-base-muted"
      >
        Lanjutkan dengan Google
      </button>
    </AuthShell>
  )
}
