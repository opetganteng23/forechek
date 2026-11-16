'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { similarityIndicator, styleIndicator, buildIndicators, FORBIDDEN, SIM_CONSTANTS } = require('../index')

const ABS = 'We propose a lightweight autoencoder for network anomaly detection on constrained IoT gateways and evaluate it on public traces with strong baselines.'
const CORPUS = [{ id: 'wulandari2021', label: 'wulandari2021 (2021)', title: 'Adaptive Sparse Attention', text: ABS }]
const OWN = 'Pengujian dilakukan pada tiga dataset berbeda dengan validasi silang lima lipatan yang dijelaskan secara rinci pada bagian metode penelitian ini. '.repeat(4)

test('kemiripan: kecocokan literal dilaporkan dengan baris, jumlah kata, dan sumber korpus', () => {
  const text = `# Judul\n\n${OWN}\n\nPenulis menulis bahwa ${ABS} Selanjutnya hasil kami berbeda.\n\n${OWN}`
  const r = similarityIndicator({ text, corpus: CORPUS })
  assert.equal(r.status, 'ok')
  assert.ok(r.passages.length >= 1)
  const p = r.passages[0]
  assert.ok(p.words >= SIM_CONSTANTS.MIN_PASSAGE_WORDS)
  assert.equal(p.matchedWith.id, 'wulandari2021')
  assert.ok(text.split('\n')[p.line - 1].includes('lightweight autoencoder'))
  assert.ok(r.coveragePercent > 0 && r.coveragePercent < 50)
  assert.match(r.scope.corpus, /abstrak referensi/)
})

test('kemiripan: kutipan langsung, blockquote, kode, dan daftar pustaka dikecualikan', () => {
  const quoted = `${OWN}\n\nMenurut mereka: "${ABS}" demikian.\n\n> ${ABS}\n\n${OWN}`
  const r = similarityIndicator({ text: quoted, corpus: CORPUS })
  assert.equal(r.passages.length, 0)
  assert.ok(r.excludedWords > 0)
  const inRefs = similarityIndicator({ text: `${OWN}\n\n## References\n${ABS}\n`, corpus: CORPUS, referencesStart: `${OWN}\n\n`.length })
  assert.equal(inRefs.passages.length, 0)
})

test('kemiripan: tanpa korpus / teks pendek -> status jujur, tanpa angka', () => {
  assert.equal(similarityIndicator({ text: OWN, corpus: [] }).status, 'no_corpus')
  assert.equal(similarityIndicator({ text: 'terlalu pendek', corpus: CORPUS }).status, 'text_too_short')
  assert.equal(similarityIndicator({ text: 'terlalu pendek', corpus: [] }).coveragePercent, null)
})

test('kemiripan: paraphrase TIDAK terdeteksi (batasan dinyatakan) dan hasil deterministik', () => {
  const para = `${OWN}\n\nKami mengajukan autoencoder ringan untuk mendeteksi anomali jaringan pada gateway IoT terbatas lalu mengujinya pada jejak publik dengan pembanding kuat.\n\n${OWN}`
  const r = similarityIndicator({ text: para, corpus: CORPUS })
  assert.equal(r.passages.length, 0)
  assert.ok(r.limitations.some((l) => /parafrase/.test(l)))
  assert.deepEqual(similarityIndicator({ text: para, corpus: CORPUS }), r)
})

test('kemiripan: masukan besar/adversarial selesai cepat', () => {
  const big = 'kata '.repeat(100000)
  const t = Date.now()
  similarityIndicator({ text: big, corpus: CORPUS })
  assert.ok(Date.now() - t < 3000, `${Date.now() - t}ms`)
})

test('gaya: teks pendek -> tidak ada angka; teks seragam vs bervariasi memberi sinyal deskriptif tanpa vonis', () => {
  assert.equal(styleIndicator({ text: 'pendek sekali.' }).signals, null)
  const uniform = 'Metode ini bekerja dengan baik pada data uji kami. '.repeat(60)
  const u = styleIndicator({ text: uniform })
  assert.equal(u.status, 'ok')
  assert.ok(u.signals.sentenceLengthCv < 0.05, 'kalimat seragam: CV mendekati 0')
  assert.ok(u.signals.repeatedFourGramRatio > 0.5)
  assert.deepEqual(Object.keys(u.signals).sort(), ['repeatedFourGramRatio', 'sentenceLengthCv', 'sentenceLengthMean', 'typeTokenRatio'], 'hanya angka deskriptif; tanpa label tingkat/lencana/skor gabungan')
  assert.equal(u.thresholds, undefined)
  assert.equal(u.score, undefined)
  const varied = [
    'Pendek sekali.', 'Namun, ketika kami memperluas eksperimen ke tiga dataset berbeda dengan karakteristik trafik yang jauh lebih beragam, hasilnya berubah secara tidak terduga dan memerlukan analisis lanjutan yang panjang.',
    'Mengapa?', 'Karena distribusi fitur bergeser.', 'Kami menelusuri penyebabnya melalui ablasi sistematis terhadap setiap komponen model dan melaporkan seluruh variasi yang ditemukan beserta batasannya.', 'Hasil akhirnya stabil.'
  ].join(' ').repeat(12)
  const v = styleIndicator({ text: varied })
  assert.ok(v.signals.sentenceLengthCv > u.signals.sentenceLengthCv + 0.3, 'teks bervariasi memiliki CV jauh lebih besar')
})

test('P4: keluaran tidak pernah memuat kata vonis (plagiat/pasti/ditulis AI/terbukti) dan selalu memuat keterbatasan', () => {
  const text = `${OWN}\n\nPenulis menulis bahwa ${ABS}\n\n${'Metode ini bekerja dengan baik pada data uji kami. '.repeat(60)}`
  const out = buildIndicators({ source: text, parse: { sections: [] }, references: [{ citeKey: 'wulandari2021', title: 'T', year: 2021, abstract: ABS }] })
  const json = JSON.stringify(out)
  assert.ok(!FORBIDDEN.test(json), json.match(FORBIDDEN))
  assert.ok(out.similarity.limitations.length >= 3 && out.style.limitations.length >= 3)
  assert.match(out.notice, /bukan penilaian/)
  for (const bad of ['plagiarisme', 'pasti ditulis AI', 'bukti plagiat', 'terbukti', 'bebas plagiat']) assert.ok(FORBIDDEN.test(bad), bad)
})

test('buildIndicators: bagian References dikecualikan; referensi tanpa abstrak tidak menjadi korpus', () => {
  const src = `# T\n\n## Intro\n${OWN}\n\n## References\n${ABS}\n`
  const parse = { sections: [{ key: 'references', start: src.indexOf('## References') }] }
  const out = buildIndicators({ source: src, parse, references: [{ citeKey: 'a', title: 'T', abstract: ABS }, { citeKey: 'b', title: 'T2', abstract: null }] })
  assert.equal(out.similarity.scope.documents, 1)
  assert.equal(out.similarity.passages.length, 0)
})

test('T8-01: tokenisasi linear - 33 ribu kutipan dalam ~0,9 MB selesai < 300 ms', () => {
  const text = '"kutipan pendek ini" kata '.repeat(33000) // ~0,9 MB, puluhan ribu rentang kutipan
  assert.ok(text.length > 800000)
  // Batas 300 ms ditegakkan pada waktu TERBAIK dari 3 percobaan: beban CPU dari proses lain (tes paralel/server) tidak boleh membuat
  // uji linearitas rapuh, tetapi implementasi kuadratik (>= detik) tetap gagal pada ketiga percobaan.
  const times = []
  let r
  for (let i = 0; i < 3; i++) {
    const t = Date.now()
    r = similarityIndicator({ text, corpus: CORPUS })
    times.push(Date.now() - t)
  }
  assert.ok(Math.min(...times) < 300, `${times.join(', ')} ms`)
  assert.ok(r.excludedWords > 0)
})

test('wording: tanpa kecocokan -> "Tidak ada kecocokan literal terhadap N abstrak referensi" (bukan 0%); dengan kecocokan -> angka deskriptif', () => {
  const none = similarityIndicator({ text: OWN.repeat(2), corpus: CORPUS })
  assert.equal(none.summaryText, 'Tidak ada kecocokan literal terhadap 1 abstrak referensi.')
  assert.ok(!/\d\s*%|0,0|0\.0/.test(none.summaryText), 'tanpa angka persen')
  const some = similarityIndicator({ text: `${OWN}

Penulis menulis bahwa ${ABS} Selesai.

${OWN}`, corpus: CORPUS })
  assert.match(some.summaryText, /^Ditemukan \d+ bagian \(\d+ kata\) yang cocok literal dengan abstrak referensi, dari \d+ kata yang diperiksa\.$/)
  assert.equal(similarityIndicator({ text: OWN, corpus: [] }).summaryText, 'Belum ada abstrak referensi untuk dibandingkan.')
  assert.equal(similarityIndicator({ text: 'pendek', corpus: CORPUS }).summaryText, 'Teks terlalu pendek untuk diperiksa.')
})

test('buildIndicators tidak memuat skor gabungan, label tingkat, atau bidang yang dapat masuk skor kesiapan', () => {
  const out = buildIndicators({ source: OWN.repeat(5), parse: { sections: [] }, references: [] })
  assert.deepEqual(Object.keys(out).sort(), ['generatedAt', 'notice', 'similarity', 'style'])
  assert.ok(!('score' in out) && !('band' in out) && !('overall' in out))
})
