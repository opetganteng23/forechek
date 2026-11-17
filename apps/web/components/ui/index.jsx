// Komponen UI bersama (satu sistem untuk seluruh aplikasi). Gaya dasar ada di globals.css (btn-*, field, card, badge, table-base, skeleton).

export function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-ink-faint">{description}</p>}
      </div>
      {actions && <div className="flex flex-none flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ title, description, actions, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-base-border px-5 py-3.5">
          <div>
            {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-ink-faint">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  )
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="rounded-xl border border-dashed border-base-border bg-white px-6 py-10 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {children && <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-faint">{children}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

export function Skeleton({ className = 'h-4 w-full' }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />
}

export function ListSkeleton({ rows = 3 }) {
  return (
    <div className="space-y-3" role="status" aria-label="Memuat">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card p-4">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="mt-3 h-3 w-3/4" />
        </div>
      ))}
    </div>
  )
}

// Pesan galat ramah dengan tombol coba lagi.
export function ErrorState({ message, onRetry }) {
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-900">
      <p className="font-medium">Terjadi masalah</p>
      <p className="mt-1">{message || 'Data tidak dapat dimuat. Periksa koneksi Anda lalu coba lagi.'}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-secondary btn-sm mt-3">Coba lagi</button>
      )}
    </div>
  )
}

export function Badge({ tone = 'neutral', children }) {
  const cls = tone === 'ok' ? 'badge-ok' : tone === 'warn' ? 'badge-warn' : tone === 'bad' ? 'badge-bad' : 'badge'
  return <span className={cls}>{children}</span>
}
