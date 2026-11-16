import Link from 'next/link'
import Reveal from '../components/landing/Reveal'

// Landing page tema "cloud white". Teks mengikuti fitur yang BENAR-BENAR ada (jujur tentang batas; tanpa testimoni/angka karangan).
const FEATURES = [
  { icon: '🔎', title: 'Referensi terverifikasi', desc: 'Cari literatur, verifikasi DOI dan metadata ke sumber, dan simpan hanya referensi yang cocok. Sitasi tanpa referensi terverifikasi ditandai, bukan ditampilkan.' },
  { icon: '🤖', title: 'Asisten per proyek', desc: 'Chat dengan asisten AI yang membaca naskah Anda. AI hanya mengusulkan; naskah berubah hanya setelah Anda menerima, dan setiap penerimaan menjadi versi baru.' },
  { icon: '✅', title: 'Pemeriksaan kesiapan', desc: 'Struktur, sitasi, dan kelengkapan diperiksa terhadap profil venue, dengan bukti berlokasi. Aturan venue dan rumus skor masih sementara dan ditandai jelas.' },
  { icon: '🕘', title: 'Versi naskah', desc: 'Simpan setiap perubahan sebagai versi, bandingkan, dan pulihkan kapan saja. Mendukung naskah Markdown dan LaTeX.' },
  { icon: '📦', title: 'Ekspor LaTeX dan BibTeX', desc: 'Unduh paket ZIP berisi main.tex dan references.bib (hanya referensi terverifikasi) beserta peringatan hal yang perlu diperiksa sebelum submit.' },
  { icon: '📊', title: 'Indikator opsional', desc: 'Kecocokan literal terhadap abstrak referensi Anda dan statistik gaya penulisan sebagai angka deskriptif. Bukan penilaian orisinalitas atau penulis.' }
]

const STEPS = [
  { n: '1', title: 'Daftar dan buat paper', desc: 'Akun gratis langsung mendapat 1 paper trial.' },
  { n: '2', title: 'Tempel atau unggah naskah', desc: 'Markdown atau LaTeX; struktur terbaca otomatis.' },
  { n: '3', title: 'Verifikasi dan perbaiki', desc: 'Cek referensi, tanya asisten, terima atau tolak usulan.' },
  { n: '4', title: 'Ekspor dan submit', desc: 'Unduh paket LaTeX dan BibTeX yang siap diperiksa akhir.' }
]

const MARQUEE = ['Referensi terverifikasi', 'Versi naskah', 'Usulan edit terkontrol', 'Ekspor LaTeX', 'Pemeriksaan venue', 'BibTeX bersih', 'Sitasi aman dari rekaan', 'Markdown dan LaTeX']

function Cloud({ className = '', style }) {
  return (
    <svg viewBox="0 0 200 80" className={className} style={style} aria-hidden="true" focusable="false">
      <path d="M50 70c-16 0-30-10-30-24s12-24 28-24c4-14 18-22 34-22 20 0 34 12 38 28 18 0 30 10 30 22s-12 20-28 20H50z" fill="currentColor" />
    </svg>
  )
}

export default function HomePage() {
  return (
    <main className="overflow-x-hidden">
      {/* Hero */}
      <section className="fc-sky relative isolate">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
          <Cloud className="fc-drift absolute left-0 top-12 w-48 text-white opacity-90 drop-shadow-sm" />
          <Cloud className="fc-drift absolute top-40 w-72 text-white opacity-80" style={{ animationDuration: '95s', animationDelay: '-30s' }} />
          <Cloud className="fc-drift absolute top-72 w-40 text-sky-100 opacity-90" style={{ animationDuration: '55s', animationDelay: '-12s' }} />
          <div className="fc-float-slow absolute right-[8%] top-24 h-40 w-40 rounded-full bg-sky-200/50 blur-3xl" />
          <div className="fc-float absolute bottom-10 left-[10%] h-48 w-48 rounded-full bg-indigo-200/40 blur-3xl" />
        </div>

        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 pb-20 pt-16 text-center sm:px-6 sm:pb-28 sm:pt-24 lg:px-8">
          <span className="fc-hero-in rounded-full border border-sky-200 bg-white/80 px-4 py-1.5 text-xs font-medium text-sky-800 shadow-sm backdrop-blur sm:text-sm">
            Akses awal (beta) - fitur dan aturan venue masih disempurnakan
          </span>
          <img src="/logo.png" alt="Logo AILO" width="245" height="80" className="fc-float fc-pulse h-20 w-auto rounded-3xl bg-white px-5 py-3 shadow-lg" style={{ animationDelay: '.1s' }} />
          <h1 className="fc-hero-in max-w-3xl text-3xl font-bold tracking-tight text-ink sm:text-4xl md:text-5xl lg:text-6xl" style={{ animationDelay: '.15s' }}>
            Siapkan naskah ilmiah Anda dengan <span className="fc-gradient-text">Forechek</span>
          </h1>
          <p className="fc-hero-in max-w-xl text-base text-ink-soft sm:text-lg" style={{ animationDelay: '.3s' }}>
            Referensi yang bisa dipertanggungjawabkan, pemeriksaan kesiapan terhadap aturan venue, dan paket LaTeX siap unggah, sebelum naskah Anda disubmit.
          </p>
          <div className="fc-hero-in flex w-full flex-col gap-3 sm:w-auto sm:flex-row" style={{ animationDelay: '.45s' }}>
            <Link href="/register" className="fc-sheen w-full rounded-full bg-sky-600 px-7 py-3 text-center text-sm font-semibold text-white shadow-lg shadow-sky-600/30 transition hover:-translate-y-0.5 hover:bg-sky-700 sm:w-auto sm:text-base">
              Coba gratis: 1 paper
            </Link>
            <Link href="#fitur" className="w-full rounded-full border border-sky-200 bg-white/80 px-7 py-3 text-center text-sm font-medium text-ink backdrop-blur transition hover:-translate-y-0.5 hover:bg-white sm:w-auto sm:text-base">
              Lihat fitur
            </Link>
          </div>
          <p className="fc-hero-in text-xs text-ink-faint" style={{ animationDelay: '.6s' }}>Tanpa kartu kredit. Akun gratis dapat membuat 1 paper trial.</p>
        </div>

        {/* gelombang awan pembatas */}
        <svg viewBox="0 0 1440 80" className="block w-full text-white" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path d="M0 40c120 40 240 40 360 10s240-40 360-10 240 50 360 20 240-40 360-10v30H0z" fill="currentColor" />
        </svg>
      </section>

      {/* Marquee */}
      <section className="overflow-hidden border-y border-base-border bg-white py-4" aria-label="Kemampuan utama">
        <div className="fc-marquee flex w-max gap-10 whitespace-nowrap text-sm font-medium text-ink-soft">
          {[...MARQUEE, ...MARQUEE].map((t, i) => (
            <span key={i} className="flex items-center gap-10">
              {t}
              <span className="text-sky-400" aria-hidden="true">☁</span>
            </span>
          ))}
        </div>
      </section>

      {/* Fitur */}
      <section id="fitur" className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Fitur</h2>
            <p className="mt-3 text-ink-soft">Alat bantu persiapan, bukan jaminan diterimanya naskah. Hasil dan skor adalah bantuan dan tidak memprediksi keputusan editor atau reviewer.</p>
          </Reveal>
          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 120}>
                <div className="fc-card h-full rounded-2xl border border-base-border bg-gradient-to-b from-white to-sky-50/60 p-6 shadow-sm">
                  <div className="fc-float mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-2xl" style={{ animationDelay: `${i * 0.4}s` }} aria-hidden="true">{f.icon}</div>
                  <h3 className="text-base font-semibold text-ink">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Cara kerja */}
      <section className="fc-sky">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Cara kerja</h2>
            <p className="mt-3 text-ink-soft">Empat langkah dari naskah mentah sampai paket siap diperiksa akhir.</p>
          </Reveal>
          <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <Reveal as="li" key={s.n} delay={i * 130} className="list-none">
                <div className="fc-card relative h-full rounded-2xl border border-base-border bg-white p-6 text-center shadow-sm">
                  <span className="fc-pulse mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-sky-600 text-lg font-bold text-white">{s.n}</span>
                  <h3 className="font-semibold text-ink">{s.title}</h3>
                  <p className="mt-2 text-sm text-ink-soft">{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* Trial / CTA */}
      <section className="bg-white">
        <Reveal className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-sky-500 via-sky-600 to-indigo-600 p-8 text-center text-white shadow-xl sm:p-12">
            <Cloud className="fc-drift absolute -top-4 left-0 w-40 text-white/20" />
            <Cloud className="fc-float absolute -bottom-6 right-6 w-48 text-white/15" />
            <h2 className="relative text-2xl font-bold sm:text-3xl">Mulai dengan 1 paper gratis</h2>
            <p className="relative mx-auto mt-3 max-w-lg text-sky-50">Daftar, buat paper trial, dan coba semua alurnya. Paket dan harga belum ditetapkan selama masa akses awal; akan diumumkan sebelum ada pembayaran apa pun.</p>
            <div className="relative mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/register" className="fc-sheen rounded-full bg-white px-7 py-3 text-sm font-semibold text-sky-700 shadow-lg transition hover:-translate-y-0.5 sm:text-base">Daftar sekarang</Link>
              <Link href="/login" className="rounded-full border border-white/60 px-7 py-3 text-sm font-medium text-white transition hover:bg-white/10 sm:text-base">Sudah punya akun? Masuk</Link>
            </div>
          </div>
          <p className="mt-6 text-center text-xs text-ink-faint">
            Dengan mendaftar Anda menyetujui draf <Link href="/terms" className="underline">Syarat Layanan</Link> dan <Link href="/privacy" className="underline">Kebijakan Privasi</Link>.
          </p>
        </Reveal>
      </section>
    </main>
  )
}
