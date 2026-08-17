import Link from 'next/link'

const COLUMNS = [
  {
    title: 'Produk',
    links: [
      { href: '/#fitur', label: 'Fitur' },
      { href: '/#harga', label: 'Harga' },
      { href: '/dashboard/journals', label: 'Database Jurnal' },
      { href: '/dashboard/kum', label: 'Kalkulator KUM' }
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
    <footer className="border-t border-base-border bg-base-soft">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          <div className="col-span-2 sm:col-span-1">
            <span className="text-base font-semibold tracking-tight text-ink">
              Kesiapan<span className="text-indigo-600">Publikasi</span>
            </span>
            <p className="mt-3 max-w-xs text-sm text-ink-faint">
              Analisis kesiapan naskah ilmiah berbasis AI, sebelum Anda submit ke jurnal.
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
          <p>© {new Date().getFullYear()} KesiapanPublikasi. Seluruh hak cipta dilindungi.</p>
          <p>Dibuat untuk peneliti, dosen, dan mahasiswa Indonesia.</p>
        </div>
      </div>
    </footer>
  )
}
