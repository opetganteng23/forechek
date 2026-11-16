'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { buildBibtex, validateBibtex, escapeTex, createZip, readZip, convertMarkdown, findPlaceholders, buildExportPackage, getOverleafProvider, createFakeOverleafProvider } = require('../index')

const ok = (o) => ({ verification: { status: 'verified' }, authors: [], ...o })
const REFS = [
  ok({ citeKey: 'wulandari2021adaptive', type: 'journal-article', title: 'Adaptive Sparse Attention & Low-Resource_Models 100%', authors: [{ given: 'Ratna', family: 'Wulandari' }, { given: 'Chen', family: 'Mei' }], year: 2021, venueName: 'Journal of {Things}', doi: '10.99999/fx.2021.001' }),
  ok({ citeKey: 'minimal2020', title: 'Hanya Judul' }),
  { citeKey: 'partial2019', title: 'Parsial', verification: { status: 'partial' }, authors: [{ family: 'X' }], year: 2019 },
  { citeKey: 'unverified2018', title: 'Belum', verification: { status: 'unverified' }, authors: [], year: 2018 },
  { citeKey: 'retracted2017', title: 'Ditarik', verification: { status: 'retracted' }, authors: [], year: 2017 },
  ok({ citeKey: 'bad key!', title: 'Kunci buruk' })
]

test('BibTeX: hanya referensi verified; partial/unverified/retracted dan kunci buruk dikecualikan dengan alasan', () => {
  const r = buildBibtex(REFS)
  assert.deepEqual(r.included, ['minimal2020', 'wulandari2021adaptive'])
  assert.deepEqual(r.excluded.map((x) => x.citeKey).sort(), ['bad key!', 'partial2019', 'retracted2017', 'unverified2018'])
  assert.ok(!/partial2019|unverified2018|retracted2017/.test(r.bib))
})

test('BibTeX: bidang yang tidak tersedia TIDAK diisi; escape karakter khusus; validasi lolos', () => {
  const r = buildBibtex(REFS)
  const minimal = r.bib.split('\n\n').find((e) => e.includes('minimal2020'))
  assert.ok(!/author|year|doi|url|journal|booktitle/.test(minimal), minimal)
  const full = r.bib.split('\n\n').find((e) => e.includes('wulandari2021adaptive'))
  assert.match(full, /@article\{wulandari2021adaptive,/)
  assert.match(full, /Adaptive Sparse Attention \\& Low-Resource\\_Models 100\\%/)
  assert.match(full, /author = \{Wulandari, Ratna and Mei, Chen\}/)
  assert.match(full, /journal = \{Journal of \\\{Things\\\}\}/)
  assert.deepEqual(validateBibtex(r.bib, r.included), [])
  assert.equal(escapeTex('a_b #c ~d ^e \\f'), 'a\\_b \\#c \\~{}d \\^{}e \\textbackslash{}f')
})

test('BibTeX: validasi mendeteksi kurung tak seimbang dan daftar kunci tak sesuai; kosong -> komentar jujur', () => {
  assert.ok(validateBibtex('@article{a,\n  title = {{x}\n}\n', ['a']).includes('kurung kurawal tidak seimbang'))
  assert.ok(validateBibtex('@article{a,\n  title = {x}\n}\n', ['b']).length)
  const empty = buildBibtex([])
  assert.match(empty.bib, /Tidak ada referensi terverifikasi/)
  assert.deepEqual(validateBibtex(empty.bib, empty.included), [])
})

test('ZIP: struktur valid, CRC dibaca ulang, nama berkas tak aman ditolak, round-trip persis', () => {
  const zip = createZip([{ name: 'a.txt', data: 'halo ✓' }, { name: 'dir/b.bin', data: Buffer.from([0, 1, 2, 255]) }])
  const files = readZip(zip)
  assert.deepEqual(files.map((f) => f.name), ['a.txt', 'dir/b.bin'])
  assert.equal(files[0].data.toString('utf8'), 'halo ✓')
  assert.deepEqual([...files[1].data], [0, 1, 2, 255])
  for (const bad of ['../x', '/abs', 'a\\b', 'a//b', '']) assert.throws(() => createZip([{ name: bad, data: 'x' }]), /tidak aman/)
  assert.throws(() => createZip([{ name: 'a', data: 'x' }, { name: 'a', data: 'y' }]), /ganda/)
  const corrupt = Buffer.from(zip)
  corrupt[40] ^= 0xff
  assert.throws(() => readZip(corrupt))
})

const MD = `# Deteksi Anomali & Jaringan

## Abstract
Kami mengusulkan **autoencoder** ringan untuk *deteksi* anomali dengan 100% data_uji.

## Introduction
Anomali mengancam IoT \\cite{wulandari2021adaptive} dan \\cite{tidakada2020}.

- butir satu
- butir dua

| a | b |
|---|---|

![gambar](fig1.png)

## References
[1] A. Author, "Title," 2020.
`

test('Markdown -> LaTeX: struktur, escape, sitasi dipertahankan, daftar pustaka naskah diganti references.bib, konstruksi tak didukung ditandai', () => {
  const { tex, warnings } = convertMarkdown(MD)
  assert.match(tex, /\\title\{Deteksi Anomali \\& Jaringan\}/)
  assert.match(tex, /\\begin\{abstract\}[\s\S]*\\textbf\{autoencoder\}[\s\S]*\\emph\{deteksi\}[\s\S]*100\\% data\\_uji[\s\S]*\\end\{abstract\}/)
  assert.match(tex, /\\section\{Introduction\}/)
  assert.match(tex, /\\cite\{wulandari2021adaptive\}/)
  assert.match(tex, /\\begin\{itemize\}\n  \\item butir satu\n  \\item butir dua\n\\end\{itemize\}/)
  assert.match(tex, /\\bibliography\{references\}/)
  assert.ok(!tex.includes('A. Author'), 'daftar pustaka naskah tidak disalin')
  assert.match(tex, /% TODO-PUBPREP: tabel/)
  assert.match(tex, /% TODO-PUBPREP: gambar/)
  assert.ok(warnings.some((w) => /tabel/.test(w)) && warnings.some((w) => /gambar/.test(w)))
  assert.ok(tex.trimEnd().endsWith('\\end{document}'))
  assert.equal((tex.match(/\\begin\{/g) || []).length, (tex.match(/\\end\{/g) || []).length)
  assert.deepEqual(findPlaceholders(tex).map((p) => p.line).length > 0, true)
})

test('Paket: berkas lengkap, ZIP dapat dibaca, manifest/versi/venue, peringatan untuk placeholder, gambar, sitasi tanpa bib, venue belum terpercaya', () => {
  const venue = { slug: 'ieee-conference-generic', name: 'IEEE Conference (generik)', version: 1, status: 'needs_review', verification: 'unverified' }
  const p = buildExportPackage({ project: { title: 'Proyek' }, version: { number: 3, format: 'markdown', source: MD }, references: REFS, venue, freshness: { trustworthy: false, state: 'needs_review' }, now: new Date('2026-11-16T00:00:00Z') })
  const files = readZip(p.zip)
  assert.deepEqual(files.map((f) => f.name), ['main.tex', 'references.bib', 'README.txt', 'manifest.json'])
  const manifest = JSON.parse(files[3].data.toString())
  assert.equal(manifest.manuscriptVersion.number, 3)
  assert.equal(manifest.venue.slug, 'ieee-conference-generic')
  assert.equal(manifest.references.exported, 2)
  assert.ok(manifest.placeholders >= 1)
  const w = p.warnings.join('\n')
  assert.match(w, /placeholder belum terisi/)
  assert.match(w, /fig1\.png/)
  assert.match(w, /tidakada2020/)
  assert.match(w, /Template venue tidak disertakan/)
  assert.match(w, /belum dapat dipercaya/)
  assert.match(w, /partial2019 tidak diekspor/)
  assert.match(files[2].data.toString(), /Upload Project/)
  assert.ok(!/password|secret|token/i.test(files.map((f) => f.data.toString()).join('\n')))
})

test('Paket: naskah LaTeX diteruskan apa adanya (tidak mengubah isi pengguna) dengan pemeriksaan bibliografi', () => {
  const src = '\\documentclass{article}\r\n\\begin{document}\r\nIsi \\cite{minimal2020} \\cite{x}.\r\n\\bibliography{lain}\r\n\\end{document}\r\n'
  const p = buildExportPackage({ project: { title: 'P' }, version: { number: 1, format: 'latex', source: src }, references: REFS })
  const tex = readZip(p.zip).find((f) => f.name === 'main.tex').data.toString()
  assert.equal(tex, src.replace(/\r\n/g, '\n'))
  assert.match(p.warnings.join('\n'), /bibliography\{lain\}/)
  assert.match(p.warnings.join('\n'), /tidak ada di references\.bib terverifikasi: x/)
})

test('Paket: deterministik untuk masukan sama dan urutan referensi berbeda', () => {
  const args = { project: { title: 'P' }, version: { number: 1, format: 'markdown', source: MD }, now: new Date('2026-11-16T00:00:00Z') }
  const a = buildExportPackage({ ...args, references: REFS })
  const b = buildExportPackage({ ...args, references: [...REFS].reverse() })
  assert.ok(a.zip.equals(b.zip))
})

test('Overleaf: penyedia bawaan = unggah manual, TIDAK mengklaim satu klik; penyedia palsu terpisah dan berlabel', async () => {
  const d = getOverleafProvider().describe()
  assert.equal(d.oneClick, false)
  assert.match(d.note, /TIDAK DIVERIFIKASI/)
  const fake = createFakeOverleafProvider()
  assert.match(fake.describe().note, /PALSU/)
  await fake.importZip(Buffer.alloc(3))
  assert.deepEqual(fake.calls, [3])
})
