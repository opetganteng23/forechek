'use client'
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../lib/clientApi'
import { useConfirm } from '../providers/ConfirmProvider'
import { Alert, inputClass } from '../auth/ui'

const STATUS = {
  verified: ['Terverifikasi', 'border-green-300 bg-green-50 text-green-900'],
  partial: ['Sebagian cocok', 'border-amber-300 bg-amber-50 text-amber-900'],
  unverified: ['Belum terverifikasi', 'border-red-300 bg-red-50 text-red-900'],
  retracted: ['Ditarik (retracted)', 'border-red-400 bg-red-100 text-red-900']
}
const NOTES = {
  DOI_NOT_FOUND: 'DOI tidak ditemukan di sumber.',
  TITLE_MISMATCH: 'Judul tidak cocok dengan karya yang ditunjuk DOI tersebut.',
  RETRACTION_DETECTED: 'Terdeteksi penarikan (retraction). Jangan disitasi.',
  DOI_RESOLVES_ONLY: 'DOI ditemukan, tetapi judul tidak diberikan sehingga metadata tidak dapat dicocokkan.',
  ONLY_TITLE_COMPARED: 'Hanya judul yang dibandingkan. Tambahkan penulis atau tahun agar dapat diverifikasi.',
  METADATA_MISMATCH: 'Sebagian metadata tidak cocok dengan sumber.',
  FOUND_BY_METADATA_NO_DOI: 'Ditemukan lewat metadata tanpa DOI: paling tinggi berstatus sebagian cocok.',
  NOT_FOUND_BY_METADATA: 'Tidak ditemukan di sumber berdasarkan metadata.',
  PROVIDER_UNAVAILABLE: 'Sumber tidak dapat dihubungi; tidak dapat diverifikasi sekarang.',
  METADATA_EDITED_REVERIFY_REQUIRED: 'Metadata diubah manual. Verifikasi ulang diperlukan.'
}
const FIELD = { title: 'judul', first_author: 'penulis pertama', year: 'tahun' }
const ERR = {
  REFERENCE_NOT_VERIFIED: 'Kandidat belum lolos verifikasi sehingga tidak dapat ditambahkan.',
  REFERENCE_DUPLICATE: 'Referensi ini sudah ada di daftar.',
  PROVIDER_NOT_CONFIGURED: 'Penyedia literatur belum dikonfigurasi di server ini.',
  RATE_LIMITED: 'Terlalu banyak permintaan. Tunggu sebentar.',
  PROVIDER_ERROR: 'Semua penyedia literatur gagal merespons.',
  QUOTA_EXCEEDED: 'Batas jumlah referensi per proyek tercapai.'
}
const errText = (e) => (e.details?.code === 'REFERENCE_NOT_VERIFIED' && e.details?.status === 'retracted' ? 'Kandidat ditandai ditarik (retracted) oleh sumber, sehingga tidak ditambahkan.' : ERR[e.details?.code] || ERR[e.code] || e.message)

const noteText = (n) => (n.startsWith('SUGGESTED_DOI:') ? `DOI saran: ${n.slice(14)}` : NOTES[n] || null)
const when = (iso) => {
  try {
    return new Date(iso).toLocaleString('id-ID')
  } catch {
    return iso
  }
}
const authorsText = (a = []) => (a.length ? `${a.slice(0, 3).map((x) => x.family).join(', ')}${a.length > 3 ? ' dkk.' : ''}` : 'penulis tidak diketahui')

function Badge({ status }) {
  const [label, cls] = STATUS[status] || STATUS.unverified
  return <span className={`rounded-md border px-2.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
}

function ProviderTag({ name }) {
  return name === 'fixture' ? (
    <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-900">Data uji (fixture), bukan sumber nyata</span>
  ) : (
    <span className="rounded-md border border-base-border px-2 py-0.5 text-xs text-ink-faint">{name}</span>
  )
}

export default function ReferencesTab({ projectId }) {
  const confirm = useConfirm()
  const [refs, setRefs] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState({ kind: 'error', text: '' })
  const [busy, setBusy] = useState('')
  const [q, setQ] = useState('')
  const [yearFrom, setYearFrom] = useState('')
  const [search, setSearch] = useState(null)
  const [manual, setManual] = useState({ doi: '', title: '', authors: '', year: '' })
  const [manualResult, setManualResult] = useState(null)

  const reload = useCallback(() => apiFetch(`/api/projects/${projectId}/references`).then((d) => setRefs(d.references)), [projectId])

  useEffect(() => {
    reload().catch((e) => setLoadError(e.message))
  }, [reload])

  async function run(key, fn) {
    setBusy(key)
    setNotice({ kind: 'error', text: '' })
    try {
      await fn()
    } catch (e) {
      setNotice({ kind: 'error', text: errText(e) })
    } finally {
      setBusy('')
    }
  }

  const doSearch = (e) => {
    e.preventDefault()
    run('search', async () => {
      const body = { query: q }
      if (yearFrom) body.yearFrom = Number(yearFrom)
      setSearch(await apiFetch(`/api/projects/${projectId}/literature/search`, { method: 'POST', body }))
    })
  }

  const add = async (c) => {
    if (!(await confirm({ title: 'Tambahkan referensi?', message: `"${c.title}" akan diverifikasi ke sumber dan ditambahkan ke daftar bila lolos.`, confirmText: 'Ya, tambahkan' }))) return
    return run(`add-${c.candidateId}`, async () => {
      await apiFetch(`/api/projects/${projectId}/references`, { method: 'POST', body: { candidateId: c.candidateId } })
      await reload()
      setNotice({ kind: 'success', text: 'Referensi ditambahkan setelah lolos verifikasi.' })
    })
  }

  const del = async (r) => {
    if (!(await confirm({ title: `Hapus referensi ${r.citeKey}?`, message: 'Referensi dihapus dari daftar proyek. Sitasi yang menunjuk ke referensi ini akan ditandai belum terverifikasi.', confirmText: 'Ya, hapus', tone: 'danger' }))) return
    run(`del-${r.id}`, async () => {
      await apiFetch(`/api/projects/${projectId}/references/${r.id}`, { method: 'DELETE' })
      await reload()
    })
  }

  const reverify = async (r) => {
    return run(`re-${r.id}`, async () => {
      await apiFetch(`/api/projects/${projectId}/references/${r.id}/reverify`, { method: 'POST' })
      await reload()
      setNotice({ kind: 'info', text: `Verifikasi ulang ${r.citeKey} selesai.` })
    })
  }

  const manualBody = () => {
    const body = {}
    if (manual.doi.trim()) body.doi = manual.doi.trim()
    if (manual.title.trim()) body.title = manual.title.trim()
    if (manual.authors.trim()) body.authors = manual.authors.split(/[;\n]/).map((s) => s.trim()).filter(Boolean)
    if (manual.year.trim()) body.year = Number(manual.year)
    return body
  }

  const submitManual = (save) => async (e) => {
    e.preventDefault()
    if (save && !(await confirm({ title: 'Simpan referensi manual?', message: 'Referensi disimpan dengan status hasil verifikasi (bisa belum terverifikasi).', confirmText: 'Ya, simpan' }))) return
    run('manual', async () => {
      const d = await apiFetch(`/api/projects/${projectId}/references/verify`, { method: 'POST', body: { ...manualBody(), add: save } })
      setManualResult(d.verification)
      if (save) {
        await reload()
        setNotice({ kind: 'info', text: `Disimpan sebagai ${d.added.citeKey} dengan status "${STATUS[d.added.verification.status][0]}".` })
      }
    })
  }

  if (loadError) return <div className="mt-5"><Alert>{loadError}</Alert></div>
  if (!refs) return <p className="mt-5 text-sm text-ink-faint">Memuat referensi...</p>

  return (
    <section className="mt-5 max-w-3xl space-y-8">
      <p className="text-sm text-ink-soft">
        Referensi hanya dianggap sah bila lolos verifikasi ke sumber (DOI, judul, penulis, tahun). Hasil pencarian adalah <strong>kandidat</strong>, bukan referensi terverifikasi. Sitasi di chat yang tidak menunjuk ke referensi terverifikasi di sini akan diganti penanda.
      </p>
      <Alert kind={notice.kind}>{notice.text}</Alert>

      <div>
        <h2 className="text-sm font-semibold text-ink">Daftar referensi proyek ({refs.length})</h2>
        {refs.length === 0 && <p className="mt-2 text-sm text-ink-faint">Belum ada referensi. Cari literatur atau verifikasi referensi manual di bawah.</p>}
        <ul className="mt-2 space-y-3">
          {refs.map((r) => (
            <li key={r.id} className="rounded-xl border border-base-border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded bg-base-muted px-1.5 py-0.5 text-xs">{r.citeKey}</code>
                <Badge status={r.verification.status} />
                {r.provider && <ProviderTag name={r.provider} />}
              </div>
              <p className="mt-2 text-sm font-medium text-ink">{r.title}</p>
              <p className="text-xs text-ink-soft">
                {authorsText(r.authors)} · {r.year || 's.a.'}
                {r.venueName ? ` · ${r.venueName}` : ''}
                {r.doi ? <> · DOI {r.doi}</> : ' · tanpa DOI'}
              </p>
              <p className="mt-1 text-xs text-ink-faint">
                Diperiksa {when(r.verification.checkedAt)}. Cocok: {(r.verification.matchedFields || []).map((f) => FIELD[f] || f).join(', ') || 'tidak ada'}.
                {(r.verification.mismatches || []).length > 0 && <span className="text-red-700"> Tidak cocok: {r.verification.mismatches.map((f) => FIELD[f] || f).join(', ')}.</span>}
              </p>
              {(r.verification.notes || []).map((n) => noteText(n)).filter(Boolean).map((t) => (
                <p key={t} className="mt-1 text-xs text-ink-soft">• {t}</p>
              ))}
              <div className="mt-3 flex gap-2">
                <button onClick={() => reverify(r)} disabled={!!busy} aria-label={`Verifikasi ulang ${r.citeKey}`} className="btn-secondary btn-sm">Verifikasi ulang</button>
                <button onClick={() => del(r)} disabled={!!busy} aria-label={`Hapus referensi ${r.citeKey}`} className="btn btn-sm border-red-200 bg-white text-red-700 hover:bg-red-50">Hapus</button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-ink">Cari literatur</h2>
        <form onSubmit={doSearch} className="mt-2 flex flex-wrap items-end gap-2">
          <div className="grow">
            <label htmlFor="lit-q" className="block text-xs text-ink-soft">Kata kunci</label>
            <input id="lit-q" className={inputClass} value={q} onChange={(e) => setQ(e.target.value)} maxLength={300} placeholder="mis. adaptive sparse attention" />
          </div>
          <div className="w-28">
            <label htmlFor="lit-y" className="block text-xs text-ink-soft">Sejak tahun</label>
            <input id="lit-y" className={inputClass} value={yearFrom} onChange={(e) => setYearFrom(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder="opsional" />
          </div>
          <button disabled={busy === 'search' || q.trim().length < 3} className="rounded-md bg-ink px-5 py-2 text-sm font-medium text-white disabled:opacity-50">{busy === 'search' ? 'Mencari...' : 'Cari'}</button>
        </form>
        {search && (
          <div className="mt-3 space-y-3" aria-live="polite">
            <div className="rounded-xl border border-base-border p-3 text-xs text-ink-soft">
              <p>Diambil {when(search.fetchedAt)} dari: {search.providers.map((p) => `${p.name} (${p.ok ? `${p.count} hasil` : 'gagal'})`).join(', ')}.</p>
              <ul className="mt-1 list-disc pl-4">
                {search.limitations.map((l) => <li key={l}>{l}</li>)}
              </ul>
            </div>
            {search.candidates.length === 0 && <p className="text-sm text-ink-faint">Tidak ada kandidat ditemukan.</p>}
            {search.candidates.map((c) => (
              <div key={c.candidateId} className="rounded-xl border border-base-border p-4">
                <p className="text-sm font-medium text-ink">{c.title}</p>
                <p className="text-xs text-ink-soft">{authorsText(c.authors)} · {c.year || 's.a.'}{c.venueName ? ` · ${c.venueName}` : ''}{c.doi ? ` · DOI ${c.doi}` : ' · tanpa DOI'}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {c.providers.map((p) => <ProviderTag key={p} name={p} />)}
                  {c.retracted && <span className="rounded-md border border-red-400 bg-red-100 px-2 py-0.5 text-xs text-red-900">Ditandai ditarik oleh sumber</span>}
                  {!c.doi && <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-900">Tanpa DOI: tidak dapat berstatus terverifikasi</span>}
                </div>
                {c.abstract && <p className="mt-2 line-clamp-3 text-xs text-ink-soft">{c.abstract}</p>}
                <button onClick={() => add(c)} disabled={!!busy} className="btn-secondary btn-sm mt-3">
                  {busy === `add-${c.candidateId}` ? 'Memverifikasi...' : 'Verifikasi dan tambahkan'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-ink">Verifikasi referensi manual</h2>
        <p className="mt-1 text-xs text-ink-faint">Isi DOI dan/atau judul. Penulis dipisah titik koma. Hasil ditampilkan apa adanya; yang gagal ditandai belum terverifikasi.</p>
        <form className="mt-2 grid gap-2 sm:grid-cols-2" onSubmit={submitManual(false)}>
          <div><label htmlFor="m-doi" className="block text-xs text-ink-soft">DOI</label><input id="m-doi" className={inputClass} value={manual.doi} onChange={(e) => setManual({ ...manual, doi: e.target.value })} placeholder="10.xxxx/xxxxx" /></div>
          <div><label htmlFor="m-year" className="block text-xs text-ink-soft">Tahun</label><input id="m-year" className={inputClass} value={manual.year} onChange={(e) => setManual({ ...manual, year: e.target.value.replace(/\D/g, '').slice(0, 4) })} inputMode="numeric" /></div>
          <div className="sm:col-span-2"><label htmlFor="m-title" className="block text-xs text-ink-soft">Judul</label><input id="m-title" className={inputClass} value={manual.title} onChange={(e) => setManual({ ...manual, title: e.target.value })} maxLength={500} /></div>
          <div className="sm:col-span-2"><label htmlFor="m-authors" className="block text-xs text-ink-soft">Penulis (dipisah titik koma)</label><input id="m-authors" className={inputClass} value={manual.authors} onChange={(e) => setManual({ ...manual, authors: e.target.value })} placeholder="Nama Depan Belakang; Nama Lain" /></div>
          <div className="flex gap-2 sm:col-span-2">
            <button disabled={busy === 'manual' || (!manual.doi.trim() && !manual.title.trim())} className="btn-secondary">Periksa</button>
            <button type="button" onClick={submitManual(true)} disabled={busy === 'manual' || !manual.title.trim()} className="btn-primary">Periksa dan simpan</button>
          </div>
        </form>
        {manualResult && (
          <div className="mt-3 rounded-xl border border-base-border p-3 text-sm" aria-live="polite">
            <div className="flex flex-wrap items-center gap-2"><Badge status={manualResult.status} />{manualResult.provider && <ProviderTag name={manualResult.provider} />}<span className="text-xs text-ink-faint">Diperiksa {when(manualResult.checkedAt)}</span></div>
            {(manualResult.notes || []).map((n) => noteText(n)).filter(Boolean).map((t) => <p key={t} className="mt-1 text-xs text-ink-soft">• {t}</p>)}
            {(manualResult.mismatches || []).length > 0 && <p className="mt-1 text-xs text-red-700">Tidak cocok: {manualResult.mismatches.map((f) => FIELD[f] || f).join(', ')}</p>}
          </div>
        )}
      </div>
    </section>
  )
}
