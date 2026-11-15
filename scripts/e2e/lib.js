// Pembantu uji HTTP end-to-end. Butuh server berjalan (BASE_URL) dan MongoDB UJI (MONGODB_URI), bukan data nyata.
// Pakai: BASE_URL=http://localhost:3000 MONGODB_URI=mongodb://localhost:27017/publikasi_db node scripts/e2e/<berkas>.js
const { MongoClient, ObjectId } = require('mongodb')

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const MONGO = process.env.MONGODB_URI || 'mongodb://localhost:27017/publikasi_db'
const PASSWORD = 'Passw0rd!long1'

class Client {
  constructor() {
    this.jar = {}
  }
  cookie() {
    return Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; ')
  }
  store(res) {
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';')
      const i = kv.indexOf('=')
      const k = kv.slice(0, i)
      const v = kv.slice(i + 1)
      if (v === '' || /Max-Age=0|expires=Thu, 01 Jan 1970/i.test(c)) delete this.jar[k]
      else this.jar[k] = v
    }
  }
  async f(url, opts = {}) {
    const res = await fetch(BASE + url, { redirect: 'manual', ...opts, headers: { cookie: this.cookie(), ...(opts.headers || {}) } })
    this.store(res)
    return res
  }
  async json(method, url, body, headers = {}) {
    const res = await this.f(url, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    let j = null
    try {
      j = await res.json()
    } catch {
      /* bukan JSON */
    }
    return { status: res.status, body: j, headers: res.headers }
  }
  async login(email, password = PASSWORD) {
    const csrf = await (await this.f('/api/auth/csrf')).json()
    const res = await this.f('/api/auth/callback/credentials', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrfToken: csrf.csrfToken, email, password, json: 'true' })
    })
    return { status: res.status }
  }
}

let ipCounter = 0
async function connectDb() {
  const mc = await MongoClient.connect(MONGO)
  return { mc, db: mc.db() }
}

// Membuat pengguna terverifikasi yang sudah login. XFF unik agar rate limit register per-IP tidak mengganggu uji.
async function makeUser(db, name) {
  const email = `${name}${Date.now()}${++ipCounter}@e2e.test`.toLowerCase() // server menormalkan email ke huruf kecil
  const C = new Client()
  const r = await fetch(BASE + '/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.18.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
    body: JSON.stringify({ name: 'E2E ' + name, email, password: PASSWORD })
  })
  if (r.status !== 201) throw new Error(`register gagal: ${r.status}`)
  await db.collection('users').updateOne({ email }, { $set: { emailVerified: true } })
  const l = await C.login(email)
  const u = await db.collection('users').findOne({ email })
  return { C, email, id: u._id, name }
}

// Pelaporan hasil: setiap pemeriksaan mencetak PASS/FAIL; skrip keluar non-nol bila ada yang gagal.
const results = []
function check(name, ok, info = '') {
  results.push({ name, ok: !!ok })
  console.log(ok ? 'PASS' : 'FAIL', name, info === '' ? '' : typeof info === 'string' ? info : JSON.stringify(info))
}
function finish() {
  const failed = results.filter((r) => !r.ok).length
  console.log(`\nTOTAL ${results.length - failed}/${results.length} PASS`)
  process.exit(failed ? 1 : 0)
}

module.exports = { BASE, MONGO, PASSWORD, Client, ObjectId, connectDb, makeUser, check, finish }
