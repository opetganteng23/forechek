'use strict'

// Ekspor BibTeX (MTS 41.2 B). Sumber HANYA daftar referensi proyek yang berstatus verified. Bidang yang tidak tersedia
// tidak diisi (tanpa tebakan). Karakter khusus di-escape; kunci sitasi divalidasi dan unik.
const TYPE_MAP = { 'journal-article': 'article', article: 'article', 'proceedings-article': 'inproceedings', 'conference-paper': 'inproceedings', inproceedings: 'inproceedings', book: 'book', 'book-chapter': 'incollection', 'posted-content': 'misc', preprint: 'misc' }
const KEY_RE = /^[A-Za-z0-9_:.-]{1,80}$/

// Escape karakter khusus LaTeX pada nilai BibTeX. Tanda kurung kurawal seimbang tidak dijamin pada masukan mentah,
// maka { } ikut di-escape (nilai dibungkus kurung kurawal oleh pemanggil).
function escapeTex(s) {
  return String(s)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\\{}&%$#_^~]/g, (c) => ({ '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '&': '\\&', '%': '\\%', $: '\\$', '#': '\\#', _: '\\_', '^': '\\^{}', '~': '\\~{}' })[c])
}
const field = (name, value) => (value === null || value === undefined || value === '' ? null : `  ${name} = {${escapeTex(value)}}`)

// DOI dan URL BUKAN teks LaTeX: nilainya tidak di-escape (agar tidak berubah). Hanya bentuk yang aman dan valid yang
// ditulis; selain itu bidang dihilangkan (tanpa tebakan/perbaikan).
const DOI_RE = /^10\.\d{4,9}\/[^\s{}\\]+$/
const URL_RE = /^https?:\/\/[^\s{}\\]+$/
const raw = (name, value, re) => (typeof value === 'string' && re.test(value.trim()) ? `  ${name} = {${value.trim()}}` : null)
const nameOf = (a) => {
  const family = /\band\b/i.test(a.family) ? `{${escapeTex(a.family)}}` : escapeTex(a.family) // "and" dalam nama keluarga tidak boleh memecah penulis
  return a.given ? `${family}, ${escapeTex(a.given)}` : family
}

function entryOf(ref, warnings) {
  const type = TYPE_MAP[String(ref.type || '').toLowerCase()] || 'misc'
  const all = (ref.authors || []).filter(Boolean)
  const withFamily = all.filter((a) => a.family)
  if (withFamily.length < all.length) warnings.push(`Referensi ${ref.citeKey}: ${all.length - withFamily.length} penulis tanpa nama keluarga tidak ditulis ke BibTeX.`)
  const authors = withFamily.map(nameOf)
  const venueField = type === 'article' ? 'journal' : type === 'inproceedings' || type === 'incollection' ? 'booktitle' : 'howpublished'
  const lines = [
    authors.length ? `  author = {${authors.join(' and ')}}` : null,
    ref.title ? `  title = {{${escapeTex(ref.title)}}}` : null,
    field('year', ref.year),
    field(venueField, ref.venueName),
    raw('doi', ref.doi, DOI_RE),
    raw('url', ref.url, URL_RE)
  ].filter(Boolean)
  return `@${type}{${ref.citeKey},\n${lines.join(',\n')}\n}`
}

// Hasil: {bib, included: [citeKey], excluded: [{citeKey, reason}], warnings: [string]}
function buildBibtex(references) {
  const included = []
  const excluded = []
  const entries = []
  const seen = new Set()
  const warnings = []
  for (const r of [...references].sort((a, b) => String(a.citeKey).localeCompare(String(b.citeKey)))) {
    const status = r.verification && r.verification.status
    if (status !== 'verified') { excluded.push({ citeKey: r.citeKey, reason: `status ${status || 'tidak diketahui'} (hanya referensi terverifikasi diekspor)` }); continue }
    if (!KEY_RE.test(String(r.citeKey))) { excluded.push({ citeKey: r.citeKey, reason: 'kunci sitasi tidak valid untuk BibTeX' }); continue }
    if (seen.has(String(r.citeKey).toLowerCase())) { excluded.push({ citeKey: r.citeKey, reason: 'kunci sitasi ganda' }); continue }
    if (!r.title) { excluded.push({ citeKey: r.citeKey, reason: 'judul tidak tersedia' }); continue }
    seen.add(String(r.citeKey).toLowerCase())
    entries.push(entryOf(r, warnings))
    included.push(r.citeKey)
  }
  const bib = entries.length ? `${entries.join('\n\n')}\n` : '% Tidak ada referensi terverifikasi pada proyek ini.\n'
  return { bib, included, excluded, warnings }
}

// Validasi hasil: kurung kurawal seimbang, kunci unik, jumlah entri sama dengan yang diekspor.
function validateBibtex(bib, expectedKeys) {
  const errors = []
  let depth = 0
  for (let i = 0; i < bib.length; i++) {
    const c = bib[i]
    if (c === '\\') { i++; continue }
    if (c === '{') depth++
    else if (c === '}') { depth--; if (depth < 0) break }
  }
  if (depth !== 0) errors.push('kurung kurawal tidak seimbang')
  const keys = [...bib.matchAll(/^@\w+\{([^,\s]+),/gm)].map((m) => m[1])
  if (new Set(keys).size !== keys.length) errors.push('kunci sitasi ganda')
  if (keys.length !== expectedKeys.length || keys.some((k) => !expectedKeys.includes(k))) errors.push('daftar kunci tidak sesuai dengan referensi terverifikasi')
  return errors
}

module.exports = { buildBibtex, validateBibtex, escapeTex, KEY_RE }
