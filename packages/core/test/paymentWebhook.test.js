'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { processMidtransNotification } = require('../index')

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-11-16T00:00:00Z')

function env({ amount = 99000, plan = 'pro_monthly', status = 'pending', endDate = null } = {}) {
  const payment = { _id: 'p1', userId: 'u1', plan, amount, status, gatewayOrderId: 'ORD-1' }
  const user = { _id: 'u1', email: 'a@b.co', subscription: { plan: 'free', isActive: false, endDate, startDate: null } }
  let extensions = 0
  const tick = () => new Promise((r) => setImmediate(r)) // celah balapan nyata antara baca dan tulis
  const Payment = {
    async findOne(q) { await tick(); return q.gatewayOrderId === payment.gatewayOrderId ? { ...payment } : null },
    // findOneAndUpdate bersifat ATOMIK (seperti di MongoDB): cek syarat dan tulis tanpa celah
    async findOneAndUpdate(filter, update) {
      const okStatus = filter.status === undefined ? true : filter.status.$ne !== undefined ? payment.status !== filter.status.$ne : payment.status === filter.status
      if (payment._id !== filter._id || !okStatus) return null
      Object.assign(payment, update.$set)
      return { ...payment }
    }
  }
  const User = {
    async updateOne(filter, pipeline) {
      extensions++
      const set = pipeline[0].$set
      const paidAt = payment.paidAt
      const base = user.subscription.endDate && user.subscription.endDate > paidAt ? user.subscription.endDate : paidAt
      const days = set['subscription.endDate'].$dateAdd.amount
      user.subscription.endDate = new Date(base.getTime() + days * DAY)
      user.subscription.startDate = user.subscription.startDate || paidAt
      user.subscription.plan = set['subscription.plan']
      user.subscription.isActive = set['subscription.isActive']
    },
    async findById() { return user }
  }
  return { payment, user, Payment, User, ext: () => extensions }
}
const body = (o = {}) => ({ order_id: 'ORD-1', status_code: '200', gross_amount: '99000.00', transaction_status: 'settlement', payment_type: 'bank_transfer', ...o })
const run = (e, b) => processMidtransNotification({ body: b, Payment: e.Payment, User: e.User, now: () => NOW })

test('settlement sah: pembayaran paid dan langganan diperpanjang tepat 30 hari', async () => {
  const e = env()
  const r = await run(e, body())
  assert.equal(r.status, 200)
  assert.equal(e.payment.status, 'paid')
  assert.equal(+e.user.subscription.endDate, +NOW + 30 * DAY)
  assert.equal(e.user.subscription.plan, 'pro')
  assert.ok(r.activated)
})

test('10 notifikasi settlement BERSAMAAN (Promise.all): langganan diperpanjang tepat sekali', async () => {
  const e = env()
  const rs = await Promise.all(Array.from({ length: 10 }, () => run(e, body())))
  assert.equal(rs.every((r) => r.status === 200), true)
  assert.equal(rs.filter((r) => r.activated).length, 1, 'hanya satu pemenang klaim')
  assert.equal(e.ext(), 1, 'pembaruan langganan hanya sekali')
  assert.equal(+e.user.subscription.endDate, +NOW + 30 * DAY, 'tidak 60/90/... hari')
})

test('notifikasi ulang sesudah paid: 200 tanpa perubahan (idempoten)', async () => {
  const e = env()
  await run(e, body())
  const end = +e.user.subscription.endDate
  const r = await run(e, body())
  assert.equal(r.status, 200)
  assert.equal(r.duplicate, true)
  assert.equal(+e.user.subscription.endDate, end)
})

test('jumlah tidak cocok ditolak (409) dan tidak mengubah pembayaran/langganan', async () => {
  const e = env()
  for (const g of ['1000.00', '99000.99', 'abc', '']) {
    const r = await run(e, body({ gross_amount: g }))
    assert.equal(r.status, 409, g)
  }
  assert.equal(e.payment.status, 'pending')
  assert.equal(e.user.subscription.isActive, false)
  assert.equal(e.ext(), 0)
})

test('perpanjangan menumpuk pada langganan yang masih aktif', async () => {
  const e = env({ endDate: new Date(+NOW + 10 * DAY) })
  await run(e, body())
  assert.equal(+e.user.subscription.endDate, +NOW + 40 * DAY)
})

test('expire/deny/cancel hanya mengubah pembayaran pending; tidak pernah menurunkan paid', async () => {
  const e1 = env()
  await run(e1, body({ transaction_status: 'expire' }))
  assert.equal(e1.payment.status, 'expired')
  const e2 = env()
  await run(e2, body())
  await run(e2, body({ transaction_status: 'expire' }))
  await run(e2, body({ transaction_status: 'cancel' }))
  assert.equal(e2.payment.status, 'paid')
  const e3 = env()
  await run(e3, body({ transaction_status: 'deny' }))
  assert.equal(e3.payment.status, 'failed')
})

test('order tidak dikenal -> 404; kartu kredit dengan fraud_status bukan accept tidak mengaktifkan langganan', async () => {
  const e = env()
  assert.equal((await run(e, body({ order_id: 'LAIN' }))).status, 404)
  const r = await run(e, body({ payment_type: 'credit_card', fraud_status: 'challenge' }))
  assert.equal(r.status, 200)
  assert.equal(e.payment.status, 'pending')
  assert.equal(e.ext(), 0)
})
