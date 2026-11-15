// Uji webhook Midtrans (tanpa memanggil Midtrans). Butuh server dijalankan dengan
// MIDTRANS_SERVER_KEY=dummy-e2e-key (nilai palsu). Untuk uji "tanpa kunci": jalankan server tanpa variabel itu.
const crypto = require('node:crypto')
const { BASE, connectDb, makeUser, check, finish } = require('./lib')

const KEY = process.env.E2E_MIDTRANS_KEY || 'dummy-e2e-key'
const mode = process.argv[2] || 'with-key'
const sign = (b, key) => crypto.createHash('sha512').update(`${b.order_id}${b.status_code}${b.gross_amount}${key}`).digest('hex')
const post = (b, raw) =>
  fetch(BASE + '/api/payments/webhook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw ?? JSON.stringify(b) })

;(async () => {
  const { mc, db } = await connectDb()
  const U = await makeUser(db, 'pay')
  const orderId = `PUB-${U.id}-${Date.now()}`
  await db.collection('payments').insertOne({ userId: U.id, plan: 'pro_monthly', amount: 99000, status: 'pending', paymentGateway: 'midtrans', gatewayOrderId: orderId, createdAt: new Date(), updatedAt: new Date() })
  const body = { order_id: orderId, status_code: '200', gross_amount: '99000.00', transaction_status: 'settlement', payment_type: 'bank_transfer' }
  const plan = async () => (await db.collection('users').findOne({ _id: U.id })).subscription.plan

  if (mode === 'no-key') {
    const forged = await post({ ...body, signature_key: sign(body, 'undefined') })
    check('tanpa kunci: signature "undefined" ditolak (503)', forged.status === 503, forged.status)
    check('tanpa kunci: paket tetap free', (await plan()) === 'free')
  } else {
    const noSig = await post(body)
    check('tanpa signature -> 401', noSig.status === 401, noSig.status)
    const bad = await post({ ...body, signature_key: 'deadbeef' })
    check('signature salah -> 401', bad.status === 401, bad.status)
    const forged = await post({ ...body, signature_key: sign(body, 'undefined') })
    check('signature "undefined" -> 401', forged.status === 401, forged.status)
    const broken = await post(null, '{rusak')
    check('JSON rusak -> 400', broken.status === 400, broken.status)
    check('paket tetap free setelah semua penolakan', (await plan()) === 'free')
    const ok = await post({ ...body, signature_key: sign(body, KEY) })
    check('signature sah -> 200', ok.status === 200, ok.status)
    check('paket menjadi pro', (await plan()) === 'pro')
    const again = await post({ ...body, signature_key: sign(body, KEY) })
    check('idempoten: notifikasi ulang 200 tanpa memperpanjang dua kali', again.status === 200)
    const end1 = (await db.collection('users').findOne({ _id: U.id })).subscription.endDate
    check('endDate tidak berubah pada notifikasi ulang', +end1 === +(await db.collection('users').findOne({ _id: U.id })).subscription.endDate)
  }
  await db.collection('payments').deleteOne({ gatewayOrderId: orderId })
  await mc.close()
  finish()
})().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
