// Uji HTTP superadmin: hierarki peran, pengaturan harga/kuota/trial, edit pengguna (CRUD), filter pengguna, pemantauan paper semua pengguna.
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { ObjectId } = require('mongodb')
const { connectDb, makeUser, check, finish, MONGO, Client } = require('./lib')

;(async () => {
  const { mc, db } = await connectDb()
  const anon = new Client()
  const pw = 'SuperUji#123456'
  const sEmail = `sup${Date.now()}@e2e.test`
  const seed = spawnSync(process.execPath, [path.join(__dirname, '..', 'seedAdmin.js'), '--superadmin'], { encoding: 'utf8', env: { ...process.env, MONGODB_URI: MONGO, ADMIN_EMAIL: sEmail, ADMIN_PASSWORD: pw, ADMIN_NAME: 'Super Uji' } })
  check('seed --superadmin membuat akun superadmin', seed.status === 0 && /Superadmin dibuat/.test(seed.stdout) && (await db.collection('users').findOne({ email: sEmail })).role === 'superadmin')
  const S = new Client(); await S.login(sEmail, pw)
  await db.collection('settings').deleteOne({ _id: 'plans' }) // basis bersih: default konfigurasi

  // peran admin biasa (dibuat oleh superadmin) dan pengguna biasa
  const adEmail = `adm${Date.now()}@e2e.test`
  const crAd = await S.json('POST', '/api/admin/users', { name: 'Admin Biasa', email: adEmail, password: pw, role: 'admin' })
  check('superadmin dapat membuat akun admin (201, peran admin)', crAd.status === 201 && crAd.body.data.user.role === 'admin', crAd.body)
  const AD = new Client(); await AD.login(adEmail, pw)
  const U = await makeUser(db, 'sau', { trial: true })

  // ---- pengaturan paket: akses
  const pub0 = await anon.json('GET', '/api/plans')
  check('GET /api/plans publik 200: harga berbayar belum ditetapkan (null), kuota dari konfigurasi', pub0.status === 200 && pub0.body.data.plans.pro.priceMonthlyIdr === null && pub0.body.data.plans.pro.tokensPerMonth > 0 && !JSON.stringify(pub0.body).includes('updatedBy'), pub0.body && pub0.body.data && pub0.body.data.plans && pub0.body.data.plans.pro)
  check('GET /api/admin/plans: 401 anonim, 403 pengguna, 403 admin biasa, 200 superadmin', (await anon.json('GET', '/api/admin/plans')).status === 401 && (await U.C.json('GET', '/api/admin/plans')).status === 403 && (await AD.json('GET', '/api/admin/plans')).status === 403 && (await S.json('GET', '/api/admin/plans')).status === 200)
  const cur = (await S.json('GET', '/api/admin/plans')).body.data.settings
  const clone = () => JSON.parse(JSON.stringify({ trialPapers: cur.trialPapers, plans: cur.plans }))

  // ---- validasi
  const tryPut = async (f) => { const s = clone(); f(s); return S.json('PUT', '/api/admin/plans', s) }
  const bads = [
    ['harga negatif', (s) => { s.plans.pro.priceMonthlyIdr = -5 }],
    ['harga pecahan', (s) => { s.plans.pro.priceMonthlyIdr = 99.5 }],
    ['harga terlalu besar', (s) => { s.plans.pro.priceYearlyIdr = 5e9 }],
    ['kuota kosong', (s) => { s.plans.pro.tokensPerMonth = '' }],
    ['nama kosong', (s) => { s.plans.pro.name = ' ' }],
    ['paket tak dikenal', (s) => { s.plans.platinum = s.plans.pro }],
    ['em dash', (s) => { s.plans.pro.note = 'hemat — besar' }],
    ['panah', (s) => { s.plans.pro.features = ['a -> b'] }],
    ['trial negatif', (s) => { s.trialPapers = -1 }]
  ]
  const badRes = []
  for (const [, f] of bads) badRes.push((await tryPut(f)).status)
  check('PUT paket tidak valid ditolak 400 (9 kasus: harga negatif/pecahan/besar, kuota kosong, nama kosong, paket asing, em dash, panah, trial negatif)', badRes.every((x) => x === 400), badRes)
  check('tidak ada yang tersimpan setelah penolakan', !(await db.collection('settings').findOne({ _id: 'plans' })))
  const ad1 = await AD.json('PUT', '/api/admin/plans', clone())
  check('admin biasa tidak dapat mengubah paket (403) dan tidak ada yang tersimpan', ad1.status === 403 && !(await db.collection('settings').findOne({ _id: 'plans' })))

  // ---- simpan harga
  const s1 = clone()
  s1.plans.pro.priceMonthlyIdr = 149000
  s1.plans.pro.priceYearlyIdr = 1490000
  s1.plans.pro.tokensPerMonth = 3000000
  s1.plans.pro.features = ['Paper tanpa batas jumlah', 'Dukungan email']
  s1.plans.pro.name = 'Pro Plus'
  s1.trialPapers = 2
  const put = await S.json('PUT', '/api/admin/plans', s1)
  check('superadmin menyimpan harga/kuota/nama/fitur/jatah trial: 200', put.status === 200 && put.body.data.settings.plans.pro.priceMonthlyIdr === 149000 && put.body.data.settings.trialPapers === 2, put.body)
  const pub1 = (await anon.json('GET', '/api/plans')).body.data
  check('landing/API publik langsung menampilkan harga dan nama baru', pub1.plans.pro.priceMonthlyIdr === 149000 && pub1.plans.pro.name === 'Pro Plus' && pub1.plans.pro.tokensPerMonth === 3000000 && pub1.trialPapers === 2)
  const stored = await db.collection('settings').findOne({ _id: 'plans' })
  check('tersimpan di database dengan updatedBy superadmin', !!stored && String(stored.updatedBy) === String((await db.collection('users').findOne({ email: sEmail }))._id))

  // ---- jatah trial dinamis
  const T2 = await makeUser(db, 'sat', { trial: true })
  const t1 = await T2.C.json('POST', '/api/projects', { title: 'Trial 1' })
  const t2 = await T2.C.json('POST', '/api/projects', { title: 'Trial 2' })
  const t3 = await T2.C.json('POST', '/api/projects', { title: 'Trial 3' })
  check('jatah trial = 2 (dari pengaturan): paper ke-1 dan ke-2 berhasil, ke-3 ditolak TRIAL_LIMIT', t1.status === 201 && t2.status === 201 && t3.status === 403 && t3.body.error.details.code === 'TRIAL_LIMIT', [t1.status, t2.status, t3.status])
  const me2 = (await T2.C.json('GET', '/api/auth/me')).body.data
  check('status trial pengguna mengikuti pengaturan (limit 2, terpakai 2)', me2.trial.limit === 2 && me2.trial.used === 2 && me2.trial.remaining === 0, me2.trial)
  const s2 = clone(); s2.trialPapers = 1
  await S.json('PUT', '/api/admin/plans', Object.assign(s2, { plans: s1.plans }))
  const T3 = await makeUser(db, 'sat', { trial: true })
  const u1 = await T3.C.json('POST', '/api/projects', { title: 'U1' })
  const u2 = await T3.C.json('POST', '/api/projects', { title: 'U2' })
  check('jatah trial diturunkan ke 1: pengguna baru hanya 1 paper', u1.status === 201 && u2.status === 403, [u1.status, u2.status])

  // ---- pembayaran memakai harga dari pengaturan
  const s3 = JSON.parse(JSON.stringify({ trialPapers: 1, plans: s1.plans })); s3.plans.pro.priceYearlyIdr = null
  await S.json('PUT', '/api/admin/plans', s3)
  const pay = await U.C.json('POST', '/api/payments/create', { plan: 'pro_yearly' })
  check('pembayaran paket tanpa harga ditolak 400 (harga belum ditetapkan)', pay.status === 400, pay.body)

  // ---- hierarki: admin biasa vs superadmin
  const adminU = await makeUser(db, 'sadm', { trial: true })
  await db.collection('users').updateOne({ _id: adminU.id }, { $set: { role: 'admin' } })
  const peer = await makeUser(db, 'sus', { trial: true })
  const h1 = await AD.json('POST', '/api/admin/users', { name: 'Coba Admin', email: `cb${Date.now()}@e2e.test`, password: pw, role: 'admin' })
  const h2 = await AD.json('PATCH', `/api/admin/users/${adminU.id}`, { isActive: false })
  const h3 = await AD.json('PATCH', `/api/admin/users/${peer.id}`, { role: 'admin', confirmEmail: peer.email })
  const h4 = await AD.json('DELETE', `/api/admin/users/${adminU.id}`, { confirmEmail: adminU.email })
  check('admin biasa DITOLAK (403 SUPERADMIN_REQUIRED): membuat admin, mengubah akun admin, menaikkan peran, menghapus admin', [h1, h2, h3, h4].every((x) => x.status === 403 && x.body.error.details?.code === 'SUPERADMIN_REQUIRED'), [h1.status, h2.status, h3.status, h4.status])
  check('akun admin dan peran tidak berubah setelah penolakan', (await db.collection('users').findOne({ _id: adminU.id })).isActive !== false && (await db.collection('users').findOne({ _id: peer.id })).role === 'user')
  const okU = await AD.json('PATCH', `/api/admin/users/${peer.id}`, { plan: 'pro', planDays: 10 })
  check('admin biasa tetap dapat mengelola pengguna biasa (ubah paket 200)', okU.status === 200 && okU.body.data.user.plan === 'pro')
  const sp = await S.json('PATCH', `/api/admin/users/${peer.id}`, { role: 'superadmin', confirmEmail: peer.email })
  check('superadmin dapat menaikkan pengguna menjadi superadmin (dengan email konfirmasi) dan menurunkannya lagi', sp.status === 200 && sp.body.data.user.role === 'superadmin' && (await S.json('PATCH', `/api/admin/users/${peer.id}`, { role: 'user', confirmEmail: peer.email })).status === 200)
  const sw = await S.json('PATCH', `/api/admin/users/${adminU.id}`, { isActive: false })
  check('superadmin dapat menonaktifkan akun admin (200)', sw.status === 200 && sw.body.data.user.isActive === false)

  // ---- edit pengguna (update nama + email)
  const E = await makeUser(db, 'sed', { trial: true })
  const newMail = `baru${Date.now()}@e2e.test`
  const ed = await AD.json('PATCH', `/api/admin/users/${E.id}`, { name: 'Nama Diubah', email: newMail.toUpperCase() })
  check('edit nama dan email (email dinormalkan huruf kecil): 200', ed.status === 200 && ed.body.data.user.name === 'Nama Diubah' && ed.body.data.user.email === newMail, ed.body)
  const stLogin = async (email) => { const c = new Client(); await c.login(email); return (await c.json('GET', '/api/auth/me')).status }
  check('setelah ubah email: sesi lama dicabut, email lama tidak bisa masuk, email baru bisa', (await E.C.json('GET', '/api/auth/me')).status === 401 && (await stLogin(E.email)) === 401 && (await stLogin(newMail)) === 200)
  check('edit email: duplikat 409, tidak valid 400', (await AD.json('PATCH', `/api/admin/users/${E.id}`, { email: peer.email })).status === 409 && (await AD.json('PATCH', `/api/admin/users/${E.id}`, { email: 'bukan-email' })).status === 400)

  // ---- filter pengguna
  const fa = (await S.json('GET', '/api/admin/users?role=admin&limit=100')).body.data
  check('filter role=admin hanya memuat admin dan superadmin', fa.users.length >= 2 && fa.users.every((x) => x.role === 'admin' || x.role === 'superadmin'))
  const fu = (await S.json('GET', '/api/admin/users?status=inactive&limit=100')).body.data
  check('filter status=inactive hanya memuat akun nonaktif (termasuk admin yang dinonaktifkan)', fu.users.length >= 1 && fu.users.every((x) => x.isActive === false) && fu.users.some((x) => x.email === adminU.email))
  const fp = (await S.json('GET', '/api/admin/users?plan=pro&limit=100')).body.data
  check('filter plan=pro hanya memuat paket pro aktif', fp.users.length >= 1 && fp.users.every((x) => x.plan === 'pro') && fp.users.some((x) => x.email === peer.email))
  const ff = (await S.json('GET', '/api/admin/users?plan=free&limit=100')).body.data
  check('filter plan=free tidak memuat pengguna pro', ff.users.length >= 1 && !ff.users.some((x) => x.email === peer.email))
  const fq = (await S.json('GET', `/api/admin/users?q=${encodeURIComponent(sEmail.slice(0, 10))}&role=admin`)).body.data
  check('filter dan pencarian digabung', fq.users.length >= 1 && fq.users.every((x) => x.email.includes(sEmail.slice(0, 10))))

  // ---- pemantauan paper semua pengguna
  const P1 = await makeUser(db, 'spa', {}); const P2 = await makeUser(db, 'spb', {})
  const TAG = 'Z' + Date.now() // judul unik per putaran agar data sisa tidak mengganggu hitungan
  const mk = async (U0, title, body) => (await U0.C.json('POST', '/api/projects', { title, ...body })).body.data.project._id
  const a1 = await mk(P1, `Studi Alfa ${TAG}`, { language: 'indonesia', publicationType: 'journal' })
  const a2 = await mk(P1, `Studi Beta ${TAG}`, { language: 'english', publicationType: 'conference' })
  const b1 = await mk(P2, `Kajian Gamma ${TAG}`, { language: 'english', publicationType: 'journal' })
  await db.collection('projects').updateOne({ _id: new ObjectId(a2) }, { $set: { status: 'archived' } })
  const lp = await AD.json('GET', `/api/admin/projects?q=${TAG}&limit=100`)
  check('admin melihat paper semua pengguna: 200, memuat pemilik (nama+email), tanpa isi naskah', lp.status === 200 && lp.body.data.projects.length >= 3 && lp.body.data.projects.every((p) => p.owner && p.owner.email) && !/"source"|"text"|"content"/.test(JSON.stringify(lp.body.data)), lp.body && lp.body.error)
  const ids = (r) => r.body.data.projects.map((p) => p.id)
  check('pencarian judul', ids(await AD.json('GET', `/api/admin/projects?q=Gamma+${TAG}`)).join() === b1)
  check('pencarian email pemilik', (await AD.json('GET', `/api/admin/projects?q=${encodeURIComponent(P1.email)}`)).body.data.projects.length === 2)
  check('filter status=archived', ids(await AD.json('GET', `/api/admin/projects?q=${TAG}&status=archived`)).join() === a2)
  check('filter jenis=journal (2) dan konferensi (1)', (await AD.json('GET', `/api/admin/projects?q=${TAG}&type=journal`)).body.data.projects.length === 2 && ids(await AD.json('GET', `/api/admin/projects?q=${TAG}&type=conference`)).join() === a2)
  check('filter bahasa=english (2) dan indonesia (1)', (await AD.json('GET', `/api/admin/projects?q=${TAG}&language=english`)).body.data.projects.length === 2 && ids(await AD.json('GET', `/api/admin/projects?q=${TAG}&language=indonesia`)).join() === a1)
  check('filter pemilik (owner id)', (await AD.json('GET', `/api/admin/projects?owner=${P2.id}`)).body.data.projects.every((p) => p.owner.id === String(P2.id)))
  const pg = (await AD.json('GET', `/api/admin/projects?q=${TAG}&limit=2&page=2`)).body.data
  check('paginasi: total >= 3, halaman 2 berisi sisa', pg.total >= 3 && pg.projects.length === pg.total - 2 && pg.page === 2)
  check('karakter regex pada pencarian tidak menyebabkan galat', (await AD.json('GET', '/api/admin/projects?q=.*(')).status === 200)
  check('daftar paper admin: 401 anonim, 403 pengguna biasa', (await anon.json('GET', '/api/admin/projects')).status === 401 && (await P1.C.json('GET', '/api/admin/projects')).status === 403)
  check('pengguna hanya melihat paper miliknya sendiri (isolasi tetap)', (await P1.C.json('GET', '/api/projects?status=active')).body.data.projects.every((p) => String(p.userId) === String(P1.id)))

  await db.collection('settings').deleteOne({ _id: 'plans' }) // kembalikan default
  await db.collection('locks').deleteMany({})
  await mc.close()
  finish()
})().catch((e) => { console.error('FATAL', e); process.exit(1) })
