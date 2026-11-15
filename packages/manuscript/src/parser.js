'use strict'
// Parser naskah Markdown/LaTeX (MTS Bagian 37.2 B/D).
// Tanpa dependensi Node (tidak ada crypto/fs) agar bisa dipakai di browser untuk pratinjau struktur.
// Semua offset (start/bodyStart/end) merujuk ke string hasil normalizeSource().

const MAX_SOURCE_BYTES = 1000000

function normalizeSource(source) {
  let s = String(source)
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1)
  return s.replace(/\r\n?/g, '\n')
}

function detectFormat(source) {
  if (/\\documentclass|\\begin\{document\}/.test(source)) return 'latex'
  const latexSections = source.match(/\\(?:sub)*section\*?\s*\{/g)
  if (latexSections && latexSections.length >= 2) return 'latex'
  return 'markdown'
}

// ---------- pengenalan heading ----------
const SECTION_RULES = [
  ['results_discussion', /^(?:hasil\b.*pembahasan|results?\b.*discussion|results? and discussions?)/],
  ['abstract', /^(?:abstract|abstrak)\b/],
  ['keywords', /^(?:keywords?|kata kunci|index terms)\b/],
  ['related_work', /^(?:related works?|literature review|tinjauan pustaka|tinjauan literatur|kajian pustaka|landasan teori|studi literatur|state of the art)/],
  ['introduction', /^(?:introduction|pendahuluan|latar belakang|background)\b/],
  ['methodology', /^(?:methods?\b|methodology|materials? and methods?|proposed (?:method|approach|system)|research method|metode|metodologi)/],
  ['results', /^(?:results?\b|hasil\b|experiments?\b|experimental|evaluation)/],
  ['discussion', /^(?:discussions?\b|pembahasan)/],
  ['conclusion', /^(?:conclusions?|concluding|kesimpulan|simpulan|penutup)/],
  ['acknowledgements', /^(?:acknowledge?ments?|ucapan terima kasih|terima kasih|penghargaan)/],
  [
    'declarations',
    /^(?:declarations?|conflicts? of interest|competing interests?|ethics|ethical|funding|data availability|author contributions?|pernyataan|konflik kepentingan|ketersediaan data|kontribusi penulis|pendanaan)/
  ],
  ['references', /^(?:references?\b|bibliograph|daftar pustaka|daftar rujukan|referensi|pustaka\b)/]
]

function stripHeadingMarkup(text) {
  return text
    .replace(/\\[a-zA-Z@]+\*?(\[[^\]]*\])?/g, '')
    .replace(/[{}$*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeHeading(raw) {
  let t = stripHeadingMarkup(raw)
  // Penomoran: "1.", "2.3", "I.", "IV)" (huruf romawi hanya KAPITAL agar "Dim results" tidak terpotong).
  t = t.replace(/^(?:[IVXLC]+|\d+(?:\.\d+)*)[.)]?\s+/, '')
  return t.toLowerCase().replace(/[:.—-]+$/, '').trim()
}

function classifyHeading(raw) {
  const n = normalizeHeading(raw)
  for (const [key, re] of SECTION_RULES) if (re.test(n)) return key
  return null
}

// ---------- LaTeX: masking ----------
const VERBATIM_ENVS = ['verbatim', 'lstlisting', 'minted', 'comment']

// Mengganti komentar (%...) dan isi lingkungan verbatim dengan spasi, panjang string tetap sama
// sehingga offset di string termask identik dengan string asli. Linear, tanpa regex berbahaya.
function maskLatex(src) {
  const out = src.split('')
  const n = src.length
  let i = 0
  while (i < n) {
    const c = src[i]
    if (c === '\\') {
      if (src.startsWith('\\begin{', i)) {
        const close = src.indexOf('}', i + 7)
        if (close !== -1 && close - (i + 7) < 30) {
          const env = src.slice(i + 7, close)
          if (VERBATIM_ENVS.includes(env)) {
            const endTag = `\\end{${env}}`
            const endIdx = src.indexOf(endTag, close + 1)
            const stop = endIdx === -1 ? n : endIdx
            for (let k = close + 1; k < stop; k++) if (src[k] !== '\n') out[k] = ' '
            i = stop
            continue
          }
        }
      }
      i += 2 // lewati karakter yang di-escape (mis. \%)
      continue
    }
    if (c === '%') {
      while (i < n && src[i] !== '\n') {
        out[i] = ' '
        i++
      }
      continue
    }
    i++
  }
  return out.join('')
}

// Membaca isi { ... } seimbang mulai dari indeks '{'. Mengembalikan null bila tidak seimbang dalam batas.
function readBraced(src, openIdx, limit = 8000) {
  if (src[openIdx] !== '{') return null
  let depth = 0
  const stop = Math.min(src.length, openIdx + limit)
  for (let i = openIdx; i < stop; i++) {
    const c = src[i]
    if (c === '\\') {
      i++
      continue
    }
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return { content: src.slice(openIdx + 1, i), end: i + 1 }
    }
  }
  return null
}

function plainText(latexOrMd) {
  return latexOrMd
    .replace(/\\thanks\{[^}]*\}/g, '')
    .replace(/\\\\/g, ' ')
    .replace(/\\[a-zA-Z@]+\*?(\[[^\]]*\])?/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitKeywords(text) {
  const parts = plainText(text.replace(/\\sep\b/g, ','))
    .split(/[,;·•]|\s{2,}/)
    .map((k) => k.trim().replace(/^[-–—:\s]+|[.\s]+$/g, ''))
    .filter(Boolean)
  return [...new Set(parts)].slice(0, 30)
}

function countWords(text) {
  const m = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)
  return m ? m.length : 0
}

function wordsOfLatex(maskedSlice) {
  return countWords(
    maskedSlice
      .replace(/\\(?:cite|ref|label|eqref|autoref|cref)\w*\*?(\[[^\]]*\])*\{[^}]*\}/g, ' ')
      .replace(/\\begin\{[^}]*\}|\\end\{[^}]*\}/g, ' ')
      .replace(/\\[a-zA-Z@]+\*?(\[[^\]]*\])?/g, ' ')
      .replace(/\$[^$]*\$/g, ' ')
  )
}

// ---------- ekstraksi heading ----------
function latexHeadings(src, masked) {
  const headings = []
  const re = /\\(section|subsection|subsubsection)\*?\s*(?:\[[^\]]*\])?\s*\{/g
  let m
  while ((m = re.exec(masked))) {
    const open = m.index + m[0].length - 1
    const braced = readBraced(src, open)
    if (!braced) continue
    const level = m[1] === 'section' ? 1 : m[1] === 'subsection' ? 2 : 3
    headings.push({ level, text: plainText(braced.content), start: m.index, bodyStart: braced.end })
    re.lastIndex = braced.end
  }

  // \begin{abstract} ... \end{abstract}
  const abs = /\\begin\{abstract\}/.exec(masked)
  if (abs) {
    const endIdx = masked.indexOf('\\end{abstract}', abs.index)
    if (endIdx !== -1) {
      headings.push({
        level: 0, // diset ke level bagian di akhir
        top: true,
        text: 'Abstract',
        start: abs.index,
        bodyStart: abs.index + abs[0].length,
        explicitEnd: endIdx
      })
    }
  }

  // Daftar pustaka di dalam naskah
  const bib = /\\begin\{thebibliography\}/.exec(masked)
  if (bib) {
    const endIdx = masked.indexOf('\\end{thebibliography}', bib.index)
    headings.push({
      level: 0,
      top: true,
      text: 'References',
      start: bib.index,
      bodyStart: bib.index + bib[0].length,
      explicitEnd: endIdx === -1 ? undefined : endIdx
    })
  } else {
    const ext = /\\(?:bibliography|printbibliography)\b(?:\{[^}]*\})?/.exec(masked)
    if (ext) {
      headings.push({
        level: 0,
        top: true,
        text: 'References',
        start: ext.index,
        bodyStart: ext.index + ext[0].length,
        explicitEnd: ext.index + ext[0].length,
        externalBib: true
      })
    }
  }

  return headings.sort((a, b) => a.start - b.start)
}

function markdownHeadings(src) {
  const headings = []
  let i = 0
  let fence = null
  const n = src.length
  while (i <= n) {
    let eol = src.indexOf('\n', i)
    if (eol === -1) eol = n
    const line = src.slice(i, eol)

    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line)
    if (fenceMatch) {
      const marker = fenceMatch[1]
      if (!fence) fence = { ch: marker[0], len: marker.length }
      else if (marker[0] === fence.ch && marker.length >= fence.len && /^ {0,3}(`+|~+)\s*$/.test(line)) fence = null
    } else if (!fence) {
      const h = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line)
      if (h) headings.push({ level: h[1].length, text: stripHeadingMarkup(h[2]), start: i, bodyStart: eol })
    }
    if (eol >= n) break
    i = eol + 1
  }
  return headings
}

function parseFrontMatter(src) {
  if (!src.startsWith('---\n')) return { meta: {}, bodyOffset: 0 }
  const end = src.indexOf('\n---', 4)
  if (end === -1 || end > 5000) return { meta: {}, bodyOffset: 0 }
  const block = src.slice(4, end)
  const meta = {}
  for (const line of block.split('\n')) {
    const m = /^(title|keywords?)\s*:\s*(.+)$/i.exec(line.trim())
    if (m) meta[m[1].toLowerCase().replace(/s$/, '')] = m[2].replace(/^["']|["']$/g, '').trim()
  }
  const afterClose = src.indexOf('\n', end + 1)
  return { meta, bodyOffset: afterClose === -1 ? src.length : afterClose + 1 }
}

// ---------- parser utama ----------
function parseManuscript(rawSource, formatHint) {
  const source = normalizeSource(rawSource)
  const format = formatHint === 'latex' || formatHint === 'markdown' ? formatHint : detectFormat(source)
  const warnings = []
  const warn = (code, message, extra = {}) => warnings.push({ code, severity: 'warn', message, ...extra })
  const info = (code, message, extra = {}) => warnings.push({ code, severity: 'info', message, ...extra })

  const isLatex = format === 'latex'
  const masked = isLatex ? maskLatex(source) : source

  if (isLatex && !/\\[a-zA-Z]+/.test(masked)) {
    warn('FORMAT_MISMATCH', 'Format LaTeX dipilih, tetapi tidak ditemukan perintah LaTeX.')
  }
  if (!isLatex && /\\documentclass/.test(source)) {
    warn('FORMAT_MISMATCH', 'Naskah tampak berformat LaTeX, tetapi dibaca sebagai Markdown.')
  }
  if (isLatex) {
    const danger = /\\write18|\\openout|\\immediate\s*\\write|\\input\s*\{\s*(?:\/|\.\.|~)|\\include\s*\{\s*(?:\/|\.\.|~)/.exec(masked)
    if (danger) {
      warn('DANGEROUS_LATEX', 'Ditemukan perintah LaTeX berisiko (eksekusi shell/akses berkas di luar proyek). Tidak akan dijalankan.', { offset: danger.index })
    }
  }

  let title = null
  let keywords = []
  let headings
  let bodyOffset = 0

  if (isLatex) {
    const t = /\\title\s*(?:\[[^\]]*\])?\s*\{/.exec(masked)
    if (t) {
      const braced = readBraced(source, t.index + t[0].length - 1)
      if (braced) title = plainText(braced.content) || null
    }
    const kwPatterns = [
      /\\begin\{IEEEkeywords\}/,
      /\\begin\{keyword\}/,
      /\\keywords\s*\{/,
      /\\begin\{keywords\}/
    ]
    for (const p of kwPatterns) {
      const m = p.exec(masked)
      if (!m) continue
      if (m[0].endsWith('{') && m[0].startsWith('\\keywords')) {
        const braced = readBraced(source, m.index + m[0].length - 1)
        if (braced) keywords = splitKeywords(braced.content)
      } else {
        const envName = /\{(\w+)\}/.exec(m[0])[1]
        const endIdx = masked.indexOf(`\\end{${envName}}`, m.index)
        if (endIdx !== -1) keywords = splitKeywords(source.slice(m.index + m[0].length, endIdx))
      }
      break
    }
    headings = latexHeadings(source, masked)
  } else {
    const fm = parseFrontMatter(source)
    bodyOffset = fm.bodyOffset
    if (fm.meta.title) title = fm.meta.title
    if (fm.meta.keyword) keywords = splitKeywords(fm.meta.keyword)
    headings = markdownHeadings(source).filter((h) => h.start >= bodyOffset)

    // Baris "Keywords: a, b" / "**Kata kunci:** a, b" di luar heading
    if (!keywords.length) {
      const kw = /^[ \t]*(?:\*\*|__)?(?:keywords?|kata kunci|index terms)(?:\*\*|__)?[ \t]*[:—-](?:\*\*|__)?[ \t]*(.+)$/im.exec(source)
      if (kw) keywords = splitKeywords(kw[1])
    }

    // H1 pertama yang bukan nama bagian standar = judul
    const first = headings[0]
    if (!title && first && first.level === 1 && !classifyHeading(first.text)) {
      title = first.text
      headings = headings.slice(1)
    }
  }

  // Tentukan level bagian utama: level terbanyak di antara heading yang dikenali.
  const counts = new Map()
  for (const h of headings) {
    if (h.top) continue
    if (classifyHeading(h.text)) counts.set(h.level, (counts.get(h.level) || 0) + 1)
  }
  let sectionLevel
  if (counts.size) sectionLevel = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]
  else {
    const levels = headings.filter((h) => !h.top).map((h) => h.level)
    sectionLevel = levels.length ? Math.min(...levels) : 1
  }
  for (const h of headings) if (h.top) h.level = sectionLevel

  // Batas akhir tiap heading = heading berikutnya yang levelnya <= miliknya, atau akhir dokumen.
  const docEnd = isLatex ? (() => {
    const e = masked.indexOf('\\end{document}')
    return e === -1 ? source.length : e
  })() : source.length

  const sections = headings.map((h, idx) => {
    let end = docEnd
    for (let j = idx + 1; j < headings.length; j++) {
      if (headings[j].level <= h.level) {
        end = headings[j].start
        break
      }
    }
    if (h.explicitEnd !== undefined) end = Math.min(end, h.explicitEnd)
    if (end < h.bodyStart) end = h.bodyStart
    const slice = masked.slice(h.bodyStart, end)
    const isTop = h.level === sectionLevel
    return {
      index: idx,
      level: h.level,
      heading: h.text,
      key: isTop ? classifyHeading(h.text) : null,
      start: h.start,
      bodyStart: h.bodyStart,
      end,
      words: isLatex ? wordsOfLatex(slice) : countWords(slice.replace(/```[\s\S]*?```/g, ' ')),
      externalBib: Boolean(h.externalBib)
    }
  })

  // Keywords yang berupa heading bukan "bagian" naskah; ambil isinya bila belum ada.
  const kwSection = sections.find((s) => s.key === 'keywords')
  if (kwSection && !keywords.length) {
    keywords = splitKeywords(source.slice(kwSection.bodyStart, kwSection.end))
  }
  const outline = sections.filter((s) => s.key !== 'keywords')

  // ---------- peringatan ----------
  if (!outline.length) warn('NO_SECTIONS', 'Tidak ditemukan heading bagian. Gunakan "## Pendahuluan" (Markdown) atau \\section{...} (LaTeX).')
  if (!title) warn('NO_TITLE', 'Judul tidak ditemukan.')

  const top = outline.filter((s) => s.level === sectionLevel)
  const recognized = top.filter((s) => s.key)
  const abstractSection = recognized.find((s) => s.key === 'abstract')
  if (!abstractSection) warn('NO_ABSTRACT', 'Bagian abstrak tidak ditemukan.')

  const seen = new Map()
  for (const s of recognized) {
    if (seen.has(s.key)) warn('DUPLICATE_SECTION', `Bagian "${s.heading}" muncul lebih dari sekali.`, { offset: s.start })
    seen.set(s.key, true)
  }
  let unrecognizedShown = 0
  for (const s of top) {
    if (!s.key && unrecognizedShown < 10) {
      info('UNRECOGNIZED_HEADING', `Heading "${s.heading}" bukan nama bagian standar; tetap disimpan apa adanya.`, { offset: s.start })
      unrecognizedShown++
    }
  }
  for (const s of recognized) {
    if (s.key === 'results_discussion') info('COMBINED_RESULTS_DISCUSSION', 'Hasil dan Pembahasan digabung dalam satu bagian.', { offset: s.start })
    if (s.externalBib) info('BIB_EXTERNAL', 'Daftar pustaka berasal dari berkas .bib terpisah; isinya tidak ada di naskah ini.', { offset: s.start })
    else if (s.words === 0 && s.key !== 'references') warn('EMPTY_SECTION', `Bagian "${s.heading}" kosong.`, { offset: s.start })
  }
  if (recognized.length > 0 && recognized.length < 3) {
    info('FEW_SECTIONS', `Hanya ${recognized.length} bagian standar yang dikenali.`)
  }

  const distinctKeys = new Set(recognized.map((s) => s.key))
  const confidence =
    distinctKeys.size >= 4 && title && abstractSection ? 'high' : distinctKeys.size >= 2 ? 'medium' : 'low'

  const totalWords = isLatex ? wordsOfLatex(masked) : countWords(source.replace(/```[\s\S]*?```/g, ' '))

  return {
    format,
    title,
    keywords,
    sections: outline,
    warnings,
    confidence,
    stats: {
      words: totalWords,
      chars: source.length,
      lines: source.split('\n').length,
      abstractWords: abstractSection ? abstractSection.words : 0
    },
    source
  }
}

function sectionText(source, section) {
  return source.slice(section.bodyStart, section.end).trim()
}

module.exports = { parseManuscript, normalizeSource, detectFormat, classifyHeading, sectionText, countWords, MAX_SOURCE_BYTES }
