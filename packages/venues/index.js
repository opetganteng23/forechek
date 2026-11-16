'use strict'
const { assertValidVenueProfile, validateVenueProfile } = require('./src/schema')

const BUILTIN = [
  require('./data/ieee-conference-generic.json'),
  require('./data/ieee-journal-generic.json'),
  require('./data/scopus-generic.json'),
  require('./data/sinta-generic.json')
]

const DAY = 24 * 60 * 60 * 1000
const DEFAULT_MAX_AGE_DAYS = 180 // provisional (D5-01): profil tidak diperiksa ulang lebih lama dari ini dianggap usang

function loadBuiltinProfiles() {
  return BUILTIN.map((p) => assertValidVenueProfile(JSON.parse(JSON.stringify(p))))
}

// Kesegaran profil (MTS 40.2 A: profil usang harus terlihat dan tidak diperlakukan sebagai aturan terbaru).
//  deprecated | needs_review (termasuk belum pernah diverifikasi) | stale (checkedAt terlalu lama) | ok
function evaluateFreshness(profile, now = new Date(), maxAgeDays = DEFAULT_MAX_AGE_DAYS) {
  const reasons = []
  if (profile.status === 'deprecated') return { state: 'deprecated', trustworthy: false, reasons: ['Profil ditandai deprecated.'] }
  if (profile.verification !== 'verified' || !profile.checkedAt) reasons.push('Aturan belum diverifikasi manusia terhadap sumber resmi.')
  if (profile.status === 'needs_review') reasons.push('Status profil: needs_review.')
  if (profile.checkedAt) {
    const age = (now.getTime() - Date.parse(profile.checkedAt)) / DAY
    if (age < -1) return { state: 'needs_review', trustworthy: false, reasons: [...reasons, 'checkedAt berada di masa depan: tidak dapat dipercaya.'] }
    if (age > maxAgeDays) {
      reasons.push(`Terakhir diperiksa ${Math.floor(age)} hari lalu (batas ${maxAgeDays} hari).`)
      return { state: 'stale', trustworthy: false, reasons }
    }
  }
  if (reasons.length) return { state: 'needs_review', trustworthy: false, reasons }
  return { state: 'ok', trustworthy: true, reasons: [] }
}

// Ringkasan aman untuk UI/model: tanpa catatan internal panjang.
function summarizeProfile(p, now = new Date()) {
  return {
    slug: p.slug,
    name: p.name,
    publisher: p.publisher,
    kind: p.kind,
    version: p.version,
    status: p.status,
    verification: p.verification,
    checkedAt: p.checkedAt,
    freshness: evaluateFreshness(p, now),
    sources: p.sources,
    reviewPolicy: p.reviewPolicy,
    referenceStyle: p.references.style,
    requiredSections: p.format.requiredSections,
    requiredDeclarations: p.requiredDeclarations,
    aiPolicy: p.aiPolicy,
    provenance: p.provenance
  }
}

module.exports = { loadBuiltinProfiles, evaluateFreshness, summarizeProfile, validateVenueProfile, assertValidVenueProfile, DEFAULT_MAX_AGE_DAYS, ...require('./src/schema') }
