'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { parseManuscript, normalizeSource, detectFormat, classifyHeading, sectionText } = require('../src/parser')

const keys = (r) => r.sections.map((s) => s.key)
const codes = (r) => r.warnings.map((w) => w.code)

// ---------- Markdown ----------
const MD_EN = `# Deep Learning for Flight Delay Prediction

**Keywords:** deep learning, aviation; time series

## Abstract
We propose a model that predicts flight delays with high accuracy using historical data.

## 1. Introduction
Flight delays cost billions. See prior work.

### 1.1 Motivation
Details here.

## 2. Methodology
We use an LSTM network.

## 3. Results
Accuracy reached 91 percent.

## 4. Discussion
The model generalises well.

## 5. Conclusion
We presented a model.

## References
[1] A. Author, Title, 2020.
`

test('Markdown Inggris: judul, kata kunci, bagian standar, confidence tinggi', () => {
  const r = parseManuscript(MD_EN)
  assert.equal(r.format, 'markdown')
  assert.equal(r.title, 'Deep Learning for Flight Delay Prediction')
  assert.deepEqual(r.keywords, ['deep learning', 'aviation', 'time series'])
  assert.deepEqual(keys(r).filter(Boolean), ['abstract', 'introduction', 'methodology', 'results', 'discussion', 'conclusion', 'references'])
  assert.equal(r.confidence, 'high')
  assert.ok(r.stats.abstractWords > 5)
  assert.ok(!codes(r).includes('NO_ABSTRACT'))
  // subbagian tercatat tetapi tidak bertipe
  const sub = r.sections.find((s) => s.heading.includes('Motivation'))
  assert.equal(sub.key, null)
  assert.equal(sub.level, 3)
})

test('offset benar: slice dari start diawali heading, sectionText mengambil isi', () => {
  const r = parseManuscript(MD_EN)
  for (const s of r.sections) assert.ok(r.source.slice(s.start).startsWith('#'), s.heading)
  const intro = r.sections.find((s) => s.key === 'introduction')
  assert.match(sectionText(r.source, intro), /^Flight delays cost billions/)
  assert.ok(!sectionText(r.source, intro).includes('We use an LSTM'))
  // bagian "introduction" memuat subbagian 1.1 (end = heading level sama berikutnya)
  assert.match(sectionText(r.source, intro), /Details here/)
})

const MD_ID = `# Prediksi Keterlambatan Penerbangan dengan LSTM

Kata kunci: LSTM, penerbangan, prediksi

## Abstrak
Penelitian ini membangun model prediksi keterlambatan penerbangan.

## Pendahuluan
Keterlambatan menimbulkan kerugian.

## Metode Penelitian
Data dikumpulkan dari bandara.

## Hasil dan Pembahasan
Akurasi mencapai 91 persen.

## Kesimpulan
Model berhasil.

## Daftar Pustaka
[1] Penulis, Judul, 2020.
`

test('Markdown Indonesia dikenali (Pendahuluan, Metode Penelitian, Hasil dan Pembahasan, Daftar Pustaka)', () => {
  const r = parseManuscript(MD_ID)
  assert.deepEqual(keys(r), ['abstract', 'introduction', 'methodology', 'results_discussion', 'conclusion', 'references'])
  assert.deepEqual(r.keywords, ['LSTM', 'penerbangan', 'prediksi'])
  assert.ok(codes(r).includes('COMBINED_RESULTS_DISCUSSION'))
  assert.equal(r.confidence, 'high')
})

test('penomoran romawi KAPITAL (gaya IEEE) dan arab dilepas, "Dim results" tidak terpotong', () => {
  assert.equal(classifyHeading('I. INTRODUCTION'), 'introduction')
  assert.equal(classifyHeading('IV. RESULTS'), 'results')
  assert.equal(classifyHeading('2.3 Methods'), 'methodology')
  assert.equal(classifyHeading('Dim results'), null)
  assert.equal(classifyHeading('**Conclusions and Future Work**'), 'conclusion')
  assert.equal(classifyHeading('Acknowledgment'), 'acknowledgements')
  assert.equal(classifyHeading('Data Availability Statement'), 'declarations')
})

test('heading di dalam blok kode berpagar tidak dianggap bagian', () => {
  const src = '# T\n\n## Introduction\ntext\n\n```python\n# komentar bukan heading\n## Methods palsu\n```\n\n## Conclusion\nok\n'
  const r = parseManuscript(src)
  assert.deepEqual(keys(r), ['introduction', 'conclusion'])
})

test('Markdown tanpa heading: NO_SECTIONS, NO_TITLE, confidence rendah, tidak crash', () => {
  const r = parseManuscript('Hanya paragraf biasa tanpa struktur.')
  assert.deepEqual(codes(r).sort(), ['NO_ABSTRACT', 'NO_SECTIONS', 'NO_TITLE'].sort())
  assert.equal(r.confidence, 'low')
})

test('front matter YAML memberi judul dan kata kunci', () => {
  const src = '---\ntitle: "Judul dari front matter"\nkeywords: a, b\n---\n\n## Introduction\nisi\n'
  const r = parseManuscript(src)
  assert.equal(r.title, 'Judul dari front matter')
  assert.deepEqual(r.keywords, ['a', 'b'])
  assert.deepEqual(keys(r), ['introduction'])
})

test('bagian duplikat dan kosong diperingatkan', () => {
  const r = parseManuscript('# T\n\n## Introduction\nsatu\n\n## Introduction\ndua\n\n## Methods\n\n## Conclusion\nx')
  assert.ok(codes(r).includes('DUPLICATE_SECTION'))
  assert.ok(codes(r).includes('EMPTY_SECTION'))
})

test('heading tak dikenal dilaporkan sebagai info, tetap ada di outline', () => {
  const r = parseManuscript('# T\n\n## Introduction\na\n\n## Cerita Sampingan\nb\n')
  const w = r.warnings.find((x) => x.code === 'UNRECOGNIZED_HEADING')
  assert.equal(w.severity, 'info')
  assert.ok(r.sections.some((s) => s.heading === 'Cerita Sampingan' && s.key === null))
})

test('CRLF dan BOM dinormalisasi sehingga offset konsisten', () => {
  const crlf = '\uFEFF# T\r\n\r\n## Introduction\r\nisi\r\n\r\n## Conclusion\r\nok\r\n'
  const r = parseManuscript(crlf)
  assert.equal(r.source.includes('\r'), false)
  assert.equal(r.source.charCodeAt(0), '#'.charCodeAt(0))
  assert.deepEqual(keys(r), ['introduction', 'conclusion'])
  for (const s of r.sections) assert.ok(r.source.slice(s.start).startsWith('##'))
  assert.equal(normalizeSource('a\rb'), 'a\nb')
})

// ---------- LaTeX ----------
const TEX = String.raw`\documentclass[conference]{IEEEtran}
% \section{Komentar Palsu}
\begin{document}
\title{Flight Delay Prediction\thanks{Funded by X}}
\author{A. Author}
\maketitle

\begin{abstract}
We present a model for predicting flight delays with strong accuracy on real data.
\end{abstract}

\begin{IEEEkeywords}
deep learning, aviation, LSTM
\end{IEEEkeywords}

\section{Introduction}
Delays are costly \cite{smith2020}. % catatan \section{Hantu}
\subsection{Motivation}
More text here.

\section{Methodology}
We use $x^2$ in an LSTM.
\begin{verbatim}
\section{Palsu di verbatim}
\end{verbatim}

\section{Results}
Accuracy is 91\%.

\section{Conclusion}
Done.

\begin{thebibliography}{1}
\bibitem{smith2020} J. Smith, Title, 2020.
\end{thebibliography}
\end{document}
`

test('LaTeX IEEE: judul, abstrak env, keywords env, bagian, thebibliography', () => {
  const r = parseManuscript(TEX)
  assert.equal(r.format, 'latex')
  assert.equal(r.title, 'Flight Delay Prediction')
  assert.deepEqual(r.keywords, ['deep learning', 'aviation', 'LSTM'])
  assert.deepEqual(keys(r).filter(Boolean), ['abstract', 'introduction', 'methodology', 'results', 'conclusion', 'references'])
  assert.equal(r.confidence, 'high')
})

test('LaTeX: komentar dan verbatim diabaikan', () => {
  const r = parseManuscript(TEX)
  const headings = r.sections.map((s) => s.heading)
  assert.ok(!headings.includes('Komentar Palsu'))
  assert.ok(!headings.includes('Hantu'))
  assert.ok(!headings.includes('Palsu di verbatim'))
})

test('LaTeX: offset benar untuk bagian dan abstrak', () => {
  const r = parseManuscript(TEX)
  const abs = r.sections.find((s) => s.key === 'abstract')
  assert.match(sectionText(r.source, abs), /^We present a model/)
  assert.ok(!sectionText(r.source, abs).includes('\\end{abstract}'))
  const intro = r.sections.find((s) => s.key === 'introduction')
  assert.ok(r.source.slice(intro.start).startsWith('\\section{Introduction}'))
  const refs = r.sections.find((s) => s.key === 'references')
  assert.match(sectionText(r.source, refs), /bibitem\{smith2020\}/)
  assert.ok(!sectionText(r.source, refs).includes('\\end{document}'))
})

test('LaTeX: hitungan kata mengabaikan perintah, sitasi, matematika', () => {
  const r = parseManuscript(String.raw`\section{Introduction}
Delays are costly \cite{a} and $x^2$ matter \textbf{greatly}.
\section{Conclusion}
Done now.`, 'latex')
  const intro = r.sections.find((s) => s.key === 'introduction')
  assert.equal(intro.words, 6) // Delays are costly and matter greatly
})

test('LaTeX dengan \\bibliography: peringatan BIB_EXTERNAL (info)', () => {
  const r = parseManuscript(String.raw`\documentclass{article}
\begin{document}
\title{T}
\section{Introduction}
isi
\section{Conclusion}
isi
\bibliographystyle{plain}
\bibliography{refs}
\end{document}`)
  assert.ok(r.sections.some((s) => s.key === 'references' && s.externalBib))
  assert.equal(r.warnings.find((w) => w.code === 'BIB_EXTERNAL').severity, 'info')
})

test('\\keywords{} (Springer/elsarticle) dan \\sep', () => {
  const r1 = parseManuscript(String.raw`\title{T}\keywords{alpha, beta; gamma}\section{Introduction}x`, 'latex')
  assert.deepEqual(r1.keywords, ['alpha', 'beta', 'gamma'])
  const r2 = parseManuscript(String.raw`\title{T}\begin{keyword}one \sep two\end{keyword}\section{Introduction}x`, 'latex')
  assert.deepEqual(r2.keywords, ['one', 'two'])
})

test('perintah LaTeX berisiko ditandai (tidak dijalankan di MVP)', () => {
  const r = parseManuscript(String.raw`\documentclass{article}\begin{document}\immediate\write18{rm -rf /}\section{Introduction}x\end{document}`)
  assert.ok(codes(r).includes('DANGEROUS_LATEX'))
  const r2 = parseManuscript(String.raw`\documentclass{article}\begin{document}\input{/etc/passwd}\section{Introduction}x\end{document}`)
  assert.ok(codes(r2).includes('DANGEROUS_LATEX'))
  // yang ada di komentar tidak dihitung
  const r3 = parseManuscript(String.raw`\documentclass{article}\begin{document}
% \write18{x}
\section{Introduction}x\end{document}`)
  assert.ok(!codes(r3).includes('DANGEROUS_LATEX'))
})

test('detectFormat dan peringatan ketidakcocokan format', () => {
  assert.equal(detectFormat('\\documentclass{article}'), 'latex')
  assert.equal(detectFormat('\\section{A} x \\section{B} y'), 'latex')
  assert.equal(detectFormat('# Judul\n\n## A'), 'markdown')
  assert.ok(codes(parseManuscript('\\documentclass{article}\nteks', 'markdown')).includes('FORMAT_MISMATCH'))
  assert.ok(codes(parseManuscript('# Judul\n\nteks biasa', 'latex')).includes('FORMAT_MISMATCH'))
})

// ---------- ketahanan ----------
test('masukan jelek tidak membuat parser crash atau menggantung', () => {
  const garbage = [
    '\\section{', '\\title{{{{{{', '\\begin{abstract}', '\\begin{verbatim}\\section{A}', '{{{{}}}}',
    '\\\\\\\\\\\\', '%', '\\', '#', '##', '```', '---\ntitle: x', '\u0000\u0001', '\\begin{', '\\section*[x]{y', '\\begin{thebibliography}'
  ]
  for (const g of garbage) {
    for (const fmt of ['latex', 'markdown', undefined]) {
      assert.doesNotThrow(() => parseManuscript(g, fmt), JSON.stringify(g))
    }
  }
})

test('performa: naskah ~1 MB terparse < 1,5 detik (Markdown dan LaTeX)', () => {
  const para = 'Kalimat contoh untuk menguji performa parser pada naskah yang sangat besar. '.repeat(20) + '\n\n'
  let md = '# Judul\n\n## Abstract\nx\n\n'
  let tex = '\\documentclass{article}\n\\begin{document}\n\\title{J}\n'
  while (md.length < 1000000) {
    md += `## Bagian ${md.length}\n${para}`
    tex += `\\section{Bagian ${tex.length}}\n${para}% komentar \\section{x}\n`
  }
  for (const [src, fmt] of [[md, 'markdown'], [tex, 'latex']]) {
    const t = Date.now()
    const r = parseManuscript(src, fmt)
    const ms = Date.now() - t
    assert.ok(r.sections.length > 100)
    assert.ok(ms < 1500, `${fmt} butuh ${ms} ms`)
  }
})

test('keluaran dapat di-serialisasi JSON dan stats masuk akal', () => {
  const r = parseManuscript(MD_EN)
  const { source, ...rest } = r
  assert.doesNotThrow(() => JSON.stringify(rest))
  assert.ok(rest.stats.words > 30)
  assert.equal(rest.stats.chars, source.length)
})

// Regresi QA-12: Math.min(...levels) melempar RangeError pada ratusan ribu heading (naskah <= 1 MB masih valid).
test('naskah dengan 200.000 heading tidak melempar RangeError', () => {
  const src = '## a\n'.repeat(200000)
  assert.equal(Buffer.byteLength(src), 1000000)
  const r = parseManuscript(src, 'markdown')
  assert.ok(r.sections.length > 0)
})

test('CPU/ukuran parser: 200.000 heading selesai < 1 dtk, jumlah bagian dibatasi, dokumen parse muat dalam batas dokumen Mongo', () => {
  const { parseManuscript, MAX_SECTIONS } = require('../src/parser')
  const src = '# a\n'.repeat(200000)
  const t = Date.now()
  const r = parseManuscript(src, 'markdown')
  const ms = Date.now() - t
  assert.ok(ms < 1000, `${ms} ms`)
  assert.ok(MAX_SECTIONS >= 1000 && r.sections.length <= MAX_SECTIONS, `sections=${r.sections.length}`)
  assert.ok(r.warnings.some((w) => w.code === 'SECTIONS_TRUNCATED'), 'harus ada peringatan pemotongan')
  const { source, ...parse } = r
  assert.ok(JSON.stringify(parse).length < 2_000_000, 'dokumen parse harus jauh di bawah 16 MB')
  assert.equal(source.length, src.length)
})
