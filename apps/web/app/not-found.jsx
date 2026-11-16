import Link from 'next/link'

export const metadata = { title: 'Halaman tidak ditemukan | Forechek' }

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <p className="text-sm font-medium text-ink-faint">404</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink">Halaman tidak ditemukan</h1>
      <p className="mt-3 text-sm text-ink-soft">Alamat yang Anda tuju tidak ada atau sudah dipindahkan.</p>
      <Link href="/" className="mt-6 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-base">Kembali ke beranda</Link>
    </main>
  )
}
