import Link from 'next/link'
import { loadConfig } from '@publication-prepare/core'
import PaperBackdrop from '../../components/layout/PaperBackdrop'

export const metadata = {
  title: 'Forechek | Persiapan naskah ilmiah sebelum submit',
  description: 'Periksa kesiapan naskah terhadap aturan venue, verifikasi referensi, dan siapkan paket LaTeX untuk Overleaf. Anda yang memutuskan setiap perubahan.'
}

const PROBLEMS = [
  { title: 'Aturan venue sulit dilacak', body: 'Jumlah kata, struktur bagian, format sitasi, dan deklarasi wajib berbeda di setiap jurnal dan konferensi, dan sering berubah. Naskah mudah ditolak karena hal administratif.' },
  { title: 'Referensi bermasalah', body: 'DOI keliru, sitasi yang tidak ada di daftar pustaka, atau rujukan yang sebenarnya tidak ditemukan memakan waktu penelaah dan merusak kepercayaan pada naskah.' },
  { title: 'Revisi tanpa jejak', body: 'Naskah berpindah antara dokumen, chat, dan catatan. Tanpa riwayat yang jelas, sulit tahu apa yang berubah dan mengapa.' }
]

const STEPS = [
  { n: '1', title: 'Unggah naskah', body: 'Tempel teks atau unggah berkas. Forechek menyimpan naskah sebagai versi pertama dan mengenali struktur bagiannya.' },
  { n: '2', title: 'Pilih target publikasi', body: 'Pilih profil venue tujuan. Setiap profil menampilkan sumber aturan dan status verifikasinya.' },
  { n: '3', title: 'Periksa kesiapan', body: 'Laporan menunjukkan temuan per aturan: yang sudah terpenuhi, yang perlu diperbaiki, dan yang belum dapat dinilai.' },
  { n: '4', title: 'Perbaiki dan ekspor', body: 'Terima atau tolak usulan edit satu per satu, lalu ekspor paket LaTeX dan BibTeX untuk dilanjutkan di Overleaf.' }
]

const FEATURES = [
  { title: 'Cek kesiapan per aturan venue', body: 'Naskah dibandingkan dengan aturan venue yang dipilih. Setiap temuan menyebut aturan, bagian naskah, dan sumbernya.' },
  { title: 'Referensi terverifikasi', body: 'Referensi dicocokkan dengan basis data publik seperti OpenAlex dan Crossref. Yang tidak ditemukan ditandai, bukan diganti dengan data karangan.' },
  { title: 'Usulan edit yang harus Anda setujui', body: 'Asisten hanya mengusulkan. Tidak ada perubahan masuk ke naskah sebelum Anda menerimanya, dan setiap penerimaan menjadi versi baru.' },
  { title: 'Ekspor LaTeX dan BibTeX', body: 'Unduh paket siap unggah ke Overleaf, lengkap dengan berkas BibTeX yang dibersihkan dari entri bermasalah.' },
  { title: 'Indikator kemiripan dan gaya', body: 'Kemiripan literal dan statistik gaya dihitung sebagai angka deskriptif. Tidak ada vonis, skor gabungan, atau label plagiarisme.' },
  { title: 'Riwayat versi', body: 'Setiap perubahan tersimpan sebagai versi. Anda dapat membandingkan dan memulihkan versi sebelumnya kapan saja.' }
]

const PRINCIPLES = [
  { title: 'Tidak pernah mengarang referensi', body: 'Sitasi hanya berasal dari sumber yang dapat diverifikasi. Bila tidak ditemukan, sistem mengatakannya.' },
  { title: 'Tidak menjamin diterima', body: 'Forechek membantu menyiapkan naskah. Keputusan penerimaan sepenuhnya ada pada penelaah dan editor venue.' },
  { title: 'Anda yang memutuskan', body: 'Setiap perubahan pada naskah melalui persetujuan Anda. Aksi penting selalu meminta konfirmasi.' },
  { title: 'Data dapat dihapus', body: 'Anda dapat menghapus proyek atau seluruh akun beserta isinya kapan saja dari halaman Akun.' }
]

const LIMITS = [
  'Tidak menggantikan penelaah sejawat, pembimbing, atau editor.',
  'Tidak menulis naskah atas nama Anda dan tidak mengubah isi tanpa persetujuan.',
  'Bukan alat deteksi plagiarisme resmi dan tidak menggantikan layanan pemeriksa kemiripan institusi Anda.',
  'Aturan venue masih dalam tahap verifikasi. Profil yang belum diverifikasi diberi peringatan, dan label siap tidak diberikan untuknya.',
  'Tidak mengirim naskah ke jurnal atau konferensi mana pun.',
  'Hasil asisten AI dapat keliru. Periksa kembali setiap usulan sebelum menerimanya.'
]

const FAQ = [
  { q: 'Apa itu Forechek?', a: 'Forechek adalah aplikasi web untuk menyiapkan naskah ilmiah sebelum submit: memeriksa kesiapan terhadap aturan venue, memverifikasi referensi, mengelola versi, dan mengekspor paket LaTeX.' },
  { q: 'Siapa yang cocok memakainya?', a: 'Dosen, peneliti, dan mahasiswa pascasarjana yang menyiapkan naskah untuk jurnal atau konferensi, terutama yang ingin merapikan referensi dan memeriksa persyaratan venue lebih awal.' },
  { q: 'Apakah naskah saya aman?', a: 'Naskah hanya dapat diakses oleh akun Anda. Bagian naskah yang relevan dikirim ke penyedia model AI hanya untuk menjawab permintaan Anda. Anda dapat menghapus proyek atau akun kapan saja. Lihat kebijakan privasi (masih draf).' },
  { q: 'Apakah Forechek menjamin naskah saya diterima?', a: 'Tidak. Forechek menunjukkan hal yang dapat diperbaiki sebelum submit. Penerimaan ditentukan oleh venue.' },
  { q: 'Bagaimana referensi diverifikasi?', a: 'Referensi dicocokkan dengan sumber publik seperti OpenAlex dan Crossref. Hasilnya berupa status per referensi. Yang tidak ditemukan ditandai untuk Anda periksa, tidak dilengkapi dengan data buatan.' },
  { q: 'Venue apa saja yang didukung?', a: 'Saat ini tersedia beberapa profil awal (misalnya IEEE konferensi dan jurnal, serta profil Scopus dan SINTA generik). Aturannya masih perlu diverifikasi, dan antarmuka menampilkan peringatan untuk profil tersebut.' },
  { q: 'Apakah saya dapat memakai Overleaf?', a: 'Ya. Ekspor menghasilkan paket LaTeX dan BibTeX yang dapat diunggah ke Overleaf.' },
  { q: 'Berapa biayanya?', a: 'Akun gratis dapat membuat satu paper trial. Harga paket berbayar belum ditetapkan dan pembayaran belum diaktifkan. Lihat bagian Harga untuk kuota yang berlaku saat ini.' }
]

const fmt = (n) => Number(n).toLocaleString('id-ID')

function SectionTitle({ id, kicker, title, children }) {
  return (
    <div id={id} className="mx-auto max-w-2xl scroll-mt-20 text-center">
      {kicker && <p className="text-xs font-semibold uppercase tracking-widest text-ink-faint">{kicker}</p>}
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h2>
      {children && <p className="mt-3 text-sm leading-6 text-ink-soft sm:text-[1rem]">{children}</p>}
    </div>
  )
}

export default function Landing() {
  const cfg = loadConfig(process.env)
  const plans = [
    { name: 'Trial', tag: 'Gratis', lines: [`${cfg.trialPapers} paper per akun, seumur akun`, `${fmt(cfg.quota.free.tokensPerMonth)} token AI per bulan`, `${fmt(cfg.quota.free.messagesPerMonth)} pesan chat per bulan`, 'Semua fitur persiapan naskah'], cta: { href: '/register', label: 'Daftar gratis' } },
    { name: 'Pro', tag: 'Harga belum ditetapkan', lines: [`${fmt(cfg.quota.pro.tokensPerMonth)} token AI per bulan`, `${fmt(cfg.quota.pro.messagesPerMonth)} pesan chat per bulan`, 'Paper tanpa batas jumlah', 'Pembayaran belum diaktifkan'], cta: null },
    { name: 'Institusi', tag: 'Harga belum ditetapkan', lines: [`${fmt(cfg.quota.institutional.tokensPerMonth)} token AI per bulan`, `${fmt(cfg.quota.institutional.messagesPerMonth)} pesan chat per bulan`, 'Paper tanpa batas jumlah', 'Hubungi pengelola untuk kebutuhan lembaga'], cta: null }
  ]

  return (
    <main>
      <section className="relative overflow-hidden border-b border-base-border">
        <PaperBackdrop count={6} />
        <div className="relative z-10 mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 sm:py-28">
          <p className="inline-block rounded-md border border-base-border bg-white px-3 py-1 text-xs text-ink-soft">Akses awal (beta): fitur dan aturan venue masih disempurnakan</p>
          <h1 className="mt-6 text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-5xl">Siapkan naskah ilmiah Anda dengan teliti sebelum submit</h1>
          <p className="mx-auto mt-5 max-w-2xl text-[1rem] leading-7 text-ink-soft">
            Forechek memeriksa kesiapan naskah terhadap aturan venue tujuan, memverifikasi referensi, dan menyiapkan paket LaTeX untuk Overleaf. Untuk dosen, peneliti, dan mahasiswa pascasarjana. Anda yang memutuskan setiap perubahan.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/register" className="btn-primary px-6 py-3 text-[1rem]">Coba gratis: 1 paper</Link>
            <Link href="/#cara-kerja" className="btn-secondary px-6 py-3 text-[1rem]">Lihat cara kerja</Link>
          </div>
          <p className="mt-4 text-xs text-ink-faint">Tanpa kartu kredit. Akun gratis dapat membuat {cfg.trialPapers} paper trial.</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8" aria-labelledby="masalah">
        <SectionTitle kicker="Masalah" title="Mengapa naskah sering tertahan sebelum dibaca penelaah">Banyak penolakan awal bukan soal ilmu, tetapi soal persiapan.</SectionTitle>
        <h2 id="masalah" className="sr-only">Masalah yang diselesaikan</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {PROBLEMS.map((p) => (
            <div key={p.title} className="card p-6">
              <h3 className="text-[1rem] font-semibold text-ink">{p.title}</h3>
              <p className="mt-2 text-sm leading-6 text-ink-soft">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-base-border bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <SectionTitle id="cara-kerja" kicker="Cara kerja" title="Empat langkah dari naskah ke paket siap unggah" />
          <ol className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-xl border border-base-border bg-base p-6">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-sky-600 text-sm font-semibold text-white">{s.n}</span>
                <h3 className="mt-4 text-[1rem] font-semibold text-ink">{s.title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-soft">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <SectionTitle id="fitur" kicker="Fitur" title="Yang tersedia saat ini" />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-6">
              <h3 className="text-[1rem] font-semibold text-ink">{f.title}</h3>
              <p className="mt-2 text-sm leading-6 text-ink-soft">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-base-border bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2 lg:px-8">
          <div>
            <SectionTitle kicker="Prinsip integritas" title="Cara Forechek menjaga naskah Anda tetap jujur" />
            <ul className="mt-8 space-y-4">
              {PRINCIPLES.map((p) => (
                <li key={p.title} className="border-l-2 border-sky-600 pl-4">
                  <h3 className="text-sm font-semibold text-ink">{p.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-ink-soft">{p.body}</p>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <SectionTitle kicker="Batasan" title="Yang tidak dilakukan Forechek" />
            <ul className="mt-8 space-y-3 text-sm leading-6 text-ink-soft">
              {LIMITS.map((l) => (
                <li key={l} className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-ink-faint" aria-hidden="true" />
                  <span>{l}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <SectionTitle id="harga" kicker="Harga" title="Paket dan kuota">
          Angka kuota di bawah mengikuti konfigurasi sistem saat ini dan masih sementara (provisional). Harga paket berbayar belum ditetapkan.
        </SectionTitle>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {plans.map((p) => (
            <div key={p.name} className="card flex flex-col p-6">
              <h3 className="text-lg font-semibold text-ink">{p.name}</h3>
              <p className="mt-1 text-sm text-ink-faint">{p.tag}</p>
              <ul className="mt-5 flex-1 space-y-2 text-sm text-ink-soft">
                {p.lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
              {p.cta ? <Link href={p.cta.href} className="btn-primary mt-6">{p.cta.label}</Link> : <p className="mt-6 text-xs text-ink-faint">Belum tersedia untuk dibeli.</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-base-border bg-white">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionTitle id="faq" kicker="FAQ" title="Pertanyaan yang sering diajukan" />
          <div className="mt-10 divide-y divide-base-border rounded-xl border border-base-border">
            {FAQ.map((f) => (
              <details key={f.q} className="group px-5 py-4">
                <summary className="cursor-pointer list-none text-sm font-medium text-ink">
                  <span className="flex items-start justify-between gap-4">
                    <span>{f.q}</span>
                    <span className="text-ink-faint group-open:hidden" aria-hidden="true">+</span>
                    <span className="hidden text-ink-faint group-open:inline" aria-hidden="true">-</span>
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-6 text-ink-soft">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-base-border">
        <PaperBackdrop count={4} />
        <div className="relative z-10 mx-auto max-w-2xl px-4 py-16 text-center sm:px-6 sm:py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Mulai dengan satu paper</h2>
          <p className="mt-3 text-sm leading-6 text-ink-soft sm:text-[1rem]">Buat akun gratis, unggah naskah, dan lihat apa yang masih perlu diperbaiki sebelum submit.</p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/register" className="btn-primary px-6 py-3 text-[1rem]">Daftar gratis</Link>
            <Link href="/login" className="btn-secondary px-6 py-3 text-[1rem]">Sudah punya akun? Masuk</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
