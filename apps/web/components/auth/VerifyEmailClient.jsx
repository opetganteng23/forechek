'use client'

import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '../../lib/clientApi'
import { AuthShell, Alert, TextLink } from './ui'

export default function VerifyEmailClient({ token }) {
  const [state, setState] = useState(token ? 'loading' : 'missing')
  const [message, setMessage] = useState('')
  const started = useRef(false)

  useEffect(() => {
    if (!token || started.current) return // guard: efek dev (StrictMode) berjalan dua kali, token hanya sekali pakai
    started.current = true
    apiFetch('/api/auth/verify-email', { method: 'POST', body: { token } })
      .then(() => setState('ok'))
      .catch((err) => {
        setMessage(err.message)
        setState('error')
      })
  }, [token])

  return (
    <AuthShell title="Verifikasi email">
      {state === 'loading' && <Alert kind="info">Memverifikasi email Anda...</Alert>}
      {state === 'missing' && <Alert>Tautan verifikasi tidak lengkap. Buka tautan dari email Anda.</Alert>}
      {state === 'ok' && (
        <>
          <Alert kind="success">Email berhasil diverifikasi. Anda sekarang dapat masuk.</Alert>
          <div className="mt-5 text-center text-sm"><TextLink href="/login">Masuk</TextLink></div>
        </>
      )}
      {state === 'error' && (
        <>
          <Alert>{message || 'Verifikasi gagal.'}</Alert>
          <p className="mt-4 text-sm text-ink-faint">
            Tautan mungkin sudah dipakai atau kedaluwarsa. Coba masuk, lalu minta kirim ulang email verifikasi.
          </p>
          <div className="mt-4 text-sm"><TextLink href="/login">Ke halaman masuk</TextLink></div>
        </>
      )}
    </AuthShell>
  )
}
