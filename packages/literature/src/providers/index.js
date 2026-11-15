'use strict'
const { openalex, crossref, semanticscholar } = require('./adapters')
const { createFixtureProvider } = require('./fixture')
const { CORPUS } = require('../fixtures/corpus')

// Memilih provider dari env. Tidak ada provider default: tanpa LITERATURE_PROVIDERS pencarian ditolak dengan galat jelas.
// 'fixture' (korpus sintetis) ditolak di produksi kecuali LITERATURE_ALLOW_FIXTURE=true dan selalu dilabeli data uji.
function createLiteratureProvidersFromEnv(env = process.env) {
  const names = String(env.LITERATURE_PROVIDERS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  const timeoutMs = Number.parseInt(env.LITERATURE_TIMEOUT_MS, 10) || 8000
  const cacheTtlMs = (Number.parseInt(env.LITERATURE_CACHE_TTL_SEC, 10) || 600) * 1000
  const common = { contactEmail: env.LITERATURE_CONTACT_EMAIL || '', timeoutMs, cacheTtlMs }
  const out = []
  for (const n of names) {
    if (n === 'openalex') out.push(openalex(common))
    else if (n === 'crossref') out.push(crossref(common))
    else if (n === 'semanticscholar') out.push(semanticscholar({ ...common, apiKey: env.SEMANTIC_SCHOLAR_API_KEY || '' }))
    else if (n === 'fixture') {
      if (env.NODE_ENV === 'production' && env.LITERATURE_ALLOW_FIXTURE !== 'true') throw new Error('Provider literatur fixture tidak diizinkan di produksi')
      out.push(createFixtureProvider(CORPUS))
    } else throw new Error(`Provider literatur tidak dikenal: ${n}`)
  }
  return out
}

module.exports = { createLiteratureProvidersFromEnv }
