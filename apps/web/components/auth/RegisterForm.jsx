'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { apiFetch } from '../../lib/clientApi'
import { AuthShell, Field, inputClass, Alert, SubmitButton, Divider, TextLink } from './ui'

const PROFESSIONS = [
  { value: '', label: 'Pilih (opsional)' },
  { value: 'dosen', label: 'Dosen' },
  { value: 'mahasiswa_s2', label: 'Mahasiswa S2' },
  { value: 'mahasiswa_s3', label: 'Mahasiswa S3' },
  { value: 'peneliti', label: 'Peneliti' },
  { value: 'lainnya', label: 'Lainnya' }
]

export default function RegisterForm() {
  const [form, setForm] = useState({ name: '', email: '', password: '', profession: '', institution: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    if (form.password.length < 8) {
      setError('Password minimal 8 karakter.')
      return
    }
    setLoading(true)
    try {
      await apiFetch('/api/auth/register', { method: 'POST', body: form })
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <AuthShell title="Periksa email Anda" subtitle={`Jika ${form.email} dapat didaftarkan, tautan verifikasi dikirim ke alamat itu.`}>
        <Alert kind="info">
          Tautan berlaku 24 jam. Belum menerima email? Cek folder spam, atau minta kirim ulang dari halaman masuk.
        </Alert>
        <div className="mt-5 text-center text-sm">
          <TextLink href="/login">Ke halaman masuk</TextLink>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Buat akun"
      subtitle="Mulai siapkan naskah Anda untuk publikasi."
      footer={
        <>
          Sudah punya akun? <TextLink href="/login">Masuk</TextLink>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Alert>{error}</Alert>
        <Field label="Nama lengkap" id="name">
          <input id="name" required autoComplete="name" value={form.name} onChange={set('name')} className={inputClass} />
        </Field>
        <Field label="Email" id="email">
          <input id="email" type="email" required autoComplete="email" value={form.email} onChange={set('email')} className={inputClass} placeholder="nama@kampus.ac.id" />
        </Field>
        <Field label="Password" id="password" hint="Minimal 8 karakter.">
          <input id="password" type="password" required autoComplete="new-password" value={form.password} onChange={set('password')} className={inputClass} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Profesi" id="profession">
            <select id="profession" value={form.profession} onChange={set('profession')} className={inputClass}>
              {PROFESSIONS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Institusi" id="institution">
            <input id="institution" autoComplete="organization" value={form.institution} onChange={set('institution')} className={inputClass} placeholder="Opsional" />
          </Field>
        </div>
        <SubmitButton loading={loading} loadingText="Mendaftar...">Daftar</SubmitButton>
      </form>

      <Divider>atau</Divider>
      <button
        type="button"
        onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
        className="w-full rounded-full border border-base-border bg-base px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-base-muted"
      >
        Daftar dengan Google
      </button>
    </AuthShell>
  )
}
