'use client'
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../lib/clientApi'
import { useConfirm } from '../providers/ConfirmProvider'
import { Alert, Field, inputClass } from '../auth/ui'
import { Card, ErrorState, PageHeader, Skeleton } from '../ui'

const KEYS = ['free', 'pro', 'institutional']
const TITLE = { free: 'Paket trial (gratis)', pro: 'Paket Pro', institutional: 'Paket Institusi' }

const toForm = (s) => ({
  trialPapers: String(s.trialPapers),
  plans: Object.fromEntries(KEYS.map((k) => {
    const p = s.plans[k]
    return [k, { name: p.name, note: p.note || '', priceMonthlyIdr: p.priceMonthlyIdr === null ? '' : String(p.priceMonthlyIdr), priceYearlyIdr: p.priceYearlyIdr === null ? '' : String(p.priceYearlyIdr), tokensPerMonth: String(p.tokensPerMonth), messagesPerMonth: String(p.messagesPerMonth), features: (p.features || []).join('\n') }]
  }))
})

const num = (v) => (v === '' ? null : Number(v))
const toBody = (f) => ({
  trialPapers: Number(f.trialPapers),
  plans: Object.fromEntries(KEYS.map((k) => {
    const p = f.plans[k]
    return [k, { name: p.name, note: p.note, priceMonthlyIdr: num(p.priceMonthlyIdr), priceYearlyIdr: num(p.priceYearlyIdr), tokensPerMonth: Number(p.tokensPerMonth), messagesPerMonth: Number(p.messagesPerMonth), features: p.features.split('\n').map((x) => x.trim()).filter(Boolean) }]
  }))
})

// Harga paket (khusus SUPERADMIN): nama, catatan, harga bulanan/tahunan (kosong = belum ditetapkan), kuota token/pesan, butir fitur, dan jatah paper trial.
// Perubahan langsung berlaku di landing page, kuota pemakaian, jatah trial, dan pembuatan pembayaran.
export default function AdminPlans() {
  const confirm = useConfirm()
  const [form, setForm] = useState(null)
  const [meta, setMeta] = useState({ customized: false, updatedAt: null })
  const [error, setError] = useState('')
  const [denied, setDenied] = useState(false)
  const [notice, setNotice] = useState({ kind: 'error', text: '' })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      const d = await apiFetch('/api/admin/plans')
      setForm(toForm(d.settings))
      setMeta({ customized: d.settings.customized, updatedAt: d.settings.updatedAt })
    } catch (e) {
      if (e.code === 'FORBIDDEN') setDenied(true)
      else setError(e.message)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const set = (k, field, v) => setForm((f) => ({ ...f, plans: { ...f.plans, [k]: { ...f.plans[k], [field]: v } } }))

  async function save(e) {
    e.preventDefault()
    if (busy) return
    if (!(await confirm({ title: 'Simpan pengaturan paket?', message: 'Harga, kuota, nama paket, dan jatah trial langsung berlaku untuk semua pengguna dan landing page.', confirmText: 'Ya, simpan' }))) return
    setBusy(true)
    setNotice({ kind: 'error', text: '' })
    try {
      const d = await apiFetch('/api/admin/plans', { method: 'PUT', body: toBody(form) })
      setForm(toForm(d.settings))
      setMeta({ customized: d.settings.customized, updatedAt: d.settings.updatedAt })
      setNotice({ kind: 'success', text: 'Pengaturan paket disimpan dan langsung berlaku.' })
    } catch (err) {
      setNotice({ kind: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  if (denied) return <div className="mx-auto max-w-xl py-10"><Alert>Halaman ini khusus superadmin.</Alert></div>
  if (error) return <div><PageHeader title="Harga paket" /><ErrorState message={error} onRetry={load} /></div>
  if (!form) return <div><PageHeader title="Harga paket" /><Skeleton className="h-40 w-full" /></div>

  return (
    <div>
      <PageHeader title="Harga paket" description="Khusus superadmin. Atur harga, kuota, dan jatah trial. Harga kosong berarti belum ditetapkan dan pembayaran paket itu ditolak." />
      <p className="mb-4 text-xs text-ink-faint">{meta.customized ? `Terakhir diubah ${new Date(meta.updatedAt).toLocaleString('id-ID')}.` : 'Belum pernah diubah: memakai nilai bawaan dari konfigurasi server.'}</p>
      <div className="mb-4"><Alert kind={notice.kind}>{notice.text}</Alert></div>

      <form onSubmit={save} className="space-y-6" aria-label="Pengaturan paket">
        <Card title="Trial" description="Jumlah paper gratis seumur akun untuk akun tanpa langganan aktif.">
          <div className="max-w-xs">
            <Field label="Jatah paper trial per akun" id="pl-trial">
              <input id="pl-trial" type="number" min={0} max={1000} required className={inputClass} value={form.trialPapers} onChange={(e) => setForm({ ...form, trialPapers: e.target.value })} />
            </Field>
          </div>
        </Card>

        {KEYS.map((k) => {
          const p = form.plans[k]
          return (
            <Card key={k} title={TITLE[k]}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nama paket" id={`pl-${k}-name`}><input id={`pl-${k}-name`} required maxLength={40} className={inputClass} value={p.name} onChange={(e) => set(k, 'name', e.target.value)} /></Field>
                <Field label="Catatan singkat (opsional)" id={`pl-${k}-note`}><input id={`pl-${k}-note`} maxLength={80} className={inputClass} value={p.note} onChange={(e) => set(k, 'note', e.target.value)} /></Field>
                <Field label="Harga per bulan (Rp)" id={`pl-${k}-pm`} hint={k === 'free' ? 'Isi 0 untuk gratis.' : 'Kosongkan bila belum ditetapkan.'}><input id={`pl-${k}-pm`} type="number" min={0} className={inputClass} value={p.priceMonthlyIdr} onChange={(e) => set(k, 'priceMonthlyIdr', e.target.value)} /></Field>
                <Field label="Harga per tahun (Rp)" id={`pl-${k}-py`} hint="Kosongkan bila tidak ada paket tahunan."><input id={`pl-${k}-py`} type="number" min={0} className={inputClass} value={p.priceYearlyIdr} onChange={(e) => set(k, 'priceYearlyIdr', e.target.value)} /></Field>
                <Field label="Kuota token AI per bulan" id={`pl-${k}-tk`}><input id={`pl-${k}-tk`} type="number" min={0} required className={inputClass} value={p.tokensPerMonth} onChange={(e) => set(k, 'tokensPerMonth', e.target.value)} /></Field>
                <Field label="Kuota pesan chat per bulan" id={`pl-${k}-ms`}><input id={`pl-${k}-ms`} type="number" min={0} required className={inputClass} value={p.messagesPerMonth} onChange={(e) => set(k, 'messagesPerMonth', e.target.value)} /></Field>
              </div>
              <div className="mt-4">
                <Field label="Butir fitur (satu per baris, maksimal 8)" id={`pl-${k}-ft`}>
                  <textarea id={`pl-${k}-ft`} rows={4} className={inputClass} value={p.features} onChange={(e) => set(k, 'features', e.target.value)} />
                </Field>
              </div>
            </Card>
          )
        })}

        <div className="flex gap-3">
          <button type="submit" disabled={busy} className="btn-primary">{busy ? 'Menyimpan...' : 'Simpan pengaturan paket'}</button>
          <button type="button" disabled={busy} className="btn-secondary" onClick={load}>Batalkan perubahan</button>
        </div>
      </form>
    </div>
  )
}
