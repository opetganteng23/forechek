'use strict'
const { extractCitations, validateCitations } = require('@publication-prepare/literature')

// Pemeriksaan deterministik (MTS 10.1, 40.2 B). Fungsi MURNI: hasil sama untuk masukan yang sama (tanpa jam sistem
// selain `now` yang diinjeksi, tanpa jaringan, tanpa model). Setiap hasil: status + detail + evidence berlokasi.
// status: pass | warn | fail | not_applicable | manual_review. `critical` menandai blocker yang menahan label "siap".
// Ambang di THRESHOLDS bersifat PROVISIONAL (keputusan D5-02) dan versi-nya tercatat di laporan.
const THRESHOLDS = Object.freeze({
  version: 'checks-provisional-0.1',
  doiCoverageWarnBelow: 0.7,
  recencyWarnBelow: 0.5,
  defaultRecentYears: 5,
  wordsPerPageEstimate: 500
})

const BASE_REQUIRED = ['abstract', 'introduction', 'conclusion', 'references']
// Kunci bagian yang dianggap setara (naskah menggabungkan hasil dan pembahasan).
const ALIASES = { results: ['results', 'results_discussion'], discussion: ['discussion', 'results_discussion'], results_discussion: ['results_discussion'] }
// Pola deklarasi: frasa deklaratif, bukan kata lepas ("ethical implications", "we grant that" tidak dihitung).
const DECL_PATTERNS = {
  ethics: /\b(ethics (statement|approval|committee|board|clearance)|ethical (approval|clearance|statement|review|considerations?)|irb|institutional review|informed consent|persetujuan (etik|komite)|komite etik|kaji etik|izin etik|etika penelitian)\b/i,
  data_availability: /(data availability|availability of data|ketersediaan data|data (is|are|can be) (available|obtained|accessible|shared)|(code|dataset|data)[^.\n]{0,60}available (at|on|in|upon|from)|publicly available|dapat diakses|tersedia (di|pada|secara)|data tersedia)/i,
  funding: /\b(funding|funded by|supported by|financial support|(grant|award) (no|number|id|from)|awards?|pendanaan|didanai|hibah|dana penelitian|tidak (menerima|mendapat)(kan)? (dana|pendanaan|hibah))\b/i,
  conflict_of_interest: /(conflict[s]? of interest|competing interests?|konflik kepentingan)/i,
  credit: /(credit author|credit taxonomy|author contributions?|kontribusi penulis)/i,
  orcid: /(orcid\.org|\b\d{4}-\d{4}-\d{4}-\d{3}[\dX]\b)/i
}
const DECL_LABEL = { ethics: 'pernyataan etik', data_availability: 'ketersediaan data', funding: 'pendanaan', conflict_of_interest: 'konflik kepentingan', credit: 'kontribusi penulis (CRediT)', orcid: 'ORCID' }

const lineOf = (source, offset) => source.slice(0, Math.max(0, offset)).split('\n').length
const snip = (s, max = 140) => (s.length > max ? `${s.slice(0, max)}...` : s).replace(/\s+/g, ' ').trim()

function ev(source, start, end, extra = {}) {
  return { line: lineOf(source, start), start, end, snippet: snip(source.slice(start, Math.min(end, start + 400))), ...extra }
}

const HEADING_FALLBACK = { conclusion: /(conclu|kesimpulan|simpulan|penutup)/i }
function hasSection(sections, key) {
  const keys = ALIASES[key] || [key]
  return sections.find((s) => keys.includes(s.key)) || (HEADING_FALLBACK[key] && sections.find((s) => HEADING_FALLBACK[key].test(s.heading || '')))
}

function result(checkId, group, label, status, detail, evidence = [], extra = {}) {
  return { checkId, group, label, status, detail, evidence, critical: false, ...extra }
}

// Abstrak sebaris ("**Abstract—** teks"): dikenali sebagai abstrak bila parser tidak menemukan bagian abstrak.
const INLINE_ABSTRACT = /^[ \t]*(\*\*|__)?(abstract|abstrak)[ \t]*[—–:-]*(\*\*|__)?[ \t]*[—–:-]*[ \t]*(?=\S)/im

function runChecks({ source, parse, references = [], venue = null, now = new Date() }) {
  source = String(source).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n') // offset parser mengacu ke teks ternormalisasi
  references = [...references].sort((a, b) => String(a.citeKey).localeCompare(String(b.citeKey))) // urutan masukan tidak memengaruhi hasil
  const out = []
  const sections = parse.sections || []
  const refsSection = sections.find((s) => s.key === 'references')
  const venueName = venue ? venue.name : null
  const venueNote = venue ? '' : ' (pilih venue untuk aturan spesifik)'

  // 1. Struktur dan kelengkapan bagian
  const required = venue ? venue.format.requiredSections : BASE_REQUIRED
  const missing = required.filter((k) => !hasSection(sections, k) && !(k === 'abstract' && INLINE_ABSTRACT.test(source)))
  out.push(
    result(
      'structure.required_sections',
      'structure',
      'Bagian wajib',
      missing.length ? 'fail' : 'pass',
      missing.length ? `Bagian wajib belum terdeteksi: ${missing.join(', ')}.${venue ? '' : ' (aturan umum; pilih venue untuk aturan spesifik)'}` : `Semua bagian wajib terdeteksi (${required.join(', ')}).`,
      sections.slice(0, 20).map((s) => ev(source, s.start, s.bodyStart, { section: s.heading })),
      { critical: missing.length > 0 && Boolean(venue), rule: venue ? `venue:${venue.slug}` : 'umum' }
    )
  )
  const recommended = venue ? (venue.format.recommendedSections || []).filter((k) => !hasSection(sections, k)) : []
  if (venue && (venue.format.recommendedSections || []).length) {
    out.push(result('structure.recommended_sections', 'structure', 'Bagian yang disarankan', recommended.length ? 'warn' : 'pass', recommended.length ? `Bagian yang disarankan belum terdeteksi: ${recommended.join(', ')}.` : 'Semua bagian yang disarankan ada.'))
  }
  out.push(result('structure.title', 'structure', 'Judul', parse.title ? 'pass' : 'warn', parse.title ? `Judul terdeteksi: "${snip(parse.title, 100)}".` : 'Judul tidak terdeteksi (tidak ada heading level 1 / \\title).'))

  // 2. Abstrak dan kata kunci
  let abs = sections.find((s) => s.key === 'abstract')
  let aw = parse.stats ? parse.stats.abstractWords : 0
  if (!abs) {
    const m = INLINE_ABSTRACT.exec(source)
    if (m) {
      const stop = source.indexOf('\n\n', m.index + m[0].length)
      const end = stop < 0 ? source.length : stop
      abs = { start: m.index, end, heading: 'Abstract (sebaris)' }
      aw = source.slice(m.index + m[0].length, end).trim().split(/\s+/).filter(Boolean).length
    }
  }
  const absRule = venue && venue.format.abstractWords
  if (!abs) {
    out.push(result('abstract.word_count', 'abstract', 'Jumlah kata abstrak', required.includes('abstract') ? 'fail' : 'warn', 'Abstrak tidak terdeteksi.'))
  } else if (!absRule) {
    out.push(result('abstract.word_count', 'abstract', 'Jumlah kata abstrak', 'not_applicable', `Abstrak ${aw} kata. ${venue ? 'Venue tidak menetapkan batas kata abstrak.' : 'Pilih venue untuk batas kata.'}`, [ev(source, abs.start, abs.end, { section: abs.heading })]))
  } else {
    const bad = (absRule.min !== undefined && aw < absRule.min) || (absRule.max !== undefined && aw > absRule.max)
    out.push(result('abstract.word_count', 'abstract', 'Jumlah kata abstrak', bad ? 'fail' : 'pass', `Abstrak ${aw} kata; batas venue ${absRule.min ?? '-'}-${absRule.max ?? '-'}.`, [ev(source, abs.start, abs.end, { section: abs.heading })]))
  }
  const kw = (parse.keywords || []).length
  const kwRule = venue && venue.format.keywords
  if (!kw) out.push(result('keywords.count', 'abstract', 'Kata kunci', kwRule ? 'fail' : 'warn', 'Kata kunci tidak terdeteksi.'))
  else if (!kwRule) out.push(result('keywords.count', 'abstract', 'Kata kunci', 'not_applicable', `${kw} kata kunci terdeteksi.${venueNote}`))
  else out.push(result('keywords.count', 'abstract', 'Kata kunci', (kwRule.min !== undefined && kw < kwRule.min) || (kwRule.max !== undefined && kw > kwRule.max) ? 'fail' : 'pass', `${kw} kata kunci; batas venue ${kwRule.min ?? '-'}-${kwRule.max ?? '-'}.`))

  const words = parse.stats ? parse.stats.words : 0
  const wRule = venue && venue.format.words
  out.push(result('length.word_count', 'length', 'Jumlah kata naskah', !wRule ? 'not_applicable' : (wRule.min !== undefined && words < wRule.min) || (wRule.max !== undefined && words > wRule.max) ? 'fail' : 'pass', wRule ? `${words} kata; batas ${wRule.min ?? '-'}-${wRule.max ?? '-'}.` : `${words} kata. Venue tidak menetapkan batas kata.`))

  // 3. Konsistensi sitasi dan daftar pustaka (bagian referensi tidak ikut dipindai sebagai teks sitasi)
  const body = refsSection ? source.slice(0, refsSection.start) + ' '.repeat(refsSection.end - refsSection.start) + source.slice(refsSection.end) : source
  // Pemindai sitasi dibatasi panjang masukan; di atas batas (atau bila gagal) hasil ditandai manual_review, bukan crash.
  // Angka dalam kurung siku yang menempel pada kata/kurung (a[1], p[4]) adalah indeks larik/URL, bukan sitasi numerik.
  const glued = (c) => c.kind === 'numeric' && /[\w\])]/.test(body[c.start - 1] || '')
  let cites = []
  let val = { issues: [], citations: [] }
  let citeError = null
  try {
    cites = extractCitations(body).filter((c) => !glued(c))
    val = validateCitations(body, references)
    val = { ...val, issues: val.issues.filter((i) => !(i.start !== undefined && /[\w\])]/.test(body[i.start - 1] || '') && body[i.start] === '[')) }
  } catch (err) {
    citeError = err && (err.code === 'TEXT_TOO_LONG' || err.message === 'TEXT_TOO_LONG') ? 'Naskah terlalu panjang untuk pemindaian sitasi otomatis' : 'Pemindaian sitasi otomatis gagal'
  }
  const numeric = cites.filter((c) => c.kind === 'numeric')
  const issues = val.issues.filter((i) => i.start !== undefined)
  const orphan = issues.filter((i) => i.type === 'orphan')
  const unver = issues.filter((i) => i.type === 'unverified')
  const retracted = issues.filter((i) => i.type === 'retracted')
  const ambiguous = issues.filter((i) => i.type === 'ambiguous' && !numeric.some((n) => n.start === i.start))
  const evOf = (list) => list.slice(0, 15).map((i) => ev(source, i.start, i.start + i.citation.length, { citation: i.citation, detail: i.detail }))
  if (citeError) out.push(result('citations.orphan', 'citations', 'Sitasi tanpa referensi terdaftar', 'manual_review', `${citeError}; periksa sitasi secara manual atau pecah naskah.`))
  else out.push(result('citations.orphan', 'citations', 'Sitasi tanpa referensi terdaftar', orphan.length ? 'fail' : 'pass', orphan.length ? `${orphan.length} sitasi tidak menunjuk ke referensi proyek: ${[...new Set(orphan.map((o) => o.detail))].slice(0, 8).join(', ')}.` : 'Tidak ada sitasi yatim.', evOf(orphan), { critical: orphan.length > 0 }))
  if (!citeError) out.push(result('citations.unverified', 'citations', 'Sitasi ke referensi belum terverifikasi', unver.length ? 'warn' : 'pass', unver.length ? `${unver.length} sitasi menunjuk ke referensi berstatus belum terverifikasi/sebagian.` : 'Semua sitasi yang dapat dipetakan menunjuk ke referensi terverifikasi.', evOf(unver)))
  if (!citeError) out.push(result('citations.retracted', 'citations', 'Sitasi ke referensi ditarik (retracted)', retracted.length ? 'fail' : 'pass', retracted.length ? `${retracted.length} sitasi menunjuk ke referensi yang ditarik (retracted).` : 'Tidak ada sitasi ke referensi yang ditarik.', evOf(retracted), { critical: retracted.length > 0 }))
  if (ambiguous.length) out.push(result('citations.ambiguous', 'citations', 'Sitasi ambigu', 'manual_review', `${ambiguous.length} sitasi ambigu (beberapa referensi cocok); tinjau manual.`, evOf(ambiguous)))
  if (numeric.length) {
    const entries = refsSection ? source.slice(refsSection.bodyStart, refsSection.end).split('\n').filter((l) => /^\s*(\[\d{1,3}\]|\d{1,3}[.)])\s+\S/.test(l)).length : 0
    const maxCited = Math.max(...numeric.flatMap((n) => n.numbers))
    if (refsSection && entries && maxCited > entries) out.push(result('citations.numeric_range', 'citations', 'Sitasi numerik', 'fail', `Sitasi menunjuk nomor ${maxCited}, tetapi daftar pustaka naskah hanya memuat ${entries} entri.`, numeric.slice(0, 10).map((n) => ev(source, n.start, n.end, { citation: n.raw })), { critical: true }))
    else out.push(result('citations.numeric_range', 'citations', 'Sitasi numerik', 'manual_review', `${numeric.length} sitasi numerik tidak dapat dipetakan otomatis ke referensi terverifikasi proyek (pemetaan lewat urutan ekspor ada di Tahap 6).${entries ? ` Daftar pustaka naskah: ${entries} entri.` : ''}`, numeric.slice(0, 10).map((n) => ev(source, n.start, n.end, { citation: n.raw }))))
  }
  const used = new Set((val.citations || []).flatMap((c) => (c.resolvedKeys || []).concat((c.keys || []))))
  const unusedRefs = references.filter((r) => !used.has(r.citeKey))
  if (!citeError) out.push(result('citations.unused_references', 'citations', 'Referensi proyek yang tidak disitasi', unusedRefs.length ? 'warn' : 'pass', unusedRefs.length ? `${unusedRefs.length} referensi proyek tidak disitasi di naskah: ${unusedRefs.slice(0, 8).map((r) => r.citeKey).join(', ')}.` : 'Semua referensi proyek disitasi.'))
  if (parse.warnings && parse.warnings.some((w) => w.code === 'BIB_EXTERNAL')) out.push(result('citations.external_bib', 'citations', 'Daftar pustaka eksternal', 'manual_review', 'Naskah memakai \\bibliography{...} eksternal; isi berkas .bib tidak tersedia untuk diperiksa.'))

  // 4. Gaya sitasi
  const kinds = new Set(cites.map((c) => (c.kind === 'authoryear' ? 'authoryear' : c.kind === 'numeric' ? 'numeric' : c.kind)))
  const styleExpected = venue && venue.references.style
  const detected = [...kinds].filter((k) => k === 'numeric' || k === 'authoryear')
  let styleStatus = citeError ? 'manual_review' : 'pass'
  let styleDetail = cites.length ? `Gaya sitasi terdeteksi: ${[...kinds].join(', ')}.` : 'Tidak ada sitasi terdeteksi di naskah.'
  if (citeError) styleDetail = `${citeError}; gaya sitasi tidak dapat ditentukan.`
  else if (!cites.length) styleStatus = 'warn'
  else if (detected.length > 1) { styleStatus = 'warn'; styleDetail += ' Gaya numerik dan penulis-tahun bercampur.' }
  else if (!styleExpected || styleExpected === 'custom') { styleStatus = 'manual_review'; styleDetail += ` ${venue ? 'Gaya sitasi venue tidak ditetapkan.' : 'Pilih venue.'}` }
  else if (detected.length === 1) {
    const want = styleExpected === 'ieee' || styleExpected === 'vancouver' ? 'numeric' : 'authoryear'
    if (detected[0] !== want) { styleStatus = 'warn'; styleDetail += ` Venue mengharapkan gaya ${styleExpected}.` }
  }
  out.push(result('citations.style', 'citations', 'Gaya sitasi', styleStatus, styleDetail))

  // 5. DOI, status verifikasi, dan keterbaruan referensi
  const nRefs = references.length
  if (!nRefs) {
    out.push(result('references.library', 'references', 'Daftar referensi proyek', 'warn', 'Belum ada referensi terverifikasi di proyek ini.'))
  } else {
    const withDoi = references.filter((r) => r.doi).length
    const cov = withDoi / nRefs
    out.push(result('references.doi_coverage', 'references', 'Cakupan DOI', cov < THRESHOLDS.doiCoverageWarnBelow ? 'warn' : 'pass', `${withDoi}/${nRefs} referensi memiliki DOI (${Math.round(cov * 100)}%); peringatan bila di bawah ${Math.round(THRESHOLDS.doiCoverageWarnBelow * 100)}%.`))
    const by = (s) => references.filter((r) => (r.verification && r.verification.status) === s).length
    const rt = by('retracted')
    const notOk = nRefs - by('verified') - rt
    out.push(result('references.verification_status', 'references', 'Status verifikasi referensi', rt ? 'fail' : notOk ? 'warn' : 'pass', `Terverifikasi ${by('verified')}, sebagian ${by('partial')}, belum ${by('unverified')}, ditarik ${rt}.`, [], { critical: rt > 0 }))
    const years = references.map((r) => r.year).filter((y) => y && y <= now.getUTCFullYear() + 1)
    const recentYears = (venue && venue.references.recentYears) || THRESHOLDS.defaultRecentYears
    if (!years.length) out.push(result('references.recency', 'references', 'Keterbaruan referensi', 'manual_review', 'Tahun terbit referensi tidak tersedia.'))
    else {
      const cutoff = now.getUTCFullYear() - recentYears
      const recent = years.filter((y) => y >= cutoff).length / years.length
      out.push(result('references.recency', 'references', 'Keterbaruan referensi', recent < THRESHOLDS.recencyWarnBelow ? 'warn' : 'pass', `${Math.round(recent * 100)}% referensi terbit sejak ${cutoff} (${recentYears} tahun terakhir); peringatan bila di bawah ${Math.round(THRESHOLDS.recencyWarnBelow * 100)}%.`))
    }
  }
  out.push(result('references.self_citation', 'references', 'Self-citation', 'not_applicable', 'Penulis naskah tidak tersedia pada data proyek, sehingga self-citation tidak dapat dihitung (sinyal, bukan pelanggaran).'))

  // 6. Double-blind dan identitas
  if (!venue || venue.reviewPolicy === 'unknown') {
    out.push(result('blind.identity_leakage', 'blind', 'Kebocoran identitas (double-blind)', 'manual_review', venue ? 'Kebijakan blind venue belum diketahui; tinjau manual.' : 'Pilih venue untuk memeriksa kebijakan blind.'))
  } else if (venue.reviewPolicy !== 'double_blind') {
    out.push(result('blind.identity_leakage', 'blind', 'Kebocoran identitas (double-blind)', 'not_applicable', `Kebijakan review venue: ${venue.reviewPolicy}.`))
  } else {
    const signals = []
    for (const m of body.matchAll(/[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63}){1,5}/g)) signals.push(ev(source, m.index, m.index + m[0].length, { signal: 'email' }))
    for (const m of source.matchAll(/orcid\.org\/\d{4}-\d{4}-\d{4}-\d{3}[\dX]|\b\d{4}-\d{4}-\d{4}-\d{3}[\dX]\b/gi)) signals.push(ev(source, m.index, m.index + m[0].length, { signal: 'orcid' }))
    for (const m of body.matchAll(/\\author\s*\{|\\IEEEauthorblock/g)) signals.push(ev(source, m.index, m.index + m[0].length, { signal: 'author_block' }))
    for (const m of body.matchAll(/\b(our (previous|prior|earlier) work|kami (sebelumnya|telah)|penelitian kami sebelumnya)\b/gi)) signals.push(ev(source, m.index, m.index + m[0].length, { signal: 'self_reference' }))
    out.push(result('blind.identity_leakage', 'blind', 'Kebocoran identitas (double-blind)', signals.length ? 'warn' : 'manual_review', signals.length ? `${signals.length} sinyal identitas terdeteksi (email/ORCID/blok penulis/rujukan diri). Pemeriksaan otomatis terbatas.` : 'Tidak ada sinyal otomatis, tetapi pemeriksaan identitas tetap perlu ditinjau manual.', signals.slice(0, 15)))
  }

  // 7. Batas halaman: hanya ESTIMASI (tanpa PDF kompilasi)
  const pageMax = venue && venue.format.pages && venue.format.pages.max
  if (!pageMax) out.push(result('length.page_estimate', 'length', 'Estimasi halaman', 'not_applicable', `Batas halaman tidak ditetapkan${venue ? ' oleh profil venue' : ''}. Tanpa PDF kompilasi, halaman hanya dapat diestimasi.`))
  else {
    const pages = Math.ceil(words / THRESHOLDS.wordsPerPageEstimate)
    out.push(result('length.page_estimate', 'length', 'Estimasi halaman', pages > pageMax ? 'warn' : 'pass', `ESTIMASI kasar ${pages} halaman (${THRESHOLDS.wordsPerPageEstimate} kata/halaman, bukan PDF kompilasi); batas venue ${pageMax}.`, [], { limitation: 'estimasi' }))
  }

  // 8. Deklarasi wajib venue
  if (!venue) out.push(result('declarations.required', 'declarations', 'Deklarasi wajib venue', 'not_applicable', 'Pilih venue untuk memeriksa deklarasi wajib.'))
  else if (!venue.requiredDeclarations.length) out.push(result('declarations.required', 'declarations', 'Deklarasi wajib venue', 'not_applicable', 'Profil venue tidak mewajibkan deklarasi tertentu.'))
  else {
    const missingDecl = []
    const found = []
    for (const d of venue.requiredDeclarations) {
      const m = DECL_PATTERNS[d].exec(body)
      if (m) found.push(ev(source, m.index, m.index + m[0].length, { declaration: d }))
      else missingDecl.push(d)
    }
    out.push(result('declarations.required', 'declarations', 'Deklarasi wajib venue', missingDecl.length ? 'fail' : 'pass', missingDecl.length ? `Deklarasi wajib belum ditemukan: ${missingDecl.map((d) => DECL_LABEL[d]).join(', ')}.` : 'Semua deklarasi wajib ditemukan (pencarian kata kunci).', found, { critical: missingDecl.length > 0, limitation: 'pencarian kata kunci; isi deklarasi tidak dinilai' }))
  }

  return out
}

function summarizeChecks(list) {
  const counts = { pass: 0, warn: 0, fail: 0, not_applicable: 0, manual_review: 0 }
  for (const c of list) counts[c.status]++
  return { counts, criticalFailures: list.filter((c) => c.critical && c.status === 'fail').map((c) => c.checkId), thresholdsVersion: THRESHOLDS.version }
}

module.exports = { runChecks, summarizeChecks, THRESHOLDS, BASE_REQUIRED, DECL_PATTERNS }
