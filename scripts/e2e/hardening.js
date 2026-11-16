// Uji HTTP Tahap 7 (hardening). Server harus berjalan dengan TRUST_PROXY=true (uji lain memakai X-Forwarded-For berputar) dan:
//   AI_PROVIDER=fake AI_ALLOW_FAKE=true AI_MODEL_CHAT=demo-model LITERATURE_PROVIDERS=fixture LITERATURE_ALLOW_FIXTURE=true
// Mencakup: cek Origin (QA-18), batas body streaming (QA-11), kuota proyek paralel (QA-10), pencabutan sesi (QA-14),
// waktu forgot-password (QA-13), hapus akun (QA-09), pekerja retensi (QA-09), rute lama dinonaktifkan (QA-07),
// sapuan NoSQL injection, header keamanan, dan pemindaian bundle klien (tanpa membaca nilai env).
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { BASE, MONGO, connectDb, makeUser, check, finish, ObjectId, Client, PASSWORD } = require('./lib')
const { hashToken, generateToken } = require('../../packages/core')

const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]

;(async () => {
  const { mc, db } = await connectDb()
  const A = await makeUser(db, 'hda')
  const anon = new Client()

  // ---- register tidak membocorkan keberadaan email (QA-25): respons email baru dan email terdaftar identik
  {
    const reg = (email) => fetch(BASE + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.18.7.${Math.floor(Math.random() * 250)}` }, body: JSON.stringify({ name: 'Enum Uji', email, password: PASSWORD }) })
    const fresh = await reg(`enum-baru-${Date.now()}@e2e.test`)
    const dup = await reg(A.email)
    const fj = await fresh.json()
    const dj = await dup.json()
    check('register email terdaftar: respons SAMA dengan email baru (201, tanpa id/email, tanpa "sudah terdaftar")', fresh.status === 201 && dup.status === 201 && JSON.stringify(Object.keys(fj.data).sort()) === JSON.stringify(Object.keys(dj.data).sort()) && fj.data.message === dj.data.message && !/terdaftar/i.test(JSON.stringify(dj)) && !('id' in dj.data), [dup.status, dj])
    check('register duplikat tidak membuat akun kedua', (await db.collection('users').countDocuments({ email: A.email })) === 1)
  }

  // ---- Origin (QA-18)
  const post = (U, url, origin, body = { title: 'Uji Origin' }) => U.f(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(body) })
  const host = new URL(BASE).origin
  check('Origin asing pada POST pengubah-status -> 403 FORBIDDEN dan tidak ada proyek dibuat', (await post(A.C, '/api/projects', 'https://evil.example')).status === 403 && (await db.collection('projects').countDocuments({ userId: A.id })) === 0)
  check('Origin sama -> diizinkan (201)', (await post(A.C, '/api/projects', host)).status === 201)
  check('tanpa Origin (klien non-browser) -> diizinkan', (await post(A.C, '/api/projects', null)).status === 201)
  check('GET dengan Origin asing tidak diblokir (baca saja)', (await A.C.f('/api/projects', { headers: { origin: 'https://evil.example' } })).status === 200)

  // ---- batas body streaming (QA-11): tanpa Content-Length (chunked)
  async function chunked(bytes) {
    const body = new ReadableStream({ start(c) { const chunk = new TextEncoder().encode('x'.repeat(65536)); for (let i = 0; i < bytes / 65536; i++) c.enqueue(chunk); c.close() } })
    const r = await fetch(BASE + '/api/projects', { method: 'POST', headers: { cookie: A.C.cookie(), 'content-type': 'application/json' }, body, duplex: 'half' })
    return r.status
  }
  check('body chunked 3 MB tanpa Content-Length -> 413 (batas ditegakkan pada byte yang dibaca)', (await chunked(3 * 1024 * 1024)) === 413)
  check('body kecil chunked tetap diproses normal (400 karena bukan JSON valid, bukan 413)', (await chunked(65536)) === 400)

  // ---- kuota proyek paralel (QA-10)
  const U = await makeUser(db, 'hdq')
  const now = new Date()
  const seed = Array.from({ length: 46 }, (_, i) => ({ userId: U.id, title: `seed${i}`, status: 'active', revision: 0, versionCount: 0, createdAt: now, updatedAt: now }))
  await db.collection('projects').insertMany(seed)
  const par = await Promise.all(Array.from({ length: 10 }, (_, i) => U.C.json('POST', '/api/projects', { title: `par${i}` })))
  const active = await db.collection('projects').countDocuments({ userId: U.id, status: 'active' })
  check('46 proyek + 10 pembuatan paralel: jumlah aktif tidak melebihi 50', active <= 50 && par.filter((r) => r.status === 201).length === active - 46, { active, statuses: par.map((r) => r.status) })

  // ---- pencabutan sesi setelah reset password (QA-14)
  const R = await makeUser(db, 'hdr')
  check('sesi sebelum reset: 200', (await R.C.json('GET', '/api/projects')).status === 200)
  const tok = generateToken()
  await db.collection('users').updateOne({ _id: R.id }, { $set: { passwordResetToken: tok.hash, passwordResetExpires: new Date(Date.now() + 3600000) } })
  await new Promise((r) => setTimeout(r, 1100)) // iat berdetik: pastikan reset jatuh setelah sesi diterbitkan
  const rp = await anon.json('POST', '/api/auth/reset-password', { token: tok.raw, password: 'PasswordBaru!2345' })
  check('reset-password -> 200', rp.status === 200, rp.body && rp.body.error)
  check('sesi lama setelah reset password dicabut: 401', (await R.C.json('GET', '/api/projects')).status === 401)
  check('sesi dicabut juga TIDAK berlaku di rute lama (GET /api/manuscripts -> 401, bukan 200 [])', (await R.C.f('/api/manuscripts')).status === 401)
  const R2 = new Client()
  check('login dengan password baru berhasil dan sesi baru berlaku', (await R2.login(R.email, 'PasswordBaru!2345')).status === 200 && (await R2.json('GET', '/api/projects')).status === 200)

  // ---- waktu forgot-password (QA-13)
  const T = await makeUser(db, 'hdt')
  const time = async (email) => { const t = process.hrtime.bigint(); await anon.json('POST', '/api/auth/forgot-password', { email }); return Number(process.hrtime.bigint() - t) / 1e6 }
  const known = []
  const unknown = []
  for (let i = 0; i < 3; i++) { known.push(await time(T.email)); unknown.push(await time(`tidak-ada-${i}@e2e.test`)) }
  check('waktu respons forgot-password terdaftar vs tidak berselisih < 150 ms (median)', Math.abs(median(known) - median(unknown)) < 150, { known, unknown })

  // ---- rute lama dinonaktifkan (QA-07)
  check('POST /api/manuscripts (unggah lama) -> 410', (await A.C.f('/api/manuscripts', { method: 'POST' })).status === 410)
  check('POST /api/analyses (analisis lama tanpa kendali sitasi) -> 410', (await A.C.json('POST', '/api/analyses', { manuscriptId: 'x' })).status === 410)

  // ---- hapus akun (QA-09)
  const D = await makeUser(db, 'hdd')
  const keep = await makeUser(db, 'hdk')
  const mk = async (U, title) => {
    const pid = (await U.C.json('POST', '/api/projects', { title })).body.data.project._id
    await U.C.json('POST', `/api/projects/${pid}/versions`, { baseRevision: 0, source: '# T\n\n## Abstract\nIsi abstrak yang cukup untuk uji hapus akun.\n\n## References\n[1] A.\n' })
    await U.C.json('POST', `/api/projects/${pid}/references/verify`, { doi: '10.99999/fx.2021.001', title: 'Adaptive Sparse Attention for Low-Resource Language Modeling', authors: ['Ratna Wulandari', 'Chen Mei'], year: 2021, add: true })
    await U.C.json('POST', `/api/projects/${pid}/report`, {})
    return pid
  }
  const dp = await mk(D, 'Hapus Akun'); const kp = await mk(keep, 'Tetap')
  await new Promise((r) => setTimeout(r, 1500))
  check('hapus akun tanpa login -> 401', (await anon.json('DELETE', '/api/account', { confirmEmail: D.email })).status === 401)
  check('hapus akun tanpa kata konfirmasi HAPUS -> 400, data utuh', (await D.C.json('DELETE', '/api/account', { confirmEmail: D.email, password: PASSWORD })).status === 400 && (await db.collection('projects').countDocuments({ userId: D.id })) === 1)
  check('hapus akun: email konfirmasi salah -> 400, data utuh', (await D.C.json('DELETE', '/api/account', { confirmText: 'HAPUS', confirmEmail: 'lain@e2e.test', password: PASSWORD })).status === 400 && (await db.collection('projects').countDocuments({ userId: D.id })) === 1)
  check('hapus akun: password salah -> 400, data utuh', (await D.C.json('DELETE', '/api/account', { confirmText: 'HAPUS', confirmEmail: D.email, password: 'salah-salah-1!' })).status === 400 && !!(await db.collection('users').findOne({ _id: D.id })))
  const del = await D.C.json('DELETE', '/api/account', { confirmText: 'HAPUS', confirmEmail: D.email, password: PASSWORD })
  check('hapus akun benar -> 200', del.status === 200 && del.body.data.deleted === true, del.body)
  const cols = ['projects', 'manuscriptversions', 'messages', 'references', 'referencecandidates', 'aiusagelogs', 'readinessreports', 'editproposals']
  const left = {}
  for (const c of cols) left[c] = await db.collection(c).countDocuments({ userId: D.id })
  check('semua data terkait pengguna terhapus (proyek, versi, chat, referensi, laporan, usulan, jejak AI)', Object.values(left).every((n) => n === 0) && !(await db.collection('users').findOne({ _id: D.id })), left)
  check('sesi akun terhapus tidak berlaku lagi: 401', (await D.C.json('GET', '/api/projects')).status === 401)
  check('data pengguna lain tidak tersentuh', (await db.collection('projects').countDocuments({ userId: keep.id })) === 1 && (await db.collection('references').countDocuments({ userId: keep.id })) >= 1)
  void dp; void kp

  // ---- pekerja retensi (QA-09)
  const Q = await makeUser(db, 'hdn')
  const mkp = async (title, retentionDays, expires) => {
    const pid = (await Q.C.json('POST', '/api/projects', { title })).body.data.project._id
    await db.collection('projects').updateOne({ _id: new ObjectId(pid) }, { $set: { retentionDays, retentionExpiresAt: expires } })
    return pid
  }
  const DAY = 86400000
  const old = await mkp('lama', 30, new Date(Date.now() - 40 * DAY))
  const inGrace = await mkp('masa-tenggang', 30, new Date(Date.now() - 2 * DAY))
  const none = await mkp('tanpa-retensi', null, null)
  const run = (env) => spawnSync(process.execPath, [path.join(__dirname, '..', 'retention.js')], { encoding: 'utf8', env: { ...process.env, MONGODB_URI: MONGO, ...env } })
  const dry = run({ RETENTION_ENABLED: '' })
  const dryJson = JSON.parse(dry.stdout.trim().split('\n').pop())
  check('retensi default = dry-run: melaporkan kandidat tetapi tidak menghapus', dry.status === 0 && dryJson.dryRun === true && dryJson.candidates >= 1 && !!(await db.collection('projects').findOne({ _id: new ObjectId(old) })), dry.stderr || dryJson)
  const live = run({ RETENTION_ENABLED: 'true', RETENTION_GRACE_DAYS: '7' })
  const liveJson = JSON.parse(live.stdout.trim().split('\n').pop())
  check('retensi aktif: proyek lewat kedaluwarsa+tenggang terhapus', live.status === 0 && liveJson.deleted >= 1 && !(await db.collection('projects').findOne({ _id: new ObjectId(old) })), live.stderr || liveJson)
  check('retensi: proyek dalam masa tenggang dan tanpa retensi TIDAK dihapus', !!(await db.collection('projects').findOne({ _id: new ObjectId(inGrace) })) && !!(await db.collection('projects').findOne({ _id: new ObjectId(none) })))
  check('keluaran retensi tidak memuat isi naskah/judul', !/lama|masa-tenggang|tanpa-retensi/.test(live.stdout + live.stderr))

  // ---- TOCTOU retensi (T7-02) pada DB nyata: pengguna menyimpan versi di antara findExpired dan deleteProject
  {
    const { dbConnect, retentionStore } = require('../../packages/db')
    process.env.MONGODB_URI = MONGO
    await dbConnect()
    const race = await mkp('diperpanjang', 30, new Date(Date.now() - 40 * DAY))
    const before = new Date(Date.now() - 7 * DAY)
    const found = await retentionStore.findExpired({ before, limit: 200 })
    check('pencarian retensi menemukan proyek kedaluwarsa', found.some((f) => f.id === race))
    const sv = await Q.C.json('POST', `/api/projects/${race}/versions`, { baseRevision: 0, source: '# T\n\n## Abstract\nIsi abstrak untuk uji perpanjangan retensi.\n' })
    check('menyimpan versi memperpanjang retensi (retentionExpiresAt di masa depan)', sv.status === 201 && new Date(sv.body.data.project.retentionExpiresAt) > new Date())
    const del = await retentionStore.deleteProject(found.find((f) => f.id === race).userId, race, before)
    const still = await db.collection('projects').findOne({ _id: new ObjectId(race) })
    check('proyek yang diperpanjang di antara pencarian dan penghapusan TIDAK terhapus dan tidak berstatus deletion_pending', del === false && !!still && still.status === 'active', { del, status: still && still.status })
    const stuck = await mkp('macet', 30, new Date(Date.now() - 40 * DAY))
    await db.collection('projects').updateOne({ _id: new ObjectId(stuck) }, { $set: { status: 'deletion_pending' } })
    const retry = await retentionStore.findExpired({ before, limit: 200 })
    check('proyek deletion_pending (cascade gagal sebelumnya) ditemukan lagi untuk dicoba ulang', retry.some((f) => f.id === stuck))
    const wr = await Q.C.json('POST', `/api/projects/${stuck}/versions`, { baseRevision: 0, source: '# T\n\n## Abstract\nTulis ke proyek yang sedang dihapus.\n' })
    check('proyek deletion_pending tidak dapat ditulis (409/404)', wr.status === 409 || wr.status === 404, wr.status)
  }

  // ---- sapuan NoSQL injection
  const S = await makeUser(db, 'hds')
  const sp = (await S.C.json('POST', '/api/projects', { title: 'Sapuan' })).body.data.project._id
  const inj = { $ne: null }
  const injGt = { $gt: '' }
  const cases = [
    ['POST', '/api/auth/register', { name: inj, email: inj, password: inj }, anon],
    ['POST', '/api/auth/forgot-password', { email: inj }, anon],
    ['POST', '/api/auth/reset-password', { token: inj, password: 'PasswordBaru!2345' }, anon],
    ['POST', '/api/auth/verify-email', { token: inj }, anon],
    ['POST', '/api/auth/resend-verification', { email: inj }, anon],
    ['POST', '/api/projects', { title: inj, fieldOfStudy: injGt }, S.C],
    ['PATCH', `/api/projects/${sp}`, { title: inj, venueSlug: inj, status: inj }, S.C],
    ['POST', `/api/projects/${sp}/versions`, { source: inj, baseRevision: inj, format: inj }, S.C],
    ['POST', `/api/projects/${sp}/references/verify`, { doi: inj, title: inj, authors: inj, year: inj }, S.C],
    ['POST', `/api/projects/${sp}/references`, { doi: inj, title: inj }, S.C],
    ['POST', `/api/projects/${sp}/literature/search`, { query: inj, limit: inj }, S.C],
    ['POST', `/api/projects/${sp}/chat`, { clientRequestId: inj, content: inj }, S.C],
    ['POST', `/api/projects/${sp}/edits/${'a'.repeat(24)}/accept`, { baseRevision: inj }, S.C],
    ['DELETE', '/api/account', { confirmEmail: inj, password: inj }, S.C]
  ]
  const bad = []
  for (const [m, u, b, C] of cases) { const r = await C.json(m, u, b); if (r.status >= 500 || r.status === 200 || r.status === 201) bad.push([m, u, r.status]) }
  check('sapuan NoSQL injection ($ne/$gt di semua bidang): tidak ada 5xx dan tidak ada yang berhasil', bad.length === 0, bad)
  const qs = await S.C.json('GET', '/api/projects?status[$ne]=x&status=%7B%22%24ne%22%3Anull%7D')
  check('query string operator injeksi tidak menyebabkan 5xx', qs.status < 500, qs.status)
  const lg = await new Client().f('/api/auth/callback/credentials', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'email[$ne]=x&password[$ne]=x&json=true' })
  check('login dengan operator injeksi gagal (bukan sesi)', !(await (async () => { const C = new Client(); await C.f('/api/auth/callback/credentials', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'email[$ne]=x&password[$ne]=x&json=true' }); return (await C.json('GET', '/api/projects')).status === 200 })()) && lg.status < 500)

  // ---- header keamanan dan bundle klien
  const h = await anon.f('/login')
  check('header keamanan: nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy', h.headers.get('x-content-type-options') === 'nosniff' && h.headers.get('x-frame-options') === 'DENY' && !!h.headers.get('referrer-policy') && !!h.headers.get('permissions-policy') && !h.headers.get('x-powered-by'))
  const staticDir = path.join(__dirname, '..', '..', 'apps', 'web', '.next', 'static')
  const files = []
  ;(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(js|css|html|map)$/.test(e.name)) files.push(p) } })(staticDir)
  const PATTERNS = [/mongodb(\+srv)?:\/\//, /sk-ant-[A-Za-z0-9_-]{10,}/, /NEXTAUTH_SECRET/, /MIDTRANS_SERVER_KEY/, /GMAIL_(REFRESH_TOKEN|CLIENT_SECRET)/, /ANTHROPIC_API_KEY/, /GOOGLE_CLIENT_SECRET/, /CLOUDINARY_API_SECRET/, /passwordResetToken/]
  const hits = []
  for (const f of files) { const t = fs.readFileSync(f, 'utf8'); for (const p of PATTERNS) if (p.test(t)) hits.push([path.basename(f), String(p)]) }
  check(`pemindaian bundle klien (${files.length} berkas): tanpa nama/pola rahasia server`, files.length > 0 && hits.length === 0, hits.slice(0, 5))

  await mc.close()
  finish()
})().catch((e) => { console.error('FATAL', e); process.exit(1) })
