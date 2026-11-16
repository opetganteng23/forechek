// Uji kepercayaan proxy untuk batas laju (QA-05). Jalankan terhadap dua server dengan DB yang sama:
//   BASE_URL=http://localhost:3001 EXPECT_TRUST=false node scripts/e2e/proxy.js   (server dengan TRUST_PROXY=false)
//   BASE_URL=http://localhost:3000 EXPECT_TRUST=true  node scripts/e2e/proxy.js   (server dengan TRUST_PROXY=true)
const { BASE, check, finish } = require('./lib')

const trust = process.env.EXPECT_TRUST === 'true'
const reg = async (xff, i) => {
  const r = await fetch(BASE + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': xff }, body: JSON.stringify({ name: 'Proxy', email: `px${Date.now()}${i}@e2e.test`, password: 'Passw0rd!long1' }) })
  return r.status
}

;(async () => {
  if (!trust) {
    // Dengan bucket bersama diskalakan (x50), XFF yang diabaikan diverifikasi pada tes unit core (resolveClientIp); di sini: pengguna sah tidak terkunci.
    // T7-01: bucket 'unknown' bersama tidak boleh mengunci pengguna sah: 15 pengguna berbeda harus bisa login
    const { connectDb, makeUser } = require('./lib')
    const { mc, db } = await connectDb()
    const users = []
    try {
      for (let i = 0; i < 15; i++) users.push(await makeUser(db, `px15u${i}`))
    } catch (e) {
      users.push({ error: String(e.message) })
    }
    const ok = []
    for (const u of users) ok.push(u.error ? u.error : (await u.C.json('GET', '/api/projects')).status)
    check('tanpa TRUST_PROXY: 15 pengguna berbeda semuanya dapat login (bucket bersama diskalakan, bukan 10 per 15 menit untuk semua)', users.length === 15 && ok.every((x) => x === 200), ok)
    await mc.close()
  } else {
    const s = []
    const base = `203.0.113.${Math.floor(Math.random() * 200) + 1}`
    for (let i = 0; i < 8; i++) s.push(await reg(`10.9.9.${i + 1}, ${base}`, i)) // klien memalsukan entri kiri; proxy menambah kanan (tetap)
    check('dengan TRUST_PROXY: entri kiri dipalsukan tidak melewati batas (kunci = entri kanan tepercaya)', s.filter((x) => x === 429).length >= 3, s)
    const other = await reg('10.9.9.1, 203.0.113.250', 99)
    check('klien lain (entri kanan berbeda) tidak ikut terblokir', other === 201, other)
  }
  finish()
})().catch((e) => { console.error('FATAL', e); process.exit(1) })
