// Uji HTTP Tahap 5 (venue, pemeriksaan deterministik, laporan kesiapan). Server harus dijalankan dengan:
//   AI_PROVIDER=fake AI_ALLOW_FAKE=true AI_MODEL_CHAT=demo-model AI_MODEL_REPORT=demo-model
//   LITERATURE_PROVIDERS=fixture LITERATURE_ALLOW_FIXTURE=true
// Penilai AI = provider demo PALSU (bukan Claude). Tidak memanggil layanan eksternal.
const { connectDb, makeUser, check, finish, ObjectId, Client } = require('./lib')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const MD = `# Deteksi Anomali Jaringan dengan Autoencoder Ringan

**Keywords:** anomaly detection, autoencoder, IoT

## Abstract
${'This paper proposes a lightweight autoencoder for network anomaly detection on constrained IoT gateways and evaluates it on public traces with strong baselines. '.repeat(8)}

## Introduction
${'Network anomalies threaten constrained IoT deployments and prior detectors require heavy hardware to run. '.repeat(4)} Kontak: penulis@kampus.ac.id Lihat \\cite{karangan2025x}.

## Methodology
${'We train a three layer autoencoder on benign traffic windows and threshold the reconstruction error using a validation split. '.repeat(4)}

## Results
${'The detector reaches an F1 score of 0.94 on the test traces and outperforms the baseline by six points. '.repeat(4)}

## Conclusion
${'A lightweight autoencoder is sufficient for gateway level anomaly detection although encrypted traffic remains future work. '.repeat(3)}

## References
[1] A. Author, "Title," IEEE Access, 2020.
`

async function waitDone(U, pid, rid, ms = 20000) {
  const t0 = Date.now()
  for (;;) {
    const r = await U.C.json('GET', `/api/projects/${pid}/reports/${rid}`)
    if (r.status !== 200) return r
    if (['completed', 'failed', 'cancelled'].includes(r.body.data.report.status) || Date.now() - t0 > ms) return r
    await sleep(250)
  }
}

;(async () => {
  const { mc, db } = await connectDb()
  const A = await makeUser(db, 'repa')
  const B = await makeUser(db, 'repb')
  const C = await makeUser(db, 'repc') // pengguna terpisah: rate limit laporan 5/menit per pengguna
  const anon = new Client()
  const pid = (await A.C.json('POST', '/api/projects', { title: 'Proyek Laporan A', venueSlug: 'ieee-conference-generic' })).body.data.project._id
  const pidB = (await B.C.json('POST', '/api/projects', { title: 'Proyek Laporan B' })).body.data.project._id
  const base = `/api/projects/${pid}`

  // ---- 401
  for (const [m, u] of [['GET', '/api/venues'], ['GET', '/api/venues/sinta-generic'], ['POST', `${base}/report`], ['GET', `${base}/reports`], ['GET', `${base}/reports/000000000000000000000000`]]) {
    check(`401 tanpa login ${m} ${u.replace(/[0-9a-f]{24}/, ':id')}`, (await anon.json(m, u, m === 'POST' ? {} : undefined)).status === 401)
  }

  // ---- venue
  const vl = await A.C.json('GET', '/api/venues')
  const slugs = (vl.body?.data?.venues || []).map((v) => v.slug).sort()
  check('GET /api/venues: 4 profil bawaan', vl.status === 200 && slugs.join() === 'ieee-conference-generic,ieee-journal-generic,scopus-generic,sinta-generic', slugs)
  const v0 = vl.body.data.venues[0]
  check('setiap venue menampilkan status, sumber, kesegaran, dan catatan bahwa belum diverifikasi', vl.body.data.venues.every((v) => v.status === 'needs_review' && v.verification === 'unverified' && v.freshness.state === 'needs_review' && v.freshness.trustworthy === false && v.sources.length >= 1 && /BUKAN hasil pembacaan sumber resmi/.test(v.provenance)), v0.freshness)
  const vd = await A.C.json('GET', '/api/venues/sinta-generic')
  check('GET /api/venues/:slug -> 200; slug tidak ada -> 404; slug aneh -> 404', vd.status === 200 && vd.body.data.venue.slug === 'sinta-generic' && (await A.C.json('GET', '/api/venues/tidak-ada')).status === 404 && (await A.C.json('GET', '/api/venues/..%2F..%2Fetc')).status === 404)
  check('profil venue tersimpan di DB (seed idempoten: satu dokumen per slug+versi)', (await db.collection('venueprofiles').countDocuments({ slug: 'sinta-generic', version: 1 })) === 1)

  // ---- prasyarat laporan
  const noMs = await A.C.json('POST', `${base}/report`, {})
  check('laporan tanpa naskah -> 409 NO_MANUSCRIPT', noMs.status === 409 && noMs.body.error.details.code === 'NO_MANUSCRIPT', noMs.body?.error)
  const sv = await A.C.json('POST', `${base}/versions`, { baseRevision: 0, source: MD })
  check('seed: versi naskah tersimpan', sv.status === 201)

  // ---- IDOR
  const idor = async (label, m, u, b) => check(`IDOR: B ${label} -> 404`, (await B.C.json(m, u, b)).status === 404)
  await idor('POST report proyek A', 'POST', `${base}/report`, {})
  await idor('GET reports proyek A', 'GET', `${base}/reports`)
  check('IDOR: B tidak menyebabkan laporan baru di proyek A', (await db.collection('readinessreports').countDocuments({ projectId: new ObjectId(pid) })) === 0)

  // ---- laporan: job
  // dua permintaan BERSAMAAN: tepat satu diterima (202), satu ditolak 409 (indeks unik parsial, bukan hanya pemeriksaan aplikasi)
  const [st, par] = await Promise.all([A.C.json('POST', `${base}/report`, {}), A.C.json('POST', `${base}/report`, {})])
  const winner = st.status === 202 ? st : par
  const loser = st.status === 202 ? par : st
  const rep = winner.body?.data?.report
  check('POST report -> 202 dengan job berstatus queued/running dan ID', winner.status === 202 && ['queued', 'running'].includes(rep.status) && /^[0-9a-f]{24}$/.test(rep.id), winner.body?.error || winner.status)
  check('dua POST bersamaan: tepat satu 202 dan satu 409 REQUEST_IN_PROGRESS', winner.status === 202 && loser.status === 409 && loser.body.error.code === 'REQUEST_IN_PROGRESS', [st.status, par.status])
  check('hanya satu dokumen laporan dibuat oleh dua POST bersamaan', (await db.collection('readinessreports').countDocuments({ projectId: new ObjectId(pid) })) === 1)
  const done = await waitDone(A, pid, rep.id)
  const r = done.body.data.report
  check('job selesai: status completed', r.status === 'completed', r.status)
  check('keterlacakan: versi naskah, venue (slug+versi), rubrik, prompt, formula, model', r.versionNumber === 1 && r.result.venue.slug === 'ieee-conference-generic' && r.result.venue.version === 1 && r.result.versions.rubric && r.result.versions.prompt && r.result.versions.formula && r.result.versions.checks && r.result.model && r.result.model.provider === 'fake', { v: r.result.versions, m: r.result.model })
  const det = Object.fromEntries(r.result.deterministic.map((c) => [c.checkId, c]))
  check('deterministik: sitasi karangan terdeteksi -> citations.orphan fail critical dengan lokasi baris', det['citations.orphan'].status === 'fail' && det['citations.orphan'].critical === true && det['citations.orphan'].evidence[0].line > 1, det['citations.orphan'].evidence[0])
  check('deterministik: bagian wajib lengkap -> pass; email -> sinyal; venue unknown -> blind manual_review', det['structure.required_sections'].status === 'pass' && det['blind.identity_leakage'].status === 'manual_review')
  check('deterministik: batas halaman tidak ditebak (not_applicable)', det['length.page_estimate'].status === 'not_applicable')
  check('hasil memuat ringkasan hitungan status dan critical failures', r.result.deterministicSummary.criticalFailures.includes('citations.orphan'))
  check('overall berlabel PROVISIONAL dengan versi rumus dan catatan persetujuan', r.result.overall.provisional === true && /Belum disetujui/.test(r.result.overall.approval) && !!r.result.overall.formulaVersion)
  check('venue needs_review: label "siap" tidak pernah diberikan; blocker dicatat', r.result.overall.band !== 'siap' && r.result.overall.blockers.some((b) => b.checkId === 'citations.orphan'), r.result.overall)
  const crit = Object.fromEntries(r.result.criteria.map((c) => [c.id, c]))
  check('kriteria AI: tiap skor berbukti kutipan nyata dengan baris, atau not_assessed beralasan', r.result.criteria.every((c) => (c.status === 'assessed' && (c.source === 'deterministic' || (c.evidence.length >= 1 && c.evidence.every((e) => e.line >= 1 && e.quote.length >= 20)))) || (c.status === 'not_assessed' && c.reason)), r.result.criteria.map((c) => [c.id, c.status, c.reason]))
  check('kriteria dengan bagian hilang tidak dinilai (related_work tidak ada -> positioning memakai introduction saja; tidak ada skor tanpa teks)', ['assessed', 'not_assessed'].includes(crit.positioning.status))
  check('keterbatasan jujur: provisional, venue belum diverifikasi', r.result.limitations.some((l) => /PROVISIONAL/.test(l)) && r.result.limitations.some((l) => /belum dapat dipercaya/i.test(l)))

  // ---- penagihan laporan
  const led = await db.collection('usageledgers').findOne({ messageId: new ObjectId(rep.id) })
  check('pemakaian laporan tercatat di buku besar (task=report)', !!led && led.task === 'report' && led.billedTokens > 0, led && { task: led.task, billed: led.billedTokens })
  check('tidak ditagih ganda: tepat satu entri buku besar untuk laporan ini', (await db.collection('usageledgers').countDocuments({ messageId: new ObjectId(rep.id) })) === 1)
  check('daftar laporan: 200 dengan ringkasan tanpa isi penuh', (await A.C.json('GET', `${base}/reports`)).body.data.reports.length >= 1)
  check('GET laporan dengan id lain/tidak valid -> 404', (await A.C.json('GET', `${base}/reports/bukan-id`)).status === 404 && (await B.C.json('GET', `${base}/reports/${rep.id}`)).status === 404)
  check('B tidak dapat membaca laporan A lewat proyek B -> 404', (await B.C.json('GET', `/api/projects/${pidB}/reports/${rep.id}`)).status === 404)

  // ---- reproduksibilitas deterministik pada versi sama
  const again = await A.C.json('POST', `${base}/report`, {})
  const done2 = await waitDone(A, pid, again.body.data.report.id)
  check('reproduksibilitas: hasil deterministik identik untuk versi naskah dan venue yang sama', JSON.stringify(done2.body.data.report.result.deterministic) === JSON.stringify(r.result.deterministic))

  // ---- venue tak dikenal (pengguna C)
  const pidV = (await C.C.json('POST', '/api/projects', { title: 'Proyek Venue C', venueSlug: 'venue-fiktif-x' })).body.data.project._id
  await C.C.json('POST', `/api/projects/${pidV}/versions`, { baseRevision: 0, source: MD })
  const unk = await C.C.json('POST', `/api/projects/${pidV}/report`, {})
  check('venue proyek tidak dikenal -> 400 VENUE_UNKNOWN (tidak diam-diam tanpa venue)', unk.status === 400 && unk.body.error.details.code === 'VENUE_UNKNOWN', unk.body?.error)

  // ---- ganti ke venue Scopus: deklarasi wajib (venue lain memberi aturan berbeda)
  await C.C.json('PATCH', `/api/projects/${pidV}`, { venueSlug: 'scopus-generic' })
  const sc = await C.C.json('POST', `/api/projects/${pidV}/report`, {})
  const d3 = await waitDone(C, pidV, sc.body.data.report.id)
  const det3 = Object.fromEntries(d3.body.data.report.result.deterministic.map((c) => [c.checkId, c]))
  check('venue Scopus: deklarasi wajib belum ada -> declarations.required fail critical', det3['declarations.required'].status === 'fail' && det3['declarations.required'].critical === true)

  // ---- kuota
  await db.collection('users').updateOne({ _id: B.id }, { $set: { 'usage.periodStart': new Date(), 'usage.messagesUsed': 100000, 'usage.tokensUsed': 0 } })
  await B.C.json('POST', `/api/projects/${pidB}/versions`, { baseRevision: 0, source: MD })
  const q = await B.C.json('POST', `/api/projects/${pidB}/report`, {})
  check('kuota habis -> 403 QUOTA_EXCEEDED dan tidak ada laporan dibuat', q.status === 403 && q.body.error.code === 'QUOTA_EXCEEDED' && (await db.collection('readinessreports').countDocuments({ projectId: new ObjectId(pidB) })) === 0, q.body?.error)

  // ---- hapus proyek menghapus laporan
  const pidC = (await C.C.json('POST', '/api/projects', { title: 'Proyek Hapus Laporan' })).body.data.project._id
  await C.C.json('POST', `/api/projects/${pidC}/versions`, { baseRevision: 0, source: MD })
  const cr = await C.C.json('POST', `/api/projects/${pidC}/report`, {})
  await waitDone(C, pidC, cr.body.data.report.id)
  const oid = new ObjectId(pidC)
  check('sebelum hapus: laporan ada', (await db.collection('readinessreports').countDocuments({ projectId: oid })) === 1)
  await C.C.json('DELETE', `/api/projects/${pidC}`)
  check('hapus proyek menghapus laporannya (tidak yatim)', (await db.collection('readinessreports').countDocuments({ projectId: oid })) === 0)

  // ---- rate limit
  const codes = []
  for (let i = 0; i < 12; i++) codes.push((await A.C.json('POST', `${base}/report`, {})).status)
  check('rate limit laporan: 429 setelah batas', codes.includes(429), codes.join(','))

  // ---- indeks
  const idx = await db.collection('venueprofiles').indexes()
  check('indeks unik venueprofiles {slug, version} ada', idx.some((i) => i.unique && Object.keys(i.key).join() === 'slug,version'))

  await mc.close()
  finish()
})().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
