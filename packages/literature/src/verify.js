'use strict'
const { AppError } = require('@publication-prepare/core')
const { normalizeDoi, normalizeTitle, cleanText } = require('./normalize')
const { THRESHOLDS, titleSimilarity, compareAuthors, compareYear } = require('./compare')

// Pipeline verifikasi (MTS 39.2 C). TIDAK cukup memeriksa DOI resolve (HTTP 200): judul, penulis, dan tahun
// dibandingkan dengan toleransi terdokumentasi di compare.js. Aturan keputusan (provisional, D4-02):
//
//  Tanpa DOI di input:
//    - Tidak pernah `verified` (hanya `partial` bila metadata ditemukan cocok di provider, disertai DOI saran; selain itu `unverified`).
//  Dengan DOI:
//    - DOI tidak ditemukan di semua resolver            -> unverified (DOI_NOT_FOUND)
//    - semua resolver gagal (jaringan)                  -> unverified (PROVIDER_UNAVAILABLE), bukan verified
//    - judul input kemiripan < titleNear                -> unverified (TITLE_MISMATCH: DOI menunjuk karya lain)
//    - ditemukan flag retraction pada resolver mana pun -> retracted (selama judul >= titleNear)
//    - judul >= titleMatch DAN ada pembanding lain (penulis atau tahun) yang cocok, tanpa ketidakcocokan -> verified
//    - input tanpa judul, atau hanya judul tanpa pembanding lain                                          -> partial
//    - selain itu (judul mirip tetapi penulis/tahun/judul tidak cocok)                                    -> partial dengan daftar mismatch
function emptyResult(status, notes, extra = {}) {
  return { status, matchedFields: [], mismatches: [], notes, canonical: null, provider: null, providers: [], checkedAt: new Date().toISOString(), ...extra }
}

function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AppError('VALIDATION_ERROR', 'Input referensi harus berupa objek')
  const out = {}
  if (input.doi !== undefined && input.doi !== null && input.doi !== '') {
    out.doi = normalizeDoi(input.doi)
    if (!out.doi) throw new AppError('VALIDATION_ERROR', 'Format DOI tidak valid')
  }
  if (input.title !== undefined && input.title !== null && input.title !== '') {
    if (typeof input.title !== 'string' || input.title.length > 500) throw new AppError('VALIDATION_ERROR', 'Judul harus teks maksimal 500 karakter')
    out.title = cleanText(input.title, 500)
  }
  if (input.authors !== undefined && input.authors !== null) {
    if (!Array.isArray(input.authors) || input.authors.length > 100) throw new AppError('VALIDATION_ERROR', 'authors harus array maksimal 100')
    out.authors = input.authors.map((a) => {
      if (typeof a === 'string') {
        const parts = a.trim().split(/\s+/)
        return { given: parts.slice(0, -1).join(' '), family: parts[parts.length - 1] || '' }
      }
      if (!a || typeof a.family !== 'string') throw new AppError('VALIDATION_ERROR', 'Setiap penulis wajib memiliki family')
      return { given: typeof a.given === 'string' ? a.given : '', family: a.family }
    }).filter((a) => a.family)
  }
  if (input.year !== undefined && input.year !== null && input.year !== '') {
    const y = Number(input.year)
    if (!Number.isInteger(y) || y < 1800 || y > new Date().getUTCFullYear() + 1) throw new AppError('VALIDATION_ERROR', 'Tahun tidak valid')
    out.year = y
  }
  if (!out.doi && !out.title) throw new AppError('VALIDATION_ERROR', 'Isi minimal DOI atau judul')
  return out
}

async function resolveDoi(resolvers, doi) {
  const found = []
  const errors = []
  for (const r of resolvers) {
    if (typeof r.getByDoi !== 'function') continue
    try {
      const rec = await r.getByDoi(doi)
      if (rec) found.push(rec)
    } catch (err) {
      errors.push({ provider: r.name, code: (err && err.code) || 'PROVIDER_ERROR' })
    }
  }
  return { found, errors, attempted: resolvers.filter((r) => typeof r.getByDoi === 'function').length }
}

function compareToRecord(input, rec) {
  const matched = []
  const mismatches = []
  const sim = input.title ? titleSimilarity(input.title, rec.title) : null
  if (sim !== null) (sim >= THRESHOLDS.titleMatch ? matched : mismatches).push('title')
  const au = compareAuthors(input.authors, rec.authors)
  if (au.comparable) (au.firstAuthorMatch ? matched : mismatches).push('first_author')
  if (au.comparable && au.firstAuthorMatch && !au.listConsistent) mismatches.push('authors')
  const yr = compareYear(input.year, rec.year)
  if (yr.comparable) (yr.match ? matched : mismatches).push('year')
  return { sim, au, yr, matched, mismatches }
}

async function verifyReference({ input, resolvers, searchers = [], now = () => new Date() }) {
  const inp = validateInput(input)
  const checkedAt = now().toISOString()
  const done = (status, extra) => ({ ...emptyResult(status, []), checkedAt, ...extra })

  if (!inp.doi) {
    // Tanpa DOI: cari berdasarkan metadata; paling tinggi `partial`.
    let best = null
    const errors = []
    for (const s of searchers) {
      try {
        const items = await s.search({ query: `${inp.title} ${(inp.authors && inp.authors[0] && inp.authors[0].family) || ''}`.trim(), limit: 5 })
        for (const rec of items) {
          const c = compareToRecord(inp, rec)
          if (c.sim >= THRESHOLDS.titleMatch && !c.mismatches.length && (!best || c.sim > best.sim)) best = { rec, ...c }
        }
      } catch (err) {
        errors.push({ provider: s.name, code: (err && err.code) || 'PROVIDER_ERROR' })
      }
    }
    if (best) {
      return done('partial', {
        matchedFields: best.matched,
        notes: ['FOUND_BY_METADATA_NO_DOI', best.rec.doi ? `SUGGESTED_DOI:${best.rec.doi}` : 'NO_DOI_AT_PROVIDER', 'Tanpa DOI input, referensi tidak dapat berstatus terverifikasi; tambahkan DOI lalu verifikasi ulang.'],
        canonical: best.rec,
        provider: best.rec.provider,
        providers: [best.rec.provider]
      })
    }
    return done('unverified', { notes: [errors.length === searchers.length && searchers.length ? 'PROVIDER_UNAVAILABLE' : 'NOT_FOUND_BY_METADATA'], providers: [] })
  }

  const resolverCaps = new Map(resolvers.map((r) => [r.name, r.detectsRetraction !== false]))
  const { found, errors, attempted } = await resolveDoi(resolvers, inp.doi)
  if (found.length === 0) {
    const allFailed = attempted > 0 && errors.length === attempted
    return done('unverified', { notes: [allFailed ? 'PROVIDER_UNAVAILABLE' : 'DOI_NOT_FOUND'] })
  }

  const primary = found[0]
  const retracted = found.some((r) => r.retracted)
  const c = compareToRecord(inp, primary)
  const providers = found.map((r) => r.provider)
  const base = { matchedFields: c.matched, mismatches: c.mismatches, canonical: { ...primary, retracted }, provider: primary.provider, providers }

  if (inp.title && c.sim < THRESHOLDS.titleNear) return done('unverified', { ...base, matchedFields: c.matched.filter((f) => f !== 'title'), notes: ['TITLE_MISMATCH', 'DOI menunjuk ke karya lain daripada judul yang diberikan'] })
  if (retracted) return done('retracted', { ...base, notes: ['RETRACTION_DETECTED'] })
  if (!inp.title) return done('partial', { ...base, notes: ['DOI_RESOLVES_ONLY', 'Judul tidak diberikan sehingga metadata tidak dapat dicocokkan'] })
  const hasOther = c.au.comparable || c.yr.comparable
  if (c.sim >= THRESHOLDS.titleMatch && hasOther && c.mismatches.length === 0) {
    // Judul sangat pendek tidak cukup unik untuk dicocokkan.
    if (normalizeTitle(inp.title).length < THRESHOLDS.minTitleChars) return done('partial', { ...base, notes: ['TITLE_TOO_SHORT', 'Judul terlalu pendek untuk memverifikasi kecocokan karya'] })
    // Provider yang mampu mendeteksi retraction harus semuanya menjawab; kalau tidak, retraction tidak dapat dikesampingkan.
    const capable = (name) => (resolverCaps.has(name) ? resolverCaps.get(name) : true)
    if (errors.some((e) => capable(e.provider))) return done('partial', { ...base, notes: ['PARTIAL_PROVIDER_OUTAGE', 'Sebagian provider pendeteksi retraction tidak menjawab; retraction belum dapat dikesampingkan'] })
    if (!found.some((r) => capable(r.provider))) return done('partial', { ...base, notes: ['RETRACTION_CHECK_UNAVAILABLE', 'Tidak ada provider pendeteksi retraction yang menjawab'] })
    return done('verified', { ...base, notes: [] })
  }
  if (!hasOther && c.mismatches.length === 0) return done('partial', { ...base, notes: ['ONLY_TITLE_COMPARED', 'Tambahkan penulis atau tahun agar dapat diverifikasi'] })
  return done('partial', { ...base, notes: ['METADATA_MISMATCH'] })
}

module.exports = { verifyReference, validateInput }
