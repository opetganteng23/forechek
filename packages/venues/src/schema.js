'use strict'
const { AppError } = require('@publication-prepare/core')

// Skema profil venue (MTS 9, 40.2 A). Profil adalah DATA (JSON), bukan kode. Setiap aturan yang memengaruhi
// pemeriksaan membawa sumber dan tanggal pengecekan; aturan tanpa verifikasi ditandai verification: 'needs_human'.
const STATUSES = ['active', 'needs_review', 'deprecated']
const KINDS = ['conference', 'journal']
const REF_STYLES = ['ieee', 'apa', 'vancouver', 'custom']
const REVIEW = ['single_blind', 'double_blind', 'open', 'unknown']
const DECLARATIONS = ['ethics', 'data_availability', 'funding', 'conflict_of_interest', 'credit', 'orcid']
const SECTION_KEYS = ['abstract', 'introduction', 'related_work', 'methodology', 'results', 'discussion', 'results_discussion', 'conclusion', 'acknowledgements', 'declarations', 'references']

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)

function validateVenueProfile(p) {
  const errs = []
  const need = (cond, msg) => cond || errs.push(msg)
  need(isObj(p), 'profil harus objek')
  if (!isObj(p)) return errs
  need(/^[a-z0-9-]{3,60}$/.test(p.slug || ''), 'slug tidak valid')
  need(typeof p.name === 'string' && p.name.length >= 3, 'name wajib')
  need(typeof p.publisher === 'string', 'publisher wajib (boleh "generik")')
  need(KINDS.includes(p.kind), 'kind harus conference|journal')
  need(Number.isInteger(p.version) && p.version >= 1, 'version bilangan bulat >= 1')
  need(STATUSES.includes(p.status), 'status tidak valid')
  need(typeof p.effectiveFrom === 'string' || p.effectiveFrom === null, 'effectiveFrom string/null')
  need(p.checkedAt === null || (typeof p.checkedAt === 'string' && ISO_DATE.test(p.checkedAt) && !Number.isNaN(Date.parse(p.checkedAt)) && Date.parse(p.checkedAt) <= Date.now() + 86400000), 'checkedAt harus tanggal ISO (bukan masa depan) atau null (belum diverifikasi)')
  need(typeof p.provenance === 'string' && p.provenance.length >= 10, 'provenance wajib (asal nilai aturan)')
  if (p.status === 'active') need(p.checkedAt !== null, 'profil active wajib punya checkedAt')
  need(Array.isArray(p.sources) && p.sources.length >= 1 && p.sources.every((s) => isObj(s) && /^https?:\/\//.test(s.url || '') && typeof s.title === 'string'), 'sources wajib berisi {url,title}')
  need(isObj(p.indexing), 'indexing wajib objek')
  need(isObj(p.format), 'format wajib objek')
  if (isObj(p.format)) {
    for (const k of ['abstractWords', 'keywords', 'words']) {
      const r = p.format[k]
      need(r === null || r === undefined || (isObj(r) && (r.min === undefined || Number.isInteger(r.min)) && (r.max === undefined || Number.isInteger(r.max)) && (r.min === undefined || r.max === undefined || r.min <= r.max)), `format.${k} harus {min<=max} atau null`)
    }
    need(p.format.pages === null || p.format.pages === undefined || (isObj(p.format.pages) && Number.isInteger(p.format.pages.max)), 'format.pages harus {max} atau null')
    need(Array.isArray(p.format.requiredSections) && p.format.requiredSections.every((s) => SECTION_KEYS.includes(s)), 'format.requiredSections harus daftar kunci bagian dikenal')
    need(Array.isArray(p.format.recommendedSections || []) && (p.format.recommendedSections || []).every((s) => SECTION_KEYS.includes(s)), 'format.recommendedSections tidak valid')
  }
  need(isObj(p.references) && REF_STYLES.includes(p.references.style), 'references.style tidak valid')
  if (isObj(p.references)) need(p.references.recentYears === undefined || (Number.isInteger(p.references.recentYears) && p.references.recentYears >= 1), 'references.recentYears bilangan bulat >= 1')
  need(Array.isArray(p.requiredDeclarations) && p.requiredDeclarations.every((d) => DECLARATIONS.includes(d)), 'requiredDeclarations tidak valid')
  need(REVIEW.includes(p.reviewPolicy), 'reviewPolicy tidak valid')
  need(isObj(p.aiPolicy) && typeof p.aiPolicy.summary === 'string', 'aiPolicy.summary wajib')
  need(isObj(p.rubric) && Array.isArray(p.rubric.weights) === false, 'rubric wajib objek (bobot kriteria per id)')
  if (isObj(p.rubric) && isObj(p.rubric.weights)) need(Object.values(p.rubric.weights).every((w) => typeof w === 'number' && Number.isFinite(w) && w >= 0 && w <= 100), 'rubric.weights harus angka 0-100')
  need(['unverified', 'verified'].includes(p.verification), 'verification harus unverified|verified')
  if (p.verification === 'verified') need(p.checkedAt !== null, 'verified wajib punya checkedAt')
  return errs
}

function assertValidVenueProfile(p) {
  const errs = validateVenueProfile(p)
  if (errs.length) throw new AppError('VALIDATION_ERROR', `Profil venue tidak valid: ${errs.slice(0, 5).join('; ')}`)
  return p
}

module.exports = { validateVenueProfile, assertValidVenueProfile, STATUSES, KINDS, REF_STYLES, DECLARATIONS, SECTION_KEYS }
