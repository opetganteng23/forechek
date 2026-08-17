'use client'

import Link from 'next/link'
import { useState } from 'react'

const NAV_LINKS = [
  { href: '/#fitur', label: 'Fitur' },
  { href: '/#harga', label: 'Harga' },
  { href: '/dashboard/journals', label: 'Database Jurnal' },
  { href: '/dashboard/kum', label: 'Kalkulator KUM' }
]

export default function Navbar() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-base-border/80 bg-base/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="text-base font-semibold tracking-tight text-ink sm:text-lg">
          Kesiapan<span className="text-indigo-600">Publikasi</span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-ink-soft transition-colors hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/login"
            className="text-sm font-medium text-ink-soft transition-colors hover:text-ink"
          >
            Masuk
          </Link>
          <Link
            href="/register"
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-base shadow-sm transition-opacity hover:opacity-90"
          >
            Mulai Gratis
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Buka menu navigasi"
          aria-expanded={open}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-base-border text-ink md:hidden"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
            {open ? (
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </nav>

      {open && (
        <div className="border-t border-base-border bg-base px-4 py-4 md:hidden">
          <div className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-ink-soft hover:bg-base-muted hover:text-ink"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-base-border pt-3">
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-center text-sm font-medium text-ink-soft hover:bg-base-muted"
              >
                Masuk
              </Link>
              <Link
                href="/register"
                onClick={() => setOpen(false)}
                className="rounded-full bg-ink px-3 py-2.5 text-center text-sm font-medium text-base"
              >
                Mulai Gratis
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
