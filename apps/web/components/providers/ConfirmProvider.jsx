'use client'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

// Dialog konfirmasi untuk SETIAP tindakan yang mengubah data/menghabiskan kuota/keluar akun:
//   const confirm = useConfirm(); const ok = await confirm({ title, message, confirmText, tone })
// tone 'danger' = tindakan merusak (fokus awal pada Batal). Tidak memakai window.confirm (dapat diblokir dan tidak dapat ditata).
const ConfirmContext = createContext(null)

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm harus dipakai di dalam ConfirmProvider')
  return ctx
}

export default function ConfirmProvider({ children }) {
  const [dlg, setDlg] = useState(null)
  const resolver = useRef(null)
  const okRef = useRef(null)
  const cancelRef = useRef(null)
  const lastFocus = useRef(null)

  const confirm = useCallback((opts = {}) => {
    lastFocus.current = typeof document !== 'undefined' ? document.activeElement : null
    return new Promise((resolve) => {
      if (resolver.current) resolver.current(false) // dialog baru menggantikan yang lama (dianggap batal)
      resolver.current = resolve
      setDlg({ title: 'Lanjutkan?', message: '', confirmText: 'Ya, lanjutkan', cancelText: 'Batal', tone: 'default', ...opts })
    })
  }, [])

  const close = useCallback((value) => {
    if (resolver.current) resolver.current(value)
    resolver.current = null
    setDlg(null)
    const el = lastFocus.current
    if (el && typeof el.focus === 'function') setTimeout(() => el.focus(), 0)
  }, [])

  useEffect(() => {
    if (!dlg) return undefined
    ;(dlg.tone === 'danger' ? cancelRef : okRef).current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close(false)
      }
      if (e.key === 'Tab') {
        // fokus terkurung di dalam dialog
        const els = [cancelRef.current, okRef.current].filter(Boolean)
        const i = els.indexOf(document.activeElement)
        e.preventDefault()
        els[(i + (e.shiftKey ? els.length - 1 : 1)) % els.length].focus()
      }
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [dlg, close])

  const danger = dlg && dlg.tone === 'danger'
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dlg && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" data-testid="confirm-root">
          <div className="fc-fade absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => close(false)} aria-hidden="true" />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-desc"
            className="fc-pop relative w-full max-w-md rounded-2xl border border-base-border bg-white p-6 shadow-2xl"
          >
            <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-full font-bold ${danger ? 'bg-red-100 text-red-700' : 'bg-sky-100 text-sky-700'}`} aria-hidden="true">
              {danger ? '!' : '?'}
            </div>
            <h2 id="confirm-title" className="text-lg font-semibold text-ink">{dlg.title}</h2>
            {dlg.message && <p id="confirm-desc" className="mt-2 whitespace-pre-line text-sm text-ink-soft">{dlg.message}</p>}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                ref={cancelRef}
                type="button"
                data-testid="confirm-cancel"
                onClick={() => close(false)}
                className="rounded-full border border-base-border px-5 py-2 text-sm font-medium text-ink-soft transition hover:bg-base-muted focus:outline-none focus:ring-2 focus:ring-sky-400"
              >
                {dlg.cancelText}
              </button>
              <button
                ref={okRef}
                type="button"
                data-testid="confirm-ok"
                onClick={() => close(true)}
                className={`rounded-full px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90 focus:outline-none focus:ring-2 ${danger ? 'bg-red-600 focus:ring-red-300' : 'bg-sky-600 focus:ring-sky-300'}`}
              >
                {dlg.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}
