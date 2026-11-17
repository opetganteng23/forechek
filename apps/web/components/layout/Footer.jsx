import Link from 'next/link'
import Brand from './Brand'

const COLUMNS = [
  {
    title: 'Produk',
    links: [
      { href: '/#fitur', label: 'Fitur' },
      { href: '/#cara-kerja', label: 'Cara kerja' },
      { href: '/#harga', label: 'Harga' },
      { href: '/#faq', label: 'FAQ' }
    ]
  },
  {
    title: 'Akun',
    links: [
      { href: '/login', label: 'Masuk' },
      { href: '/register', label: 'Daftar' }
    ]
  },
  {
    title: 'Legal',
    links: [
      { href: '/privacy', label: 'Kebijakan privasi (draf)' },
      { href: '/terms', label: 'Syarat layanan (draf)' }
    ]
  }
]

export default function Footer() {
  const contact = process.env.CONTACT_EMAIL // diisi pemilik produk; tidak ada nilai bawaan agar tidak mengarang kontak
  return (
    <footer className="border-t border-base-border bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <span className="flex items-center gap-3">
              <img src="/logo.png" alt="Logo AILO" width="36" height="32" className="h-8 w-auto" />
              <Brand />
            </span>
            <p className="mt-3 max-w-xs text-sm text-ink-faint">Asisten persiapan naskah ilmiah: referensi terverifikasi, pemeriksaan kesiapan, dan ekspor LaTeX sebelum Anda submit.</p>
            <p className="mt-3 text-sm text-ink-faint">
              Dikembangkan oleh AILO, pusat unggulan Telkom University.{' '}
              <a href="https://ailo.telkomuniversity.ac.id/" target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline">Kunjungi situs AILO</a>
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold text-ink">{col.title}</h3>
              <ul className="mt-3 flex flex-col gap-2">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-sm text-ink-faint hover:text-ink">{l.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-base-border pt-6 text-xs text-ink-faint sm:flex-row sm:items-center sm:justify-between">
          <p>
            {`© ${new Date().getFullYear()} `}
            <a href="https://ailo.telkomuniversity.ac.id/" target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">AILO</a>
            . Forechek adalah produk AILO.
          </p>
          <p>
            Kontak:{' '}
            {contact ? <a href={`mailto:${contact}`} className="underline">{contact}</a> : <span>belum ditetapkan oleh pengelola</span>}
          </p>
        </div>
      </div>
    </footer>
  )
}
