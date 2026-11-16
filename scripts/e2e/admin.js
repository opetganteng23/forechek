// Uji HTTP admin: seed admin (kredensial dari env, tidak dicetak), kelola pengguna, pengaman diri-sendiri/admin terakhir, pencabutan sesi, trial.
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { connectDb, makeUser, check, finish, MONGO, Client } = require('./lib')

;(async () => {
  const { mc, db } = await connectDb()
  const anon = new Client()
  const adminEmail = `adm${Date.now()}@e2e.test`
  const adminPass = 'AdminUji#12345'
  const seed = () => spawnSync(process.execPath, [path.join(__dirname, '..', 'seedAdmin.js')], { encoding: 'utf8', env: { ...process.env, MONGODB_URI: MONGO, ADMIN_EMAIL: adminEmail, ADMIN_PASSWORD: adminPass, ADMIN_NAME: 'Admin Uji' } })
  let r = seed()
  check('seed:admin membuat admin dan TIDAK mencetak password', r.status === 0 && /Admin dibuat/.test(r.stdout) && !(r.stdout + r.stderr).includes(adminPass), r.stderr.slice(0, 100))
  r = seed()
  check('seed:admin idempoten (kedua kali memperbarui, tetap satu akun)', r.status === 0 && /diperbarui/.test(r.stdout) && (await db.collection('users').countDocuments({ email: adminEmail })) === 1)
  const row = await db.collection('users').findOne({ email: adminEmail })
  check('admin: role admin, aktif, terverifikasi, password ter-hash (bukan teks asli)', row.role === 'admin' && row.isActive === true && row.emailVerified === true && row.password !== adminPass && /^\$2[aby]\$/.test(row.password))

  const A = { C: new Client() }
  check('admin dapat login lewat form kredensial', (await A.C.login(adminEmail, adminPass)).status === 200 && (await A.C.json('GET', '/api/auth/me')).body?.data?.email === adminEmail)
  const me = (await A.C.json('GET', '/api/auth/me')).body.data
  check('admin: status trial = admin (tanpa batas)', me.trial.plan === 'admin' && me.trial.trial === false, me.trial)
  const p1 = await A.C.json('POST', '/api/projects', { title: 'Admin paper 1' })
  const p2 = await A.C.json('POST', '/api/projects', { title: 'Admin paper 2' })
  check('admin tidak dibatasi trial (2 paper berhasil)', p1.status === 201 && p2.status === 201, [p1.status, p2.status])

  // ---- kontrol akses
  const U = await makeUser(db, 'admu', { trial: true })
  const routes = [['GET', '/api/admin/users'], ['POST', '/api/admin/users'], ['PATCH', `/api/admin/users/${U.id}`], ['DELETE', `/api/admin/users/${U.id}`]]
  for (const [m, u] of routes) check(`401 tanpa login: ${m} ${u.replace(String(U.id), ':id')}`, (await anon.json(m, u, m === 'GET' ? undefined : {})).status === 401)
  for (const [m, u] of routes) check(`403 pengguna biasa: ${m} ${u.replace(String(U.id), ':id')}`, (await U.C.json(m, u, m === 'GET' ? undefined : { isActive: false, confirmEmail: U.email })).status === 403)
  check('pengguna biasa tidak berubah setelah percobaan', (await db.collection('users').findOne({ _id: U.id })).isActive !== false)

  // ---- daftar
  const list = await A.C.json('GET', '/api/admin/users?limit=100')
  const ju = JSON.stringify(list.body.data)
  check('daftar pengguna: 200, memuat pengguna uji, tanpa password/token', list.status === 200 && list.body.data.users.some((x) => x.email === U.email) && !/password|passwordResetToken|emailVerificationToken|\$2[aby]\$/.test(ju))
  const sr = await A.C.json('GET', `/api/admin/users?q=${encodeURIComponent(U.email.slice(0, 12))}`)
  check('pencarian: hanya yang cocok; karakter regex tidak menyebabkan galat', sr.status === 200 && sr.body.data.users.every((x) => x.email.includes(U.email.slice(0, 12))) && (await A.C.json('GET', '/api/admin/users?q=.*(')).status === 200)

  // ---- buat pengguna
  const newEmail = `baru${Date.now()}@e2e.test`
  const cr = await A.C.json('POST', '/api/admin/users', { name: 'Pengguna Baru', email: newEmail, password: 'Rahasia#123456', role: 'user' })
  check('admin membuat pengguna: 201 terverifikasi', cr.status === 201 && cr.body.data.user.emailVerified === true && cr.body.data.user.role === 'user', cr.body)
  check('pengguna baru dapat login', (await new Client().login(newEmail, 'Rahasia#123456')).status === 200)
  check('buat pengguna: email duplikat 409; password pendek 400; email buruk 400', (await A.C.json('POST', '/api/admin/users', { name: 'X Y', email: newEmail, password: 'Rahasia#123456' })).status === 409 && (await A.C.json('POST', '/api/admin/users', { name: 'X Y', email: `p${Date.now()}@e2e.test`, password: 'pendek' })).status === 400 && (await A.C.json('POST', '/api/admin/users', { name: 'X Y', email: 'bukan-email', password: 'Rahasia#123456' })).status === 400)
  const Nid = cr.body.data.user.id

  // ---- ubah pengguna
  const upPlan = await A.C.json('PATCH', `/api/admin/users/${Nid}`, { plan: 'pro', planDays: 30 })
  check('ubah paket ke Pro 30 hari', upPlan.status === 200 && upPlan.body.data.user.plan === 'pro' && new Date(upPlan.body.data.user.subscriptionEnd) > new Date(Date.now() + 29 * 864e5), upPlan.body)
  check('paket invalid 400; planDays di luar rentang 400; body kosong 400', (await A.C.json('PATCH', `/api/admin/users/${Nid}`, { plan: 'platinum' })).status === 400 && (await A.C.json('PATCH', `/api/admin/users/${Nid}`, { plan: 'pro', planDays: 99999 })).status === 400 && (await A.C.json('PATCH', `/api/admin/users/${Nid}`, {})).status === 400)
  const NC = new Client(); await NC.login(newEmail, 'Rahasia#123456')
  const pre = await NC.json('GET', '/api/projects')
  const deact = await A.C.json('PATCH', `/api/admin/users/${Nid}`, { isActive: false })
  check('nonaktifkan pengguna: 200', deact.status === 200 && deact.body.data.user.isActive === false)
  const reloginDeact = new Client(); await reloginDeact.login(newEmail, 'Rahasia#123456')
  check('pengguna nonaktif: sesi lama dicabut (401) dan login ulang tidak menghasilkan sesi', pre.status === 200 && (await NC.json('GET', '/api/projects')).status === 401 && (await reloginDeact.json('GET', '/api/auth/me')).status === 401)
  await A.C.json('PATCH', `/api/admin/users/${Nid}`, { isActive: true })
  const setpw = await A.C.json('PATCH', `/api/admin/users/${Nid}`, { newPassword: 'PasswordBaru#789' })
  check('admin mengganti password pengguna: 200; password lama tidak berlaku, baru berlaku', setpw.status === 200 && (await (async () => { const c = new Client(); await c.login(newEmail, 'Rahasia#123456'); return (await c.json('GET', '/api/auth/me')).status })()) === 401 && (await (async () => { const c = new Client(); await c.login(newEmail, 'PasswordBaru#789'); return (await c.json('GET', '/api/auth/me')).status })()) === 200)
  check('password baru pendek ditolak 400', (await A.C.json('PATCH', `/api/admin/users/${Nid}`, { newPassword: 'pendek' })).status === 400)
  // reset trial
  const T = await makeUser(db, 'admt', { trial: true })
  await T.C.json('POST', '/api/projects', { title: 'Trial terpakai' })
  const blocked = await T.C.json('POST', '/api/projects', { title: 'Kedua' })
  await A.C.json('PATCH', `/api/admin/users/${T.id}`, { resetTrial: true })
  check('reset trial: sebelum 403 TRIAL_LIMIT, sesudah paper baru 201', blocked.status === 403 && (await T.C.json('POST', '/api/projects', { title: 'Setelah reset' })).status === 201)
  const promote = await A.C.json('PATCH', `/api/admin/users/${T.id}`, { role: 'admin' })
  check('promosikan ke admin: 200, dan ia dapat mengakses daftar pengguna', promote.status === 200 && (await (async () => { const c = new Client(); await c.login(T.email); return (await c.json('GET', '/api/admin/users')).status })()) === 200)
  const demote = await A.C.json('PATCH', `/api/admin/users/${T.id}`, { role: 'user' })
  check('turunkan kembali ke pengguna: 200, akses admin hilang', demote.status === 200 && (await (async () => { const c = new Client(); await c.login(T.email); return (await c.json('GET', '/api/admin/users')).status })()) === 403)

  // ---- pengaman
  const myId = String(row._id)
  const s1 = await A.C.json('PATCH', `/api/admin/users/${myId}`, { isActive: false })
  const s2 = await A.C.json('PATCH', `/api/admin/users/${myId}`, { role: 'user' })
  const s3 = await A.C.json('DELETE', `/api/admin/users/${myId}`, { confirmEmail: adminEmail })
  check('admin tidak dapat menonaktifkan/menurunkan/menghapus dirinya sendiri (409 SELF_ACTION)', [s1, s2, s3].every((x) => x.status === 409 && x.body.error.details?.code === 'SELF_ACTION'), [s1.status, s2.status, s3.status])
  const stillAdmin = await db.collection('users').findOne({ _id: row._id })
  check('admin tetap aktif dan admin', stillAdmin.role === 'admin' && stillAdmin.isActive === true)
  const lastAdminTry = await A.C.json('PATCH', `/api/admin/users/${myId}`, { isActive: false })
  check('admin aktif terakhir tidak dapat dinonaktifkan (409)', lastAdminTry.status === 409)

  // ---- hapus pengguna
  const D = await makeUser(db, 'admd', { trial: true })
  await D.C.json('POST', '/api/projects', { title: 'Akan terhapus' })
  const wrong = await A.C.json('DELETE', `/api/admin/users/${D.id}`, { confirmEmail: 'lain@e2e.test' })
  check('hapus pengguna: email konfirmasi salah -> 400, data utuh', wrong.status === 400 && !!(await db.collection('users').findOne({ _id: D.id })))
  const del = await A.C.json('DELETE', `/api/admin/users/${D.id}`, { confirmEmail: D.email })
  check('hapus pengguna: 200, akun dan proyek terhapus', del.status === 200 && !(await db.collection('users').findOne({ _id: D.id })) && (await db.collection('projects').countDocuments({ userId: D.id })) === 0, del.body)
  check('id tidak valid/tidak ada: 404', (await A.C.json('PATCH', '/api/admin/users/bukan-id', { isActive: true })).status === 404 && (await A.C.json('DELETE', '/api/admin/users/000000000000000000000000', { confirmEmail: 'x@y.zz' })).status === 404)

  // ---- rute lain tidak terpengaruh: pengguna biasa tetap hanya melihat datanya
  check('admin tidak otomatis melihat proyek pengguna lain lewat API proyek (isolasi tetap)', (await A.C.json('GET', '/api/projects')).body.data.projects.every((p) => String(p.userId) === myId))
  await mc.close()
  finish()
})().catch((e) => { console.error('FATAL', e); process.exit(1) })
