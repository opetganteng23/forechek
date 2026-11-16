'use strict'

// Pemrosesan notifikasi Midtrans yang idempoten dan tahan balapan (audit C). Model (Payment, User) DIINJEKSI sehingga logika dapat diuji
// tanpa database. Aturan:
//  - signature diverifikasi oleh pemanggil SEBELUM fungsi ini dipanggil;
//  - pembayaran "paid" diklaim secara ATOMIK (findOneAndUpdate dengan syarat status bukan paid): hanya satu permintaan yang menang dan
//    memperpanjang langganan, berapa pun notifikasi bersamaan/ulang;
//  - jumlah (gross_amount) harus cocok dengan Payment.amount; bila tidak, ditolak tanpa mengubah apa pun;
//  - perpanjangan langganan memakai satu pembaruan atomik (pipeline) sehingga dua pembayaran berbeda milik pengguna yang sama tidak
//    saling menimpa;
//  - notifikasi expire/deny/cancel hanya boleh mengubah pembayaran yang MASIH pending (tidak pernah menurunkan "paid").
const PLAN_DURATIONS_DAYS = { pro_monthly: 30, pro_yearly: 365, institutional: 365 }
const DAY_MS = 24 * 60 * 60 * 1000

async function processMidtransNotification({ body, Payment, User, now = () => new Date() }) {
  const payment = await Payment.findOne({ gatewayOrderId: body.order_id })
  if (!payment) return { status: 404, body: { error: 'Transaksi tidak ditemukan' } }

  const ts = body.transaction_status
  const isCardFraud = body.payment_type === 'credit_card' && body.fraud_status && body.fraud_status !== 'accept'

  if ((ts === 'settlement' || ts === 'capture') && !isCardFraud) {
    const given = Number(body.gross_amount)
    if (!Number.isFinite(given) || Math.abs(given - payment.amount) > 0.5) {
      return { status: 409, body: { error: 'Jumlah pembayaran tidak cocok' }, amountMismatch: true }
    }
    const paidAt = now()
    const claimed = await Payment.findOneAndUpdate(
      { _id: payment._id, status: { $ne: 'paid' } },
      { $set: { status: 'paid', paidAt, paymentMethod: body.payment_type } },
      { new: true }
    )
    if (!claimed) return { status: 200, body: { received: true }, duplicate: true } // sudah diproses (notifikasi ulang/bersamaan)

    const days = PLAN_DURATIONS_DAYS[payment.plan] || 30
    const plan = payment.plan.startsWith('pro') ? 'pro' : 'institutional'
    await User.updateOne({ _id: payment.userId }, [
      {
        $set: {
          'subscription.endDate': {
            $dateAdd: {
              startDate: { $cond: [{ $gt: [{ $ifNull: ['$subscription.endDate', paidAt] }, paidAt] }, '$subscription.endDate', paidAt] },
              unit: 'day',
              amount: days
            }
          },
          'subscription.startDate': { $ifNull: ['$subscription.startDate', paidAt] },
          'subscription.plan': plan,
          'subscription.isActive': true
        }
      }
    ])
    const user = await User.findById(payment.userId)
    return { status: 200, body: { received: true }, activated: { user, plan: payment.plan, endDate: user && user.subscription && user.subscription.endDate } }
  }

  if (ts === 'expire' || ts === 'deny' || ts === 'cancel') {
    await Payment.findOneAndUpdate({ _id: payment._id, status: 'pending' }, { $set: { status: ts === 'expire' ? 'expired' : 'failed' } })
  }
  return { status: 200, body: { received: true } }
}

module.exports = { processMidtransNotification, PLAN_DURATIONS_DAYS, DAY_MS }
