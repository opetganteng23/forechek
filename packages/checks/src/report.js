'use strict'
const { runChecks, summarizeChecks, THRESHOLDS } = require('./checks')
const { assessAll } = require('./assess')
const { computeReadiness, FORMULA } = require('./readiness')
const { RUBRIC_VERSION, PROMPT_VERSION } = require('./rubric')

// Membangun laporan kesiapan (MTS 40.2 E). Laporan dapat ditelusuri ke versi naskah, profil venue (slug+versi),
// rubrik, prompt, model, dan rumus. `freshness` berasal dari @publication-prepare/venues.evaluateFreshness.
async function buildReport({ source, parse, references = [], venue = null, freshness = null, provider = null, model = null, judge = null, now = new Date(), usageSink }) {
  const deterministic = runChecks({ source, parse, references, venue, now })
  const assessment = await assessAll({ source, parse, references, venue, provider, model, judge, now, usageSink })
  const overall = computeReadiness({ criteria: assessment.criteria, checks: deterministic, freshness })

  const limitations = [
    'Pemeriksaan deterministik berbasis pola; bukan pengganti pembacaan manusia.',
    'Skor kriteria bersifat bantuan: penilaian model dapat keliru dan tidak memprediksi keputusan editor/reviewer.',
    'Rumus, ambang, dan bobot bersifat PROVISIONAL dan belum disetujui Product Owner/academic reviewer.',
    'Batas halaman hanya estimasi tanpa PDF kompilasi.'
  ]
  if (!venue) limitations.push('Venue belum dipilih: aturan venue tidak diterapkan.')
  else if (freshness && !freshness.trustworthy) limitations.push(`Aturan venue belum dapat dipercaya (${freshness.state}): ${freshness.reasons.join(' ')}`)
  if (assessment.injectionSuspected) limitations.push('Naskah memuat teks yang menyerupai instruksi kepada penilai AI. Teks itu diperlakukan sebagai data; tinjau skor dengan hati-hati.')
  if (assessment.criteria.some((c) => c.truncated)) limitations.push('Sebagian bagian naskah dipotong pada 6.000 karakter pertama saat dinilai model; bukti hanya diterima dari bagian yang dilihat model.')
  if (assessment.criteria.some((c) => c.reason === 'AI_NOT_CONFIGURED')) limitations.push('Layanan AI belum dikonfigurasi: kriteria berbasis model tidak dinilai.')

  return {
    deterministic,
    deterministicSummary: summarizeChecks(deterministic),
    criteria: assessment.criteria,
    overall,
    limitations,
    versions: { checks: THRESHOLDS.version, rubric: RUBRIC_VERSION, prompt: PROMPT_VERSION, formula: FORMULA.version },
    venue: venue ? { slug: venue.slug, version: venue.version, status: venue.status, verification: venue.verification, checkedAt: venue.checkedAt, freshness } : null,
    model: provider ? { provider: provider.name, id: model } : null,
    generatedAt: now.toISOString()
  }
}

module.exports = { buildReport }
