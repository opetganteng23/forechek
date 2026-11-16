'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { runChecks, summarizeChecks, THRESHOLDS } = require('../index')
const { GOOD_MD, REFS, venues, clone, parse, PARA } = require('./fixtures')

const NOW = new Date('2026-11-15T00:00:00Z')
const run = (src, over = {}) => runChecks({ source: src, parse: parse(src), references: REFS, venue: venues['ieee-conference-generic'], now: NOW, ...over })
const get = (list, id) => list.find((c) => c.checkId === id)

test('reproduksibilitas: masukan sama -> hasil identik (deep equal), tidak bergantung urutan referensi', () => {
  const a = run(GOOD_MD)
  const b = run(GOOD_MD)
  assert.deepEqual(a, b)
  const c = run(GOOD_MD, { references: [...REFS].reverse() })
  assert.deepEqual(a.map((x) => [x.checkId, x.status]), c.map((x) => [x.checkId, x.status]))
})

test('semua hasil memiliki status valid, detail, dan evidence berlokasi bila relevan', () => {
  const list = run(GOOD_MD)
  const valid = new Set(['pass', 'warn', 'fail', 'not_applicable', 'manual_review'])
  for (const c of list) {
    assert.ok(valid.has(c.status), c.checkId)
    assert.ok(c.detail && c.group && c.label, c.checkId)
    for (const e of c.evidence) assert.ok(Number.isInteger(e.line) && e.line >= 1 && e.start >= 0, c.checkId)
  }
  assert.equal(new Set(list.map((c) => c.checkId)).size, list.length, 'checkId unik')
})

test('struktur: naskah baik lolos; bagian wajib hilang -> fail + critical (dengan venue); alias results_discussion diterima', () => {
  assert.equal(get(run(GOOD_MD), 'structure.required_sections').status, 'pass')
  const noIntro = GOOD_MD.replace(/## Introduction[\s\S]*?(?=## Methodology)/, '')
  const r = get(run(noIntro), 'structure.required_sections')
  assert.equal(r.status, 'fail')
  assert.equal(r.critical, true)
  assert.match(r.detail, /introduction/)
  const merged = GOOD_MD.replace('## Results', '## Results and Discussion')
  const sc = runChecks({ source: merged, parse: parse(merged), references: REFS, venue: venues['scopus-generic'], now: NOW })
  assert.equal(get(sc, 'structure.required_sections').status, 'pass', 'results_discussion memenuhi results')
})

test('struktur tanpa venue: aturan umum, tidak critical', () => {
  const r = get(runChecks({ source: 'x', parse: parse('# T\n\ntes'), references: [], venue: null, now: NOW }), 'structure.required_sections')
  assert.equal(r.status, 'fail')
  assert.equal(r.critical, false)
  assert.match(r.detail, /pilih venue/)
})

test('abstrak: batas venue 150-250 kata; terlalu pendek -> fail; tanpa venue -> not_applicable', () => {
  const short = GOOD_MD.replace(/## Abstract[\s\S]*?(?=## Introduction)/, '## Abstract\nTerlalu pendek.\n\n')
  assert.equal(get(run(short), 'abstract.word_count').status, 'fail')
  const noVenue = get(run(GOOD_MD, { venue: null }), 'abstract.word_count')
  assert.equal(noVenue.status, 'not_applicable')
  const ok = get(run(GOOD_MD.replace(/## Abstract\n[^\n]*/, `## Abstract\n${'kata '.repeat(180)}`)), 'abstract.word_count')
  assert.equal(ok.status, 'pass')
  assert.ok(ok.evidence[0].line >= 1)
})

test('kata kunci: jumlah dibanding venue; tanpa kata kunci -> fail (venue menetapkan) / warn (tanpa venue)', () => {
  assert.equal(get(run(GOOD_MD), 'keywords.count').status, 'pass')
  const none = GOOD_MD.replace('**Keywords:** anomaly detection, autoencoder, IoT\n', '')
  assert.equal(get(run(none), 'keywords.count').status, 'fail')
  assert.equal(get(run(none, { venue: null }), 'keywords.count').status, 'warn')
})

test('sitasi: yatim -> fail critical dengan lokasi; tidak terverifikasi -> warn; retracted -> fail critical', () => {
  const orphan = GOOD_MD.replace('Kontak:', 'Lihat \\cite{karangan2025x}. Kontak:')
  const o = get(run(orphan), 'citations.orphan')
  assert.equal(o.status, 'fail')
  assert.equal(o.critical, true)
  assert.ok(o.evidence[0].snippet.includes('karangan2025x'))
  const src = orphan.split('\n')
  assert.ok(src[o.evidence[0].line - 1].includes('karangan2025x'), 'nomor baris menunjuk baris sitasi')
  const refs = [{ ...REFS[0], verification: { status: 'partial' } }, REFS[1]]
  assert.equal(get(run(GOOD_MD, { references: refs }), 'citations.unverified').status, 'warn')
  const ret = [{ ...REFS[0], verification: { status: 'retracted' } }, REFS[1]]
  const r = get(run(GOOD_MD, { references: ret }), 'citations.retracted')
  assert.equal(r.status, 'fail')
  assert.equal(r.critical, true)
})

test('sitasi: tanpa sitasi sah semua lolos; bagian referensi naskah tidak dipindai sebagai sitasi', () => {
  const list = run(GOOD_MD)
  assert.equal(get(list, 'citations.orphan').status, 'pass')
  assert.equal(get(list, 'citations.retracted').status, 'pass')
  // "[1]" di bagian References bukan sitasi di teks
  assert.ok(!get(list, 'citations.numeric_range'))
})

test('sitasi numerik: manual_review; nomor di luar daftar pustaka naskah -> fail critical', () => {
  const num = GOOD_MD.replace('(Santoso, 2020)', '[1], [2]')
  assert.equal(get(run(num), 'citations.numeric_range').status, 'manual_review')
  const over = GOOD_MD.replace('(Santoso, 2020)', '[9]')
  const r = get(run(over), 'citations.numeric_range')
  assert.equal(r.status, 'fail')
  assert.equal(r.critical, true)
})

test('referensi proyek tidak disitasi -> warn; gaya sitasi dibanding venue', () => {
  const unused = get(run(GOOD_MD, { references: [...REFS, { ...REFS[0], citeKey: 'lain2022x', doi: '10.99999/l' }] }), 'citations.unused_references')
  assert.equal(unused.status, 'warn')
  assert.match(unused.detail, /lain2022x/)
  const numeric = GOOD_MD.replaceAll('\\cite{wulandari2021adaptive}', '[1]').replaceAll('(Santoso, 2020)', '[2]')
  assert.equal(get(run(numeric), 'citations.style').status, 'pass', 'IEEE + numerik')
  const ay = GOOD_MD.replace('\\cite{wulandari2021adaptive}', 'Wulandari (2021)')
  assert.equal(get(run(ay), 'citations.style').status, 'warn', 'IEEE tetapi penulis-tahun')
  const mixed = GOOD_MD.replace('\\cite{wulandari2021adaptive}', '[1]')
  assert.equal(get(run(mixed), 'citations.style').status, 'warn', 'gaya bercampur')
  assert.equal(get(run(GOOD_MD, { venue: venues['sinta-generic'] }), 'citations.style').status, 'manual_review', 'gaya custom')
})

test('referensi: cakupan DOI, keterbaruan (now diinjeksi), status verifikasi', () => {
  const noDoi = REFS.map((r) => ({ ...r, doi: null }))
  assert.equal(get(run(GOOD_MD, { references: noDoi }), 'references.doi_coverage').status, 'warn')
  const old = REFS.map((r) => ({ ...r, year: 2005 }))
  assert.equal(get(run(GOOD_MD, { references: old }), 'references.recency').status, 'warn')
  assert.equal(get(run(GOOD_MD, { references: old, now: new Date('2007-01-01T00:00:00Z') }), 'references.recency').status, 'pass', 'now menentukan keterbaruan')
  assert.equal(get(run(GOOD_MD), 'references.verification_status').status, 'pass')
  const none = get(run(GOOD_MD, { references: [] }), 'references.library')
  assert.equal(none.status, 'warn')
  assert.equal(get(run(GOOD_MD), 'references.self_citation').status, 'not_applicable')
})

test('double-blind: sinyal email/ORCID/blok penulis dilaporkan dengan baris; kebijakan unknown -> manual_review; non-blind -> not_applicable', () => {
  const db = clone(venues['ieee-conference-generic'])
  db.reviewPolicy = 'double_blind'
  const src = `${GOOD_MD}\n\nORCID: 0000-0002-1825-0097\n`
  const r = get(run(src, { venue: db }), 'blind.identity_leakage')
  assert.equal(r.status, 'warn')
  assert.ok(r.evidence.some((e) => e.signal === 'email'))
  assert.ok(r.evidence.some((e) => e.signal === 'orcid'))
  assert.ok(src.split('\n')[r.evidence.find((e) => e.signal === 'email').line - 1].includes('@'))
  assert.equal(get(run(GOOD_MD), 'blind.identity_leakage').status, 'manual_review')
  const single = clone(db)
  single.reviewPolicy = 'single_blind'
  assert.equal(get(run(GOOD_MD, { venue: single }), 'blind.identity_leakage').status, 'not_applicable')
  const clean = get(run(GOOD_MD.replace('Kontak: penulis@kampus.ac.id', ''), { venue: db }), 'blind.identity_leakage')
  assert.equal(clean.status, 'manual_review', 'tanpa sinyal tetap perlu tinjauan manual')
})

test('halaman: hanya ESTIMASI berlabel; tanpa batas venue -> not_applicable; batas terlampaui -> warn (bukan fail)', () => {
  assert.equal(get(run(GOOD_MD), 'length.page_estimate').status, 'not_applicable')
  const v = clone(venues['ieee-conference-generic'])
  v.format.pages = { max: 1 }
  const big = `${GOOD_MD}\n${'kata '.repeat(2000)}`
  const r = get(run(big, { venue: v }), 'length.page_estimate')
  assert.equal(r.status, 'warn')
  assert.match(r.detail, /ESTIMASI/)
  assert.equal(r.limitation, 'estimasi')
})

test('deklarasi wajib venue: hilang -> fail critical; ada -> pass dengan bukti; tanpa venue -> not_applicable', () => {
  const r = get(run(GOOD_MD, { venue: venues['scopus-generic'] }), 'declarations.required')
  assert.equal(r.status, 'fail')
  assert.equal(r.critical, true)
  assert.match(r.detail, /pernyataan etik/)
  const withDecl = `${GOOD_MD}\n## Declarations\nEthics approval obtained. Data availability: on request. Funding: grant 123. Conflict of interest: none.\n`
  const ok = get(runChecks({ source: withDecl, parse: parse(withDecl), references: REFS, venue: venues['scopus-generic'], now: NOW }), 'declarations.required')
  assert.equal(ok.status, 'pass')
  assert.ok(ok.evidence.length >= 4)
  assert.equal(get(run(GOOD_MD, { venue: null }), 'declarations.required').status, 'not_applicable')
})

test('ringkasan: hitungan status dan daftar critical failures', () => {
  const orphan = GOOD_MD.replace('Kontak:', 'Lihat \\cite{karangan2025x}. Kontak:')
  const s = summarizeChecks(run(orphan))
  assert.ok(s.criticalFailures.includes('citations.orphan'))
  assert.equal(s.thresholdsVersion, THRESHOLDS.version)
  assert.equal(Object.values(s.counts).reduce((a, b) => a + b, 0), run(orphan).length)
})

test('LaTeX: pemeriksaan jalan pada naskah LaTeX (struktur, sitasi \\cite)', () => {
  const tex = `\\documentclass{IEEEtran}\\begin{document}\\title{Judul Uji}\\begin{abstract}${'kata '.repeat(180)}\\end{abstract}\\begin{IEEEkeywords}a, b, c\\end{IEEEkeywords}\\section{Introduction}${PARA('Pendahuluan memuat sitasi \\cite{wulandari2021adaptive} dan \\cite{hantu2030z} yang dibuat.')}\\section{Conclusion}${PARA('Kesimpulan penelitian ini cukup panjang untuk dideteksi sebagai bagian.')}\\begin{thebibliography}{1}\\bibitem{a} X\\end{thebibliography}\\end{document}`
  const list = runChecks({ source: tex, parse: parse(tex, 'latex'), references: REFS, venue: venues['ieee-journal-generic'], now: NOW })
  assert.equal(get(list, 'citations.orphan').status, 'fail')
  assert.match(get(list, 'citations.orphan').detail, /hantu2030z/)
})
