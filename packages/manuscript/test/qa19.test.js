'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { parseManuscript } = require('../index')

// QA-19: pola naskah Indonesia (BAB ...), daftar kata kunci YAML flow, dan penulis LaTeX \and.
test('BAB I-V dan DAFTAR PUSTAKA dikenali sebagai bagian standar (tanpa menelan heading)', () => {
  const md = '# BAB I PENDAHULUAN\nTeks.\n\n# BAB II TINJAUAN PUSTAKA\nTeks.\n\n# BAB III METODOLOGI PENELITIAN\nx\n\n# BAB IV HASIL DAN PEMBAHASAN\nx\n\n# BAB V KESIMPULAN DAN SARAN\nx\n\n# DAFTAR PUSTAKA\n[1] a\n'
  const r = parseManuscript(md, 'markdown')
  const keys = Object.fromEntries(r.sections.map((s) => [s.heading, s.key]))
  assert.equal(keys['BAB I PENDAHULUAN'], 'introduction')
  assert.equal(keys['BAB II TINJAUAN PUSTAKA'], 'related_work')
  assert.equal(keys['BAB III METODOLOGI PENELITIAN'], 'methodology')
  assert.equal(keys['BAB IV HASIL DAN PEMBAHASAN'], 'results_discussion')
  assert.equal(keys['BAB V KESIMPULAN DAN SARAN'], 'conclusion')
  assert.equal(keys['DAFTAR PUSTAKA'], 'references')
  assert.equal(r.sections.length, 6, 'tidak ada heading yang hilang')
})

test('BAB dengan angka Romawi/Arab dan titik dua juga dikenali; kata "bab" biasa tidak', () => {
  const r = parseManuscript('## BAB 1: PENDAHULUAN\nx\n\n## Bab 2 - Metode\ny\n\n## Babak baru dalam cerita\nz\n', 'markdown')
  const keys = r.sections.map((s) => s.key)
  assert.deepEqual(keys, ['introduction', 'methodology', null])
})

test('kata kunci YAML flow list [a, b, c] diurai bersih (tanpa kurung)', () => {
  const r = parseManuscript('---\ntitle: Judul\nkeywords: [alfa, beta, "gamma delta"]\n---\n\n# Judul\n\n## Abstract\nIsi.\n', 'markdown')
  assert.deepEqual(r.keywords, ['alfa', 'beta', 'gamma delta'])
})

test('kata kunci YAML blok (daftar bertanda -) dan string dipisah koma tetap berfungsi', () => {
  const a = parseManuscript('---\nkeywords:\n  - satu\n  - dua\n---\n\n## Abstract\nIsi.\n', 'markdown')
  assert.deepEqual(a.keywords, ['satu', 'dua'])
  const b = parseManuscript('---\nkeywords: satu, dua; tiga\n---\n\n## Abstract\nIsi.\n', 'markdown')
  assert.deepEqual(b.keywords, ['satu', 'dua', 'tiga'])
})

test('LaTeX Springer: \\keywords{a \\and b \\and c} dipisah menjadi kata kunci terpisah; \\sep tetap berfungsi; bagian tetap dikenali', () => {
  const tex = '\\documentclass{svjour3}\n\\title{Judul Uji}\n\\author{A. Satu \\and B. Dua}\n\\begin{document}\n\\maketitle\n\\begin{abstract}\nIsi abstrak yang cukup.\n\\keywords{crop yield \\and deep learning \\and CNN}\n\\end{abstract}\n\\section{Pendahuluan}\nTeks pendahuluan.\n\\section{Metode}\nTeks.\n\\end{document}\n'
  const r = parseManuscript(tex, 'latex')
  assert.equal(r.title, 'Judul Uji')
  assert.deepEqual(r.keywords, ['crop yield', 'deep learning', 'CNN'])
  assert.deepEqual(r.sections.map((s) => s.key), ['abstract', 'introduction', 'methodology'])
  const ieee = parseManuscript('\\documentclass{IEEEtran}\n\\begin{document}\n\\begin{IEEEkeywords}\nalfa \\sep beta\n\\end{IEEEkeywords}\n\\section{Introduction}\nx\n\\end{document}\n', 'latex')
  assert.deepEqual(ieee.keywords, ['alfa', 'beta'])
})
