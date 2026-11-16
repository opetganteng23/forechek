// Uji HTTP trial: akun tanpa langganan hanya dapat membuat 1 paper (proyek) seumur akun; berlangganan aktif tidak dibatasi.
// Server dijalankan dengan env uji biasa (TRIAL_PAPER_LIMIT tidak diisi = 1).
const { connectDb, makeUser, check, finish, ObjectId, Client } = require('./lib')

;(async () => {
  const { mc, db } = await connectDb()
  const anon = new Client()
  check('401 tanpa login: status trial (GET /api/auth/me)', (await anon.json('GET', '/api/auth/me')).status === 401)

  const F = await makeUser(db, 'trialf', { trial: true })
  const me0 = (await F.C.json('GET', '/api/auth/me')).body.data.trial
  check('status awal: trial, batas 1, terpakai 0, sisa 1', me0.trial === true && me0.limit === 1 && me0.used === 0 && me0.remaining === 1, me0)
  const p1 = await F.C.json('POST', '/api/projects', { title: 'Paper trial saya' })
  check('paper pertama: 201', p1.status === 201, p1.body && p1.body.error)
  const p2 = await F.C.json('POST', '/api/projects', { title: 'Paper kedua' })
  check('paper kedua: 403 QUOTA_EXCEEDED dengan kode TRIAL_LIMIT dan pesan jelas', p2.status === 403 && p2.body.error.code === 'QUOTA_EXCEEDED' && p2.body.error.details.code === 'TRIAL_LIMIT' && /Akun trial hanya dapat membuat 1 paper/.test(p2.body.error.message), p2.body)
  check('tidak ada proyek kedua di database', (await db.collection('projects').countDocuments({ userId: F.id })) === 1)
  const me1 = (await F.C.json('GET', '/api/auth/me')).body.data.trial
  check('status sesudah pakai: sisa 0', me1.used === 1 && me1.remaining === 0, me1)

  const del = await F.C.json('DELETE', `/api/projects/${p1.body.data.project._id}`)
  check('hapus paper trial -> 200', del.status === 200)
  const p3 = await F.C.json('POST', '/api/projects', { title: 'Coba lagi setelah hapus' })
  check('setelah menghapus, tetap TIDAK boleh membuat lagi (jatah tidak kembali)', p3.status === 403 && p3.body.error.details.code === 'TRIAL_LIMIT', p3.status)

  const R = await makeUser(db, 'trialr', { trial: true })
  const rs = await Promise.all(Array.from({ length: 8 }, (_, i) => R.C.json('POST', '/api/projects', { title: `Paralel ${i}` })))
  check('8 pembuatan paralel: tepat satu 201, lainnya 403', rs.filter((r) => r.status === 201).length === 1 && rs.filter((r) => r.status === 403).length === 7, rs.map((r) => r.status))
  check('hanya satu proyek tersimpan', (await db.collection('projects').countDocuments({ userId: R.id })) === 1)

  const V = await makeUser(db, 'trialv', { trial: true })
  const inv = await V.C.json('POST', '/api/projects', { title: '' })
  check('judul kosong ditolak 400 SEBELUM klaim jatah; paper sah sesudahnya tetap 201', inv.status === 400 && (await V.C.json('POST', '/api/projects', { title: 'Sah' })).status === 201, inv.status)

  // berlangganan aktif: tidak dibatasi trial
  await db.collection('users').updateOne({ _id: F.id }, { $set: { 'subscription.plan': 'pro', 'subscription.isActive': true, 'subscription.endDate': new Date(Date.now() + 30 * 864e5) } })
  const up = await F.C.json('POST', '/api/projects', { title: 'Setelah berlangganan' })
  check('setelah berlangganan aktif: boleh membuat paper lagi', up.status === 201, up.status)
  const meP = (await F.C.json('GET', '/api/auth/me')).body.data.trial
  check('status berlangganan: bukan trial', meP.trial === false && meP.plan === 'pro', meP)
  await db.collection('users').updateOne({ _id: F.id }, { $set: { 'subscription.endDate': new Date(Date.now() - 864e5) } })
  const exp = await F.C.json('POST', '/api/projects', { title: 'Langganan kedaluwarsa' })
  check('langganan kedaluwarsa kembali dibatasi trial (jatah sudah terpakai)', exp.status === 403 && exp.body.error.details.code === 'TRIAL_LIMIT', exp.status)

  // akun lama tanpa field penghitung dianggap 0
  const L = await makeUser(db, 'triall', { trial: true })
  await db.collection('users').updateOne({ _id: L.id }, { $unset: { trialPapersCreated: '' } })
  check('akun tanpa field penghitung (data lama): paper pertama 201', (await L.C.json('POST', '/api/projects', { title: 'Akun lama' })).status === 201)
  check('IDOR: status trial hanya milik sendiri (me tidak menerima id lain)', (await L.C.json('GET', `/api/auth/me?id=${F.id}`)).body.data.id === String(L.id))
  void ObjectId
  await mc.close()
  finish()
})().catch((e) => { console.error('FATAL', e); process.exit(1) })
