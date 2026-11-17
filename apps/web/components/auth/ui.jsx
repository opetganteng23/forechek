import Link from 'next/link'
import PaperBackdrop from '../layout/PaperBackdrop'

export function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="relative overflow-hidden">
      <PaperBackdrop count={5} />
      <main className="relative z-10 mx-auto flex min-h-[80vh] max-w-md items-center px-4 py-12 sm:px-6">
        <div className="w-full">
          <Link href="/" data-testid="back-to-landing" className="btn-secondary mb-4">
            Kembali ke beranda
          </Link>
          <div className="card p-6 sm:p-8">
            <img src="/logo.png" alt="Logo AILO" width="147" height="48" className="mb-4 h-10 w-auto" />
            <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-ink-faint">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </div>
          {footer && <p className="mt-5 text-center text-sm text-ink-faint">{footer}</p>}
        </div>
      </main>
    </div>
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

export const inputClass = 'field'

export function Alert({ kind = 'error', children }) {
  if (!children) return null
  const styles =
    kind === 'error'
      ? 'border-red-200 bg-red-50 text-red-800'
      : kind === 'success'
        ? 'border-green-200 bg-green-50 text-green-800'
        : 'border-base-border bg-base-muted text-ink-soft'
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} aria-live="polite" className={`rounded-lg border px-3.5 py-2.5 text-sm ${styles}`}>
      {children}
    </div>
  )
}

export function SubmitButton({ loading, children, loadingText = 'Memproses...' }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="btn-primary w-full"
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
    <Link href={href} className="font-medium text-sky-700 underline underline-offset-2 hover:text-sky-900">
      {children}
    </Link>
  )
}
