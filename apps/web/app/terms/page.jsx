export const metadata = { title: 'Syarat Layanan (draf) | Kesiapan Publikasi' }

// DRAF syarat layanan (QA-03, 42.4). BELUM ditinjau hukum; wajib ditinjau sebelum rilis.
export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-sm leading-6 text-ink-soft">
      <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900">
        <strong>DRAF - belum ditinjau hukum.</strong> Dokumen ini belum menjadi syarat layanan resmi.
      </p>
      <h1 className="mt-6 text-2xl font-bold text-ink">Syarat Layanan</h1>
      <h2 className="mt-5 font-semibold text-ink">Batas layanan</h2>
      <p>Layanan ini adalah alat bantu persiapan naskah. Skor kesiapan, pemeriksaan sitasi, dan saran AI adalah bantuan, bukan jaminan diterimanya naskah atau penilaian akhir editor/reviewer. Aturan venue dan rumus kesiapan bersifat sementara sampai diverifikasi.</p>
      <h2 className="mt-5 font-semibold text-ink">Tanggung jawab pengguna</h2>
      <p>Anda hanya mengunggah naskah yang Anda berhak unggah, dan Anda bertanggung jawab atas isi, sitasi, serta kepatuhan terhadap kebijakan penggunaan AI venue tujuan. Periksa semua referensi sebelum submit.</p>
      <h2 className="mt-5 font-semibold text-ink">Kuota dan pembayaran</h2>
      <p>Kuota dan harga bersifat sementara dan dapat berubah.</p>
    </main>
  )
}
