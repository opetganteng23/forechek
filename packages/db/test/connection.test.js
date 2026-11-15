const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const connPath = path.join(__dirname, '..', 'connection.js')
const mongoosePath = require.resolve('mongoose', { paths: [path.join(__dirname, '..')] })

// Memuat ulang connection.js dengan mongoose palsu agar tidak perlu database.
function load(connectImpl) {
  delete global._mongooseConn
  delete require.cache[connPath]
  const calls = []
  require.cache[mongoosePath] = {
    id: mongoosePath,
    filename: mongoosePath,
    loaded: true,
    exports: { connect: (uri, opts) => (calls.push({ uri, opts }), connectImpl(calls.length)) }
  }
  process.env.MONGODB_URI = 'mongodb://localhost:27017/dummy_test'
  return { dbConnect: require(connPath), calls }
}

test('regresi QA-04: kegagalan koneksi pertama tidak permanen (mencoba lagi pada panggilan berikutnya)', async () => {
  const { dbConnect, calls } = load((n) => (n === 1 ? Promise.reject(new Error('ECONNREFUSED')) : Promise.resolve({ ok: n })))
  await assert.rejects(() => dbConnect(), /ECONNREFUSED/)
  const conn = await dbConnect()
  assert.deepEqual(conn, { ok: 2 })
  assert.equal(calls.length, 2)
})

test('koneksi berhasil dipakai ulang (satu connect untuk banyak panggilan, termasuk paralel)', async () => {
  const { dbConnect, calls } = load(() => Promise.resolve({ ok: true }))
  await Promise.all([dbConnect(), dbConnect(), dbConnect()])
  await dbConnect()
  assert.equal(calls.length, 1)
})

test('regresi QA-15: serverSelectionTimeoutMS dibatasi (bukan default 30 detik)', async () => {
  const { dbConnect, calls } = load(() => Promise.resolve({}))
  await dbConnect()
  const t = calls[0].opts.serverSelectionTimeoutMS
  assert.ok(Number.isFinite(t) && t > 0 && t <= 10000, `serverSelectionTimeoutMS=${t}`)
  assert.equal(calls[0].opts.bufferCommands, false)
})

test('MONGODB_URI kosong melempar galat jelas tanpa memanggil connect', async () => {
  const { dbConnect, calls } = load(() => Promise.resolve({}))
  delete require.cache[connPath]
  delete global._mongooseConn
  delete process.env.MONGODB_URI
  const fresh = require(connPath)
  await assert.rejects(() => fresh(), /MONGODB_URI/)
  assert.equal(calls.length, 0)
})
