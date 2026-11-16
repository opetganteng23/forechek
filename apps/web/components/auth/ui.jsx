import Link from 'next/link'

export function AuthShell({ title, subtitle, children, footer }) {
  return (
    <main className="fc-sky mx-auto flex min-h-[80vh] max-w-md items-center px-4 py-12 sm:px-6">
      <div className="fc-hero-in w-full">
        <Link href="/" data-testid="back-to-landing" className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-base-border bg-white/80 px-3.5 py-1.5 text-sm font-medium text-ink-soft shadow-sm backdrop-blur transition hover:-translate-x-0.5 hover:bg-white hover:text-sky-700">
          <span aria-hidden="true">&larr;</span> Kembali ke beranda
        </Link>
        <div className="rounded-2xl border border-base-border bg-white p-6 shadow-lg shadow-sky-900/5 sm:p-8">
          <img src="/logo.png" alt="Logo AILO" width="147" height="48" className="fc-float mb-4 h-12 w-auto" />
          <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-ink-faint">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <p className="mt-5 text-center text-sm text-ink-faint">{footer}</p>}
      </div>
    </main>
  )
}

export function Field({ label, id, hint, children }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-soft">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
    </div>
  )
}

export const inputClass =
  'w-full rounded-xl border border-base-border bg-base px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 disabled:opacity-60'

export function Alert({ kind = 'error', children }) {
  if (!children) return null
  const styles =
    kind === 'error'
      ? 'border-red-200 bg-red-50 text-red-800'
      : kind === 'success'
        ? 'border-green-200 bg-green-50 text-green-800'
        : 'border-base-border bg-base-muted text-ink-soft'
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} aria-live="polite" className={`rounded-xl border px-3.5 py-2.5 text-sm ${styles}`}>
      {children}
    </div>
  )
}

export function SubmitButton({ loading, children, loadingText = 'Memproses...' }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full rounded-full bg-sky-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? loadingText : children}
    </button>
  )
}

export function Divider({ children }) {
  return (
    <div className="relative my-5 flex items-center">
      <div className="flex-grow border-t border-base-border" />
      <span className="mx-3 text-xs uppercase tracking-wide text-ink-faint">{children}</span>
      <div className="flex-grow border-t border-base-border" />
    </div>
  )
}

export function TextLink({ href, children }) {
  return (
    <Link href={href} className="font-medium text-indigo-600 hover:text-indigo-700">
      {children}
    </Link>
  )
}
