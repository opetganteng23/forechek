import './globals.css'
import Providers from '../components/providers/Providers'
import Navbar from '../components/layout/Navbar'
import Footer from '../components/layout/Footer'

// CSP berbasis nonce memerlukan render dinamis (nonce berbeda tiap permintaan); halaman statis prerender tidak dapat memuat nonce.
export const dynamic = 'force-dynamic'

export const metadata = {
  title: { default: 'Forechek - persiapan naskah ilmiah', template: '%s' },
  description: 'Forechek membantu menyiapkan naskah ilmiah: referensi terverifikasi, pemeriksaan kesiapan terhadap aturan venue, dan ekspor LaTeX.'
}

export const viewport = {
  width: 'device-width',
  initialScale: 1
}

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body className="flex min-h-screen flex-col bg-base font-sans text-ink antialiased">
        <Providers>
          <Navbar />
          <div className="flex-1">{children}</div>
          <Footer />
        </Providers>
      </body>
    </html>
  )
}
