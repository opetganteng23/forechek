const STATS = [
  { label: 'Naskah Diunggah', value: '0' },
  { label: 'Analisis Selesai', value: '0' },
  { label: 'Kuota Tersisa', value: '2 / bulan' }
]

const QUICK_LINKS = [
  { title: 'Riwayat Analisis', desc: 'Lihat hasil analisis naskah sebelumnya', href: '/dashboard/analyses' },
  { title: 'Naskah Saya', desc: 'Kelola naskah yang sudah diunggah', href: '/dashboard/manuscripts' },
  { title: 'Database Jurnal', desc: 'Cari jurnal sesuai bidang & ranking', href: '/dashboard/journals' },
  { title: 'Kalkulator KUM', desc: 'Hitung nilai KUM publikasi Anda', href: '/dashboard/kum' }
]

export default function DashboardPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Dashboard</h1>
        <p className="text-sm text-ink-faint sm:text-base">
          Overview aktivitas dan statistik analisis naskah Anda.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {STATS.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-base-border bg-base-soft p-5 sm:p-6"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint sm:text-sm">
              {stat.label}
            </p>
            <p className="mt-2 text-2xl font-bold text-ink sm:text-3xl">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-10">
        <h2 className="text-lg font-semibold text-ink sm:text-xl">Menu Cepat</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_LINKS.map((link) => (
            <a
              key={link.title}
              href={link.href}
              className="flex flex-col rounded-2xl border border-base-border bg-base p-5 shadow-sm transition-colors hover:bg-base-soft"
            >
              <span className="text-sm font-semibold text-ink">{link.title}</span>
              <span className="mt-1.5 text-xs text-ink-faint sm:text-sm">{link.desc}</span>
            </a>
          ))}
        </div>
      </div>
    </main>
  )
}
