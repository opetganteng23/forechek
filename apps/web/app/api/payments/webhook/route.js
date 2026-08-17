import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { dbConnect, Payment, User } from '@publication-prepare/db'
import { sendPaymentConfirmationEmail } from '@publication-prepare/mailer'

function isValidSignature({ order_id, status_code, gross_amount, signature_key }) {
  const raw = `${order_id}${status_code}${gross_amount}${process.env.MIDTRANS_SERVER_KEY}`
  const expected = crypto.createHash('sha512').update(raw).digest('hex')
  return expected === signature_key
}

const PLAN_DURATIONS_DAYS = { pro_monthly: 30, pro_yearly: 365, institutional: 365 }

export async function POST(request) {
  const body = await request.json()

  if (!isValidSignature(body)) {
    return NextResponse.json({ error: 'Signature tidak valid' }, { status: 401 })
  }

  await dbConnect()

  const payment = await Payment.findOne({ gatewayOrderId: body.order_id })
  if (!payment) return NextResponse.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 })

  // Idempoten: Midtrans dapat mengirim notifikasi yang sama lebih dari sekali.
  if (payment.status === 'paid') {
    return NextResponse.json({ received: true })
  }

  const transactionStatus = body.transaction_status
  const isCardFraud = body.payment_type === 'credit_card' && body.fraud_status && body.fraud_status !== 'accept'

  if ((transactionStatus === 'settlement' || transactionStatus === 'capture') && !isCardFraud) {
    payment.status = 'paid'
    payment.paidAt = new Date()
    payment.paymentMethod = body.payment_type
    await payment.save()

    const user = await User.findById(payment.userId)
    const days = PLAN_DURATIONS_DAYS[payment.plan] || 30
    const currentEndDate = user.subscription.endDate
    const renewalBase = currentEndDate && currentEndDate > new Date() ? currentEndDate.getTime() : Date.now()
    const endDate = new Date(renewalBase + days * 24 * 60 * 60 * 1000)

    user.subscription.plan = payment.plan.startsWith('pro') ? 'pro' : 'institutional'
    user.subscription.isActive = true
    user.subscription.startDate = user.subscription.startDate || new Date()
    user.subscription.endDate = endDate
    await user.save()

    sendPaymentConfirmationEmail(user.email, user.name, payment.plan, endDate).catch((err) =>
      console.error('Gagal mengirim email konfirmasi pembayaran:', err.message)
    )
  } else if (transactionStatus === 'expire') {
    payment.status = 'expired'
    await payment.save()
  } else if (transactionStatus === 'deny' || transactionStatus === 'cancel') {
    payment.status = 'failed'
    await payment.save()
  }

  return NextResponse.json({ received: true })
}
