'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { convertMarkdown, buildBibtex, validateBibtex, buildExportPackage, createZip, readZip, inspectLatex } = require('../index')

const ok = (o) => ({ verification: { status: 'verified' }, authors: [], ...o })

test('QC6-1: kode berpagar tidak dapat keluar dari verbatim dan TeX mentah tidak diteruskan', () => {
  const md = '# T\n\n## Methods\n```\n\\end{verbatim}\n\\input{/etc/passwd}\n\\begin{verbatim}\n```\n'
  const { tex } = convertMarkdown(md)
  assert.ok(!/\\input\{\/etc\/passwd\}/.test(tex.replace(/\\textbackslash\{\}input/g, '')), tex)
  assert.ok(!tex.includes('\\end{verbatim}'))
  assert.equal((tex.match(/\\begin\{/g) || []).length, (tex.match(/\\end\{/g) || []).length)
})

test('QC6-1b: \\cite dengan argumen opsional/perintah/kurung tak seimbang di-escape, \\cite biasa dipertahankan', () => {
  const md = '# T\n\n## A\nOk \\cite{a1,b2} dan \\cite[\\input{/etc/passwd}]{a} dan \\citep[\\write18{x}]{b} dan \\cite{a\\input{/etc/passwd} x.\n'
  const { tex } = convertMarkdown(md)
  assert.match(tex, /\\cite\{a1,b2\}/)
  assert.ok(!/\\cite\[/.test(tex))
  assert.ok(!/(^|[^{])\\input\{\/etc/.test(tex.replace(/\\textbackslash\{\}/g, '')), tex)
  assert.ok(!/\\write18/.test(tex.replace(/\\textbackslash\{\}write18/g, '')))
})

test('QC6-3: naskah LaTeX diteruskan memicu peringatan perintah berbahaya, berkas yang dirujuk, dan kelas kustom', () => {
  const src = '\\documentclass{ieeeconf}\n\\usepackage{custom}\n\\begin{document}\n\\input{sections/intro}\n\\immediate\\write18{ls}\n\\input{/etc/passwd}\n\\end{document}\n'
  const w = inspectLatex(src).join('\n')
  assert.match(w, /berbahaya/)
  assert.match(w, /sections\/intro/)
  assert.match(w, /ieeeconf/)
  assert.match(w, /custom/)
})

test('QC6-7: pemeriksaan struktur .tex berjalan saat ekspor (begin/end seimbang) dan melapor bila tidak', () => {
  const p = buildExportPackage({ project: { title: 'P' }, version: { number: 1, format: 'latex', source: '\\documentclass{article}\n\\begin{document}\n\\begin{itemize}\nx\n\\end{document}\n' }, references: [] })
  assert.match(p.warnings.join('\n'), /tidak seimbang/)
  const good = buildExportPackage({ project: { title: 'P' }, version: { number: 1, format: 'markdown', source: '# T\n\n## A\nteks\n' }, references: [] })
  assert.ok(!/tidak seimbang/.test(good.warnings.join('\n')))
})

test('QC6-8: daftar pustaka naskah Markdown yang tidak disalin dan sitasi penulis-tahun diperingatkan', () => {
  const p = buildExportPackage({ project: { title: 'P' }, version: { number: 1, format: 'markdown', source: '# T\n\n## A\nKlaim (Lee, 2020).\n\n## References\nLee. Paper. 2020.\n' }, references: [] })
  const w = p.warnings.join('\n')
  assert.match(w, /Daftar pustaka naskah tidak disalin/)
  assert.match(w, /penulis-tahun/)
})

test('QC6-9: DOI/URL tidak di-escape (valid dipertahankan, tidak valid dibuang), nama dengan "and" dibungkus, key tak peka huruf besar-kecil, penulis tanpa family dilaporkan', () => {
  const r = buildBibtex([
    ok({ citeKey: 'a2020', title: 'T1', doi: '10.1234/a_b%c#d', url: 'https://x.org/a_b?q=1%20#h' }),
    ok({ citeKey: 'A2020', title: 'T2' }),
    ok({ citeKey: 'b2020', title: 'T3', doi: 'bukan doi {x}', url: 'javascript:alert(1)' }),
    ok({ citeKey: 'c2020', title: 'T4', authors: [{ family: 'Smith and Jones', given: 'A' }, { given: 'Tanpa' }, { family: 'Lee', given: 'B' }] })
  ])
  assert.deepEqual([...r.included].sort(), ['A2020', 'b2020', 'c2020'].filter((k) => k !== 'a2020' && k !== 'A2020').concat(r.included.filter((k) => k.toLowerCase() === 'a2020')).sort())
  assert.equal(r.included.filter((k) => k.toLowerCase() === 'a2020').length, 1, 'kunci sama tanpa peduli huruf hanya satu')
  assert.ok(r.excluded.some((x) => /ganda/.test(x.reason)))
  assert.match(r.bib, /doi = \{10\.1234\/a_b%c#d\}/)
  assert.match(r.bib, /url = \{https:\/\/x\.org\/a_b\?q=1%20#h\}/)
  const b = r.bib.split('\n\n').find((e) => e.includes('b2020'))
  assert.ok(!/doi|url/.test(b), b)
  assert.match(r.bib, /author = \{\{Smith and Jones\}, A and Lee, B\}/)
  assert.ok(r.warnings.some((w) => /c2020/.test(w) && /tanpa nama keluarga/.test(w)))
  assert.deepEqual(validateBibtex(r.bib, r.included), [])
})

test('QC6-5b: readZip menolak nama berkas tidak aman (zip-slip)', () => {
  const zip = createZip([{ name: 'a/b.txt', data: 'x' }])
  const evil = Buffer.from(zip)
  let at = 0
  let patched = 0
  while ((at = evil.indexOf(Buffer.from('a/b.txt'), at)) >= 0) { evil.write('../b.tx', at); patched++; at++ } // nama sama panjang di header lokal dan pusat
  assert.equal(patched, 2)
  assert.throws(() => readZip(evil), /tidak aman/)
})

test('QC6-5c: KEY_RE menolak kunci berisi koma/kurung', () => {
  const r = buildBibtex([ok({ citeKey: 'a,b', title: 'T' }), ok({ citeKey: 'a{b}', title: 'T' }), ok({ citeKey: 'ok1', title: 'T' })])
  assert.deepEqual(r.included, ['ok1'])
})
