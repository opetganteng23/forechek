'use strict'

// Konversi naskah ke LaTeX (MTS 41.2 C). Naskah LaTeX diteruskan APA ADANYA (tidak menimpa/mengubah isi pengguna).
// Naskah Markdown dikonversi dengan subset yang dapat dipetakan pasti; konstruksi lain TIDAK ditebak: ditandai
// `% TODO-PUBPREP` (komentar) dan dilaporkan sebagai peringatan. Template venue tidak disertakan (tidak ada sumber
// resmi yang diverifikasi); kelas dokumen yang dipakai generik (`article`).
const REF_HEADING = /^(references?|daftar pustaka|referensi|bibliography|daftar acuan)$/i
const ABSTRACT_HEADING = /^(abstract|abstrak)$/i
// Hanya \cite{kunci,...}: tanpa argumen opsional/perintah lain (neutralisasi TeX mentah dari Markdown).
const CITE_RE = /\\cite[a-zA-Z]*\*?\{[A-Za-z0-9_:.,; -]{1,300}\}/g

const SPECIAL = { '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '&': '\\&', '%': '\\%', $: '\\$', '#': '\\#', _: '\\_', '^': '\\^{}', '~': '\\~{}' }
const esc = (s) => s.replace(/[\\{}&%$#_^~]/g, (c) => SPECIAL[c])

// Inline: \cite{..} dipertahankan, `kode` -> \texttt, teks lain di-escape lalu **tebal** / *miring*.
function inline(text, warn) {
  const parts = []
  let last = 0
  const re = new RegExp(`${CITE_RE.source}|\`[^\`\\n]{1,200}\``, 'g')
  for (const m of text.matchAll(re)) {
    parts.push({ plain: text.slice(last, m.index) })
    parts.push(m[0].startsWith('`') ? { raw: `\\texttt{${esc(m[0].slice(1, -1))}}` } : { raw: m[0] })
    last = m.index + m[0].length
  }
  parts.push({ plain: text.slice(last) })
  return parts
    .map((p) => {
      if (p.raw !== undefined) return p.raw
      let t = p.plain.replace(/!?\[([^\]\n]{0,200})\]\(([^)\n]{0,300})\)/g, (_, label, url) => { warn('link', 'Tautan Markdown diubah menjadi teks dengan URL; periksa hasilnya.'); return `${label} (${url})` })
      if (/\$[^$\n]+\$/.test(t)) warn('math', 'Teks mengandung pola $...$ (kemungkinan rumus inline); tanda $ di-escape, ubah manual bila itu rumus.')
      t = esc(t)
      t = t.replace(/\*\*([^*\n]+)\*\*/g, '\\textbf{$1}').replace(/\*([^*\n]+)\*/g, '\\emph{$1}')
      return t
    })
    .join('')
}

function convertMarkdown(source) {
  const warnings = []
  const warned = new Set()
  const warn = (id, msg) => { if (!warned.has(id)) { warned.add(id); warnings.push(msg) } }
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const out = []
  let title = null
  let inCode = false
  let para = []
  let list = null // 'itemize' | 'enumerate'
  let mode = 'body' // body | abstract | references
  let bibEmitted = false

  const flushPara = () => { if (para.length) { out.push(inline(para.join(' '), warn)); out.push(''); para = [] } }
  const closeList = () => { if (list) { out.push(`\\end{${list}}`); out.push(''); list = null } }
  const closeAbstract = () => { if (mode === 'abstract') { flushPara(); out.push('\\end{abstract}'); out.push('') } }
  const bibliography = () => { if (!bibEmitted) { out.push('\\bibliographystyle{plain}', '\\bibliography{references}', ''); bibEmitted = true } }

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    if (/^```/.test(line)) {
      if (mode === 'references') { inCode = !inCode; continue }
      flushPara(); closeList()
      out.push(inCode ? '\\end{quote}' : '\\begin{quote}\\ttfamily')
      if (!inCode) warn('code', 'Blok kode dirender sebagai teks monospasi (tanpa penyorotan sintaks); periksa hasilnya.')
      inCode = !inCode
      continue
    }
    if (inCode) {
      if (mode !== 'references') {
        if (/\\(end|begin)\{verbatim\}/.test(line)) warn('verbatim', 'Blok kode memuat \\begin/\\end{verbatim}; teksnya di-escape agar tidak keluar dari blok kode.')
        out.push(`${esc(line) || '~'}\\\\`)
      }
      continue
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*$/.exec(line)
    if (h) {
      flushPara(); closeList(); closeAbstract()
      const level = h[1].length
      const text = h[2].trim()
      if (level === 1 && title === null) { title = text; mode = 'body'; continue }
      if (level === 1) warn('h1', `Heading level 1 tambahan "${text.slice(0, 60)}" dipetakan ke \\section (judul diambil dari heading level 1 pertama).`)
      else warn('levels', 'Heading Markdown level 2/3/4 dipetakan ke \\section/\\subsection/\\subsubsection.')
      if (REF_HEADING.test(text)) { mode = 'references'; bibliography(); continue }
      if (ABSTRACT_HEADING.test(text)) { mode = 'abstract'; out.push('\\begin{abstract}'); continue }
      mode = 'body'
      const cmd = level <= 2 ? 'section' : level === 3 ? 'subsection' : 'subsubsection'
      if (level > 4) warn('deep', 'Heading lebih dalam dari level 4 dipetakan ke \\subsubsection.')
      out.push(`\\${cmd}{${inline(text, warn)}}`, '')
      continue
    }
    if (mode === 'references') continue // daftar pustaka naskah digantikan references.bib (hanya referensi terverifikasi)
    if (/^\s*\|.*\|\s*$/.test(line) || /^\s*\$\$/.test(line) || /^\s*!\[/.test(line)) {
      flushPara(); closeList()
      const kind = /^\s*!\[/.test(line) ? 'gambar' : /^\s*\$\$/.test(line) ? 'persamaan' : 'tabel'
      warn(`unsupported-${kind}`, `Konstruksi ${kind} tidak dikonversi otomatis; ditandai komentar TODO-PUBPREP.`)
      out.push(`% TODO-PUBPREP: ${kind} tidak dikonversi: ${line.replace(/\n/g, ' ')}`)
      continue
    }
    const li = /^\s*(?:([-*+])|(\d{1,3})[.)])\s+(.*)$/.exec(line)
    if (li) {
      flushPara()
      if (/^\s{2,}|^\t/.test(line)) warn('nested', 'Daftar bersarang diratakan menjadi satu tingkat; periksa hasilnya.')
      const kind = li[1] ? 'itemize' : 'enumerate'
      if (list && list !== kind) closeList()
      if (!list) { list = kind; out.push(`\\begin{${kind}}`) }
      out.push(`  \\item ${inline(li[3], warn)}`)
      continue
    }
    if (!line.trim()) { flushPara(); closeList(); continue }
    closeList()
    para.push(line.trim())
  }
  flushPara(); closeList(); closeAbstract()
  if (inCode) { out.push('\\end{quote}'); warn('fence', 'Pagar kode tidak ditutup; ditutup otomatis di akhir naskah.') }
  if (!bibEmitted && CITE_RE.test(out.join('\n'))) bibliography()
  CITE_RE.lastIndex = 0

  const head = [
    '\\documentclass[11pt]{article}',
    '\\usepackage[utf8]{inputenc}',
    '\\usepackage[T1]{fontenc}',
    '\\usepackage{url}',
    `\\title{${title ? inline(title, warn) : '[ISI JUDUL]'}}`,
    '\\author{[ISI NAMA PENULIS]}',
    '\\date{}',
    '\\begin{document}',
    '\\maketitle',
    ''
  ]
  return { tex: `${[...head, ...out].join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n\\end{document}\n`, warnings }
}

// Placeholder yang belum terisi: [ISI ...], {{...}}, TODO-PUBPREP. Mengembalikan [{line, text}].
function findPlaceholders(tex) {
  const found = []
  tex.split('\n').forEach((l, i) => { if (/\[ISI [^\]]+\]|\{\{[^}]*\}\}|TODO-PUBPREP/.test(l)) found.push({ line: i + 1, text: l.trim().slice(0, 140) }) })
  return found
}

function citeKeysOf(tex) {
  const keys = new Set()
  for (const m of tex.matchAll(/\\cite[a-zA-Z]*\*?(?:\[[^\]]*\])*\{([^}\n]{1,300})\}/g)) for (const k of m[1].split(',')) if (k.trim()) keys.add(k.trim())
  return [...keys]
}

// Pemeriksaan naskah LaTeX asli yang diteruskan apa adanya.
function inspectLatex(source) {
  const warnings = []
  const bibs = [...source.matchAll(/\\bibliography\{([^}]+)\}/g)].map((m) => m[1])
  if (/\\begin\{thebibliography\}/.test(source)) warnings.push('Naskah memuat \\begin{thebibliography}; isi daftar pustaka itu dari naskah, bukan dari references.bib terverifikasi.')
  if (bibs.length && !bibs.every((b) => b.split(',').every((n) => n.trim() === 'references'))) warnings.push(`Naskah memakai \\bibliography{${bibs.join(',')}}; ubah menjadi \\bibliography{references} agar memakai references.bib dari paket ini.`)
  if (!bibs.length && citeKeysOf(source).length) warnings.push('Naskah memuat \\cite tetapi tidak memanggil \\bibliography{references}.')
  // Naskah diteruskan apa adanya, jadi perintah berbahaya hanya DILAPORKAN (tidak diubah). Jangan kompilasi sebelum meninjau.
  const danger = [...new Set([...source.matchAll(/\\(write18|immediate|openout|openin|read|catcode|directlua)(?![a-zA-Z])/g)].map((m) => `\\${m[1]}`))]
  if (danger.length) warnings.push(`Naskah memuat perintah LaTeX berbahaya (${danger.join(', ')}): dapat membaca/menulis berkas atau menjalankan perintah saat dikompilasi. Tinjau sebelum mengompilasi.`)
  const files = [...new Set([...source.matchAll(/\\(?:input|include)\{([^}\n]+)\}/g)].map((m) => m[1]))]
  if (files.length) warnings.push(`Naskah merujuk berkas lain yang TIDAK disertakan dalam paket (${files.slice(0, 8).join(', ')}); jalur absolut berisiko membaca berkas lokal.`)
  const cls = (/\\documentclass(?:\[[^\]]*\])?\{([^}]+)\}/.exec(source) || [])[1]
  if (cls && !STANDARD_CLASSES.includes(cls.trim())) warnings.push(`Kelas dokumen "${cls.trim()}" tidak disertakan dalam paket (template venue tidak didistribusikan); sediakan berkas .cls dari penerbit.`)
  const pkgs = [...new Set([...source.matchAll(/\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/g)].flatMap((m) => m[1].split(',').map((x) => x.trim())).filter((p) => p && !STANDARD_PACKAGES.includes(p)))]
  if (pkgs.length) warnings.push(`Paket non-standar tidak disertakan dalam paket: ${pkgs.slice(0, 10).join(', ')}.`)
  return warnings
}

// Pemeriksaan struktur .tex (bukan kompilasi): \begin/\end seimbang per lingkungan dan tepat satu \end{document}.
function validateTexStructure(tex) {
  const issues = []
  const stack = []
  for (const m of tex.matchAll(/\\(begin|end)\{([^}\n]+)\}/g)) {
    if (m[1] === 'begin') stack.push(m[2])
    else if (stack.pop() !== m[2]) { issues.push(`\\end{${m[2]}} tidak cocok dengan \\begin sebelumnya`); break }
  }
  if (stack.length) issues.push(`lingkungan tidak ditutup: ${stack.slice(-3).join(', ')}`)
  if ((tex.match(/\\end\{document\}/g) || []).length !== 1) issues.push('\\end{document} harus tepat satu')
  return issues
}

const STANDARD_CLASSES = ['article', 'report', 'book', 'IEEEtran', 'llncs', 'elsarticle']
const STANDARD_PACKAGES = ['amsmath', 'amssymb', 'graphicx', 'url', 'hyperref', 'cite', 'natbib', 'inputenc', 'fontenc', 'booktabs', 'geometry', 'xcolor', 'listings', 'algorithm', 'algorithmic', 'subcaption', 'multirow', 'times', 'babel']

function imagesOf(source) {
  return [...new Set([...source.matchAll(/\\includegraphics(?:\[[^\]]*\])?\{([^}\n]+)\}/g)].map((m) => m[1]).concat([...source.matchAll(/!\[[^\]]*\]\(([^)\n]+)\)/g)].map((m) => m[1])))]
}

module.exports = { convertMarkdown, findPlaceholders, citeKeysOf, inspectLatex, validateTexStructure, imagesOf, esc }
