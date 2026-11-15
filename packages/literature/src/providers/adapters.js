'use strict'
const { fromOpenAlex, fromCrossref, fromSemanticScholar, normalizeDoi } = require('../normalize')
const { createHttp } = require('./http')

// Adapter nyata. STATUS: TIDAK DIVERIFIKASI terhadap API langsung (tanpa jaringan/kunci di lingkungan pengembangan).
// Pemetaan respons diuji dengan fixture berbentuk dokumentasi resmi, bukan rekaman respons nyata.
// Setiap adapter: { name, attribution, search({query, yearFrom, limit, language}), getByDoi(doi) }.
const enc = encodeURIComponent

function openalex({ contactEmail, http, baseUrl = 'https://api.openalex.org', fetchFn, timeoutMs, cacheTtlMs } = {}) {
  const h = http || createHttp({ provider: 'openalex', fetchFn, timeoutMs, cacheTtlMs, minIntervalMs: 120 })
  const mailto = contactEmail ? `&mailto=${enc(contactEmail)}` : ''
  return {
    name: 'openalex',
    detectsRetraction: true, // OpenAlex: is_retracted
    attribution: 'OpenAlex (openalex.org), data CC0',
    async search({ query, yearFrom, limit = 10, language }) {
      const filters = []
      if (yearFrom) filters.push(`from_publication_date:${yearFrom}-01-01`)
      if (language && /^[a-z]{2}$/.test(language)) filters.push(`language:${language}`)
      const json = await h.getJson(`${baseUrl}/works?search=${enc(query)}&per-page=${limit}${filters.length ? `&filter=${filters.join(',')}` : ''}${mailto}`)
      const fetchedAt = new Date().toISOString()
      return ((json && json.results) || []).map((w) => fromOpenAlex(w, fetchedAt)).filter(Boolean)
    },
    async getByDoi(doi) {
      const d = normalizeDoi(doi)
      if (!d) return null
      const w = await h.getJson(`${baseUrl}/works/doi:${enc(d)}${mailto ? `?${mailto.slice(1)}` : ''}`)
      return w ? fromOpenAlex(w) : null
    }
  }
}

function crossref({ contactEmail, http, baseUrl = 'https://api.crossref.org', fetchFn, timeoutMs, cacheTtlMs } = {}) {
  const ua = `PublicationPrepare/1.0 (mailto:${contactEmail || 'tidak-dikonfigurasi'})`
  const h = http || createHttp({ provider: 'crossref', fetchFn, timeoutMs, cacheTtlMs, minIntervalMs: 120, userAgent: ua })
  const mailto = contactEmail ? `&mailto=${enc(contactEmail)}` : ''
  return {
    name: 'crossref',
    detectsRetraction: true, // Crossref: updated-by / update-to (best-effort)
    attribution: 'Crossref REST API (api.crossref.org)',
    async search({ query, yearFrom, limit = 10 }) {
      const json = await h.getJson(`${baseUrl}/works?query.bibliographic=${enc(query)}&rows=${limit}${yearFrom ? `&filter=from-pub-date:${yearFrom}` : ''}${mailto}`)
      const fetchedAt = new Date().toISOString()
      return ((json && json.message && json.message.items) || []).map((m) => fromCrossref(m, fetchedAt)).filter(Boolean)
    },
    async getByDoi(doi) {
      const d = normalizeDoi(doi)
      if (!d) return null
      const json = await h.getJson(`${baseUrl}/works/${enc(d)}${mailto ? `?${mailto.slice(1)}` : ''}`)
      return json && json.message ? fromCrossref(json.message) : null
    }
  }
}

const S2_FIELDS = 'title,authors,year,venue,externalIds,abstract,url,publicationTypes'

function semanticscholar({ apiKey, http, baseUrl = 'https://api.semanticscholar.org', fetchFn, timeoutMs, cacheTtlMs } = {}) {
  // Tanpa kunci, Semantic Scholar membatasi sangat ketat: jarak antar permintaan dibuat lebih lebar.
  const h = http || createHttp({ provider: 'semanticscholar', fetchFn, timeoutMs, cacheTtlMs, minIntervalMs: apiKey ? 200 : 1100 })
  const headers = apiKey ? { 'x-api-key': apiKey } : {}
  return {
    name: 'semanticscholar',
    detectsRetraction: false, // tidak menyediakan flag retraction
    attribution: 'Semantic Scholar Academic Graph (api.semanticscholar.org)',
    async search({ query, yearFrom, limit = 10 }) {
      const json = await h.getJson(`${baseUrl}/graph/v1/paper/search?query=${enc(query)}&limit=${limit}&fields=${S2_FIELDS}${yearFrom ? `&year=${yearFrom}-` : ''}`, { headers })
      const fetchedAt = new Date().toISOString()
      return ((json && json.data) || []).map((p) => fromSemanticScholar(p, fetchedAt)).filter(Boolean)
    },
    async getByDoi(doi) {
      const d = normalizeDoi(doi)
      if (!d) return null
      const p = await h.getJson(`${baseUrl}/graph/v1/paper/DOI:${enc(d)}?fields=${S2_FIELDS}`, { headers })
      return p ? fromSemanticScholar(p) : null
    }
  }
}

module.exports = { openalex, crossref, semanticscholar }
