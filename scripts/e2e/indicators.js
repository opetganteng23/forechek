// Uji HTTP Tahap 8 (indikator kemiripan teks dan gaya). Server: seperti uji Tahap 4 (LITERATURE_PROVIDERS=fixture ...).
// Indikator: opsional per proyek, tidak disimpan, tidak masuk laporan kesiapan/ekspor, tanpa vonis.
const { connectDb, makeUser, check, finish, ObjectId, Client } = require('./lib')
const { CORPUS } = require('../../packages/literature')
const { readZip } = require('../../packages/export')

const A1 = CORPUS.find((c) => c.doi && c.doi.includes('fx.2021.001'))
const OWN = 'Pengujian dilakukan pada tiga dataset berbeda dengan validasi silang lima lipatan yang dijelaskan secara rinci pada bagian metode penelitian ini. '.repeat(5)
const mdWith = (middle) => `# Naskah Indikator\n\n## Abstract\n${OWN}\n\n## Introduction\n${middle}\n\n${OWN}\n\n## References\n[1] A. Author, "Title," 2020.\n`

;(async () => {
  const { mc, db } = await connectDb()
  const A = await makeUser(db, 'inda')
  const B = await makeUser(db, 'indb')
  const anon = new Client()
  const pid = (await A.C.json('POST', '/api/projects', { title: 'Proyek Indikator' })).body.data.project._id
  const base = `/api/projects/${pid}`

  check('401 tanpa login', (await anon.json('POST', `${base}/indicators`, {})).status === 401)
  check('IDOR: B -> 404 untuk proyek A', (await B.C.json('POST', `${base}/indicators`, {})).status === 404)
  check('proyek baru: indikator MATI secara default', (await A.C.json('GET', base)).body.data.project.indicatorsEnabled !== true)
  const off = await A.C.json('POST', `${base}/indicators`, {})
  check('indikator mati -> 409 INDICATORS_DISABLED (tidak dihitung)', off.status === 409 && off.body.error.details?.code === 'INDICATORS_DISABLED', off.body)
  check('PATCH indicatorsEnabled bukan boolean -> 400', (await A.C.json('PATCH', base, { indicatorsEnabled: 'ya' })).status === 400)
  check('B tidak dapat mengaktifkan indikator di proyek A (404)', (await B.C.json('PATCH', base, { indicatorsEnabled: true })).status === 404)
  check('mengaktifkan indikator (PATCH) -> 200', (await A.C.json('PATCH', base, { indicatorsEnabled: true })).body.data.project.indicatorsEnabled === true)
  const nm = await A.C.json('POST', `${base}/indicators`, {})
  check('tanpa naskah -> 409 NO_MANUSCRIPT', nm.status === 409 && nm.body.error.details?.code === 'NO_MANUSCRIPT')

  // referensi terverifikasi dengan abstrak (korpus fixture)
  const add = await A.C.json('POST', `${base}/references/verify`, { doi: A1.doi, title: A1.title, authors: A1.authors.map((a) => `${a.given} ${a.family}`), year: A1.year, add: true })
  check('referensi terverifikasi ditambahkan', add.status === 201, add.body?.error)

  // naskah tanpa kemiripan
  await A.C.json('POST', `${base}/versions`, { baseRevision: 0, source: mdWith('Bagian ini ditulis sendiri dan tidak menyalin teks referensi mana pun secara literal.') })
  const none = await A.C.json('POST', `${base}/indicators`, {})
  const ns = none.body?.data?.indicators
  check('tanpa kecocokan: wording "Tidak ada kecocokan literal terhadap N abstrak referensi" (bukan 0%)', none.status === 200 && /^Tidak ada kecocokan literal terhadap \d+ abstrak referensi\.$/.test(ns.similarity.summaryText) && !/%/.test(ns.similarity.summaryText), ns && ns.similarity.summaryText)

  // naskah yang menyalin abstrak referensi secara literal (di luar kutipan)
  const rv = (await A.C.json('GET', base)).body.data.project.revision
  await A.C.json('POST', `${base}/versions`, { baseRevision: rv, source: mdWith(`Menurut penelitian terdahulu, ${A1.abstract} Demikian ringkasnya.`) })
  const hit = await A.C.json('POST', `${base}/indicators`, {})
  const hs = hit.body.data.indicators
  check('salinan literal abstrak terdeteksi dengan baris, jumlah kata, dan sumber', hs.similarity.passages.length >= 1 && hs.similarity.passages[0].matchedWith.id === add.body.data.added.citeKey && hs.similarity.passages[0].line > 1 && /^Ditemukan \d+ bagian/.test(hs.similarity.summaryText), hs.similarity)
  // kutipan langsung dikecualikan
  const rv2 = (await A.C.json('GET', base)).body.data.project.revision
  await A.C.json('POST', `${base}/versions`, { baseRevision: rv2, source: mdWith(`Penulis menyatakan: "${A1.abstract.slice(0, 200)}" lalu melanjutkan.`) })
  const q = (await A.C.json('POST', `${base}/indicators`, {})).body.data.indicators
  check('kutipan langsung dikecualikan dari kecocokan', q.similarity.passages.length === 0 && q.similarity.excludedWords > 0, q.similarity.summaryText)

  // tanpa vonis / skor / lencana
  const json = JSON.stringify(hit.body.data)
  check('keluaran tanpa kata vonis (plagiat/pasti/ditulis AI/terbukti) dan tanpa skor gabungan', !/plagiat|plagiarism|pasti|ditulis (oleh )?(AI|ai|mesin)|terbukti|"score"|"band"/i.test(json))
  check('gaya: hanya angka deskriptif (tanpa label tingkat)', !/tinggi|sedang|rendah|sentenceUniformity/.test(JSON.stringify(hs.style.signals || {})))
  check('indikator memuat keterbatasan', hs.similarity.limitations.length >= 3 && hs.style.limitations.length >= 3)

  // tidak disimpan, tidak masuk laporan kesiapan dan ekspor
  check('hasil tidak disimpan di database (tidak ada koleksi/dokumen indikator)', !(await db.listCollections().toArray()).some((c) => /indicator/i.test(c.name)))
  const rep = await A.C.json('POST', `${base}/report`, {})
  let done
  for (let i = 0; i < 80; i++) { done = await A.C.json('GET', `${base}/reports/${rep.body.data.report.id}`); if (done.body.data.report.status !== 'queued' && done.body.data.report.status !== 'running') break; await new Promise((r) => setTimeout(r, 250)) }
  check('laporan kesiapan TIDAK memuat indikator', done.body.data.report.status === 'completed' && !/kecocokan literal|sentenceLengthCv|summaryText|repeatedFourGram/i.test(JSON.stringify(done.body.data.report.result)))
  const zip = readZip(Buffer.from(await (await A.C.f(`${base}/export`)).arrayBuffer()))
  check('ekspor TIDAK memuat hasil indikator (ringkasan kecocokan, statistik gaya)', !/kecocokan literal|sentenceLengthCv|summaryText|repeatedFourGram|Statistik gaya/i.test(zip.map((f) => f.data.toString('utf8')).join('\n')))

  // mematikan kembali; hapus proyek tidak meninggalkan data indikator
  check('menonaktifkan indikator -> 200 lalu perhitungan ditolak lagi', (await A.C.json('PATCH', base, { indicatorsEnabled: false })).status === 200 && (await A.C.json('POST', `${base}/indicators`, {})).status === 409)
  const burst = []
  await A.C.json('PATCH', base, { indicatorsEnabled: true })
  for (let i = 0; i < 12; i++) burst.push((await A.C.json('POST', `${base}/indicators`, {})).status)
  check('dibatasi laju (429 setelah 10/menit)', burst.includes(429), burst)
  await mc.close()
  void ObjectId
  finish()
})().catch((e) => { console.error('FATAL', e); process.exit(1) })
