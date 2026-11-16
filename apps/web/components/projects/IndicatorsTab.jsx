'use client'
import { useState } from 'react'
import { apiFetch } from '../../lib/clientApi'
import { Alert } from '../auth/ui'

const ERR = {
  INDICATORS_DISABLED: 'Indikator belum diaktifkan untuk proyek ini.',
  NO_MANUSCRIPT: 'Proyek belum memiliki naskah tersimpan. Simpan naskah di tab Naskah dulu.',
  RATE_LIMITED: 'Terlalu banyak permintaan. Tunggu sebentar.'
}
const errText = (e) => ERR[e.details?.code] || ERR[e.code] || e.message

// Angka deskriptif saja: tanpa lencana berwarna, tanpa skor gabungan, tanpa label tingkat. Tidak masuk skor kesiapan maupun ekspor.
function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4 border-b border-base-border py-1 text-sm">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="font-mono text-ink">{value === null || value === undefined ? '-' : value}</dd>
    </div>
  )
}

export default function IndicatorsTab({ projectId, project, onProjectChange }) {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState({ kind: 'error', text: '' })
  const enabled = Boolean(project.indicatorsEnabled)

  async function toggle(next) {
    setBusy(true)
    setNotice({ kind: 'error', text: '' })
    try {
      const d = await apiFetch(`/api/projects/${projectId}`, { method: 'PATCH', body: { indicatorsEnabled: next } })
      onProjectChange(d.project)
      if (!next) setData(null)
    } catch (e) {
      setNotice({ kind: 'error', text: errText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function run() {
    setBusy(true)
    setNotice({ kind: 'error', text: '' })
    try {
      setData(await apiFetch(`/api/projects/${projectId}/indicators`, { method: 'POST', body: {} }))
    } catch (e) {
      setNotice({ kind: 'error', text: errText(e) })
    } finally {
      setBusy(false)
    }
  }

  const sim = data && data.indicators.similarity
  const sty = data && data.indicators.style
  return (
    <section className="mt-5 max-w-3xl space-y-5">
      <div className="rounded-xl border border-base-border p-3 text-sm text-ink-soft">
        <p><strong>Indikator, bukan penilaian.</strong> Angka di bawah menggambarkan teks Anda terhadap korpus terbatas dan keseragaman gaya penulisan. Tidak ada vonis tentang orisinalitas atau penulis naskah, tidak masuk skor kesiapan, dan tidak ikut diekspor. Ambang tidak divalidasi; tulisan akademik formal dan penulis non-native dapat menghasilkan angka serupa tanpa masalah apa pun.</p>
      </div>
      <Alert kind={notice.kind}>{notice.text}</Alert>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={enabled} disabled={busy} onChange={(e) => toggle(e.target.checked)} />
        Aktifkan indikator untuk proyek ini (opsional, default mati)
      </label>
      {enabled && (
        <button onClick={run} disabled={busy} className="rounded-xl bg-ink px-4 py-2 text-sm font-medium text-base disabled:opacity-50">{busy ? 'Menghitung...' : 'Hitung indikator'}</button>
      )}
      {data && (
        <div className="space-y-6" aria-live="polite">
          <div>
            <h3 className="text-sm font-semibold text-ink">Kecocokan literal terhadap abstrak referensi proyek</h3>
            <p className="mt-1 text-sm text-ink-soft">{sim.summaryText}</p>
            {sim.status === 'ok' && (
              <dl className="mt-2">
                <Row label="Kata yang diperiksa" value={sim.checkedWords} />
                <Row label="Kata dikecualikan (kutipan langsung, kode, daftar pustaka)" value={sim.excludedWords} />
                <Row label="Bagian yang cocok" value={sim.passages.length} />
              </dl>
            )}
            {sim.passages.length > 0 && (
              <ul className="mt-2 space-y-2">
                {sim.passages.map((p, i) => (
                  <li key={i} className="rounded-lg border border-base-border p-2 text-xs text-ink-soft">
                    <span className="text-ink-faint">baris {p.line} · {p.words} kata · cocok dengan {p.matchedWith.label}</span>
                    <span className="mt-1 block break-words">{p.snippet}</span>
                  </li>
                ))}
              </ul>
            )}
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-ink-faint">{sim.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-ink">Statistik gaya penulisan (deskriptif)</h3>
            {sty.status === 'ok' ? (
              <dl className="mt-2">
                <Row label="Jumlah kata / kalimat" value={`${sty.words} / ${sty.sentences}`} />
                <Row label="Rata-rata panjang kalimat (kata)" value={sty.signals.sentenceLengthMean} />
                <Row label="Variasi panjang kalimat (CV)" value={sty.signals.sentenceLengthCv} />
                <Row label="Rasio kata unik" value={sty.signals.typeTokenRatio} />
                <Row label="Rasio pengulangan frasa 4 kata" value={sty.signals.repeatedFourGramRatio} />
              </dl>
            ) : (
              <p className="mt-1 text-sm text-ink-soft">Teks terlalu pendek untuk dihitung (minimal {sty.minWords} kata; saat ini {sty.words}).</p>
            )}
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-ink-faint">{sty.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
          </div>
          <p className="text-xs text-ink-faint">Dihitung dari naskah versi {data.versionNumber}. Hasil tidak disimpan.</p>
        </div>
      )}
    </section>
  )
}
