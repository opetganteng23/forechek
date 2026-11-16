import Link from 'next/link'

// Teks landing mengikuti fitur yang BENAR-BENAR ada (MTS P4: jujur tentang batas). Skor, aturan venue, dan indikator bersifat bantuan/sementara.
const FEATURES = [
  {
    title: 'Referensi terverifikasi',
    desc: 'Cari literatur, verifikasi DOI dan metadata ke sumber, dan simpan hanya referensi yang cocok. Sitasi yang tidak punya referensi terverifikasi ditandai, bukan ditampilkan.'
  },
  {
    title: 'Asisten per proyek',
    desc: 'Chat dengan asisten AI yang membaca naskah Anda. AI hanya mengusulkan perubahan; naskah berubah hanya setelah Anda menerima usulan, dan setiap penerimaan membuat versi baru.'
  },
  {
    title: 'Pemeriksaan kesiapan',
    desc: 'Pemeriksaan struktur, sitasi, dan kelengkapan terhadap profil venue, dengan bukti berlokasi. Aturan venue dan rumus skor masih sementara dan ditandai jelas sampai diverifikasi.'
  },
  {
    title: 'Versi naskah',
    desc: 'Simpan setiap perubahan sebagai versi, bandingkan, dan pulihkan. Naskah Markdown atau LaTeX.'
  },
  {
    title: 'Ekspor LaTeX dan BibTeX',
    desc: 'Unduh paket ZIP berisi main.tex dan references.bib (hanya referensi terverifikasi) beserta peringatan hal yang perlu diperiksa sebelum submit.'
  },
  {
    title: 'Indikator opsional',
    desc: 'Kecocokan literal terhadap abstrak referensi Anda dan statistik gaya penulisan, sebagai angka deskriptif. Bukan penilaian orisinalitas atau penulis naskah.'
  }
]

export default function HomePage() {
  return (
    <main>
      <section className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-16 text-center sm:px-6 sm:py-24 lg:px-8 lg:py-28">
        <span className="rounded-full border border-base-border bg-base-soft px-4 py-1.5 text-xs font-medium text-ink-soft sm:text-sm">
          Akses awal (beta) - fitur dan aturan venue masih disempurnakan
        </span>
        <h1 className="max-w-3xl text-3xl font-bold tracking-tight text-ink sm:text-4xl md:text-5xl lg:text-6xl">
          Siapkan naskah ilmiah Anda dengan Forechek
        </h1>
        <p className="max-w-xl text-base text-ink-soft sm:text-lg">
          Referensi yang bisa dipertanggungjawabkan, pemeriksaan kesiapan terhadap aturan venue, dan paket LaTeX siap unggah, sebelum naskah Anda disubmit.
        </p>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Link
            href="/register"
            className="w-full rounded-full bg-ink px-6 py-3 text-center text-sm font-medium text-base shadow-sm transition-opacity hover:opacity-90 sm:w-auto sm:text-base"
          >
            Daftar
          </Link>
          <Link
            href="#fitur"
            className="w-full rounded-full border border-base-border bg-base-soft px-6 py-3 text-center text-sm font-medium text-ink transition-colors hover:bg-base-muted sm:w-auto sm:text-base"
          >
            Lihat Fitur
          </Link>
        </div>
      </section>

      <section id="fitur" className="border-t border-base-border bg-base-soft">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Fitur</h2>
            <p className="mt-3 text-ink-soft">Alat bantu persiapan, bukan jaminan diterimanya naskah. Hasil dan skor adalah bantuan dan tidak memprediksi keputusan editor atau reviewer.</p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-4 sm:mt-12 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="rounded-2xl border border-base-border bg-base p-6 shadow-sm">
                <h3 className="text-base font-semibold text-ink">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-faint">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-base-border">
        <div className="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6 lg:px-8">
          <h2 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">Paket dan harga</h2>
          <p className="mt-3 text-ink-soft">Kuota dan harga belum ditetapkan selama masa akses awal. Informasi akan diumumkan sebelum ada pembayaran apa pun.</p>
          <p className="mt-6 text-xs text-ink-faint">
            Dengan mendaftar Anda menyetujui draf <Link href="/terms" className="underline">Syarat Layanan</Link> dan <Link href="/privacy" className="underline">Kebijakan Privasi</Link>.
          </p>
        </div>
      </section>
    </main>
  )
}
