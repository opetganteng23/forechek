import './globals.css'
import { Poppins } from 'next/font/google'
import Providers from '../components/providers/Providers'

// Font diunduh saat build dan disajikan dari origin sendiri (CSP font-src 'self' cukup; tidak ada permintaan ke Google saat runtime).
const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500', '600'], display: 'swap', variable: '--font-poppins' })

// CSP berbasis nonce memerlukan render dinamis (nonce berbeda tiap permintaan); halaman statis prerender tidak dapat memuat nonce.
export const dynamic = 'force-dynamic'

export const metadata = {
  title: { default: 'Forechek | Persiapan naskah ilmiah', template: '%s' },
  description: 'Forechek membantu menyiapkan naskah ilmiah: referensi terverifikasi, pemeriksaan kesiapan terhadap aturan venue, dan ekspor LaTeX.'
}

export const viewport = {
  width: 'device-width',
  initialScale: 1
}

export default function RootLayout({ children }) {
  return (
    <html lang="id" className={poppins.variable}>
      <body className="min-h-screen bg-base font-sans text-ink antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
