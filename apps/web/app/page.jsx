import Link from 'next/link'

const CORE_FEATURES = [
  {
    title: 'Overall Score & Grade',
    desc: 'Skor 0–100 dengan grade A/B/C/D berdasarkan standar editor jurnal.'
  },
  {
    title: 'Similarity Index',
    desc: 'Estimasi tingkat kemiripan naskah dengan literatur yang sudah ada.'
  },
  {
    title: 'Analisis per Bagian',
    desc: 'Feedback spesifik untuk Title, Abstract, Introduction, Methodology, Results, Discussion, Conclusion, References.'
  },
  {
    title: 'Rekomendasi Jurnal',
    desc: 'Saran jurnal berdasarkan topik dan skor — SINTA 1–4 hingga Scopus Q1–Q4.'
  },
  {
    title: 'Fokus Perbaikan',
    desc: 'Daftar prioritas perbaikan yang paling berdampak pada naskah Anda.'
  },
  {
    title: 'Kalkulator KUM',
    desc: 'Hitung nilai KUM otomatis berdasarkan jenis publikasi dan peran penulis.'
  }
]

const PLANS = [
  {
    name: 'Free',
    price: 'Rp0',
    period: '/selamanya',
    features: ['2 analisis per bulan', 'Skor & feedback per bagian', 'Rekomendasi jurnal dasar'],
    cta: 'Mulai Gratis',
    highlighted: false
  },
  {
    name: 'Pro',
    price: 'Rp99rb',
    period: '/bulan',
    features: ['Analisis tanpa batas', 'Export laporan PDF', 'Kalkulator KUM', 'Riwayat lengkap'],
    cta: 'Upgrade ke Pro',
    highlighted: true
  },
  {
    name: 'Institutional',
    price: 'Custom',
    period: '',
    features: ['Multi-user', 'Dashboard admin', 'Dukungan prioritas'],
    cta: 'Hubungi Kami',
    highlighted: false
  }
]

export default function HomePage() {
  return (
    <main>
      {/* Hero */}
      <section className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-16 text-center sm:px-6 sm:py-24 lg:px-8 lg:py-28">
        <span className="rounded-full border border-base-border bg-base-soft px-4 py-1.5 text-xs font-medium text-ink-soft sm:text-sm">
          Analisis naskah dalam hitungan menit, bukan bulan
        </span>
        <h1 className="max-w-3xl text-3xl font-bold tracking-tight text-ink sm:text-4xl md:text-5xl lg:text-6xl">
          Cek Kesiapan Publikasi Naskah Ilmiah Anda
        </h1>
        <p className="max-w-xl text-base text-ink-soft sm:text-lg">
          Dapatkan skor, feedback per bagian, dan rekomendasi jurnal berbasis AI —
          sebelum naskah Anda disubmit ke jurnal ilmiah.
        </p>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Link
            href="/register"
            className="w-full rounded-full bg-ink px-6 py-3 text-center text-sm font-medium text-base shadow-sm transition-opacity hover:opacity-90 sm:w-auto sm:text-base"
          >
            Mulai Analisis Gratis
          </Link>
          <Link
            href="#fitur"
            className="w-full rounded-full border border-base-border bg-base-soft px-6 py-3 text-center text-sm font-medium text-ink transition-colors hover:bg-base-muted sm:w-auto sm:text-base"
          >
            Lihat Fitur
          </Link>
        </div>
      </section>

      {/* Features */}
      <section id="fitur" className="border-t border-base-border bg-base-soft">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Fitur Utama</h2>
            <p className="mt-3 text-ink-soft">
              Semua yang Anda butuhkan untuk mengetahui kelemahan naskah sebelum ditolak editor.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-4 sm:mt-12 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
            {CORE_FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-base-border bg-base p-6 shadow-sm"
              >
                <h3 className="text-base font-semibold text-ink">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-faint">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="harga" className="border-t border-base-border">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Paket Berlangganan</h2>
            <p className="mt-3 text-ink-soft">Mulai gratis, upgrade kapan saja saat Anda butuh lebih.</p>
          </div>

          <div className="mx-auto mt-10 grid max-w-4xl grid-cols-1 gap-6 sm:mt-12 md:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`flex flex-col rounded-2xl border p-6 sm:p-8 ${
                  plan.highlighted
                    ? 'border-ink bg-ink text-base shadow-lg md:-translate-y-2'
                    : 'border-base-border bg-base-soft text-ink'
                }`}
              >
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-bold">{plan.price}</span>
                  <span className={plan.highlighted ? 'text-base/70' : 'text-ink-faint'}>{plan.period}</span>
                </p>
                <ul className="mt-6 flex flex-1 flex-col gap-3 text-sm">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <span aria-hidden className="mt-0.5">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/register"
                  className={`mt-8 rounded-full px-5 py-2.5 text-center text-sm font-medium transition-opacity hover:opacity-90 ${
                    plan.highlighted ? 'bg-base text-ink' : 'bg-ink text-base'
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
