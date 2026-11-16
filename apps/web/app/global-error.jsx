'use client'

// Galat pada layout akar (jarang). Harus memuat <html>/<body> sendiri.
export default function GlobalError({ reset }) {
  return (
    <html lang="id">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '4rem 1rem', textAlign: 'center' }}>
        <h1>Terjadi kesalahan</h1>
        <p>Aplikasi gagal dimuat. Muat ulang halaman.</p>
        <button type="button" onClick={() => reset()}>Coba lagi</button>
      </body>
    </html>
  )
}
