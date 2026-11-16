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
  const U = await makeUser(db, 'pay', { trial: true })
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
    const wrongAmt = { ...body, gross_amount: '1000.00' }
    const wa = await post({ ...wrongAmt, signature_key: sign(wrongAmt, KEY) })
    check('signature sah tetapi jumlah tidak cocok -> 409 dan paket tetap free', wa.status === 409 && (await plan()) === 'free', wa.status)
    const ok = await post({ ...body, signature_key: sign(body, KEY) })
    check('signature sah -> 200', ok.status === 200, ok.status)
    check('paket menjadi pro', (await plan()) === 'pro')
    const end1 = +(await db.collection('users').findOne({ _id: U.id })).subscription.endDate
    const again = await post({ ...body, signature_key: sign(body, KEY) })
    check('idempoten: notifikasi ulang -> 200', again.status === 200)
    check('endDate tidak berubah pada notifikasi ulang', end1 === +(await db.collection('users').findOne({ _id: U.id })).subscription.endDate)
    // Balapan: 12 notifikasi settlement BERSAMAAN untuk pesanan baru -> langganan bertambah tepat sekali (30 hari).
    const order2 = `PUB-${U.id}-${Date.now()}-2`
    await db.collection('payments').insertOne({ userId: U.id, plan: 'pro_monthly', amount: 99000, status: 'pending', paymentGateway: 'midtrans', gatewayOrderId: order2, createdAt: new Date(), updatedAt: new Date() })
    const b2 = { ...body, order_id: order2 }
    const endBefore = +(await db.collection('users').findOne({ _id: U.id })).subscription.endDate
    const rs = await Promise.all(Array.from({ length: 12 }, () => post({ ...b2, signature_key: sign(b2, KEY) })))
    const endAfter = +(await db.collection('users').findOne({ _id: U.id })).subscription.endDate
    check('12 notifikasi bersamaan: semua 200', rs.every((r) => r.status === 200), rs.map((r) => r.status))
    check('12 notifikasi bersamaan: endDate bertambah TEPAT 30 hari (bukan 30 x N)', endAfter - endBefore === 30 * 24 * 3600 * 1000, (endAfter - endBefore) / 86400000)
    check('12 notifikasi bersamaan: pembayaran paid tepat satu', (await db.collection('payments').countDocuments({ gatewayOrderId: order2, status: 'paid' })) === 1)
    await db.collection('payments').deleteOne({ gatewayOrderId: order2 })
    // expire sesudah paid tidak menurunkan status
    const ex = { ...body, transaction_status: 'expire' }
    await post({ ...ex, signature_key: sign(ex, KEY) })
    check('expire setelah paid tidak menurunkan status paid', (await db.collection('payments').findOne({ gatewayOrderId: orderId })).status === 'paid')
  }
  await db.collection('payments').deleteOne({ gatewayOrderId: orderId })
  await mc.close()
  finish()
})().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
