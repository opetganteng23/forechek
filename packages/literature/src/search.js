'use strict'
const { AppError } = require('@publication-prepare/core')
const { normalizeDoi, normalizeTitle, normalizeFamily } = require('./normalize')
const { titleSimilarity, THRESHOLDS } = require('./compare')

const MAX_QUERY = 300
const MAX_LIMIT = 25

function validateSearch({ query, yearFrom, limit, language }) {
  if (typeof query !== 'string' || query.trim().length < 3) throw new AppError('VALIDATION_ERROR', 'Kata kunci pencarian minimal 3 karakter')
  if (query.length > MAX_QUERY) throw new AppError('VALIDATION_ERROR', `Kata kunci maksimal ${MAX_QUERY} karakter`)
  const thisYear = new Date().getUTCFullYear()
  if (yearFrom !== undefined && yearFrom !== null && (!Number.isInteger(yearFrom) || yearFrom < 1900 || yearFrom > thisYear + 1)) throw new AppError('VALIDATION_ERROR', 'yearFrom tidak valid')
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT)) throw new AppError('VALIDATION_ERROR', `limit harus 1-${MAX_LIMIT}`)
  if (language !== undefined && language !== null && !/^[a-z]{2}$/.test(language)) throw new AppError('VALIDATION_ERROR', 'language harus kode 2 huruf (mis. id, en)')
  return { query: query.trim().replace(/\s+/g, ' '), yearFrom: yearFrom || null, limit: limit || 10, language: language || null }
}

// Kunci dedup: DOI ternormalisasi; tanpa DOI -> judul ternormalisasi + tahun + penulis pertama (dengan confidence).
function dedupKey(c) {
  if (c.doi) return `doi:${c.doi}`
  const fa = c.authors[0] ? normalizeFamily(c.authors[0].family) : ''
  return `meta:${normalizeTitle(c.title)}|${c.year || ''}|${fa}`
}

// Menggabungkan kandidat dari beberapa provider. Field yang kosong diisi dari provider lain; semua asal dicatat.
function dedupe(list) {
  const map = new Map()
  for (const c of list) {
    const key = dedupKey(c)
    const prev = map.get(key)
    if (!prev) {
      map.set(key, { ...c, providers: [c.provider], dedupConfidence: c.doi ? 'high' : 'medium' })
      continue
    }
    prev.providers.push(c.provider)
    for (const f of ['abstract', 'venueName', 'url', 'year', 'type']) if (!prev[f] && c[f]) prev[f] = c[f]
    if (!prev.authors.length && c.authors.length) prev.authors = c.authors
    prev.retracted = prev.retracted || c.retracted
  }
  // Tanpa DOI: gabungkan juga yang judulnya hampir sama (beda ejaan/diakritik) dengan confidence rendah.
  const out = [...map.values()]
  const merged = []
  for (const c of out) {
    const twin = !c.doi && merged.find((m) => !m.doi && m.year === c.year && titleSimilarity(m.title, c.title) >= THRESHOLDS.titleMatch)
    if (twin) {
      twin.providers.push(...c.providers)
      twin.retracted = twin.retracted || c.retracted
      twin.dedupConfidence = 'low'
    } else merged.push(c)
  }
  return merged
}

// search_literature (MTS 7.3): kandidat + asal provider + waktu + keterbatasan. Kegagalan satu provider tidak
// menggagalkan seluruh pencarian (degradasi anggun) tetapi dilaporkan apa adanya.
async function searchLiterature({ providers, params, now = () => new Date() }) {
  const p = validateSearch(params || {})
  if (!providers || providers.length === 0) throw new AppError('PROVIDER_NOT_CONFIGURED', 'Penyedia literatur belum dikonfigurasi (LITERATURE_PROVIDERS)')
  const settled = await Promise.all(
    providers.map(async (prov) => {
      try {
        const items = await prov.search(p)
        return { name: prov.name, attribution: prov.attribution, ok: true, count: items.length, items }
      } catch (err) {
        return { name: prov.name, attribution: prov.attribution, ok: false, count: 0, items: [], error: { code: (err && err.code) || 'PROVIDER_ERROR', message: err && err.name === 'LiteratureProviderError' ? err.message : 'Penyedia tidak dapat dihubungi' } }
      }
    })
  )
  const candidates = dedupe(settled.flatMap((s) => s.items)).slice(0, p.limit)
  const limitations = [
    'Hasil adalah KANDIDAT, bukan referensi terverifikasi: setiap kandidat harus diverifikasi sebelum masuk daftar referensi proyek.',
    'Cakupan dibatasi provider yang aktif; literatur berbahasa Indonesia (Garuda/Neliti) belum terintegrasi.',
    'Abstrak dan metadata dapat tidak lengkap; kandidat tanpa DOI hanya dapat berstatus sebagian.'
  ]
  if (settled.some((s) => !s.ok)) limitations.push(`Sebagian provider gagal: ${settled.filter((s) => !s.ok).map((s) => s.name).join(', ')}. Hasil bisa tidak lengkap.`)
  if (settled.every((s) => !s.ok)) throw new AppError('PROVIDER_ERROR', 'Semua penyedia literatur gagal merespons')
  return {
    query: p.query,
    fetchedAt: now().toISOString(),
    candidates,
    providers: settled.map(({ name, attribution, ok, count, error }) => ({ name, attribution, ok, count, error: error || null })),
    limitations
  }
}

module.exports = { searchLiterature, validateSearch, dedupe, dedupKey, MAX_LIMIT }
