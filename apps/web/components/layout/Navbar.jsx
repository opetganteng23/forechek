'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useConfirm } from '../providers/ConfirmProvider'

const NAV_LINKS = [
  { href: '/#fitur', label: 'Fitur' },
  { href: '/privacy', label: 'Privasi' },
  { href: '/terms', label: 'Syarat' }
]

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const { data, status } = useSession()
  const confirm = useConfirm()
  const signedIn = status === 'authenticated'
  const loading = status === 'loading'
  const isAdmin = signedIn && data?.user?.role === 'admin'

  // Keluar selalu meminta konfirmasi, lalu langsung kembali ke landing page (reload penuh agar tidak ada status lama).
  async function logout() {
    setOpen(false)
    if (leaving) return
    const ok = await confirm({ title: 'Keluar dari akun?', message: 'Anda akan keluar dan kembali ke halaman utama. Perubahan naskah yang belum disimpan akan hilang.', confirmText: 'Ya, keluar', tone: 'danger' })
    if (!ok) return
    setLeaving(true)
    try {
      await signOut({ redirect: false })
    } finally {
      window.location.assign('/')
    }
  }

  const linkCls = 'text-sm font-medium text-ink-soft transition-colors hover:text-sky-700'
  return (
    <header className="sticky top-0 z-50 border-b border-base-border/80 bg-white/75 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="group flex items-center gap-2.5 text-base font-semibold tracking-tight text-ink sm:text-lg" aria-label="Forechek, ke beranda">
          <img src="/logo.png" alt="Logo AILO" width="110" height="36" className="h-9 w-auto transition-transform duration-300 group-hover:scale-105" />
          <span>Fore<span className="text-sky-600">chek</span></span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={linkCls}>
              {link.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          {loading ? null : signedIn ? (
            <>
              <Link href="/dashboard" className={linkCls}>Dashboard</Link>
              {isAdmin && <Link href="/dashboard/admin/users" className={`${linkCls} rounded-full bg-sky-50 px-3 py-1 text-sky-800`}>Kelola pengguna</Link>}
              <Link href="/dashboard/account" className={linkCls}>Akun</Link>
              <button type="button" onClick={logout} disabled={leaving} className="rounded-full border border-base-border px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-base-muted disabled:opacity-60">
                Keluar
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className={linkCls}>Masuk</Link>
              <Link href="/register" className="fc-sheen rounded-full bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-sky-700">
                Coba Gratis
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Buka menu navigasi"
          aria-expanded={open}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-base-border text-ink md:hidden"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
            {open ? <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" /> : <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />}
          </svg>
        </button>
      </nav>

      {open && (
        <div className="border-t border-base-border bg-white px-4 py-4 md:hidden">
          <div className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-sm font-medium text-ink-soft hover:bg-base-muted hover:text-ink">
                {link.label}
              </Link>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-base-border pt-3">
              {signedIn ? (
                <>
                  <Link href="/dashboard" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-center text-sm font-medium text-ink-soft hover:bg-base-muted">Dashboard</Link>
                  {isAdmin && <Link href="/dashboard/admin/users" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-center text-sm font-medium text-sky-800 hover:bg-sky-50">Kelola pengguna</Link>}
                  <Link href="/dashboard/account" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-center text-sm font-medium text-ink-soft hover:bg-base-muted">Akun</Link>
                  <button type="button" onClick={logout} disabled={leaving} className="rounded-full border border-base-border px-3 py-2.5 text-center text-sm font-medium text-ink disabled:opacity-60">Keluar</button>
                </>
              ) : (
                <>
                  <Link href="/login" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-center text-sm font-medium text-ink-soft hover:bg-base-muted">Masuk</Link>
                  <Link href="/register" onClick={() => setOpen(false)} className="rounded-full bg-sky-600 px-3 py-2.5 text-center text-sm font-medium text-white">Coba Gratis</Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
