'use strict'

// Normalisasi metadata literatur (MTS 39.2 B). Semua provider dipetakan ke satu bentuk kanonis:
// { provider, providerId, doi, title, authors:[{given,family}], year, venueName, type, url, abstract, retracted, fetchedAt, raw? }

const DOI_RE = /^10\.\d{4,9}\/\S+$/

function normalizeDoi(input) {
  if (typeof input !== 'string') return null
  let s = input.trim().toLowerCase()
  s = s.replace(/^(https?:\/\/)?(dx\.)?doi\.org\//, '').replace(/^doi:\s*/, '')
  try {
    s = decodeURIComponent(s)
  } catch {
    /* biarkan apa adanya */
  }
  s = s.replace(/[\s.,;:)\]}>"']+$/, '')
  return DOI_RE.test(s) ? s : null
}

function stripTags(s) {
  return String(s || '').replace(/<[^>]*>/g, ' ')
}

// Judul dinormalkan: huruf kecil, tanpa diakritik/tag/tanda baca, spasi tunggal.
function normalizeTitle(title) {
  return stripTags(title)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeFamily(name) {
  return String(name || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\s-]/gu, '') // huruf Unicode dipertahankan (nama non-Latin tidak boleh menjadi string kosong)
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanText(s, max = 4000) {
  const t = stripTags(s).replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, max) : null
}

// "Given Family" atau "Family, Given" -> {given, family}
function splitName(full) {
  const s = String(full || '').trim()
  if (!s) return null
  if (s.includes(',')) {
    const [family, given] = s.split(',').map((x) => x.trim())
    return { given: given || '', family }
  }
  const parts = s.split(/\s+/)
  return { given: parts.slice(0, -1).join(' '), family: parts[parts.length - 1] }
}

const yearOf = (v) => {
  const n = Number.parseInt(v, 10)
  return Number.isInteger(n) && n > 1000 && n < 3000 ? n : null
}

function base(provider, fetchedAt) {
  return { provider, providerId: null, doi: null, title: null, authors: [], year: null, venueName: null, type: null, url: null, abstract: null, retracted: false, fetchedAt: fetchedAt || new Date().toISOString() }
}

// ---- OpenAlex (https://api.openalex.org/works) ----
function abstractFromInverted(inv) {
  if (!inv || typeof inv !== 'object') return null
  const words = []
  for (const [w, positions] of Object.entries(inv)) for (const p of positions) words[p] = w
  return words.filter((w) => w !== undefined).join(' ') || null
}

function fromOpenAlex(w, fetchedAt) {
  if (!w || typeof w !== 'object') return null
  const c = base('openalex', fetchedAt)
  c.providerId = w.id || null
  c.doi = normalizeDoi(w.doi || '')
  c.title = cleanText(w.title || w.display_name, 500)
  c.authors = (w.authorships || []).map((a) => splitName(a && a.author && a.author.display_name)).filter(Boolean)
  c.year = yearOf(w.publication_year)
  c.venueName = cleanText(w.primary_location && w.primary_location.source && w.primary_location.source.display_name, 300)
  c.type = w.type || null
  c.url = (w.primary_location && w.primary_location.landing_page_url) || w.doi || null
  c.abstract = cleanText(abstractFromInverted(w.abstract_inverted_index))
  c.retracted = w.is_retracted === true
  return c.title ? c : null
}

// ---- Crossref (https://api.crossref.org/works) ----
function fromCrossref(m, fetchedAt) {
  if (!m || typeof m !== 'object') return null
  const c = base('crossref', fetchedAt)
  c.doi = normalizeDoi(m.DOI || '')
  c.providerId = c.doi
  c.title = cleanText(Array.isArray(m.title) ? m.title[0] : m.title, 500)
  c.authors = (m.author || []).map((a) => (a && (a.family || a.name) ? { given: a.given || '', family: a.family || a.name } : null)).filter(Boolean)
  const parts = (m.issued && m.issued['date-parts'] && m.issued['date-parts'][0]) || (m.published && m.published['date-parts'] && m.published['date-parts'][0]) || []
  c.year = yearOf(parts[0])
  c.venueName = cleanText(Array.isArray(m['container-title']) ? m['container-title'][0] : m['container-title'], 300)
  c.type = m.type || null
  c.url = m.URL || null
  c.abstract = cleanText(m.abstract)
  // Deteksi retraction terbaik-usaha: relasi "updated-by" bertipe retraction/withdrawal, atau tipe/judul pemberitahuan.
  const updates = [...(m['updated-by'] || []), ...(m['update-to'] || [])]
  c.retracted = updates.some((u) => /retraction|withdrawal/i.test(u && u.type))
  return c.title ? c : null
}

// ---- Semantic Scholar (https://api.semanticscholar.org/graph/v1/paper) ----
function fromSemanticScholar(p, fetchedAt) {
  if (!p || typeof p !== 'object') return null
  const c = base('semanticscholar', fetchedAt)
  c.providerId = p.paperId || null
  c.doi = normalizeDoi((p.externalIds && p.externalIds.DOI) || '')
  c.title = cleanText(p.title, 500)
  c.authors = (p.authors || []).map((a) => splitName(a && a.name)).filter(Boolean)
  c.year = yearOf(p.year)
  c.venueName = cleanText(p.venue, 300)
  c.type = (p.publicationTypes && p.publicationTypes[0]) || null
  c.url = p.url || null
  c.abstract = cleanText(p.abstract)
  return c.title ? c : null
}

module.exports = { normalizeDoi, normalizeTitle, normalizeFamily, cleanText, splitName, fromOpenAlex, fromCrossref, fromSemanticScholar, abstractFromInverted, yearOf }
