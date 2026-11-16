'use strict'

// Rumus kesiapan (MTS 40.2 D). MTS menyatakan rumus final BELUM ditetapkan dan harus disetujui Product Owner dan
// academic reviewer. Yang ada di sini adalah rumus SEMENTARA yang transparan dan dapat dijelaskan (keputusan D5-04).
// Semua nilai ada di FORMULA dan versi-nya dicatat di setiap laporan. JANGAN disajikan sebagai final.
const FORMULA = Object.freeze({
  version: 'formula-provisional-0.1',
  provisional: true,
  approval: 'Belum disetujui Product Owner dan academic reviewer (Gate 5).',
  minCoverage: 0.5, // bobot kriteria yang dinilai / total bobot; di bawah ini skor tidak dihitung
  penaltyPerFail: 5, // poin per pemeriksaan deterministik berstatus fail
  maxPenalty: 30,
  bands: Object.freeze({ siap: 80, revisi_minor: 65, revisi_major: 45 }), // di bawah revisi_major = belum_siap
  order: ['belum_siap', 'revisi_major', 'revisi_minor', 'siap']
})

const bandOf = (score) => (score >= FORMULA.bands.siap ? 'siap' : score >= FORMULA.bands.revisi_minor ? 'revisi_minor' : score >= FORMULA.bands.revisi_major ? 'revisi_major' : 'belum_siap')
const capBand = (band, max) => (FORMULA.order.indexOf(band) > FORMULA.order.indexOf(max) ? max : band)

// criteria: hasil assessAll; checks: hasil runChecks; freshness: evaluateFreshness(venue) atau null bila tanpa venue.
function computeReadiness({ criteria, checks, freshness }) {
  const breakdown = []
  // Defense in depth: kriteria 'assessed' dengan nilai di luar [0,1] atau bobot tidak valid diperlakukan tidak dinilai.
  const okNum = (c) => Number.isFinite(c.weight) && c.weight >= 0 && Number.isFinite(c.normalized) && c.normalized >= 0 && c.normalized <= 1
  criteria = criteria.map((c) => (c.status === 'assessed' && !okNum(c) ? { ...c, status: 'not_assessed', reason: 'INVALID_SCORE' } : c))
  const assessed = criteria.filter((c) => c.status === 'assessed')
  const totalW = criteria.reduce((s, c) => s + c.weight, 0)
  const assessedW = assessed.reduce((s, c) => s + c.weight, 0)
  const coverage = totalW ? assessedW / totalW : 0
  const blockers = checks.filter((c) => c.critical && c.status === 'fail').map((c) => ({ checkId: c.checkId, label: c.label }))
  const reasons = []

  const base = {
    formulaVersion: FORMULA.version,
    provisional: true,
    approval: FORMULA.approval,
    coverage: Number(coverage.toFixed(3)),
    notAssessed: criteria.filter((c) => c.status !== 'assessed').map((c) => ({ id: c.id, reason: c.reason })),
    blockers
  }
  if (coverage < FORMULA.minCoverage || !assessed.length) {
    return { ...base, score: null, band: null, status: 'insufficient_evidence', penalty: 0, reasons: [`Bukti tidak cukup: hanya ${Math.round(coverage * 100)}% bobot kriteria yang dapat dinilai (minimal ${Math.round(FORMULA.minCoverage * 100)}%). Skor dan label tidak diberikan.`], breakdown: [] }
  }
  const weighted = assessed.reduce((s, c) => s + c.weight * c.normalized * 100, 0) / assessedW
  breakdown.push({ step: 'skor_berbobot', value: Number(weighted.toFixed(2)), note: 'rata-rata berbobot kriteria yang DINILAI (not_assessed dikeluarkan dari pembagi)' })
  const fails = checks.filter((c) => c.status === 'fail').length
  const penalty = Math.min(FORMULA.maxPenalty, fails * FORMULA.penaltyPerFail)
  breakdown.push({ step: 'penalti_deterministik', value: -penalty, note: `${fails} pemeriksaan fail x ${FORMULA.penaltyPerFail} (maks ${FORMULA.maxPenalty})` })
  const raw = Math.max(0, weighted - penalty)
  const score = Number(raw.toFixed(1))
  let band = bandOf(raw) // label dari skor tak dibulatkan: pembulatan tidak boleh menaikkan label
  breakdown.push({ step: 'label_awal', value: band })
  if (blockers.length) {
    const capped = capBand(band, 'revisi_major')
    if (capped !== band) reasons.push(`Label dibatasi ke "${capped}" karena ada critical blocker (${blockers.map((b) => b.checkId).join(', ')}).`)
    band = capped
  }
  if (!freshness || !freshness.trustworthy) {
    const capped = capBand(band, 'revisi_minor')
    if (capped !== band) reasons.push(!freshness ? 'Label "siap" tidak diberikan: venue belum dipilih.' : `Label "siap" tidak diberikan: aturan venue belum dapat dipercaya (${freshness.state}).`)
    band = capped
  }
  if (coverage < 1) reasons.push(`${criteria.length - assessed.length} kriteria tidak dinilai; skor hanya mencerminkan ${Math.round(coverage * 100)}% bobot.`)
  return { ...base, score, band, status: 'scored', penalty, reasons, breakdown }
}

const BAND_LABEL = { siap: 'Siap', revisi_minor: 'Revisi minor', revisi_major: 'Revisi mayor', belum_siap: 'Belum siap' }

module.exports = { computeReadiness, FORMULA, BAND_LABEL, bandOf }
