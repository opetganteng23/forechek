import Link from 'next/link'

const COLUMNS = [
  {
    title: 'Produk',
    links: [
      { href: '/#fitur', label: 'Fitur' },
      { href: '/privacy', label: 'Kebijakan Privasi (draf)' },
      { href: '/terms', label: 'Syarat Layanan (draf)' }
    ]
  },
  {
    title: 'Akun',
    links: [
      { href: '/login', label: 'Masuk' },
      { href: '/register', label: 'Daftar' },
      { href: '/dashboard', label: 'Dashboard' }
    ]
  }
]

export default function Footer() {
  return (
    <footer className="border-t border-base-border bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          <div className="col-span-2 sm:col-span-1">
            <span className="flex items-center gap-2.5 text-base font-semibold tracking-tight text-ink">
              <img src="/logo.png" alt="Logo AILO" width="98" height="32" className="h-8 w-auto" />
              <span>Fore<span className="text-sky-600">chek</span></span>
            </span>
            <p className="mt-3 max-w-xs text-sm text-ink-faint">
              Asisten persiapan naskah ilmiah: referensi terverifikasi, pemeriksaan kesiapan, dan ekspor LaTeX, sebelum Anda submit.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold text-ink">{col.title}</h3>
              <ul className="mt-3 flex flex-col gap-2">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-ink-faint hover:text-ink">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-base-border pt-6 text-xs text-ink-faint sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Forechek. Seluruh hak cipta dilindungi.</p>
          <p>Dibuat untuk peneliti, dosen, dan mahasiswa Indonesia.</p>
        </div>
      </div>
    </footer>
  )
}
