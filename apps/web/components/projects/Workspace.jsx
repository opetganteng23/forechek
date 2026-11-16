'use client'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { parseManuscript, normalizeSource } from '@publication-prepare/manuscript/src/parser'
import { apiFetch } from '../../lib/clientApi'
import { Alert } from '../auth/ui'
import VersionsTab from './VersionsTab'
import SettingsTab from './SettingsTab'
import ChatTab from './ChatTab'
import ReferencesTab from './ReferencesTab'
import ReportTab from './ReportTab'
import { useConfirm } from '../providers/ConfirmProvider'
import EditsTab from './EditsTab'
import ExportTab from './ExportTab'
import IndicatorsTab from './IndicatorsTab'

const MAX_BYTES = 1_000_000
const CONF = {
  high: ['Struktur terdeteksi baik', 'bg-green-50 text-green-800 border-green-200'],
  medium: ['Struktur sebagian terdeteksi', 'bg-amber-50 text-amber-800 border-amber-200'],
  low: ['Struktur sulit dideteksi', 'bg-red-50 text-red-800 border-red-200']
}
const KEY_LABEL = {
  abstract: 'Abstrak', introduction: 'Pendahuluan', related_work: 'Tinjauan pustaka', methodology: 'Metode',
  results: 'Hasil', discussion: 'Pembahasan', results_discussion: 'Hasil & pembahasan', conclusion: 'Kesimpulan',
  acknowledgements: 'Ucapan terima kasih', declarations: 'Pernyataan', references: 'Referensi'
}

export default function Workspace({ projectId }) {
  const confirm = useConfirm()
  const [load, setLoad] = useState({ loading: true, error: '' })
  const [project, setProject] = useState(null)
  const [source, setSource] = useState('')
  const [savedSource, setSavedSource] = useState('')
  const [format, setFormat] = useState('auto')
  const [tab, setTab] = useState('naskah')
  const [chatMounted, setChatMounted] = useState(false) // Chat dimuat saat pertama dibuka, lalu tetap hidup agar stream tidak putus saat pindah tab
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState({ kind: 'info', text: '' })
  const [conflict, setConflict] = useState(false)
  const [debounced, setDebounced] = useState('')
  const originRef = useRef('paste')
  const taRef = useRef(null)
  const fileRef = useRef(null)

  const dirty = source !== savedSource

  const fetchProject = useCallback(async () => {
    const d = await apiFetch(`/api/projects/${projectId}`)
    const text = d.currentVersion ? d.currentVersion.source : ''
    setProject(d.project)
    setSource(text)
    setSavedSource(text)
    setDebounced(text)
    setFormat('auto')
    originRef.current = d.currentVersion ? 'user_edit' : 'paste'
    setConflict(false)
  }, [projectId])

  useEffect(() => {
    let alive = true
    fetchProject()
      .then(() => alive && setLoad({ loading: false, error: '' }))
      .catch((e) => alive && setLoad({ loading: false, error: e.message }))
    return () => {
      alive = false
    }
  }, [fetchProject])

  useEffect(() => {
    const t = setTimeout(() => setDebounced(source), 350)
    return () => clearTimeout(t)
  }, [source])

  useEffect(() => {
    if (!dirty) return
    const h = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const parsed = useMemo(() => {
    if (!debounced.trim()) return null
    try {
      return parseManuscript(debounced, format === 'auto' ? undefined : format)
    } catch {
      return null
    }
  }, [debounced, format])

  async function save() {
    if (saving || !dirty || !source.trim()) return
    if (!(await confirm({ title: 'Simpan sebagai versi baru?', message: 'Isi editor akan disimpan sebagai versi baru naskah. Versi sebelumnya tetap tersimpan.', confirmText: 'Ya, simpan versi' }))) return
    setSaving(true)
    setMsg({ kind: 'info', text: '' })
    try {
      const d = await apiFetch(`/api/projects/${projectId}/versions`, {
        method: 'POST',
        body: {
          source,
          format: format === 'auto' ? undefined : format,
          origin: originRef.current,
          baseRevision: project.revision
        }
      })
      setProject(d.project)
      setSavedSource(source)
      originRef.current = 'user_edit'
      setConflict(false)
      setMsg({ kind: 'success', text: d.unchanged ? 'Tidak ada perubahan dari versi tersimpan.' : `Tersimpan sebagai versi ${d.version.number}.` })
    } catch (e) {
      if (e.code === 'VERSION_CONFLICT') setConflict(true)
      else setMsg({ kind: 'error', text: e.message })
    } finally {
      setSaving(false)
    }
  }

  async function reloadLatest() {
    if (!(await confirm({ title: 'Muat versi terbaru?', message: 'Perubahan lokal yang belum tersimpan akan hilang.', confirmText: 'Ya, muat ulang', tone: 'danger' }))) return
    try {
      await fetchProject()
      setMsg({ kind: 'info', text: 'Versi terbaru dimuat.' })
    } catch (e) {
      setMsg({ kind: 'error', text: e.message })
    }
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(source)
      setMsg({ kind: 'success', text: 'Draf lokal disalin ke clipboard.' })
    } catch {
      setMsg({ kind: 'error', text: 'Gagal menyalin. Pilih semua teks di editor lalu salin manual.' })
    }
  }

  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!/\.(tex|md|markdown|txt)$/i.test(file.name)) {
      setMsg({ kind: 'error', text: 'Format berkas tidak didukung. Gunakan .tex, .md, .markdown, atau .txt.' })
      return
    }
    if (file.size > MAX_BYTES) {
      setMsg({ kind: 'error', text: 'Berkas lebih dari 1 MB.' })
      return
    }
    if (dirty && !(await confirm({ title: 'Ganti isi editor?', message: 'Mengganti isi editor akan membuang perubahan yang belum tersimpan.', confirmText: 'Ya, ganti isi', tone: 'danger' }))) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result || '')
      if (text.includes('\u0000')) {
        setMsg({ kind: 'error', text: 'Berkas tampak biner, bukan teks.' })
        return
      }
      setSource(normalizeSource(text))
      setFormat(/\.tex$/i.test(file.name) ? 'latex' : 'auto')
      originRef.current = 'upload'
      setMsg({ kind: 'info', text: `${file.name} dimuat. Periksa lalu simpan.` })
    }
    reader.onerror = () => setMsg({ kind: 'error', text: 'Gagal membaca berkas.' })
    reader.readAsText(file)
  }

  function jumpTo(offset) {
    const ta = taRef.current
    if (!ta) return
    ta.focus()
    ta.setSelectionRange(offset, offset)
    const lines = source.slice(0, offset).split('\n').length - 1
    const lh = parseFloat(getComputedStyle(ta).lineHeight) || 20
    ta.scrollTop = Math.max(0, lines * lh - 40)
  }

  if (load.loading) return <main className="mx-auto max-w-6xl px-4 py-10 text-sm text-ink-faint">Memuat proyek...</main>
  if (load.error)
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Alert>{load.error}</Alert>
        <Link href="/dashboard/projects" className="mt-4 inline-block text-sm text-ink-soft underline">← Kembali ke daftar proyek</Link>
      </main>
    )

  const archived = project.status !== 'active'
  const conf = parsed ? CONF[parsed.confidence] : null

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link href="/dashboard/projects" className="text-xs text-ink-faint hover:underline">← Proyek Saya</Link>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">{project.title}</h1>
        {archived && <span className="rounded-full border border-base-border px-2.5 py-0.5 text-xs text-ink-faint">Diarsipkan</span>}
        <span className="text-xs text-ink-faint">{project.versionCount} versi</span>
      </div>

      <div className="mt-5 flex gap-2 overflow-x-auto whitespace-nowrap border-b border-base-border text-sm">
        {[['naskah', 'Naskah'], ['chat', 'Chat'], ['referensi', 'Referensi'], ['kesiapan', 'Kesiapan'], ['usulan', 'Usulan'], ['ekspor', 'Ekspor'], ['indikator', 'Indikator'], ['versi', 'Versi'], ['info', 'Pengaturan']].map(([k, label]) => (
          <button key={k} onClick={() => { setTab(k); if (k === 'chat') setChatMounted(true) }} className={`-mb-px border-b-2 px-3 py-2 ${tab === k ? 'border-ink font-medium text-ink' : 'border-transparent text-ink-faint'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'naskah' && (
        <section className="mt-5">
          {archived && <Alert kind="info">Proyek diarsipkan. Pulihkan di tab Pengaturan untuk mengubah naskah.</Alert>}
          {conflict && (
            <div role="alert" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-medium">Naskah diubah dari tempat lain.</p>
              <p className="mt-1">Versi di server lebih baru daripada yang Anda buka. Agar tidak menimpa, penyimpanan ditolak.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={copyDraft} className="rounded-full border border-amber-400 px-4 py-1.5">Salin draf saya</button>
                <button onClick={reloadLatest} className="rounded-full bg-amber-900 px-4 py-1.5 text-white">Muat versi terbaru</button>
              </div>
            </div>
          )}

          <div className="mb-3 flex flex-wrap items-center gap-3">
            <button onClick={() => fileRef.current?.click()} disabled={archived} className="rounded-full border border-base-border px-4 py-1.5 text-sm text-ink-soft disabled:opacity-60">Muat berkas…</button>
            <input ref={fileRef} type="file" accept=".tex,.md,.markdown,.txt" className="hidden" onChange={onFile} />
            <label className="text-sm text-ink-soft">
              Format{' '}
              <select value={format} onChange={(e) => setFormat(e.target.value)} className="rounded-lg border border-base-border bg-base px-2 py-1 text-sm">
                <option value="auto">Otomatis</option>
                <option value="markdown">Markdown</option>
                <option value="latex">LaTeX</option>
              </select>
            </label>
            <span className="ml-auto text-xs text-ink-faint">{dirty ? '● Belum disimpan' : source ? 'Tersimpan' : ''}</span>
            <button onClick={save} disabled={saving || !dirty || !source.trim() || archived} className="rounded-full bg-ink px-5 py-1.5 text-sm font-medium text-base disabled:opacity-50">
              {saving ? 'Menyimpan...' : 'Simpan versi'}
            </button>
          </div>
          <Alert kind={msg.kind}>{msg.text}</Alert>

          <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_280px]">
            <textarea
              ref={taRef}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              readOnly={archived}
              wrap="off"
              spellCheck={false}
              aria-label="Editor naskah"
              placeholder={'Tempel naskah (Markdown atau LaTeX) di sini, atau muat berkas.\n\nContoh Markdown:\n# Judul\n\n## Abstrak\n...'}
              className="h-[60vh] w-full resize-y overflow-auto whitespace-pre rounded-xl border border-base-border bg-base p-3 font-mono text-[13px] leading-5 text-ink focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
            <aside className="space-y-3 text-sm">
              {!parsed && <p className="text-ink-faint">Struktur akan tampil setelah naskah diisi.</p>}
              {parsed && (
                <>
                  <div className={`rounded-xl border px-3 py-2 text-xs ${conf[1]}`}>{conf[0]} · {parsed.format === 'latex' ? 'LaTeX' : 'Markdown'}</div>
                  <div className="rounded-xl border border-base-border p-3">
                    <p className="font-medium text-ink">{parsed.title || <span className="text-ink-faint">Judul tidak ditemukan</span>}</p>
                    <p className="mt-1 text-xs text-ink-faint">{parsed.stats.words.toLocaleString('id-ID')} kata · abstrak {parsed.stats.abstractWords} kata</p>
                    {parsed.keywords.length > 0 && <p className="mt-1 text-xs text-ink-soft">Kata kunci: {parsed.keywords.join(', ')}</p>}
                  </div>
                  <div className="rounded-xl border border-base-border p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">Struktur</p>
                    <ul className="space-y-1">
                      {parsed.sections.map((s) => (
                        <li key={s.index} style={{ paddingLeft: Math.max(0, s.level - 1) * 10 }}>
                          <button onClick={() => jumpTo(s.start)} className="w-full truncate text-left text-xs text-ink-soft hover:text-ink hover:underline" title={s.heading}>
                            {s.heading}
                            {s.key && <span className="ml-1 text-ink-faint">· {KEY_LABEL[s.key] || s.key}</span>}
                            <span className="ml-1 text-ink-faint">({s.words})</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {parsed.warnings.length > 0 && (
                    <div className="rounded-xl border border-base-border p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">Catatan parser</p>
                      <ul className="space-y-1.5">
                        {parsed.warnings.map((w, i) => (
                          <li key={i} className={`text-xs ${w.severity === 'warn' ? 'text-amber-800' : 'text-ink-faint'}`}>
                            {w.offset !== undefined ? (
                              <button onClick={() => jumpTo(w.offset)} className="text-left hover:underline">{w.message}</button>
                            ) : (
                              w.message
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </aside>
          </div>
        </section>
      )}

      {chatMounted && <div className={tab === 'chat' ? '' : 'hidden'}><ChatTab projectId={projectId} /></div>}

      {tab === 'referensi' && <ReferencesTab projectId={projectId} />}

      {tab === 'kesiapan' && <ReportTab projectId={projectId} project={project} onProjectChange={setProject} />}

      {tab === 'usulan' && <EditsTab projectId={projectId} revision={project.revision} dirty={dirty} onAccepted={fetchProject} />}

      {tab === 'ekspor' && <ExportTab projectId={projectId} revision={project.revision} />}

      {tab === 'indikator' && <IndicatorsTab projectId={projectId} project={project} onProjectChange={setProject} />}

      {tab === 'versi' && (
        <VersionsTab
          projectId={projectId}
          revision={project.revision}
          archived={archived}
          dirty={dirty}
          onRestored={async () => {
            await fetchProject()
            setTab('naskah')
            setMsg({ kind: 'success', text: 'Versi dipulihkan sebagai versi baru.' })
          }}
        />
      )}

      {tab === 'info' && <SettingsTab project={project} onChange={setProject} />}
    </main>
  )
}
