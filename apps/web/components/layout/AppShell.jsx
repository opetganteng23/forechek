'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { useConfirm } from '../providers/ConfirmProvider'
import Brand from './Brand'

// Layout aplikasi: sidebar kiri tetap (desktop), topbar dengan nama pengguna dan menu, area konten. Mobile: sidebar menjadi menu.
// Tidak ada animasi latar di dashboard.
export default function AppShell({ children }) {
  const pathname = usePathname() || ''
  const { data } = useSession()
  const confirm = useConfirm()
  const [menu, setMenu] = useState(false)
  const [user, setUser] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const isAdmin = data?.user?.role === 'admin'
  const name = data?.user?.name || data?.user?.email || ''

  useEffect(() => { setMenu(false); setUser(false) }, [pathname])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { setMenu(false); setUser(false) } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const items = [
    { href: '/dashboard', label: 'Beranda', active: pathname === '/dashboard' },
    { href: '/dashboard/projects', label: 'Paper', active: pathname.startsWith('/dashboard/projects') },
    { href: '/dashboard/account', label: 'Akun', active: pathname.startsWith('/dashboard/account') },
    ...(isAdmin ? [{ href: '/dashboard/admin/users', label: 'Admin', active: pathname.startsWith('/dashboard/admin') }] : [])
  ]

  async function logout() {
    setUser(false)
    setMenu(false)
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

  const navList = (
    <ul className="space-y-1">
      {items.map((it) => (
        <li key={it.href}>
          <Link href={it.href} aria-current={it.active ? 'page' : undefined} className={`block rounded-lg px-3 py-2 text-sm ${it.active ? 'bg-sky-600 font-medium text-white' : 'text-ink-soft hover:bg-base-muted hover:text-ink'}`}>
            {it.label}
          </Link>
        </li>
      ))}
    </ul>
  )

  return (
    <div className="min-h-screen bg-base">
      <a href="#konten" className="sr-only z-[200] rounded bg-white px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Lewati ke konten</a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-base-border bg-white lg:flex" aria-label="Menu aplikasi">
        <Link href="/dashboard" className="flex h-16 items-center gap-3 border-b border-base-border px-5" aria-label="Forechek, beranda dashboard">
          <img src="/logo.png" alt="Logo AILO" width="110" height="36" className="h-8 w-auto" />
          <Brand className="text-lg" />
        </Link>
        <nav className="flex-1 overflow-y-auto p-3" aria-label="Navigasi dashboard">{navList}</nav>
        <div className="border-t border-base-border p-3 text-xs text-ink-faint">
          <Link href="/" className="block rounded-lg px-3 py-2 hover:bg-base-muted">Situs utama</Link>
        </div>
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-base-border bg-white/95 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button type="button" className="btn-secondary lg:hidden" aria-expanded={menu} aria-controls="menu-app" onClick={() => setMenu((v) => !v)}>
              {menu ? 'Tutup' : 'Menu'}
            </button>
            <span className="lg:hidden"><Brand className="text-lg" /></span>
          </div>
          <div className="relative">
            <button type="button" className="btn-secondary max-w-[14rem]" aria-expanded={user} aria-haspopup="menu" aria-controls="menu-user" onClick={() => setUser((v) => !v)} data-testid="user-menu">
              <span className="truncate">{name || 'Akun'}</span>
            </button>
            {user && (
              <div id="menu-user" role="menu" className="absolute right-0 mt-2 w-56 rounded-xl border border-base-border bg-white p-2 shadow-pop">
                <p className="truncate px-3 py-2 text-xs text-ink-faint">{data?.user?.email}</p>
                <Link role="menuitem" href="/dashboard/account" className="block rounded-lg px-3 py-2 text-sm text-ink-soft hover:bg-base-muted">Akun saya</Link>
                <button role="menuitem" type="button" onClick={logout} disabled={leaving} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink-soft hover:bg-base-muted">Keluar</button>
              </div>
            )}
          </div>
        </header>

        {menu && (
          <nav id="menu-app" className="border-b border-base-border bg-white p-3 lg:hidden" aria-label="Navigasi dashboard (mobile)">
            {navList}
          </nav>
        )}

        <main id="konten" className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
