'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useConfirm } from '../providers/ConfirmProvider'
import Brand from './Brand'

const NAV_LINKS = [
  { href: '/#fitur', label: 'Fitur' },
  { href: '/#cara-kerja', label: 'Cara kerja' },
  { href: '/#harga', label: 'Harga' },
  { href: '/#faq', label: 'FAQ' }
]

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const { status } = useSession()
  const confirm = useConfirm()
  const signedIn = status === 'authenticated'
  const loading = status === 'loading'

  // Keluar selalu meminta konfirmasi, lalu langsung kembali ke landing page (reload penuh agar tidak ada status lama).
  async function logout() {
    setOpen(false)
    if (leaving) return
    const ok = await confirm({ title: 'Keluar dari akun?', message: 'Anda akan keluar dan kembali ke halaman utama.', confirmText: 'Ya, keluar', tone: 'danger' })
    if (!ok) return
    setLeaving(true)
    try {
      await signOut({ redirect: false })
    } finally {
      window.location.assign('/')
    }
  }

  const linkCls = 'text-sm text-ink-soft transition-colors hover:text-ink'
  return (
    <header className="sticky top-0 z-50 border-b border-base-border bg-white/90 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8" aria-label="Navigasi utama">
        <Link href="/" className="flex items-center gap-3" aria-label="Forechek, beranda">
          <img src="/logo.png" alt="Logo AILO" width="110" height="36" className="h-9 w-auto" />
          <Brand />
        </Link>

        <div className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={linkCls}>{l.label}</Link>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          {loading ? (
            <span className="h-9 w-40" aria-hidden="true" />
          ) : signedIn ? (
            <>
              <Link href="/dashboard" className="btn-primary">Buka dashboard</Link>
              <button type="button" onClick={logout} disabled={leaving} className="btn-secondary">Keluar</button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-secondary">Masuk</Link>
              <Link href="/register" className="btn-primary">Daftar</Link>
            </>
          )}
        </div>

        <button type="button" className="btn-secondary md:hidden" aria-expanded={open} aria-controls="menu-mobile" onClick={() => setOpen((v) => !v)}>
          {open ? 'Tutup' : 'Menu'}
        </button>
      </nav>

      {open && (
        <div id="menu-mobile" className="border-t border-base-border bg-white px-4 pb-4 pt-2 md:hidden">
          <ul className="flex flex-col">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} onClick={() => setOpen(false)} className="block py-2.5 text-sm text-ink-soft">{l.label}</Link>
              </li>
            ))}
          </ul>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {signedIn ? (
              <>
                <Link href="/dashboard" onClick={() => setOpen(false)} className="btn-primary">Buka dashboard</Link>
                <button type="button" onClick={logout} disabled={leaving} className="btn-secondary">Keluar</button>
              </>
            ) : (
              <>
                <Link href="/login" onClick={() => setOpen(false)} className="btn-secondary">Masuk</Link>
                <Link href="/register" onClick={() => setOpen(false)} className="btn-primary">Daftar</Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
