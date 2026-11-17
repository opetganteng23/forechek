// Uji HTTP admin: seed admin (kredensial dari env, tidak dicetak), kelola pengguna, pengaman diri-sendiri/admin terakhir, pencabutan sesi, trial.
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { connectDb, makeUser, check, finish, MONGO, Client } = require('./lib')
const { ObjectId } = require('mongodb')

;(async () => {
  const { mc, db } = await connectDb()
  const anon = new Client()
  const adminEmail = `adm${Date.now()}@e2e.test`
  const adminPass = 'AdminUji#12345' // 14 karakter (seed mewajibkan minimal 12)
  const seed = (args = [], pass = adminPass, email = adminEmail) => spawnSync(process.execPath, [path.join(__dirname, '..', 'seedAdmin.js'), '--superadmin', ...args], { encoding: 'utf8', env: { ...process.env, MONGODB_URI: MONGO, ADMIN_EMAIL: email, ADMIN_PASSWORD: pass, ADMIN_NAME: 'Admin Uji' } })
  let r = seed()
  check('seed:admin membuat admin dan TIDAK mencetak password', r.status === 0 && /dibuat/.test(r.stdout) && !(r.stdout + r.stderr).includes(adminPass), r.stderr.slice(0, 100))
  r = seed()
  check('seed:admin idempoten (kedua kali memperbarui, tetap satu akun, password TIDAK diubah)', r.status === 0 && /diperbarui/.test(r.stdout) && /tidak diubah/.test(r.stdout) && (await db.collection('users').countDocuments({ email: adminEmail })) === 1)
  const h0 = (await db.collection('users').findOne({ email: adminEmail })).password
  r = seed([], 'password-lain-yang-panjang-1')
  check('seed:admin tanpa --reset-password tidak mengubah hash password (walau ADMIN_PASSWORD berbeda)', r.status === 0 && (await db.collection('users').findOne({ email: adminEmail })).password === h0)
  r = seed([], 'pendek', `short${Date.now()}@e2e.test`)
  check('seed:admin menolak password < 12 karakter untuk akun baru (tanpa mencetak password)', r.status !== 0 && /12-72/.test(r.stderr) && !(r.stdout + r.stderr).includes('pendek'.repeat(1) + ' '))
  r = seed(['--reset-password'], 'dua-belas-1')
  check('seed:admin --reset-password menolak password 11 karakter; hash tetap', r.status !== 0 && (await db.collection('users').findOne({ email: adminEmail })).password === h0)
  r = seed(['--reset-password'], 'PasswordBaruAdmin#1')
  check('seed:admin --reset-password mengganti password (hash berubah)', r.status === 0 && /direset/.test(r.stdout) && (await db.collection('users').findOne({ email: adminEmail })).password !== h0)
  r = seed(['--reset-password'], adminPass)
  check('seed:admin --reset-password dapat mengembalikan password uji', r.status === 0)
  const row = await db.collection('users').findOne({ email: adminEmail })
  check('admin: role admin, aktif, terverifikasi, password ter-hash (bukan teks asli)', row.role === 'superadmin' && row.isActive === true && row.emailVerified === true && row.password !== adminPass && /^\$2[aby]\$/.test(row.password))

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
  const promote = await A.C.json('PATCH', `/api/admin/users/${T.id}`, { role: 'admin', confirmEmail: T.email })
  check('promosikan ke admin: 200, dan ia dapat mengakses daftar pengguna', promote.status === 200 && (await (async () => { const c = new Client(); await c.login(T.email); return (await c.json('GET', '/api/admin/users')).status })()) === 200)
  const demote = await A.C.json('PATCH', `/api/admin/users/${T.id}`, { role: 'user', confirmEmail: T.email })
  check('turunkan kembali ke pengguna: 200, akses admin hilang', demote.status === 200 && (await (async () => { const c = new Client(); await c.login(T.email); return (await c.json('GET', '/api/admin/users')).status })()) === 403)

  const myId = String(row._id)
  // ---- pengaman: SEMUA aksi admin atas dirinya sendiri ditolak (UI maupun API langsung)
  const selfPatches = [{ isActive: false }, { role: 'user', confirmEmail: adminEmail }, { plan: 'pro', planDays: 30 }, { plan: 'free' }, { resetTrial: true }, { newPassword: 'PasswordBaru#789' }, { name: 'Nama Baru' }, { isActive: true }]
  const selfRes = []
  for (const p of selfPatches) selfRes.push(await A.C.json('PATCH', `/api/admin/users/${myId}`, p))
  selfRes.push(await A.C.json('DELETE', `/api/admin/users/${myId}`, { confirmEmail: adminEmail }))
  check('admin: 9 aksi atas akunnya sendiri (nonaktif, peran, paket, reset trial, password, nama, hapus) semuanya 409 SELF_ACTION', selfRes.every((x) => x.status === 409 && x.body.error.details?.code === 'SELF_ACTION'), selfRes.map((x) => x.status))
  const after = await db.collection('users').findOne({ _id: row._id })
  check('akun admin tidak berubah sama sekali (peran, aktif, paket, password, nama)', after.role === 'superadmin' && after.isActive === true && after.password === row.password && after.name === 'Admin Uji' && (after.subscription?.plan || 'free') === 'free')
  check('login admin dengan password lama tetap berhasil', (await new Client().login(adminEmail, adminPass)).status === 200)

  // ---- ganti password sendiri hanya lewat halaman Akun (butuh password lama)
  const pw1 = await A.C.json('PATCH', '/api/account/password', { currentPassword: 'salah-salah-1', newPassword: 'GantiSendiri#2026' })
  const pw2 = await A.C.json('PATCH', '/api/account/password', { currentPassword: adminPass, newPassword: 'pendek' })
  const pw3 = await A.C.json('PATCH', '/api/account/password', { currentPassword: adminPass, newPassword: adminPass })
  check('ganti password: password lama salah 400, baru pendek 400, sama dengan lama 400', pw1.status === 400 && pw2.status === 400 && pw3.status === 400, [pw1.status, pw2.status, pw3.status])
  check('ganti password tanpa login: 401', (await anon.json('PATCH', '/api/account/password', { currentPassword: 'a', newPassword: 'bbbbbbbbb' })).status === 401)
  const pw4 = await A.C.json('PATCH', '/api/account/password', { currentPassword: adminPass, newPassword: 'GantiSendiri#2026' })
  const stCode = async (pass) => { const c = new Client(); await c.login(adminEmail, pass); return (await c.json('GET', '/api/auth/me')).status }
  check('ganti password benar: 200; sesi lama dicabut; password lama tidak berlaku; baru berlaku', pw4.status === 200 && (await A.C.json('GET', '/api/auth/me')).status === 401 && (await stCode(adminPass)) === 401 && (await stCode('GantiSendiri#2026')) === 200)
  const NEWPW = 'GantiSendiri#2026'
  await A.C.login(adminEmail, NEWPW)

  // ---- perubahan peran wajib mengetik email target (dipaksa di server)
  const R = await makeUser(db, 'admr', { trial: true })
  const r0 = await A.C.json('PATCH', `/api/admin/users/${R.id}`, { role: 'admin' })
  const r1 = await A.C.json('PATCH', `/api/admin/users/${R.id}`, { role: 'admin', confirmEmail: 'lain@e2e.test' })
  check('ubah peran tanpa/salah email konfirmasi: 400 dan peran tidak berubah', r0.status === 400 && r1.status === 400 && (await db.collection('users').findOne({ _id: R.id })).role !== 'admin', [r0.status, r1.status])

  // ---- konkurensi: tidak boleh ada keadaan tanpa admin aktif
  const pwB = 'AdminDua#2026xx'
  const emailB = `admb${Date.now()}@e2e.test`
  const crB = await A.C.json('POST', '/api/admin/users', { name: 'Admin Dua', email: emailB, password: pwB, role: 'superadmin' })
  const Bid = crB.body.data.user.id
  const B = { C: new Client() }
  await B.C.login(emailB, pwB)
  await db.collection('users').updateMany({ _id: { $nin: [row._id, new ObjectId(Bid)] }, role: { $in: ['admin', 'superadmin'] } }, { $set: { role: 'user' } }) // basis uji: hanya dua admin
  const nAdmins = () => db.collection('users').countDocuments({ role: { $in: ['admin', 'superadmin'] }, isActive: { $ne: false } })
  const reset2 = async () => { await db.collection('users').updateMany({ _id: { $in: [row._id, new ObjectId(Bid)] } }, { $set: { role: 'superadmin', isActive: true }, $unset: { sessionsValidAfter: '' } }) } // sesi dipulihkan lewat DB agar tidak terkena batas laju login (10 per email)
  check('basis uji: tepat dua admin aktif', (await nAdmins()) === 2)
  const rounds = [
    ['saling menurunkan', () => A.C.json('PATCH', `/api/admin/users/${Bid}`, { role: 'user', confirmEmail: emailB }), () => B.C.json('PATCH', `/api/admin/users/${myId}`, { role: 'user', confirmEmail: adminEmail })],
    ['saling menonaktifkan', () => A.C.json('PATCH', `/api/admin/users/${Bid}`, { isActive: false }), () => B.C.json('PATCH', `/api/admin/users/${myId}`, { isActive: false })]
  ]
  for (const [label, fa, fb] of rounds) {
    let bad = 0
    const seen = []
    for (let i = 0; i < 6; i++) {
      const [ra, rb] = await Promise.all([fa(), fb()])
      seen.push(`${ra.status}/${rb.status}`)
      const oks = [ra, rb].filter((x) => x.status === 200).length
      if ((await nAdmins()) < 1 || oks !== 1) bad++
      await reset2()
    }
    check(`konkurensi dua admin ${label} (6 putaran): tepat satu permintaan berhasil dan admin aktif tidak pernah nol`, bad === 0, seen.join(' '))
  }
  // saling menghapus: dua admin khusus (E, F) satu-satunya admin aktif; yang terhapus tidak dipulihkan
  const mk = async (tag) => { const email = `adm${tag}${Date.now()}@e2e.test`; const c = await A.C.json('POST', '/api/admin/users', { name: 'Admin ' + tag, email, password: pwB, role: 'superadmin' }); const C = new Client(); await C.login(email, pwB); return { email, id: c.body.data.user.id, C } }
  const E = await mk('e'); const F = await mk('f')
  await db.collection('users').updateMany({ _id: { $nin: [new ObjectId(E.id), new ObjectId(F.id)] }, role: { $in: ['admin', 'superadmin'] } }, { $set: { role: 'user' } })
  const [da, df] = await Promise.all([E.C.json('DELETE', `/api/admin/users/${F.id}`, { confirmEmail: F.email }), F.C.json('DELETE', `/api/admin/users/${E.id}`, { confirmEmail: E.email })])
  const eLeft = !!(await db.collection('users').findOne({ _id: new ObjectId(E.id) }))
  const fLeft = !!(await db.collection('users').findOne({ _id: new ObjectId(F.id) }))
  check('konkurensi dua admin saling menghapus: tepat satu terhapus dan tepat satu admin aktif tersisa', [da, df].filter((x) => x.status === 200).length === 1 && eLeft !== fLeft && (await nAdmins()) === 1, [da.status, df.status])
  await db.collection('users').updateOne({ _id: row._id }, { $set: { role: 'superadmin', isActive: true } })
  await db.collection('users').updateOne({ _id: row._id }, { $unset: { sessionsValidAfter: '' } })
  // tiga admin saling menurunkan melingkar serentak
  const emailC = `admc${Date.now()}@e2e.test`
  const emailD = `admd${Date.now()}@e2e.test`
  const crC = await A.C.json('POST', '/api/admin/users', { name: 'Admin Tiga', email: emailC, password: pwB, role: 'superadmin' })
  const crD = await A.C.json('POST', '/api/admin/users', { name: 'Admin Empat', email: emailD, password: pwB, role: 'superadmin' })
  const Cid = crC.body.data.user.id
  const Did = crD.body.data.user.id
  const Cc = { C: new Client() }; await Cc.C.login(emailC, pwB)
  const Dd = { C: new Client() }; await Dd.C.login(emailD, pwB)
  await db.collection('users').updateMany({ _id: { $nin: [row._id, new ObjectId(Cid), new ObjectId(Did)] }, role: { $in: ['admin', 'superadmin'] } }, { $set: { role: 'user' } })
  const ring = await Promise.all([A.C.json('PATCH', `/api/admin/users/${Cid}`, { role: 'user', confirmEmail: emailC }), Cc.C.json('PATCH', `/api/admin/users/${Did}`, { role: 'user', confirmEmail: emailD }), Dd.C.json('PATCH', `/api/admin/users/${myId}`, { role: 'user', confirmEmail: adminEmail })])
  check('tiga admin saling menurunkan melingkar serentak: paling sedikit satu admin aktif tersisa', (await nAdmins()) >= 1, ring.map((x) => x.status))
  // admin aktif terakhir tidak dapat menghapus akunnya sendiri lewat halaman Akun
  await db.collection('users').updateMany({ _id: { $ne: row._id }, role: { $in: ['admin', 'superadmin'] } }, { $set: { role: 'user' } })
  await db.collection('users').updateOne({ _id: row._id }, { $set: { role: 'superadmin', isActive: true } })
  await db.collection('users').updateOne({ _id: row._id }, { $unset: { sessionsValidAfter: '' } })
  const selfDel = await A.C.json('DELETE', '/api/account', { confirmText: 'HAPUS', confirmEmail: adminEmail, password: NEWPW })
  check('admin aktif terakhir tidak dapat menghapus akunnya lewat Akun (409 LAST_ADMIN) dan akun tetap ada', selfDel.status === 409 && selfDel.body.error.details?.code === 'LAST_ADMIN' && !!(await db.collection('users').findOne({ _id: row._id })), selfDel.body?.error)
  check('kunci serial dilepas setelah semua operasi (tidak ada kunci tersangkut)', (await db.collection('locks').countDocuments({})) === 0)

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
