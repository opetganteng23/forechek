// Uji HTTP Tahap 4 (referensi + literatur + integritas sitasi). Server harus dijalankan dengan:
//   AI_PROVIDER=fake AI_ALLOW_FAKE=true AI_MODEL_CHAT=demo-model LITERATURE_PROVIDERS=fixture LITERATURE_ALLOW_FIXTURE=true
// Korpus fixture sintetis (DOI fiktif 10.99999/...). Tidak memanggil layanan eksternal.
const { connectDb, makeUser, check, finish, ObjectId, Client } = require('./lib')

let crid = 0
const newCrid = () => `ref-${Date.now()}-${++crid}`
const parseSse = (text) => text.split('\n\n').filter(Boolean).map((b) => ({ type: (/^event: (.*)$/m.exec(b) || [])[1], ...JSON.parse((/^data: (.*)$/m.exec(b) || [])[1] || '{}') }))
async function chat(U, pid, content) {
  const res = await U.C.f(`/api/projects/${pid}/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientRequestId: newCrid(), content }) })
  const raw = await res.text()
  return (res.headers.get('content-type') || '').includes('event-stream') ? { status: res.status, events: parseSse(raw) } : { status: res.status, body: JSON.parse(raw) }
}

;(async () => {
  const { mc, db } = await connectDb()
  const A = await makeUser(db, 'refa')
  const B = await makeUser(db, 'refb')
  const anon = new Client()
  const pid = (await A.C.json('POST', '/api/projects', { title: 'Proyek Ref A' })).body.data.project._id
  const pidB = (await B.C.json('POST', '/api/projects', { title: 'Proyek Ref B' })).body.data.project._id
  const base = `/api/projects/${pid}`
  const A1 = '10.99999/fx.2021.001'
  const A1_FULL = { doi: A1, title: 'Adaptive Sparse Attention for Low-Resource Language Modeling', authors: ['Ratna Wulandari', 'Chen Mei'], year: 2021 }

  // ---- 401
  for (const [m, u] of [['GET', '/references'], ['POST', '/references'], ['POST', '/references/verify'], ['POST', '/literature/search'], ['PATCH', '/references/000000000000000000000000'], ['DELETE', '/references/000000000000000000000000'], ['POST', '/references/000000000000000000000000/reverify']]) {
    check(`401 tanpa login ${m} ${u}`, (await anon.json(m, base + u, m === 'GET' || m === 'DELETE' ? undefined : {})).status === 401)
  }

  // ---- validasi pencarian
  const s = (body) => A.C.json('POST', `${base}/literature/search`, body)
  check('validasi: query terlalu pendek -> 400', (await s({ query: 'ab' })).status === 400)
  check('validasi: query objek (NoSQLi) -> 400', (await s({ query: { $ne: '' } })).status === 400)
  check('validasi: limit 100 -> 400', (await s({ query: 'adaptive', limit: 100 })).status === 400)
  check('validasi: yearFrom string -> 400', (await s({ query: 'adaptive', yearFrom: '2020' })).status === 400)
  check('validasi: language panjang -> 400', (await s({ query: 'adaptive', language: 'indonesia' })).status === 400)
  const broken = await A.C.f(`${base}/literature/search`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{rusak' })
  check('JSON rusak -> 400', broken.status === 400)

  // ---- pencarian
  const sr = await s({ query: 'adaptive sparse attention language', limit: 5 })
  check('search: 200 envelope, kandidat berID, provider + waktu + keterbatasan', sr.status === 200 && sr.body.data.candidates.length > 0 && sr.body.data.candidates.every((c) => c.candidateId) && sr.body.data.providers[0].name === 'fixture' && sr.body.data.limitations.length >= 3 && !!sr.body.data.fetchedAt, sr.body?.data?.providers)
  const cand = sr.body.data.candidates.find((c) => c.doi === A1)
  check('search: kandidat DOI-A1 ditemukan', !!cand)
  check('search: semua kandidat menyebut provider asal', sr.body.data.candidates.every((c) => Array.isArray(c.providers) && c.providers.length))

  // ---- IDOR
  const idor = async (label, m, u, body, want = 404) => check(`IDOR: B ${label} -> ${want}`, (await B.C.json(m, `${base}${u}`, body)).status === want)
  await idor('GET references proyek A', 'GET', '/references')
  await idor('search di proyek A', 'POST', '/literature/search', { query: 'adaptive sparse' })
  await idor('add kandidat milik A ke proyek A', 'POST', '/references', { candidateId: cand.candidateId })
  await idor('verify manual di proyek A', 'POST', '/references/verify', { doi: A1 })
  const bAdd = await B.C.json('POST', `/api/projects/${pidB}/references`, { candidateId: cand.candidateId })
  check('IDOR: B tidak dapat memakai kandidat milik A di proyek B sendiri -> 404', bAdd.status === 404, bAdd.status)

  // ---- tambah dari kandidat
  const add = await A.C.json('POST', `${base}/references`, { candidateId: cand.candidateId })
  const ref = add.body?.data?.reference
  check('add kandidat verified -> 201 + status verified + provider + waktu', add.status === 201 && ref.verification.status === 'verified' && ref.provider === 'fixture' && !!ref.verification.checkedAt, add.body?.error)
  check('citeKey dibentuk dan unik (penulis+tahun+kata judul)', ref.citeKey === 'wulandari2021adaptive', ref.citeKey)
  const dup = await A.C.json('POST', `${base}/references`, { candidateId: cand.candidateId })
  check('duplikat -> 409 REFERENCE_DUPLICATE', dup.status === 409 && dup.body.error.details.code === 'REFERENCE_DUPLICATE')
  check('candidateId bukan teks -> 400', (await A.C.json('POST', `${base}/references`, { candidateId: { $ne: 1 } })).status === 400)
  check('candidateId asing -> 404', (await A.C.json('POST', `${base}/references`, { candidateId: '000000000000000000000000' })).status === 404)

  const noDoi = (await s({ query: 'reproducibility machine learning pipelines' })).body.data.candidates.find((c) => !c.doi)
  const rNo = await A.C.json('POST', `${base}/references`, { candidateId: noDoi.candidateId })
  check('kandidat tanpa DOI tidak dapat ditambahkan lewat kandidat -> 409 REFERENCE_NOT_VERIFIED', rNo.status === 409 && rNo.body.error.details.code === 'REFERENCE_NOT_VERIFIED', rNo.body?.error?.details)
  const retr = (await s({ query: 'training giant models gradients' })).body.data.candidates.find((c) => c.doi === '10.99999/fx.2018.077')
  const rRet = await A.C.json('POST', `${base}/references`, { candidateId: retr.candidateId })
  check('kandidat retracted ditolak dan statusnya dilaporkan', rRet.status === 409 && rRet.body.error.details.status === 'retracted', rRet.body?.error?.details)

  // ---- verifikasi manual
  const v = (body) => A.C.json('POST', `${base}/references/verify`, body)
  check('manual: data cocok -> verified (tidak disimpan)', (await v(A1_FULL)).body.data.verification.status === 'verified')
  check('manual: DOI palsu -> unverified DOI_NOT_FOUND', (await v({ doi: '10.99999/fx.9999.999', title: 'Karangan Model', authors: ['Fiktif Nama'], year: 2022 })).body.data.verification.notes[0] === 'DOI_NOT_FOUND')
  check('manual: judul tidak cocok dengan DOI -> unverified TITLE_MISMATCH', (await v({ ...A1_FULL, title: 'Resep Memasak Kuantum untuk Dapur Terdistribusi' })).body.data.verification.notes.includes('TITLE_MISMATCH'))
  check('manual: penulis salah -> partial + mismatch first_author', (await v({ ...A1_FULL, authors: ['Orang Lain'] })).body.data.verification.mismatches.includes('first_author'))
  check('manual: kosong / DOI buruk / tahun buruk -> 400', (await v({})).status === 400 && (await v({ doi: 'x' })).status === 400 && (await v({ title: 'T', year: 3000 })).status === 400)
  check('manual: add bukan boolean -> 400', (await v({ ...A1_FULL, add: 'ya' })).status === 400)
  const listBefore = (await A.C.json('GET', `${base}/references`)).body.data.references.length
  const saved = await v({ doi: '10.99999/fx.9999.999', title: 'Makalah Karangan Pengguna', authors: ['Fiktif Nama'], year: 2022, add: true })
  check('manual add: DOI palsu tersimpan sebagai unverified (bukan verified), sumber user_provided', saved.status === 201 && saved.body.data.added.verification.status === 'unverified' && saved.body.data.added.source === 'user_provided', saved.body?.data?.added?.verification)
  check('daftar bertambah tepat 1', (await A.C.json('GET', `${base}/references`)).body.data.references.length === listBefore + 1)
  const unverKey = saved.body.data.added.citeKey

  // ---- edit + reverify
  const pat = (id, body) => A.C.json('PATCH', `${base}/references/${id}`, body)
  const ed = await pat(ref.id, { year: 2015 })
  check('PATCH metadata -> status turun ke unverified + riwayat', ed.status === 200 && ed.body.data.reference.verification.status === 'unverified' && ed.body.data.reference.statusHistory.length === 2, ed.body?.data?.reference?.verification)
  const re1 = await A.C.json('POST', `${base}/references/${ref.id}/reverify`)
  check('reverify dengan tahun salah -> partial (tidak kembali verified)', re1.body.data.reference.verification.status === 'partial')
  await pat(ref.id, { year: 2021 })
  const re2 = await A.C.json('POST', `${base}/references/${ref.id}/reverify`)
  check('reverify setelah perbaikan -> verified', re2.body.data.reference.verification.status === 'verified')
  const mass = await pat(ref.id, { verification: { status: 'verified' }, citeKey: 'diretas', userId: '000000000000000000000001' })
  check('mass assignment: hanya verification/citeKey/userId -> 400 (tidak ada field yang dapat diubah)', mass.status === 400)
  const mass2 = await pat(ref.id, { title: 'Adaptive Sparse Attention for Low-Resource Language Modeling', verification: { status: 'verified' }, citeKey: 'diretas' })
  const dbRef = await db.collection('references').findOne({ _id: new ObjectId(ref.id) })
  check('mass assignment: verification/citeKey dari body diabaikan; status turun ke unverified', mass2.status === 200 && dbRef.verification.status === 'unverified' && dbRef.citeKey === 'wulandari2021adaptive', dbRef.verification.status)
  await A.C.json('POST', `${base}/references/${ref.id}/reverify`)
  check('PATCH doi tidak valid -> 400', (await pat(ref.id, { doi: 'bukan-doi' })).status === 400)
  check('PATCH tahun teks -> 400', (await pat(ref.id, { year: 'abc' })).status === 400)

  // ---- IDOR lanjutan pada referensi
  for (const [label, m, u, b] of [['PATCH', 'PATCH', `/references/${ref.id}`, { year: 2000 }], ['DELETE', 'DELETE', `/references/${ref.id}`], ['reverify', 'POST', `/references/${ref.id}/reverify`]]) {
    check(`IDOR: B ${label} referensi A -> 404`, (await B.C.json(m, `${base}${u}`, b)).status === 404)
  }
  check('IDOR: B lewat proyek B dengan id referensi A -> 404', (await B.C.json('DELETE', `/api/projects/${pidB}/references/${ref.id}`)).status === 404)
  check('refId tidak valid -> 404', (await A.C.json('DELETE', `${base}/references/bukan-id`)).status === 404)

  // ---- integritas sitasi di chat (kontrol inti)
  const real = 'wulandari2021adaptive'
  const c1 = await chat(A, pid, `[[say:Menurut \\cite{${real}} dan \\cite{halusinasi2024ai} serta (Fiktif, 2023) dan [7] hasilnya baik.]]`)
  const done1 = c1.events.at(-1)
  check('chat: sitasi referensi terverifikasi dipertahankan', done1.text.includes(`\\cite{${real}}`), done1.text)
  check('chat: sitasi karangan model DITOLAK (tidak ada di keluaran)', !done1.text.includes('halusinasi2024ai') && !done1.text.includes('Fiktif, 2023') && !done1.text.includes('[7]'), done1.text)
  check('chat: diganti penanda "[referensi belum terverifikasi]" 3 kali', (done1.text.match(/\[referensi belum terverifikasi\]/g) || []).length === 3)
  check('chat: flags dikirim di message_complete (orphan)', (done1.flags || []).some((f) => f.type === 'orphan' && f.detail === 'halusinasi2024ai'))
  const c1Stored = await db.collection('messages').findOne({ projectId: new ObjectId(pid), role: 'assistant', clientRequestId: { $exists: true }, text: { $regex: 'Menurut' } })
  check('chat: pesan tersimpan sudah bersih dan menyimpan flags', c1Stored && !c1Stored.text.includes('halusinasi2024ai') && c1Stored.flags.length >= 3, c1Stored && c1Stored.flags)
  const hist = (await A.C.json('GET', `${base}/messages`)).body.data.messages
  check('chat: riwayat API: pesan ASISTEN tidak pernah memuat sitasi karangan', hist.filter((m) => m.role === 'assistant').every((m) => !m.text.includes('halusinasi2024ai')))
  const c2 = await chat(A, pid, `[[say:Dukungan: [@${unverKey}] dan \\cite{${unverKey}}]]`)
  check('chat: sitasi ke referensi unverified (manual) juga tidak lolos', !c2.events.at(-1).text.includes(unverKey) && c2.events.at(-1).flags.some((f) => f.type === 'unverified'), c2.events.at(-1).text)
  const c3 = await chat(A, pid, 'Halo tanpa sitasi (lihat Tabel 2) dan `arr[1]` dalam kode.')
  check('chat: teks tanpa sitasi tidak diubah', c3.events.at(-1).flags.length === 0 && c3.events.at(-1).text.includes('(lihat Tabel 2)'))

  // ---- tool literatur lewat chat
  const t1 = await chat(A, pid, '[[tool:search_literature {"query":"graph neural networks traffic forecasting"}]]')
  check('chat tool: search_literature berhasil (ok=true)', t1.events.find((e) => e.type === 'tool_result' && e.name === 'search_literature')?.ok === true)
  const t2 = await chat(A, pid, `[[tool:search_literature {"query":"adaptive sparse","projectId":"${pidB}"}]]`)
  check('chat tool: parameter projectId dari model ditolak (ok=false)', t2.events.find((e) => e.type === 'tool_result')?.ok === false)
  const bCand = (await B.C.json('POST', `/api/projects/${pidB}/literature/search`, { query: 'kernel methods large synthetic graphs' })).body.data.candidates[0]
  const t3 = await chat(A, pid, `[[tool:add_reference {"candidateId":"${bCand.candidateId}"}]]`)
  check('chat tool: add_reference dengan kandidat milik B ditolak (ok=false)', t3.events.find((e) => e.type === 'tool_result')?.ok === false)
  const kCand = (await s({ query: 'kernel methods large synthetic graphs' })).body.data.candidates.find((c) => c.doi)
  const t4 = await chat(A, pid, `[[tool:add_reference {"candidateId":"${kCand.candidateId}"}]]`)
  check('chat tool: add_reference kandidat milik sendiri berhasil', t4.events.find((e) => e.type === 'tool_result')?.ok === true)
  const list = (await A.C.json('GET', `${base}/references`)).body.data.references
  check('referensi dari tool chat muncul di daftar dengan status verified', list.some((r) => r.doi === kCand.doi && r.verification.status === 'verified'))
  const t5 = await chat(A, pid, `[[tool:check_claim_support {"claim":"Metode ini mengurangi memori sebesar 38 persen","citeKey":"${real}"}]]`)
  check('chat tool: check_claim_support berjalan; tanpa juri AI nyata hasilnya unknown (bukan supports)', t5.events.find((e) => e.type === 'tool_result')?.ok === true && /unknown/.test(t5.events.at(-1).text) && !/"verdict":"supports"/.test(t5.events.at(-1).text), t5.events.at(-1).text.slice(0, 200))

  // ---- hapus + indeks + rate limit
  const del = await A.C.json('DELETE', `${base}/references/${ref.id}`)
  check('DELETE referensi -> 200 dan hilang dari daftar', del.status === 200 && !(await A.C.json('GET', `${base}/references`)).body.data.references.some((r) => r.id === ref.id))
  // hapus proyek -> tidak ada data yatim (pesan, referensi, kandidat, jejak AI)
  const pidC = (await A.C.json('POST', '/api/projects', { title: 'Proyek Hapus Cascade' })).body.data.project._id
  const cc = (await A.C.json('POST', `/api/projects/${pidC}/literature/search`, { query: 'adaptive sparse attention language' })).body.data.candidates.find((c) => c.doi)
  await A.C.json('POST', `/api/projects/${pidC}/references`, { candidateId: cc.candidateId })
  await chat(A, pidC, 'pesan untuk dihapus')
  const oid = new ObjectId(pidC)
  const counts = async () => ({ messages: await db.collection('messages').countDocuments({ projectId: oid }), references: await db.collection('references').countDocuments({ projectId: oid }), candidates: await db.collection('referencecandidates').countDocuments({ projectId: oid }), logs: await db.collection('aiusagelogs').countDocuments({ projectId: oid }) })
  const before = await counts()
  check('sebelum hapus proyek: data terkait ada', before.messages >= 2 && before.references === 1 && before.candidates >= 1 && before.logs >= 1, before)
  check('B tidak dapat menghapus proyek C milik A (404) dan data tetap ada', (await B.C.json('DELETE', `/api/projects/${pidC}`)).status === 404 && (await counts()).references === 1)
  check('hapus proyek -> 200', (await A.C.json('DELETE', `/api/projects/${pidC}`)).status === 200)
  const after = await counts()
  check('hapus proyek menghapus pesan, referensi, kandidat, jejak AI (tidak yatim)', after.messages === 0 && after.references === 0 && after.candidates === 0 && after.logs === 0, after)
  const idx = await db.collection('references').indexes()
  check('indeks unik {projectId, citeKey} ada', idx.some((i) => i.unique && Object.keys(i.key).join() === 'projectId,citeKey'))
  const cidx = await db.collection('referencecandidates').indexes()
  check('indeks TTL kandidat (24 jam) ada', cidx.some((i) => i.expireAfterSeconds === 86400))
  const codes = []
  for (let i = 0; i < 25; i++) codes.push((await s({ query: 'adaptive sparse attention' })).status)
  check('rate limit pencarian: 429 setelah batas 20/menit', codes.includes(429), codes.join(','))

  await mc.close()
  finish()
})().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
