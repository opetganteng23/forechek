export const metadata = { title: 'Kebijakan Privasi (draf) | Kesiapan Publikasi' }

// DRAF kebijakan privasi (QA-03, MTS 14, 42.4). BELUM ditinjau hukum dan BELUM final: harus ditinjau/disetujui pemilik produk dan penasihat
// hukum sebelum rilis. Isi di bawah menggambarkan perilaku sistem saat ini, bukan janji hukum.
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-sm leading-6 text-ink-soft">
      <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900">
        <strong>DRAF - belum ditinjau hukum.</strong> Dokumen ini menjelaskan perilaku sistem saat ini dan belum menjadi kebijakan resmi.
      </p>
      <h1 className="mt-6 text-2xl font-bold text-ink">Kebijakan Privasi</h1>
      <h2 className="mt-5 font-semibold text-ink">Data yang diproses</h2>
      <p>Akun (nama, email, password ter-hash), naskah yang Anda simpan beserta versinya, percakapan dengan asisten, daftar referensi, laporan kesiapan, dan usulan edit.</p>
      <h2 className="mt-5 font-semibold text-ink">Penggunaan AI</h2>
      <p>Bagian naskah dan pesan Anda dikirim ke penyedia model AI yang dikonfigurasi untuk menjawab permintaan Anda. Naskah Anda tidak dipakai untuk melatih model atau evaluasi di luar kebijakan yang diinformasikan dan disetujui. Syarat penyedia (retensi dan pemrosesan data) wajib diverifikasi sebelum rilis.</p>
      <h2 className="mt-5 font-semibold text-ink">Penyimpanan dan penghapusan</h2>
      <p>Anda dapat menghapus proyek kapan saja; penghapusan juga menghapus versi, chat, referensi, laporan, dan usulan edit proyek itu. Anda dapat menghapus akun beserta datanya (proyek, versi, chat, referensi, laporan, usulan, dan berkas unggahan lama bila ada; penghapusan berkas lama dilakukan sebaik mungkin dan kegagalannya dilaporkan). Salinan di backup tetap ada sampai backup kedaluwarsa. Anda juga dapat menetapkan masa simpan per proyek; proyek yang melewati masa simpan beserta masa tenggang dapat dihapus otomatis. Catatan pemakaian teknis (angka token) dan catatan pembayaran dipertahankan untuk audit tagihan dan tidak memuat isi naskah.</p>
      <h2 className="mt-5 font-semibold text-ink">Log</h2>
      <p>Log aplikasi tidak memuat isi naskah, prompt, atau rahasia.</p>
      <h2 className="mt-5 font-semibold text-ink">Kontak</h2>
      <p>[ISI kontak dukungan dan permintaan penghapusan data - belum ditetapkan]</p>
    </main>
  )
}
