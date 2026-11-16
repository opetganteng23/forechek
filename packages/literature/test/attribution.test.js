'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { sanitizeCitations, MARK_UNVERIFIED } = require('../index')

// F-02 (gerbang sitasi): atribusi naratif harus dipetakan ke referensi terverifikasi proyek; selain itu diganti penanda.
const REFS = [
  { citeKey: 'wulandari2021adaptive', title: 'Adaptive Sparse Attention', year: 2021, authors: [{ family: 'Wulandari' }, { family: 'Mei' }], doi: '10.99999/a', verification: { status: 'verified' } },
  { citeKey: 'santoso2020graph', title: 'Graph Networks', year: 2020, authors: [{ family: 'Santoso' }], doi: '10.99999/g', verification: { status: 'verified' } }
]

// Setiap kalimat memuat nama KARANGAN (Ghost/Smith/Fiction/Zhang/...) yang tidak ada di REFS: harus ditandai.
const FABRICATED = [
  ['ID narasi + tahun kurung', 'Smith (2020) melaporkan bahwa hasilnya baik.'],
  ['ID dkk. + tahun (tanpa kurung)', 'Menurut Smith dkk. 2020, metode ini efektif.'],
  ['ID dkk. + tahun kurung', 'Menurut Smith dkk. (2020), metode ini efektif.'],
  ['ID dua penulis dan', 'Smith dan Jones (2020) menunjukkan peningkatan.'],
  ['EN et al. + koma + tahun', 'Sebagaimana dilaporkan oleh Smith et al., 2020, hasilnya stabil.'],
  ['EN dua penulis ampersand', 'Smith & Jones, 2020 menemukan pola yang sama.'],
  ['EN et al. kurung', 'Smith et al. (2020) reported that accuracy improved.'],
  ['EN et al. tanpa kurung', 'Smith et al. 2020 reported that accuracy improved.'],
  ['EN tiga penulis kurung', 'As Smith, Jones, and Lee (2020) show, the effect holds.'],
  ['EN according to + tahun', 'According to Smith (2020), the effect holds.'],
  ['EN per + nama + tahun', 'Per Ghost 2021, the effect holds.'],
  ['Nama + [tahun]', 'Ghost [2021] showed a clear effect.'],
  ['kurung multi-penulis', 'Efeknya konsisten (Smith, 2020; Jones & Lee, 2019).'],
  ['numerik bertitik spasi', 'Seperti ditunjukkan dalam [ 7 ] dan analisis lanjutan.'],
  ['numerik bersufiks huruf', 'Hasil serupa dilaporkan pada [7a] sebelumnya.'],
  ['nama + tahun + kata kerja (tanpa tanda)', 'Zhang 2022 melaporkan peningkatan akurasi yang signifikan.'],
  ['tanpa tahun: menurut + nama', 'Menurut Fiction, hasilnya sangat baik.'],
  ['tanpa tahun: according to + nama', 'According to Fiction, the result is robust.'],
  ['tanpa tahun: dilaporkan oleh + nama dkk.', 'Hal ini dilaporkan oleh Fiction dkk. pada eksperimen lain.'],
  ['footnote LaTeX', 'Teks.\\footnote{Ghost 2021, hlm. 5.}'],
  ['EN tanpa tahun: as noted by', 'As noted by Fiction and Ghost, the effect is small.']
]

for (const [name, text] of FABRICATED) {
  test(`F-02 palsu ditandai: ${name}`, () => {
    const r = sanitizeCitations(text, REFS)
    assert.ok(r.changed && r.text.includes(MARK_UNVERIFIED), `lolos tanpa penanda: ${r.text}`)
    assert.ok(!/Smith|Ghost|Fiction|Zhang|Jones|Lee/.test(r.text), `nama karangan masih tampil: ${r.text}`)
  })
}

// Atribusi yang SAH (memetakan ke referensi terverifikasi) tidak boleh diubah.
const VALID = [
  'Wulandari dan Mei (2021) melaporkan peningkatan.',
  'Wulandari et al. (2021) reported an improvement.',
  'Menurut Wulandari dkk. 2021, metode ini efektif.',
  'Efeknya konsisten (Wulandari & Mei, 2021).',
  'Menurut Wulandari, hasilnya baik.',
  'According to Santoso, the graph is sparse.',
  'Santoso (2020) shows that the graph is sparse.',
  'Santoso 2020 melaporkan graf yang jarang.',
  'Seperti dilaporkan oleh Wulandari dkk. dalam studi mereka.'
]
for (const text of VALID) {
  test(`F-02 sah tidak diubah: ${text.slice(0, 50)}`, () => {
    const r = sanitizeCitations(text, REFS)
    assert.equal(r.text, text, `diubah: ${r.text} | ${JSON.stringify(r.flags)}`)
  })
}

// Kalimat biasa (tanpa atribusi) tidak boleh ditandai.
const BENIGN = [
  'Pada Januari 2020 kami mengumpulkan data dari tiga sensor.',
  'Piala Dunia 2022 diselenggarakan di Qatar.',
  'Eksperimen dijalankan pada tahun 2021 selama enam bulan.',
  'Model ini dilatih dengan 10 juta parameter pada Tabel 2 dan Gambar 3.',
  'Menurut pemerintah, program ini berjalan baik.',
  'According to the table, the value is 5.',
  'Hasil terbaik diperoleh pada iterasi ke-2021.'
]
for (const text of BENIGN) {
  test(`F-02 kalimat biasa tidak ditandai: ${text.slice(0, 50)}`, () => {
    const r = sanitizeCitations(text, REFS)
    assert.equal(r.text, text, `ditandai salah: ${r.text}`)
  })
}

// Stream: atribusi naratif tidak boleh bocor lewat batas potongan (chunk) berapa pun.
test('F-02 stream: atribusi naratif karangan tidak pernah tampil untuk berbagai ukuran potongan', () => {
  const { createStreamSanitizer } = require('../index')
  const text = 'Hasil awal. Menurut Fiction, hasilnya baik. Smith et al. 2020 reported gains. Per Ghost 2021, ok. Zhang 2022 melaporkan hal sama. Ghost [2021] juga. Selesai.'
  for (const n of [1, 2, 3, 5, 9, 17, 200]) {
    const g = createStreamSanitizer(REFS)
    let shown = ''
    for (let i = 0; i < text.length; i += n) shown += g.push(text.slice(i, i + n))
    assert.ok(!/Fiction|Smith|Ghost|Zhang/.test(shown), `n=${n}: ${shown}`)
    assert.ok(shown.includes('Hasil awal.') && shown.length > 100, `n=${n}: aliran terhenti: ${shown}`) // kalimat terakhir tanpa penutup dikirim oleh teks final (sanitasi penuh)
  }
})
