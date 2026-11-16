'use strict'
const { normalizeFamily, normalizeDoi, normalizeTitle } = require('./normalize')

// Parser dan validator sitasi (MTS 8, 39.2 F). KONTROL INTI: sitasi hanya sah bila menunjuk ke catatan referensi proyek
// berstatus `verified`. Apa pun yang tampak seperti sitasi tetapi tidak punya rekaman TIDAK lolos (keputusan D4-04/D4-08/D4-10).
// Pendekatan: deteksi LUAS (lebih baik salah-tandai prosa daripada meloloskan sitasi karangan); teks dinormalkan (NFKC, entitas,
// digit Arab, tanpa karakter lebar-nol); penanda tebal/miring diabaikan saat pemindaian; blok kode tidak dipindai; SEMUA regex
// berbatas (tanpa backtracking tak terbatas) dan input dibatasi ukurannya agar tidak membekukan proses (ReDoS).
const MARK_UNVERIFIED = '[referensi belum terverifikasi]'
const MARK_RETRACTED = '[referensi ditarik (retracted), jangan disitasi]'
const MAX_INPUT_CHARS = 80000

const ZERO_WIDTH = /[​-‍⁠﻿­]/g
const ENTITIES = { nbsp: ' ', lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' }
function normalizeText(t) {
  return String(t || '')
    .normalize('NFKC')
    .replace(ZERO_WIDTH, '')
    .replace(/&(?:#(\d{1,6})|#x([0-9a-f]{1,5})|([a-z]{2,6}));/gi, (m, d, h, n) => (d ? String.fromCodePoint(Number(d)) : h ? String.fromCodePoint(parseInt(h, 16)) : ENTITIES[n.toLowerCase()] ?? m))
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
}
// Penanda tebal/miring (*, _, ~) di batas kata diganti spasi (panjang sama) hanya untuk pemindaian; kunci seperti smith_2020 utuh.
const blankEmphasis = (t) => t.replace(/(?<![\p{L}\p{N}])[*_~]+|[*_~]+(?![\p{L}\p{N}])/gu, (m) => ' '.repeat(m.length))

const PARTICLES = '(?:van|de|der|den|von|la|le|di|da|al|el|bin|binti|ibn|dos|du|ter)'
const NAME_RE = new RegExp(`^(?:${PARTICLES}\\s+){0,2}[\\p{Lu}\\p{Lo}][\\p{L}'\\u2019-]*$`, 'u')
const INITIAL_RE = /^(?:\p{Lu}\.?){1,3}$/u
const TITLE_WORDS = /^(?:dr|prof|mr|mrs|ms|ir|drs|dra)\.?$/i
const NOT_NAME = /^(?:jan(?:uari|uary)?|feb(?:ruari|ruary)?|mar(?:et|ch)?|apr(?:il)?|mei|may|jun[ei]?|jul[iy]?|agu(?:stus)?|aug(?:ust)?|sep(?:t(?:ember)?)?|okt(?:ober)?|oct(?:ober)?|nov(?:ember)?|des(?:ember)?|dec(?:ember)?|table|tabel|figure|gambar|fig|windows|covid|versi|version|tahun|year|sejak|since|pada|in|di|iso|ieee|rfc|ke|sd|kuartal|semester|tahap|bab|pasal|and|dan|et|al|dkk|the|a|an)$/i
const LEADIN = /^(?:e\.g\.,?|i\.e\.,?|see(?:,)?(?: also)?(?:,? e\.g\.,?)?|cf\.|compare|as cited in|cited in|in|per|via|for a review(?:,)? see|lihat(?: juga)?(?::)?|mis\.|misalnya|bdk\.|bandingkan|dikutip dalam|menurut|according to|also|and|dan|&|dalam|oleh|by)\s+/i
const YEAR_G = /((?:19|20)\d{2})(?:[/–-]\d{2,4})?[a-z]?(?:\s*,\s*[a-z]\b)?|\b(?:n\.d\.|t\.t\.|in press|forthcoming|akan terbit|dalam proses terbit)/gi
const LOCATOR = /^(?:\s{0,3}[,:]\s{0,3}(?:pp?\.|hlm\.|hal\.|halaman|table|tabel|fig\.?|figure|chap\.?|bab|ch\.)?\s{0,3}\d{1,5}(?:\s{0,3}[-–]\s{0,3}\d{1,5})?){1,3}/i

const LATEX_RE = /\\([A-Za-z]{0,20}[Cc]ite[A-Za-z]{0,20})\*?(?:\s{0,5}\[[^\]]{0,200}(?:\[[^\]]{0,50}\][^\]]{0,200})?\]){0,2}\s{0,5}\{([^}]{0,500})\}/g
const LATEX_EXTRA_GROUP = /^\s{0,5}\{([^}]{0,500})\}/
const LATEX_NOTE = /\[([^\]]{0,200})\]/g
const PANDOC_RE = /\[[^\]\n]{0,300}@[A-Za-z0-9_][^\]\n]{0,300}\]/g
const PANDOC_KEY = /(?:^|[\s;[,-])-?@([A-Za-z0-9_][A-Za-z0-9_:.#$%&+?<>~/-]{0,100})/g
const BARE_AT_RE = /(?<![\w@.\/-])@([A-Za-z][A-Za-z0-9_:.-]{1,60}[A-Za-z0-9])/g
const NUMERIC_RE = /\[\s{0,3}(\d{1,3}[a-z]?(?:\s{0,3}[,;–—-]\s{0,3}\d{1,3}[a-z]?){0,20})\s{0,3}\]/g
const SUPER_RE = /(?<=\S)\^\{?\d{1,3}\}?|<sup>\s{0,3}\d{1,3}\s{0,3}<\/sup>/g
const PAREN_RE = /\(([^()]{3,300})\)/g
const BRACKET_RE = /\[([^[\]]{3,300})\]/g
const PAREN_YEAR_RE = /\(\s{0,3}((?:19|20)\d{2}[a-z]?(?:\s{0,3}[,:][^)]{0,40})?|n\.d\.|in press|forthcoming)\s{0,3}\)/gi
const INIT_YEAR_RE = /(?<=\p{Lu}\.)\s{0,3}((?:19|20)\d{2})[a-z]?(?!\d)/gu
const COMMA_YEAR_RE = /,\s{0,3}((?:19|20)\d{2})[a-z]?(?!\d)/g
const IBID_RE = /\b(?:ibid|op\.\s{0,2}cit|loc\.\s{0,2}cit|idem)\.?/gi
// Atribusi naratif tambahan (F-02): "Nama [2021]", "Nama et al. 2020", "Per Nama 2021", "Nama 2022 melaporkan", "Menurut Nama".
const BRACKET_YEAR_RE = /\[\s{0,3}((?:19|20)\d{2})[a-z]?\s{0,3}\]/g
const ETAL_YEAR_RE = /\b(?:et\s{0,2}al|dkk)\.?\s{0,3}((?:19|20)\d{2})[a-z]?(?!\d)/gi
const BARE_YEAR_RE = /(?<![\d/.,%-])\b((?:19|20)\d{2})[a-z]?(?![\d%/-])/g
const REPORT_VERB_RE = /^\s{0,3}(?:melaporkan|menunjukkan|menemukan|menyatakan|menyimpulkan|mengusulkan|mengajukan|menjelaskan|membuktikan|mengamati|memperkenalkan|mengembangkan|berpendapat|mengklaim|mencatat|menegaskan|mengungkapkan|menyebutkan|reported|reports|showed|shows|found|finds|proposed|proposes|argued|argues|demonstrated|demonstrates|noted|notes|stated|states|observed|observes|introduced|introduces|claimed|claims|suggested|suggests|concluded|developed|described|presented|studied|investigated|analy[sz]ed)\b/i
const TRIGGER_RE = /\b(?:menurut|according to|as (?:reported|noted|shown|stated|described|argued|suggested) by|dilaporkan oleh|dikemukakan oleh|dijelaskan oleh|diungkapkan oleh|dinyatakan oleh|disebutkan oleh|dikutip dari|seperti (?:dilaporkan|dikemukakan|dijelaskan) oleh|sebagaimana (?:dilaporkan|dikemukakan|dijelaskan|dinyatakan)(?: oleh)?)\s{1,3}/gi
const NAMEONLY_RE = /\p{Lu}[\p{L}'’-]*(?:\s{1,3}(?:dkk|et\s{0,2}al)\.?|(?:\s{0,2}(?:,|&|dan|and)\s{0,2}\p{Lu}[\p{L}'’-]*){1,2}(?:\s{1,3}(?:dkk|et\s{0,2}al)\.?)?)?/uy
// Kata kapital setelah pemicu atribusi yang BUKAN penulis (institusi/penunjuk umum): tidak ditandai.
const GENERIC_ATTRIBUTION = /^(?:pemerintah|anda|kami|saya|mereka|beliau|penulis|peneliti|para|undang|undang-undang|peraturan|kementerian|badan|organisasi|who|unesco|wikipedia|google|microsoft|indonesia|islam|tuhan|allah|sumber|data|laporan|survei|survey|tabel|gambar|bab|pasal)$/i

const DOI_LINK_RE = /\[([^\]\n]{0,200})\]\(\s{0,5}https?:\/\/(?:dx\.)?doi\.org\/[^)\s]{1,200}\s{0,5}\)/gi
const DOI_URL_RE = /https?:\/\/(?:dx\.)?doi\.org\/[^\s)\]>"']{1,200}/gi
const DOI_PREFIX_RE = /\bdoi\s{0,3}:\s{0,3}10\s{0,2}\.\s{0,2}\d{4,9}\s{0,3}\/\s{0,3}[^\s)\]>"',;]{1,200}/gi
const DOI_BARE_RE = /\b10\s{0,2}\.\s{0,2}\d{4,9}\s{0,3}\/\s{0,3}[^\s)\]>"',;]{1,200}/g
const IDENT_RES = [
  /\barxiv\s{0,3}:\s{0,3}\d{4}\.\d{4,5}(?:v\d+)?/gi,
  /\bISBN(?:-1[03])?\s{0,3}:?\s{0,3}[\d-]{10,17}X?/gi,
  /\bPMC?ID\s{0,3}:?\s{0,3}(?:PMC)?\d{5,9}/gi,
  /https?:\/\/(?:www\.)?(?:arxiv\.org|ieeexplore\.ieee\.org|pubmed\.ncbi\.nlm\.nih\.gov|researchgate\.net|scholar\.google\.[a-z.]{2,6}|sciencedirect\.com|link\.springer\.com|dl\.acm\.org|jstor\.org|semanticscholar\.org|openalex\.org)\/[^\s)\]>"']{0,200}/gi
]
const BIBTEX_RE = /@(?:article|inproceedings|book|incollection|phdthesis|mastersthesis|misc|techreport|conference|proceedings|unpublished)\s{0,3}\{[\s\S]{0,1500}?(?:\n\s{0,3}\n|$)/gi
const BIBITEM_RE = /\\bibitem(?:\[[^\]]{0,50}\])?\{[^}]{0,100}\}[^\n]{0,500}|\\bibliography(?:style)?\{[^}]{0,100}\}/g
const REF_HEADING_RE = /^\s{0,3}(?:#{1,6}\s{0,3}|\*\*|__)?\s{0,3}(?:references|daftar pustaka|daftar referensi|bibliography|bibliografi|referensi|pustaka|works cited|literature cited)\s{0,3}(?:\*\*|__)?:?\s{0,3}$/i
const ENTRY_LINE_RE = /^\s{0,6}(?:[-*•]\s{1,3}|\d{1,3}[.)]\s{1,3}|\[\d{1,3}\]\s{0,3})?(?:[\p{Lu}][\p{L}'’-]{1,30},?\s{1,3}(?:\p{Lu}(?:\.|(?=[\s,]))\s{0,2}){1,3}|(?:\p{Lu}\.\s{0,2}){1,3}[\p{Lu}][\p{L}'’-]{1,30})[^\n]{0,400}?(?:19|20)\d{2}/u

function maskedRanges(text) {
  const out = []
  for (const m of text.matchAll(/```[\s\S]{0,20000}?```|`[^`\n]{0,300}`/g)) out.push([m.index, m.index + m[0].length])
  return out
}

function expandNumbers(s0) {
  const s = s0.replace(/(\d)[a-z]\b/g, '$1') // sufiks huruf ([7a]) dianggap nomor yang sama
  const out = []
  for (const part of s.split(/[,;]/)) {
    const m = /^\s{0,3}(\d{1,3})\s{0,3}[–—-]\s{0,3}(\d{1,3})\s{0,3}$/.exec(part)
    if (m && Number(m[2]) >= Number(m[1]) && Number(m[2]) - Number(m[1]) <= 50) for (let i = Number(m[1]); i <= Number(m[2]); i++) out.push(i)
    else if (/^\s{0,3}\d{1,3}\s{0,3}$/.test(part)) out.push(Number(part))
  }
  return out
}

// ---- Nama penulis ----
// Mengurai teks nama ("Fake", "John Fake", "Fake, J.", "Fake, Doe, and Lee", "Fake et al.") menjadi {families, etAl} atau null.
function parseNames(text) {
  let s = text.replace(/[*_~]/g, ' ').trim()
  for (let i = 0; i < 3 && LEADIN.test(s + ' '); i++) s = (s + ' ').replace(LEADIN, '').trim()
  s = s.replace(/^[\s,;:&-]+|[\s,;:&-]+$/g, '')
  if (!s) return null
  const etAl = /(?:^|[\s,])(?:et\.?\s{0,2}al\.?|dkk\.?|and others|dan lainnya)\s{0,3}$/i.test(s)
  s = s.replace(/(?:^|[\s,])(?:et\.?\s{0,2}al\.?|dkk\.?|and others|dan lainnya)\s{0,3}$/i, '').replace(/[\s,]+$/, '')
  if (!s || s.length > 200) return null
  const families = []
  for (const chunk of s.split(/\s{0,3}(?:,|&|\band\b|\bdan\b)\s{0,3}/i)) {
    const toks = chunk.split(/\s+/).filter(Boolean).filter((t) => !INITIAL_RE.test(t) && !TITLE_WORDS.test(t))
    if (!toks.length) continue
    const fam = toks[toks.length - 1].replace(/[.'’]+$/, '')
    const joined = toks.length >= 2 && new RegExp(`^${PARTICLES}$`, 'i').test(toks[toks.length - 2]) ? toks[toks.length - 1] : fam
    if (!NAME_RE.test(joined) && !(toks.length === 1 && /^[\p{L}'’-]{3,}$/u.test(joined))) return null
    families.push(joined)
  }
  if (!families.length || families.length > 12) return null
  if (NOT_NAME.test(families[0])) return null
  return { families, etAl }
}

// Satu segmen penulis-tahun (dipisah ';' di dalam kurung) dapat memuat beberapa pasangan: "Smith, 2020, Fake, 2020".
function splitAtYears(seg) {
  const entries = []
  let prev = 0
  let m
  YEAR_G.lastIndex = 0
  while ((m = YEAR_G.exec(seg))) {
    const names = parseNames(seg.slice(prev, m.index))
    if (!names) return entries.length ? { entries, trailing: seg.slice(prev) } : null
    entries.push({ families: names.families, etAl: names.etAl, year: m[1] ? Number(m[1]) : null })
    let end = m.index + m[0].length
    const loc = LOCATOR.exec(seg.slice(end))
    if (loc) end += loc[0].length
    prev = end
    YEAR_G.lastIndex = end
  }
  if (!entries.length) return null
  return { entries, trailing: seg.slice(prev) }
}

// Isi kurung/siku -> daftar entri penulis-tahun, atau null bila bukan sitasi. Segmen tanpa tahun tetapi berwujud nama
// pada daftar yang sudah memuat sitasi dianggap sitasi tanpa rekaman (orphan): "(Smith, 2020; Fake)".
function parseAuthorYearList(content) {
  const entries = []
  let anyParsed = false
  const leftovers = []
  for (const raw of content.split(';')) {
    const seg = raw.trim()
    if (!seg) continue
    const r = splitAtYears(seg)
    if (r) {
      anyParsed = true
      entries.push(...r.entries)
      const tail = parseNames(r.trailing)
      if (tail) leftovers.push(tail)
    } else {
      const names = parseNames(seg)
      if (names) leftovers.push(names)
      else if (/\p{Lu}/u.test(seg) && /\d{4}/.test(seg)) return null
    }
  }
  if (!anyParsed) return null
  for (const l of leftovers) entries.push({ families: l.families, etAl: l.etAl, year: null })
  return entries
}

// Mundur dari posisi `idx` untuk menemukan teks nama yang langsung mendahului tahun ("**Fake** (2020)", "Fake, J. (2020)").
function lookbackNames(t, idx) {
  const win = t.slice(Math.max(0, idx - 90), idx)
  const toks = win.split(/(\s+)/)
  let k = toks.length
  let taken = 0
  while (k > 0 && taken < 14) {
    let tok = toks[k - 1]
    if (/^\s*$/.test(tok)) { k--; continue }
    // token yang menempel pada pembuka ("\footnote{Fake", "(Fake"): ambil bagian setelah pembuka lalu berhenti
    const open = Math.max(tok.lastIndexOf('{'), tok.lastIndexOf('('), tok.lastIndexOf('['))
    if (open >= 0 && open < tok.length - 1) {
      const suffix = tok.slice(open + 1)
      if (NAME_RE.test(suffix.replace(/[.,';]+$/, ''))) {
        toks[k - 1] = suffix
        k--
        taken++
        break
      }
      break
    }
    const bare = tok.replace(/[,;]+$/, '')
    if (NAME_RE.test(bare.replace(/[.']+$/, '')) || INITIAL_RE.test(bare) || /^(?:et|al\.?|and|dan|&|dkk\.?|others)$/i.test(bare) || TITLE_WORDS.test(bare) || /^[\p{L}'’-]{2,}[,]$/u.test(tok)) { k--; taken++; continue }
    break
  }
  const text = toks.slice(k).join('').trim()
  return { text, start: idx - toks.slice(k).join('').length + (toks.slice(k).join('').length - toks.slice(k).join('').trimStart().length) }
}

function extractCitations(text, { normalize = false } = {}) {
  const t = normalize ? normalizeText(text) : text
  if (t.length > MAX_INPUT_CHARS) throw new Error('TEXT_TOO_LONG')
  const s = blankEmphasis(t)
  // untuk pencarian nama naratif: tautan markdown [teks](url) dipadatkan menjadi teksnya (panjang tetap, sisanya spasi)
  const sn = s.replace(/\[([^\]\n]{0,100})\]\([^)\s]{0,200}\)/g, (m, txt) => ' ' + txt + ' '.repeat(m.length - txt.length - 1))
  const masks = maskedRanges(t)
  const inMask = (i) => masks.some(([a, b]) => i >= a && i < b)
  const found = []
  const add = (c, len) => !inMask(c.start) && found.push({ ...c, raw: t.slice(c.start, c.start + len), end: c.start + len })
  let m

  LATEX_RE.lastIndex = 0
  while ((m = LATEX_RE.exec(s))) {
    let len = m[0].length
    let keys = m[2].split(',')
    if (/cites$/i.test(m[1])) {
      let rest = s.slice(m.index + len)
      let g
      while ((g = LATEX_EXTRA_GROUP.exec(rest))) {
        len += g[0].length
        keys = keys.concat(g[1].split(','))
        rest = rest.slice(g[0].length)
      }
    }
    // catatan opsional [..] pada \cite dapat memuat sitasi penulis-tahun yang harus ikut dinilai
    const notes = []
    for (const nm of m[0].matchAll(LATEX_NOTE)) {
      const entries = parseAuthorYearList(nm[1])
      if (entries) notes.push(...entries)
    }
    add({ kind: 'latex', start: m.index, keys: keys.map((k) => k.trim()).filter(Boolean), noteAuthorYear: notes }, len)
  }
  PANDOC_RE.lastIndex = 0
  while ((m = PANDOC_RE.exec(s))) {
    const keys = [...m[0].matchAll(PANDOC_KEY)].map((x) => x[1].replace(/[.:]+$/, ''))
    if (!keys.length) continue
    const rest = m[0].slice(1, -1).replace(PANDOC_KEY, ' ')
    add({ kind: 'pandoc', start: m.index, keys, noteAuthorYear: parseAuthorYearList(rest) || [] }, m[0].length)
  }
  BARE_AT_RE.lastIndex = 0
  while ((m = BARE_AT_RE.exec(s))) add({ kind: 'pandoc', start: m.index, keys: [m[1].replace(/[.:]+$/, '')], narrative: true }, m[0].length)
  NUMERIC_RE.lastIndex = 0
  while ((m = NUMERIC_RE.exec(s))) add({ kind: 'numeric', start: m.index, numbers: expandNumbers(m[1]) }, m[0].length)
  SUPER_RE.lastIndex = 0
  while ((m = SUPER_RE.exec(s))) add({ kind: 'numeric', start: m.index, numbers: [0], superscript: true }, m[0].length)

  for (const re of [PAREN_RE, BRACKET_RE]) {
    re.lastIndex = 0
    while ((m = re.exec(s))) {
      const entries = parseAuthorYearList(m[1])
      if (entries) add({ kind: 'authoryear', start: m.index, authorYear: entries }, m[0].length)
    }
  }
  // Naratif: "Fake (2020)", "**Fake et al.** (2020)", "Fake, J. (2020)"
  PAREN_YEAR_RE.lastIndex = 0
  while ((m = PAREN_YEAR_RE.exec(sn))) {
    const lb = lookbackNames(sn, m.index)
    const names = lb.text ? parseNames(lb.text) : null
    if (!names) continue
    const ym = /(?:19|20)\d{2}/.exec(m[1])
    add({ kind: 'authoryear', start: m.index - (sn.slice(0, m.index).length - sn.slice(0, m.index).trimEnd().length) - lb.text.length, authorYear: [{ families: names.families, etAl: names.etAl, year: ym ? Number(ym[0]) : null }], narrative: true }, m.index + m[0].length - (m.index - (sn.slice(0, m.index).length - sn.slice(0, m.index).trimEnd().length) - lb.text.length))
  }
  // "Fake, 2020" tanpa kurung
  COMMA_YEAR_RE.lastIndex = 0
  while ((m = COMMA_YEAR_RE.exec(sn))) {
    const lb = lookbackNames(sn, m.index)
    const names = lb.text ? parseNames(lb.text) : null
    if (!names) continue
    const startPos = m.index - lb.text.length
    add({ kind: 'authoryear', start: startPos, authorYear: [{ families: names.families, etAl: names.etAl, year: Number(m[1]) }], narrative: true }, m.index + m[0].length - startPos)
  }
  // "Fake, J. 2020": tahun langsung setelah inisial
  INIT_YEAR_RE.lastIndex = 0
  while ((m = INIT_YEAR_RE.exec(sn))) {
    const lb = lookbackNames(sn, m.index)
    const names = lb.text ? parseNames(lb.text) : null
    if (!names) continue
    const startPos = m.index - lb.text.length - (sn.slice(0, m.index).length - sn.slice(0, m.index).trimEnd().length)
    add({ kind: 'authoryear', start: startPos, authorYear: [{ families: names.families, etAl: names.etAl, year: Number(m[1]) }], narrative: true }, m.index + m[0].length - startPos)
  }
  // Helper atribusi naratif: nama tepat sebelum posisi tahun `at` -> sitasi penulis-tahun (nameBefore menghitung spasi di antara).
  const narrativeAt = (at, yearNum, extra = {}) => {
    const lb = lookbackNames(sn, at)
    const names = lb.text ? parseNames(lb.text) : null
    if (!names) return null
    const gap = sn.slice(0, at).length - sn.slice(0, at).trimEnd().length
    const startPos = at - gap - lb.text.length
    return { names, lb, startPos, ...extra, cite: { kind: 'authoryear', start: startPos, authorYear: [{ families: names.families, etAl: names.etAl, year: yearNum }], narrative: true } }
  }
  // "Fake [2021]"
  BRACKET_YEAR_RE.lastIndex = 0
  while ((m = BRACKET_YEAR_RE.exec(sn))) {
    const n = narrativeAt(m.index, Number(m[1]))
    if (n) add(n.cite, m.index + m[0].length - n.startPos)
  }
  // "Fake et al. 2020", "Fake dkk. 2020"
  ETAL_YEAR_RE.lastIndex = 0
  while ((m = ETAL_YEAR_RE.exec(sn))) {
    const yAt = m.index + m[0].search(/(?:19|20)\d{2}/)
    const n = narrativeAt(yAt, Number(m[1]))
    if (n) add(n.cite, yAt + 4 - n.startPos)
  }
  // "Per Fake 2021", "Fake 2022 melaporkan", "\footnote{Fake 2021 ...}": nama + tahun tanpa tanda baca, HANYA bila ada pemicu
  // (kata pengantar sitasi, kata kerja pelaporan, atau kurung kurawal pembuka) agar frasa seperti "Piala Dunia 2022" tidak ditandai.
  BARE_YEAR_RE.lastIndex = 0
  while ((m = BARE_YEAR_RE.exec(sn))) {
    const n = narrativeAt(m.index, Number(m[1]))
    if (!n) continue
    const after = sn.slice(m.index + m[0].length)
    const braceBefore = sn.slice(0, n.startPos).trimEnd().slice(-1) === '{'
    if (!(LEADIN.test(`${n.lb.text} `) || REPORT_VERB_RE.test(after) || braceBefore)) continue
    add(n.cite, m.index + m[0].length - n.startPos)
  }
  // Atribusi tanpa tahun: "Menurut Fake", "According to Fake and Ghost", "dilaporkan oleh Fake dkk."
  TRIGGER_RE.lastIndex = 0
  while ((m = TRIGGER_RE.exec(sn))) {
    NAMEONLY_RE.lastIndex = m.index + m[0].length
    const nm = NAMEONLY_RE.exec(sn)
    if (!nm) continue
    const names = parseNames(nm[0])
    if (!names || names.families.some((f) => GENERIC_ATTRIBUTION.test(f))) continue
    add({ kind: 'authoryear', start: nm.index, authorYear: [{ families: names.families, etAl: names.etAl, year: null }], narrative: true, nameOnly: true }, nm[0].length)
  }
  IBID_RE.lastIndex = 0
  while ((m = IBID_RE.exec(s))) add({ kind: 'ibid', start: m.index }, m[0].length)

  for (const [re, via] of [[DOI_LINK_RE, 'link'], [DOI_URL_RE, 'url'], [DOI_PREFIX_RE, 'prefix'], [DOI_BARE_RE, 'bare']]) {
    re.lastIndex = 0
    while ((m = re.exec(s))) {
      const flat = m[0].replace(/\s+/g, '')
      const doi = normalizeDoi(flat.replace(/^.*?(10\.\d{4,9}\/)/i, '$1').replace(/\)\s*$/, ''))
      const linkEntries = via === 'link' && m[1] ? parseAuthorYearList(m[1].replace(/[()]/g, ' ')) || [] : []
      add({ kind: 'doi', start: m.index, doi: doi || flat.toLowerCase(), via, linkAuthorYear: linkEntries }, m[0].length)
    }
  }
  for (const re of IDENT_RES) {
    re.lastIndex = 0
    while ((m = re.exec(s))) add({ kind: 'identifier', start: m.index, ident: m[0].trim().toLowerCase() }, m[0].length)
  }

  // Blok bibliografi karangan (BibTeX, \bibitem, daftar pustaka bergaya APA/Vancouver/IEEE)
  BIBTEX_RE.lastIndex = 0
  while ((m = BIBTEX_RE.exec(s))) add({ kind: 'bibentry', start: m.index, entry: m[0] }, m[0].length)
  BIBITEM_RE.lastIndex = 0
  while ((m = BIBITEM_RE.exec(s))) add({ kind: 'bibentry', start: m.index, entry: m[0] }, m[0].length)
  const lines = []
  let off = 0
  for (const line of t.split('\n')) {
    lines.push({ line, start: off })
    off += line.length + 1
  }
  let inRefs = false
  for (const { line, start } of lines) {
    if (/^\s{0,3}#{1,6}\s/.test(line) || /^\s{0,3}\\(?:section|chapter)/.test(line)) inRefs = REF_HEADING_RE.test(line.replace(/\\(?:section|chapter)\*?\{([^}]*)\}/, '$1'))
    else if (REF_HEADING_RE.test(line)) inRefs = true
    else if (line.trim() && !line.trimStart().startsWith('```')) {
      const stripped = line.replace(/^\s{0,6}(?:[-*•]\s{1,3}|\d{1,3}[.)]\s{1,3}|\[\d{1,3}\]\s{0,3})/, '')
      if ((inRefs && stripped.length > 8) || ENTRY_LINE_RE.test(blankEmphasis(line))) add({ kind: 'bibentry', start: start + (line.length - line.trimStart().length), entry: line.trim() }, line.trim().length)
    }
  }

  // Sitasi terpotong di akhir teks (mis. batas token/pembatalan): "(Fake, 20"
  const tail = /[([]\s{0,3}[\p{Lu}\p{Lo}][\p{L}'’-]+[^()[\]\n]{0,150}$/u.exec(s)
  if (tail && !inMask(tail.index) && !found.some((c) => c.start <= tail.index && c.end > tail.index)) add({ kind: 'truncated', start: tail.index }, tail[0].length)

  // tumpang tindih: yang mulai lebih awal menang; bila sama, yang lebih panjang
  found.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start))
  const out = []
  let cursor = -1
  for (const c of found) {
    if (c.start < cursor) continue
    out.push(c)
    cursor = c.end
  }
  return out
}

const byKey = (references) => new Map(references.map((r) => [r.citeKey, r]))
const statusOf = (r) => (r.verification && r.verification.status) || r.verificationStatus || 'unverified'
const fam = (a) => normalizeFamily(a && a.family)

// Penulis-tahun cocok hanya bila: penulis pertama, penulis kedua (bila disebut), jumlah penulis untuk "et al.", dan tahun cocok.
function matchesAuthorYear(ref, ay, { nameOnly = false } = {}) {
  // Atribusi tanpa tahun ("Menurut Fake") cocok bila penulis (pertama/kedua/jumlah) cocok dengan SATU referensi terverifikasi.
  if (!nameOnly && (!ay.year || ref.year !== ay.year)) return false
  const authors = ref.authors || []
  if (!authors.length || fam(authors[0]) !== normalizeFamily(ay.families[0])) return false
  if (ay.families.length >= 2 && (authors.length < 2 || fam(authors[1]) !== normalizeFamily(ay.families[1]))) return false
  if (ay.families.length >= 3 && (authors.length < 3 || fam(authors[2]) !== normalizeFamily(ay.families[2]))) return false
  if (ay.etAl && authors.length < 2) return false
  return true
}

const norm = (s) => normalizeTitle(s)
function bibEntryMatchesVerified(entry, references) {
  const n = norm(entry)
  const dois = [...entry.matchAll(DOI_BARE_RE)].map((x) => normalizeDoi(x[0].replace(/\s+/g, '')))
  return references.find((r) => statusOf(r) === 'verified' && ((r.doi && dois.includes(normalizeDoi(r.doi))) || (norm(r.title).length >= 15 && n.includes(norm(r.title)))))
}

// Menilai satu sitasi. Hasil: { ok, issues:[{type, detail}], resolvedKeys:[] }
//  type: orphan | unverified | retracted | ambiguous (manual_review)
function evaluateCitation(c, references, { numbering } = {}) {
  const keys = byKey(references)
  const issues = []
  const resolved = []
  const checkKey = (k) => {
    const r = keys.get(k)
    if (!r) return issues.push({ type: 'orphan', detail: k })
    const st = statusOf(r)
    if (st === 'retracted') return issues.push({ type: 'retracted', detail: k })
    if (st !== 'verified') return issues.push({ type: 'unverified', detail: k, status: st })
    resolved.push(k)
  }
  const checkAY = (ay) => {
    const matches = references.filter((r) => matchesAuthorYear(r, ay, { nameOnly: Boolean(c.nameOnly) }))
    const label = `${ay.families.join(' & ')}${ay.etAl ? ' et al.' : ''} ${ay.year || 's.a.'}`
    if (matches.length === 0) issues.push({ type: 'orphan', detail: label })
    else if (matches.length > 1) issues.push({ type: 'ambiguous', detail: label })
    else checkKey(matches[0].citeKey)
  }
  if (c.keys) {
    c.keys.forEach(checkKey)
    for (const ay of c.noteAuthorYear || []) checkAY(ay)
  } else if (c.numbers) {
    if (c.superscript) issues.push({ type: 'ambiguous', detail: c.raw })
    else if (!numbering) issues.push({ type: 'ambiguous', detail: `[${c.numbers.join(',')}]` })
    else c.numbers.forEach((n) => (numbering[n - 1] ? checkKey(numbering[n - 1]) : issues.push({ type: 'orphan', detail: `[${n}]` })))
  } else if (c.doi) {
    const ref = references.find((r) => r.doi && normalizeDoi(r.doi) === c.doi)
    if (!ref) issues.push({ type: 'orphan', detail: c.doi })
    else {
      checkKey(ref.citeKey)
      for (const ay of c.linkAuthorYear || []) if (!matchesAuthorYear(ref, ay)) issues.push({ type: 'orphan', detail: `${ay.families.join(' & ')} ${ay.year || 's.a.'} (teks tautan tidak cocok dengan DOI)` })
    }
  } else if (c.authorYear) c.authorYear.forEach(checkAY)
  else if (c.kind === 'identifier') {
    const ref = references.find((r) => r.url && r.url.toLowerCase().replace(/\/+$/, '') === c.ident.replace(/\/+$/, ''))
    if (!ref) issues.push({ type: 'orphan', detail: c.ident })
    else checkKey(ref.citeKey)
  } else if (c.kind === 'bibentry') {
    const ref = bibEntryMatchesVerified(c.entry, references)
    if (!ref) issues.push({ type: 'orphan', detail: c.entry.slice(0, 80) })
    else resolved.push(ref.citeKey)
  } else issues.push({ type: 'orphan', detail: c.raw }) // ibid., terpotong
  return { ok: issues.length === 0, issues, resolvedKeys: resolved }
}

// Validator dokumen: sitasi yatim, tidak terverifikasi, retracted, ambigu; entri pustaka tak terpakai; duplikat.
function validateCitations(text, references, { numbering } = {}) {
  const citations = extractCitations(text).map((c) => ({ ...c, ...evaluateCitation(c, references, { numbering }) }))
  const issues = citations.flatMap((c) => c.issues.map((i) => ({ ...i, citation: c.raw, start: c.start })))
  const used = new Set(citations.flatMap((c) => c.resolvedKeys.concat((c.keys || []).filter((k) => byKey(references).has(k)))))
  const unused = references.filter((r) => !used.has(r.citeKey)).map((r) => ({ type: 'unused', detail: r.citeKey }))
  const seen = new Map()
  const duplicates = []
  for (const r of references) {
    const id = r.doi || `${r.title}|${r.year}`
    if (seen.has(id)) duplicates.push({ type: 'duplicate', detail: `${seen.get(id)} = ${r.citeKey}` })
    else seen.set(id, r.citeKey)
  }
  return { citations, issues: [...issues, ...unused, ...duplicates], valid: issues.length === 0 }
}

// Sanitizer jawaban model (MTS 8 butir 2): sitasi tanpa rekaman terverifikasi diganti penanda. Teks dinormalkan lebih dulu
// agar variasi tipografi tidak dapat menyelundupkan sitasi. Input melebihi MAX_INPUT_CHARS melempar (pemanggil gagal tertutup).
function sanitizeCitations(input, references) {
  const text = normalizeText(input)
  const cs = extractCitations(text).map((c) => ({ c, r: evaluateCitation(c, references) }))
  let out = ''
  let cursor = 0
  const flags = []
  for (const { c, r } of cs) {
    out += text.slice(cursor, c.start)
    cursor = c.end
    if (r.ok) {
      out += c.raw
      continue
    }
    const retracted = r.issues.some((i) => i.type === 'retracted')
    for (const i of r.issues) flags.push({ type: i.type, detail: i.detail })
    if (c.keys && r.resolvedKeys.length && !r.issues.some((i) => i.type === 'orphan' && !c.keys.includes(i.detail))) {
      out += c.kind === 'latex' ? `\\cite{${r.resolvedKeys.join(',')}}` : `[${r.resolvedKeys.map((k) => `@${k}`).join('; ')}]`
      out += ` ${retracted ? MARK_RETRACTED : MARK_UNVERIFIED}`
    } else out += retracted ? MARK_RETRACTED : MARK_UNVERIFIED
  }
  out += text.slice(cursor)
  return { text: out, flags, changed: flags.length > 0 || out !== String(input || '') }
}

// Untuk streaming: panjang awalan teks yang AMAN disanitasi dan ditampilkan (kurung/siku/kurawal seimbang, berakhir di spasi
// atau tanda baca, di luar kode). Linear O(n).
function safePrefixLength(text) {
  let depth = 0
  let safe = 0
  let inCode = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '`') inCode = !inCode
    if (!inCode) {
      if (ch === '(' || ch === '[' || ch === '{') depth++
      else if ((ch === ')' || ch === ']' || ch === '}') && depth > 0) depth--
    }
    if (depth === 0 && !inCode && /\s/.test(ch) && text[i - 1] !== '\\') safe = i + 1 // hanya di spasi: DOI/URL tidak boleh terbelah
  }
  return safe
}

// Akhir kalimat terakhir pada `piece` (indeks setelah spasi/baris baru), atau 0 bila belum ada. Singkatan (et al., dkk., Fig., vs.,
// inisial) dan titik di dalam angka tidak dihitung sebagai akhir kalimat.
const ABBREV = /(?:^|[\s(])(?:et\s?al|dkk|al|vs|no|nos|fig|figs|tab|dr|prof|mr|mrs|ms|ir|drs|jr|sr|st|cf|ca|approx|hlm|hal|vol|pp|ed|eds|e\.g|i\.e|mis|yth|dsb|dll|dst|sd|s\.d)$/i
function lastSentenceEnd(piece) {
  let best = 0
  const re = /([.!?])(\s+)(?=[\p{Lu}"“(\[]|\n|$)|\n/gu
  let m
  while ((m = re.exec(piece))) {
    if (m[0] === '\n') { best = m.index + 1; continue }
    const before = piece.slice(Math.max(0, m.index - 12), m.index)
    if (ABBREV.test(before) || /(?:^|\s)\p{Lu}$/u.test(before)) continue
    best = m.index + m[0].length
  }
  return best
}

// Penyaring stream: setiap potongan seimbang disanitasi SENDIRI (linear, tanpa memindai ulang awalan), sehingga tidak ada
// perbandingan awalan yang dapat gagal dan tidak ada biaya kubik. Potongan tertunda yang terlalu panjang dipaksa keluar
// tersanitasi agar stream tidak macet. Teks final tetap berasal dari sanitasi penuh (message_complete).
function createStreamSanitizer(references, { forceAfter = 600, maxTotal = MAX_INPUT_CHARS } = {}) {
  let raw = ''
  let committed = 0
  return {
    push(delta) {
      raw += delta
      if (raw.length > maxTotal) return ''
      const safe = safePrefixLength(raw.slice(committed))
      let end = committed + safe
      const forced = !safe && raw.length - committed > forceAfter
      if (forced) end = raw.length
      else if (end > committed) {
        // Atribusi naratif ("Menurut Nama, ...", "Nama et al. 2020 ...") menjangkau beberapa token: hanya KALIMAT LENGKAP yang
        // ditampilkan, agar konteks pemicu/tahun tidak terpisah antar potongan (F-02). Sisa kalimat ditahan (atau dipaksa keluar
        // tersanitasi bila melebihi forceAfter); teks final tetap dari sanitasi penuh.
        const sentEnd = lastSentenceEnd(raw.slice(committed, end))
        if (sentEnd === 0 && raw.length - committed > forceAfter) { /* kalimat sangat panjang: lanjut dengan potongan seimbang */ } else end = committed + sentEnd
      }
      if (end > committed && !forced) {
        // Tahan deretan token-nama di ujung potongan agar konteks "Nama (tahun)" tidak terpisah antar potongan.
        const piece = blankEmphasis(raw.slice(committed, end))
        const held = lookbackNames(piece, piece.length).text.length
        if (held) end -= held + (raw.slice(committed, end).length - raw.slice(committed, end).trimEnd().length > 0 ? 0 : 0)
      }
      if (end <= committed) return ''
      const chunk = raw.slice(committed, end)
      committed = end
      return sanitizeCitations(chunk, references).text
    }
  }
}

module.exports = { extractCitations, evaluateCitation, validateCitations, sanitizeCitations, safePrefixLength, createStreamSanitizer, normalizeText, MARK_UNVERIFIED, MARK_RETRACTED, MAX_INPUT_CHARS }
