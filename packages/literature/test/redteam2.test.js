'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { sanitizeCitations, MARK_UNVERIFIED: MU, createStreamSanitizer, MAX_INPUT_CHARS } = require('../index')

const ref = (citeKey, family, year, extra = {}) => ({ citeKey, authors: [{ family }], year, title: `Judul panjang ${citeKey} untuk uji`, doi: `10.99999/${citeKey}`, verification: { status: 'verified' }, ...extra })
const NONE = []
const SMITH = [ref('smith2020a', 'Smith', 2020, { authors: [{ family: 'Smith' }, { family: 'Jones' }], doi: '10.99999/a' })]

// Putaran 2 (QC): bentuk yang masih lolos. Semuanya HARUS ditolak. Bila dua kemunculan perlu diuji, ditulis sebagai teks utuh.
const MUST_BLOCK_NONE = [
  // nama depan/inisial
  '(John Fake, 2020)', '(J. Fake, 2020)', '(Fake, J., 2020)', '(Fake J, 2020)', '(Fake, J. A., 2020)', '(Dr. Fake, 2020)', 'Fake, J. (2020) menyatakan', 'Fake, Doe, and Lee, 2020',
  // penekanan markdown
  '**Fake** (2020)', '_Fake_ (2020)', '**Fake et al.** (2020)', '*Fake* et al., 2020', '[Fake](#) (2020)',
  // koma tanpa kurung, footnote
  'Fake, 2020', 'FAKE, 2020', '\\footnote{Fake, 2020.}', 'Fake, J. 2020',
  // bibliografi karangan tanpa penanda di teks
  'Fake, J. A. (2020). Title of work. Journal of Things, 12(3), 45-67.',
  '1. Fake J, Doe A. Title. J Med. 2020;12:3-5.',
  'J. Fake and A. Doe, "Title," IEEE Trans., vol. 1, 2020.',
  '\\bibitem{fake} Fake J. Title. 2020.', '\\bibliography{fake}',
  '@article{fake2020, author={Fake, J.}, year={2020}, title={X}}',
  // pengenal non-DOI
  'arXiv:2101.00001', 'https://arxiv.org/abs/2101.00001', 'ISBN 978-3-16-148410-0', 'PMID: 12345678', 'PMCID: PMC1234567',
  'https://pubmed.ncbi.nlm.nih.gov/123456/', 'DOI: 10 .1234/fake', '10.1234 / fake',
  // varian lain
  '(Fake, 2020, Table 3)', '(Fake et. al., 2020)', '(Fake and others, 2020)', '(compare Fake, 2020)', '(as cited in Fake, 2020)', '(for a review see Fake, 2020)',
  '(Lihat: Fake, 2020)', '(Fake, 2020/21)', '(Fake, 2020–21)', '(山田, 2020)', '(ibid.)', 'Ibid., p. 5', '&#40;Fake, 2020&#41;', '(Fake,&nbsp;2020)',
  '<sup>1</sup>', 'Fake^1', '(Fake, ٢٠٢٠)'
]

test('RED-TEAM 2: bentuk sitasi/bibliografi karangan yang sebelumnya lolos kini ditolak', () => {
  const leaks = []
  for (const b of MUST_BLOCK_NONE) {
    const r = sanitizeCitations(`Klaim:\n${b}\n\nPenutup.`, NONE)
    if (!r.changed || !r.text.includes(MU)) leaks.push([b, r.text])
  }
  assert.deepEqual(leaks, [], `lolos: ${JSON.stringify(leaks)}`)
})

test('RED-TEAM 2: sitasi terpotong di akhir teks (batas token/pembatalan) ditolak', () => {
  for (const t of ['Teks (Fake, 2020', 'Teks [Fake, 2020', 'Teks (Fake et al., 20']) assert.ok(sanitizeCitations(t, NONE).text.includes(MU), t)
})

test('RED-TEAM 2: satu referensi sah tidak mencuci sitasi karangan di dalam kurung/siku yang sama', () => {
  const mixed = [
    '[@smith2020a, Fake 2020]', '[@smith2020a; Fake, 2020]', '[see @smith2020a, Fake 2021]', '\\cite[Fake, 2020]{smith2020a}',
    '(Smith, 2020, Fake, 2020)', '(Smith, 2020; Fake)', '(Smith, 2020 & Fake, 2020)', '(Smith 2020, Fake 2020)', '(Smith, 2020; Fake, 2019; and Doe, 2018)'
  ]
  const leaks = mixed.filter((m) => !/Fake|Doe/.test(sanitizeCitations(`x ${m} y`, SMITH).text.replace(/\[referensi belum terverifikasi\]/g, '')) === false)
  assert.deepEqual(leaks, [], `lolos: ${JSON.stringify(leaks)}`)
  // sitasi sah tetap lolos
  for (const ok of ['(Smith and Jones, 2020)', '\\cite{smith2020a}', '[@smith2020a, p. 3]', '**Smith** (2020)', 'Smith J (2020)']) assert.equal(sanitizeCitations(`x ${ok} y`, SMITH).changed, false, `harus lolos: ${ok}`)
})

test('RED-TEAM 2: teks tautan DOI tidak boleh membawa detail palsu untuk referensi nyata', () => {
  for (const b of ['[Fake et al. (2020)](https://doi.org/10.99999/a)', '[Fake, 2020](https://doi.org/10.99999/a)']) assert.equal(sanitizeCitations(`Lihat ${b}.`, SMITH).changed, true, b)
  assert.equal(sanitizeCitations('Lihat [makalah ini](https://doi.org/10.99999/a).', SMITH).changed, false)
})

test('RED-TEAM 2: daftar pustaka yang memuat referensi TERVERIFIKASI proyek lolos; yang karangan ditolak per baris', () => {
  const refs = [ref('wulandari2021adaptive', 'Wulandari', 2021, { title: 'Adaptive Sparse Attention for Low-Resource Language Modeling', doi: '10.99999/fx.2021.001' })]
  const txt = '## Daftar Pustaka\n\n1. Wulandari, R. (2021). Adaptive Sparse Attention for Low-Resource Language Modeling. doi:10.99999/fx.2021.001\n2. Fake, J. A. (2020). Karangan sepenuhnya. Jurnal Hantu, 1(2), 3-4.\n'
  const r = sanitizeCitations(txt, refs)
  assert.ok(r.text.includes('Adaptive Sparse Attention'))
  assert.ok(!r.text.includes('Karangan sepenuhnya'))
  assert.ok(r.text.includes(MU))
})

test('akurasi tidak rusak: prosa biasa tanpa sitasi tetap lolos', () => {
  const prose = ['Pada (Mei 2020) kami mulai.', 'Sejak Windows 2000 kami memakai.', 'Lihat Tabel 3 dan `arr[1]` serta n=5.', 'Hasil F1 sebesar 0,94 pada data uji.', 'Kami memakai 3 lapisan (encoder, decoder, dan head).']
  for (const p of prose) assert.equal(sanitizeCitations(p, NONE).changed, false, p)
})

// ---- ReDoS: input adversarial 20 KB tidak boleh memblokir event loop ----
test('ReDoS: input adversarial 20 KB selesai cepat (batas 2 detik) dan input melebihi batas ditolak gagal-tertutup', () => {
  const inputs = { kurung: '['.repeat(20000), latexKurung: '\\cite['.repeat(3000), nama: 'Aaaa, '.repeat(3300), partikel: 'van '.repeat(5000), dan: 'Aaaa and '.repeat(2200), paren: '('.repeat(20000), tahun: 'Fake 2020, '.repeat(1800), bib: '1. Fake J. A. (2020). x\n'.repeat(900) }
  const slow = []
  for (const [k, v] of Object.entries(inputs)) {
    const t0 = Date.now()
    sanitizeCitations(v, NONE)
    const ms = Date.now() - t0
    if (ms > 2000) slow.push([k, ms])
  }
  assert.deepEqual(slow, [], `lambat: ${JSON.stringify(slow)}`)
  assert.throws(() => sanitizeCitations('a'.repeat(MAX_INPUT_CHARS + 1), NONE), /TEXT_TOO_LONG/)
})

// ---- penyaring stream ----
const chunks = (s, n) => s.match(new RegExp(`[\\s\\S]{1,${n}}`, 'g'))
const runStream = (text, n, refs = NONE) => {
  const g = createStreamSanitizer(refs)
  return chunks(text, n).map((c) => g.push(c)).join('')
}

test('stream: untuk berbagai ukuran potongan, teks yang tampil tidak pernah memuat sitasi karangan', () => {
  const text = 'Menurut \\cite{karangan2025x} dan (Fake, 2020) serta **Karang** (2021) hasilnya baik. Lihat doi:10.1234/fake. Selesai semua di sini.'
  for (const n of [1, 2, 3, 7, 20, 200]) {
    const shown = runStream(text, n)
    assert.ok(!/karangan2025x|Fake, 2020|10\.1234\/fake/.test(shown), `n=${n}: ${shown}`)
  }
})

test('stream: tidak macet setelah satu penggantian (teks sesudahnya tetap mengalir) dan linear untuk jawaban panjang', () => {
  const text = 'Kalimat awal. Lihat (Fake, 2020). ' + 'Ini kalimat biasa yang panjang dan aman. '.repeat(400)
  const t0 = Date.now()
  const shown = runStream(text, 5)
  assert.ok(Date.now() - t0 < 2000, 'harus linear')
  assert.ok(shown.includes('Ini kalimat biasa yang panjang dan aman.'), 'teks setelah penggantian tetap tampil')
  assert.ok(shown.length > text.length * 0.9)
  assert.ok(!shown.includes('Fake, 2020'))
})

test('stream: kurung terbuka tak pernah tertutup dipaksa keluar tersanitasi setelah ambang (tidak macet selamanya)', () => {
  const text = 'Ini :( ' + 'kata biasa '.repeat(200)
  const shown = runStream(text, 10)
  assert.ok(shown.length > 400, `hanya ${shown.length} karakter tampil`)
})

test('stream: aliran melebihi batas ukuran berhenti mengeluarkan teks (final tetap dari sanitasi penuh)', () => {
  const g = createStreamSanitizer(NONE, { maxTotal: 100 })
  let shown = ''
  for (let i = 0; i < 50; i++) shown += g.push('kata biasa. ')
  assert.ok(shown.length <= 120)
})
