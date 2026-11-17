'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '../../lib/clientApi'
import { useConfirm } from '../providers/ConfirmProvider'
import { Alert } from '../auth/ui'

const BAND = { siap: 'Siap', revisi_minor: 'Revisi minor', revisi_major: 'Revisi mayor', belum_siap: 'Belum siap' }
const BAND_CLS = { siap: 'border-green-300 bg-green-50 text-green-900', revisi_minor: 'border-amber-300 bg-amber-50 text-amber-900', revisi_major: 'border-orange-300 bg-orange-50 text-orange-900', belum_siap: 'border-red-300 bg-red-50 text-red-900' }
const STATUS = {
  pass: ['Lulus', 'border-green-300 bg-green-50 text-green-900'],
  warn: ['Peringatan', 'border-amber-300 bg-amber-50 text-amber-900'],
  fail: ['Gagal', 'border-red-300 bg-red-50 text-red-900'],
  not_applicable: ['Tidak berlaku', 'border-base-border text-ink-faint'],
  manual_review: ['Tinjau manual', 'border-indigo-300 bg-indigo-50 text-indigo-900']
}
const GROUP = { structure: 'Struktur', abstract: 'Abstrak dan kata kunci', citations: 'Sitasi', references: 'Referensi', blind: 'Anonimitas', length: 'Panjang', declarations: 'Deklarasi' }
const REASON = {
  SECTION_MISSING: 'bagian yang dibutuhkan tidak tersedia',
  INSUFFICIENT_TEXT: 'teks terlalu pendek',
  AI_NOT_CONFIGURED: 'layanan AI belum dikonfigurasi',
  JUDGE_UNAVAILABLE: 'penilai AI tidak tersedia',
  JUDGE_OUTPUT_INVALID: 'keluaran penilai tidak valid',
  EVIDENCE_NOT_FOUND: 'tidak ada bukti kutipan yang valid pada teks',
  MODEL_ABSTAINED: 'bukti tidak cukup menurut penilai',
  NO_REFERENCES: 'belum ada referensi'
}
const ERR = {
  NO_MANUSCRIPT: 'Proyek belum memiliki naskah tersimpan. Simpan naskah di tab Naskah dulu.',
  VENUE_UNKNOWN: 'Venue proyek tidak dikenal. Pilih venue dari daftar.',
  QUOTA_EXCEEDED: 'Kuota pemakaian AI bulan ini habis (batas sementara).',
  REQUEST_IN_PROGRESS: 'Laporan sebelumnya masih diproses. Tunggu sebentar.',
  RATE_LIMITED: 'Terlalu banyak permintaan. Tunggu sebentar.'
}
const errText = (e) => ERR[e.details?.code] || ERR[e.code] || e.message
const when = (iso) => {
  try {
    return new Date(iso).toLocaleString('id-ID')
  } catch {
    return iso || ''
  }
}

function Badge({ status }) {
  const [label, cls] = STATUS[status] || STATUS.manual_review
  return <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
}

function Overall({ o }) {
  const scored = o.status === 'scored'
  return (
    <div className="rounded-xl border border-base-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-ink">Ringkasan kesiapan</h3>
        <span className="rounded-md border border-amber-400 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">PROVISIONAL</span>
      </div>
      {scored ? (
        <p className="mt-2 flex flex-wrap items-center gap-3">
          <span className={`rounded-md border px-3 py-1 text-sm font-semibold ${BAND_CLS[o.band]}`}>{BAND[o.band]}</span>
          <span className="text-2xl font-bold text-ink">{o.score}<span className="text-sm font-normal text-ink-faint">/100</span></span>
        </p>
      ) : (
        <p className="mt-2 text-sm font-medium text-ink">Tidak dapat dinilai: bukti tidak cukup. Skor dan label tidak diberikan.</p>
      )}
      <p className="mt-2 text-xs text-ink-soft">Formula {o.formulaVersion}. {o.approval} Cakupan kriteria yang dinilai: {Math.round(o.coverage * 100)}%.</p>
      {(o.reasons || []).map((r) => <p key={r} className="mt-1 text-xs text-ink-soft">• {r}</p>)}
      {(o.blockers || []).length > 0 && (
        <div className="mt-2 rounded-xl border border-red-300 bg-red-50 p-2 text-xs text-red-900">
          <strong>Critical blocker:</strong> {o.blockers.map((b) => b.label).join('; ')}
        </div>
      )}
    </div>
  )
}

export default function ReportTab({ projectId, project, onProjectChange }) {
  const confirm = useConfirm()
  const [venues, setVenues] = useState(null)
  const [reports, setReports] = useState([])
  const [current, setCurrent] = useState(null)
  const [notice, setNotice] = useState({ kind: 'error', text: '' })
  const [running, setRunning] = useState(false)
  const [loadError, setLoadError] = useState('')
  const timer = useRef(null)
  const alive = useRef(true)

  const refreshList = useCallback(() => apiFetch(`/api/projects/${projectId}/reports`).then((d) => { if (alive.current) setReports(d.reports); return d }), [projectId])

  const open = useCallback(async (id) => {
    const d = await apiFetch(`/api/projects/${projectId}/reports/${id}`)
    if (alive.current) setCurrent(d.report)
    return d.report
  }, [projectId])

  // Pantau satu laporan sampai selesai. Berhenti saat komponen dilepas; satu pemantau aktif sekaligus.
  const watch = useCallback((id) => {
    clearTimeout(timer.current)
    setRunning(true)
    const poll = async () => {
      if (!alive.current) return
      try {
        const r = await open(id)
        if (!alive.current) return
        if (r.status === 'queued' || r.status === 'running') timer.current = setTimeout(poll, 1000)
        else {
          setRunning(false)
          refreshList().catch(() => {})
          if (r.status === 'failed') setNotice({ kind: 'error', text: `Laporan gagal (${r.errorCode || 'galat'}). Coba lagi.` })
        }
      } catch (e) {
        if (!alive.current) return
        setRunning(false)
        setNotice({ kind: 'error', text: errText(e) })
      }
    }
    poll()
  }, [open, refreshList])

  useEffect(() => {
    alive.current = true
    Promise.all([apiFetch('/api/venues'), refreshList()])
      .then(([v, l]) => {
        if (!alive.current) return
        setVenues(v.venues)
        const active = (l.reports || []).find((r) => r.status === 'queued' || r.status === 'running')
        if (active) watch(active.id) // lanjutkan laporan yang masih berjalan setelah muat ulang/pindah tab
      })
      .catch((e) => alive.current && setLoadError(e.message))
    return () => { alive.current = false; clearTimeout(timer.current) }
  }, [refreshList, watch])

  async function chooseVenue(slug) {
    setNotice({ kind: 'error', text: '' })
    try {
      const d = await apiFetch(`/api/projects/${projectId}`, { method: 'PATCH', body: { venueSlug: slug || null } })
      onProjectChange(d.project)
    } catch (e) {
      setNotice({ kind: 'error', text: errText(e) })
    }
  }

  async function runReport() {
    if (!(await confirm({ title: 'Jalankan pemeriksaan kesiapan?', message: 'Pemeriksaan memakai versi naskah tersimpan dan dapat memakai kuota AI Anda. Hasil bersifat bantuan dan sementara.', confirmText: 'Ya, jalankan' }))) return
    setRunning(true)
    setCurrent(null)
    setNotice({ kind: 'error', text: '' })
    try {
      const d = await apiFetch(`/api/projects/${projectId}/report`, { method: 'POST', body: {} })
      watch(d.report.id)
    } catch (e) {
      setRunning(false)
      setNotice({ kind: 'error', text: errText(e) })
    }
  }

  if (loadError) return <div className="mt-5"><Alert>{loadError}</Alert></div>
  if (!venues) return <p className="mt-5 text-sm text-ink-faint">Memuat...</p>

  const venue = venues.find((v) => v.slug === project.venueSlug) || null
  const result = current && current.status === 'completed' ? current.result : null
  const groups = result ? [...new Set(result.deterministic.map((c) => c.group))] : []

  return (
    <section className="mt-5 max-w-3xl space-y-6">
      <p className="text-sm text-ink-soft">
        Pemeriksaan kesiapan terhadap aturan venue dan rubrik. Hasil adalah <strong>bantuan</strong>, bukan prediksi keputusan editor. Rumus dan ambang masih <strong>provisional</strong>.
      </p>
      <Alert kind={notice.kind}>{notice.text}</Alert>

      <div className="rounded-xl border border-base-border p-4">
        <label htmlFor="venue-select" className="block text-sm font-semibold text-ink">Venue target</label>
        <select id="venue-select" value={project.venueSlug || ''} onChange={(e) => chooseVenue(e.target.value)} className="mt-2 w-full rounded-lg border border-base-border bg-base px-2 py-1.5 text-sm">
          <option value="">Tanpa venue (aturan umum)</option>
          {venues.map((v) => <option key={v.slug} value={v.slug}>{v.name}</option>)}
        </select>
        {project.venueSlug && !venue && <p className="mt-2 text-xs text-red-700">Venue proyek ({project.venueSlug}) tidak dikenal. Pilih venue dari daftar.</p>}
        {venue && (
          <div className="mt-3 space-y-1 text-xs text-ink-soft">
            {!venue.freshness.trustworthy && (
              <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-2 text-amber-900">
                <strong>Aturan venue ini belum dapat dipercaya ({venue.freshness.state}).</strong> {venue.freshness.reasons.join(' ')} Label "siap" tidak akan diberikan.
              </div>
            )}
            <p>Jenis: {venue.kind}. Gaya sitasi: {venue.referenceStyle}. Bagian wajib: {venue.requiredSections.join(', ')}. Deklarasi wajib: {venue.requiredDeclarations.join(', ') || 'tidak ada'}.</p>
            <p>Sumber aturan: {venue.sources.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="mr-2 underline">{s.title}</a>)}</p>
            <p>{venue.provenance}</p>
          </div>
        )}
        <button onClick={runReport} disabled={running} className="btn-primary mt-4">
          {running ? 'Memeriksa...' : 'Jalankan pemeriksaan kesiapan'}
        </button>
      </div>

      {running && <p className="text-sm text-ink-soft" aria-live="polite">Laporan diproses di server. Halaman ini memantau hasilnya.</p>}

      {result && (
        <div className="space-y-5" aria-live="polite">
          <Overall o={result.overall} />
          <p className="text-xs text-ink-faint">
            Naskah versi {current.versionNumber}. Venue: {result.venue ? `${result.venue.slug} v${result.venue.version}` : 'tanpa venue'}. Rubrik {result.versions.rubric}, prompt {result.versions.prompt}, pemeriksaan {result.versions.checks}. Penilai AI: {result.model ? `${result.model.provider} (${result.model.id})` : 'tidak dipakai'}.
            {result.model && result.model.provider === 'fake' && <span className="ml-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-900">Penilai palsu (uji), bukan Claude</span>}
          </p>

          <div>
            <h3 className="text-sm font-semibold text-ink">Pemeriksaan deterministik</h3>
            {groups.map((g) => (
              <div key={g} className="mt-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{GROUP[g] || g}</h4>
                <ul className="mt-1 space-y-2">
                  {result.deterministic.filter((c) => c.group === g).map((c) => (
                    <li key={c.checkId} className="rounded-xl border border-base-border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge status={c.status} />
                        <span className="text-sm font-medium text-ink">{c.label}</span>
                        {c.critical && c.status === 'fail' && <span className="rounded-md border border-red-400 bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-900">critical</span>}
                      </div>
                      <p className="mt-1 text-xs text-ink-soft">{c.detail}</p>
                      {c.limitation && <p className="mt-1 text-xs text-ink-faint">Batasan: {c.limitation}</p>}
                      {c.evidence.slice(0, 3).map((e, i) => <p key={i} className="mt-1 truncate text-xs text-ink-faint">baris {e.line}: {e.snippet}</p>)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-ink">Kriteria rubrik</h3>
            <ul className="mt-2 space-y-2">
              {result.criteria.map((c) => (
                <li key={c.id} className="rounded-xl border border-base-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink">{c.label}</span>
                    {c.status === 'assessed' ? <span className="rounded-md border border-base-border px-2 py-0.5 text-xs">{c.score}/4</span> : <span className="rounded-md border border-base-border px-2 py-0.5 text-xs text-ink-faint">Tidak dinilai: {REASON[c.reason] || c.reason}</span>}
                    <span className="text-xs text-ink-faint">bobot {c.weight}{c.source === 'deterministic' ? ', dihitung kode' : ''}</span>
                  </div>
                  <p className="mt-1 text-xs text-ink-soft">{c.rationale}</p>
                  {c.evidence.map((e, i) => <p key={i} className="mt-1 text-xs italic text-ink-faint">"{e.quote}" ({e.section}, baris {e.line})</p>)}
                  {(c.suggestions || []).map((s) => <p key={s} className="mt-1 text-xs text-ink-soft">Saran: {s}</p>)}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-ink">Keterbatasan</h3>
            <ul className="mt-1 list-disc pl-5 text-xs text-ink-soft">{result.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-ink">Riwayat laporan</h3>
        {reports.length === 0 && <p className="mt-1 text-sm text-ink-faint">Belum ada laporan.</p>}
        <ul className="mt-2 space-y-1">
          {reports.map((r) => (
            <li key={r.id}>
              <button onClick={() => { clearTimeout(timer.current); setRunning(false); open(r.id).catch((e) => setNotice({ kind: 'error', text: errText(e) })) }} className="w-full rounded-xl border border-base-border px-3 py-2 text-left text-xs hover:bg-base-soft">
                {when(r.createdAt)} · naskah v{r.versionNumber} · {r.venueSlug || 'tanpa venue'} · {r.status}{r.result && r.result.overall && r.result.overall.band ? ` · ${BAND[r.result.overall.band]} (${r.result.overall.score})` : ''}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
