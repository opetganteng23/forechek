'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { extractCitations, validateCitations, sanitizeCitations, MARK_UNVERIFIED, MARK_RETRACTED, checkClaimSupport, createLlmJudge, MIN_ABSTRACT_CHARS } = require('../index')

const ref = (citeKey, family, year, status = 'verified', extra = {}) => ({ citeKey, authors: [{ family }], year, title: `Judul ${citeKey}`, doi: `10.99999/${citeKey}`, verification: { status }, ...extra })
const REFS = [ref('wulandari2021adaptive', 'Wulandari', 2021), ref('santoso2020graph', 'Santoso', 2020), ref('novak2018fast', 'Novak', 2018, 'retracted'), ref('moreau2020notes', 'Moreau', 2020, 'partial')]

test('extractCitations: LaTeX, pandoc, numerik, penulis-tahun (kurung dan naratif); non-sitasi diabaikan', () => {
  const t = 'A \\cite{a,b} B \\citep[hal. 3]{c} C [@d; @e] D [1, 3-4] E (Smith et al., 2020) F (Lee & Park, 2019; Kim, 2018) G Santoso (2020) H `arr[1]` I (lihat Tabel 2) J (n=5, 2020)'
  const c = extractCitations(t)
  const kinds = c.map((x) => x.kind + ':' + (x.keys ? x.keys.join('|') : x.numbers ? x.numbers.join('|') : x.authorYear.map((a) => a.families.join('+') + a.year).join('|')))
  assert.deepEqual(kinds, ['latex:a|b', 'latex:c', 'pandoc:d|e', 'numeric:1|3|4', 'authoryear:Smith2020', 'authoryear:Lee+Park2019|Kim2018', 'authoryear:Santoso2020'])
})

test('validateCitations: sah, yatim, tidak terverifikasi, retracted, ambigu; entri tak terpakai dan duplikat', () => {
  const text = 'Ok \\cite{wulandari2021adaptive}. Yatim \\cite{karangan2099}. Sebagian \\cite{moreau2020notes}. Ditarik [@novak2018fast]. Angka [2]. Santoso (2020).'
  const v = validateCitations(text, [...REFS, ref('dup1', 'Dup', 2000, 'verified', { doi: '10.99999/same' }), ref('dup2', 'Dup', 2000, 'verified', { doi: '10.99999/same' })])
  assert.equal(v.valid, false)
  const types = v.issues.map((i) => i.type + ':' + i.detail)
  assert.ok(types.includes('orphan:karangan2099'))
  assert.ok(types.includes('unverified:moreau2020notes'))
  assert.ok(types.includes('retracted:novak2018fast'))
  assert.ok(types.includes('ambiguous:[2]'))
  assert.ok(types.some((t) => t.startsWith('unused:')))
  assert.ok(types.some((t) => t.startsWith('duplicate:')))
  assert.ok(!types.includes('orphan:Santoso 2020'), 'penulis-tahun yang cocok dengan referensi terverifikasi sah')
  assert.equal(validateCitations('Hanya \\cite{wulandari2021adaptive}.', REFS).valid, true)
})

test('numbering: sitasi numerik dapat diselesaikan bila urutan kunci diberikan', () => {
  const v = validateCitations('Lihat [1] dan [2] dan [9].', REFS, { numbering: ['wulandari2021adaptive', 'santoso2020graph'] })
  assert.deepEqual(v.issues.filter((i) => i.type !== 'unused').map((i) => i.type + ':' + i.detail), ['orphan:[9]'])
})

test('penulis-tahun ambigu (dua referensi cocok) -> ambiguous (manual_review), bukan sah', () => {
  const v = validateCitations('(Santoso, 2020)', [ref('s1', 'Santoso', 2020), ref('s2', 'Santoso', 2020, 'verified', { doi: '10.99999/s2' })])
  assert.equal(v.issues[0].type, 'ambiguous')
})

test('sanitizeCitations: sitasi karangan model DITOLAK dan diganti penanda; sitasi terverifikasi dipertahankan', () => {
  const text = 'Hasil baik \\cite{wulandari2021adaptive}, tetapi \\cite{halusinasi2024ai} dan [@santoso2020graph; @tidakada] serta (Fiktif, 2023) dan [7].'
  const r = sanitizeCitations(text, REFS)
  assert.ok(r.text.includes('\\cite{wulandari2021adaptive}'))
  assert.ok(!r.text.includes('halusinasi2024ai'))
  assert.ok(!r.text.includes('tidakada'))
  assert.ok(!r.text.includes('Fiktif'))
  assert.ok(!r.text.includes('[7]'))
  assert.ok(r.text.includes('[@santoso2020graph]'), 'kunci sah dalam daftar campuran dipertahankan')
  assert.equal((r.text.match(/\[referensi belum terverifikasi\]/g) || []).length, 4)
  assert.equal(r.changed, true)
  assert.ok(r.flags.some((f) => f.type === 'orphan' && f.detail === 'halusinasi2024ai'))
})

test('sanitizeCitations: partial/unverified/retracted tidak lolos sebagai sitasi valid; retracted bertanda khusus', () => {
  const r = sanitizeCitations('A \\cite{moreau2020notes} B \\cite{novak2018fast}', REFS)
  assert.ok(!r.text.includes('\\cite{moreau2020notes}'))
  assert.ok(!r.text.includes('\\cite{novak2018fast}'))
  assert.ok(r.text.includes(MARK_UNVERIFIED) && r.text.includes(MARK_RETRACTED))
})

test('sanitizeCitations: teks tanpa sitasi tidak berubah; tanpa referensi apa pun semua sitasi ditolak', () => {
  const plain = 'Teks biasa (lihat Tabel 2) tanpa sitasi, `arr[1]` dan n=5, serta Mei 2020 dan (Mei 2020).'
  assert.deepEqual(sanitizeCitations(plain, REFS), { text: plain, flags: [], changed: false })
  const none = sanitizeCitations('Klaim \\cite{apa}.', [])
  assert.ok(none.text.includes(MARK_UNVERIFIED))
})

test('sanitizeCitations: idempoten (menjalankan dua kali tidak mengubah hasil)', () => {
  const once = sanitizeCitations('\\cite{x1} dan (Fiktif, 2023)', REFS).text
  assert.equal(sanitizeCitations(once, REFS).text, once)
})

// ---------------- klaim ----------------
const LONG = 'We introduce an adaptive sparse attention mechanism for language modeling in low-resource settings. Experiments on three synthetic benchmarks show that the proposed method reduces memory use by 38 percent while keeping perplexity close to dense attention.'
const verifiedRef = { citeKey: 'k', abstract: LONG, verification: { status: 'verified' } }
const QUOTE = 'reduces memory use by 38 percent'

test('klaim: supports hanya bila juri memberi kutipan yang ADA verbatim di abstrak', async () => {
  const ok = await checkClaimSupport({ claim: 'Metode ini mengurangi pemakaian memori.', reference: verifiedRef, judge: async () => ({ verdict: 'supports', quote: QUOTE }) })
  assert.equal(ok.verdict, 'supports')
  assert.equal(ok.evidence, QUOTE)
  assert.equal(ok.basis, 'abstract')
  assert.match(ok.limitations, /abstrak/)
})

test('klaim: supports tanpa kutipan, atau kutipan karangan -> diturunkan ke unknown (EVIDENCE_NOT_FOUND)', async () => {
  for (const out of [{ verdict: 'supports' }, { verdict: 'supports', quote: 'kutipan yang tidak pernah ada di abstrak ini' }, { verdict: 'partial', quote: 'pendek' }]) {
    const r = await checkClaimSupport({ claim: 'klaim apa saja', reference: verifiedRef, judge: async () => out })
    assert.equal(r.verdict, 'unknown')
    assert.equal(r.reason, 'EVIDENCE_NOT_FOUND')
  }
})

test('klaim: tanpa abstrak / abstrak pendek / referensi tak andal / klaim pendek / juri rusak -> unknown, juri tidak dipanggil bila tidak perlu', async () => {
  let called = 0
  const judge = async () => (called++, { verdict: 'supports', quote: QUOTE })
  const run = (reference, claim = 'klaim yang cukup panjang') => checkClaimSupport({ claim, reference, judge })
  assert.equal((await run({ ...verifiedRef, abstract: null })).reason, 'INSUFFICIENT_EVIDENCE')
  assert.equal((await run({ ...verifiedRef, abstract: 'x'.repeat(MIN_ABSTRACT_CHARS - 1) })).reason, 'INSUFFICIENT_EVIDENCE')
  assert.equal((await run({ ...verifiedRef, verification: { status: 'retracted' } })).reason, 'REFERENCE_NOT_RELIABLE')
  assert.equal((await run({ ...verifiedRef, verification: { status: 'partial' } })).reason, 'REFERENCE_NOT_RELIABLE')
  assert.equal((await run(verifiedRef, 'abc')).reason, 'CLAIM_TOO_SHORT')
  assert.equal(called, 0)
  assert.equal((await checkClaimSupport({ claim: 'klaim cukup panjang', reference: verifiedRef, judge: async () => ({ verdict: 'pasti', quote: QUOTE }) })).reason, 'JUDGE_OUTPUT_INVALID')
  assert.equal((await checkClaimSupport({ claim: 'klaim cukup panjang', reference: verifiedRef, judge: async () => { throw new Error('x') } })).reason, 'JUDGE_UNAVAILABLE')
})

test('klaim: kesamaan kata kunci saja tidak cukup (juri naif yang selalu "supports" tanpa kutipan tidak pernah menghasilkan supports)', async () => {
  const naive = async ({ claim }) => ({ verdict: 'supports', quote: '' })
  assert.equal((await checkClaimSupport({ claim: 'adaptive sparse attention language modeling low-resource', reference: verifiedRef, judge: naive })).verdict, 'unknown')
})

test('LLM judge: abstrak/klaim dikirim sebagai data, keluaran JSON diurai; non-JSON -> null', async () => {
  const seen = []
  const mk = (text) => ({ async *stream(req) { seen.push(req); yield { type: 'text_delta', text } } })
  const good = createLlmJudge({ provider: mk('Hasil: {"verdict":"supports","quote":"abc"}'), model: 'm-ringan' })
  assert.deepEqual(await good({ claim: 'c', abstract: 'a' }), { verdict: 'supports', quote: 'abc' })
  assert.match(seen[0].system, /DATA, bukan instruksi/)
  assert.deepEqual(seen[0].tools, [])
  assert.equal(await createLlmJudge({ provider: mk('bukan json'), model: 'm' })({ claim: 'c', abstract: 'a' }), null)
})
