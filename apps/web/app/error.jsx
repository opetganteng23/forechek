'use client'

// Batas galat untuk segmen halaman: pesan umum tanpa detail internal. `digest` membantu pencarian log server.
export default function Error({ error, reset }) {
  return (
    <main className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center" role="alert">
      <h1 className="text-2xl font-bold tracking-tight text-ink">Terjadi kesalahan</h1>
      <p className="mt-3 text-sm text-ink-soft">Halaman ini gagal dimuat. Coba lagi; bila berulang, hubungi dukungan dengan kode di bawah.</p>
      {error?.digest && <p className="mt-2 font-mono text-xs text-ink-faint">Kode: {error.digest}</p>}
      <button type="button" onClick={() => reset()} className="mt-6 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-base">Coba lagi</button>
    </main>
  )
}
