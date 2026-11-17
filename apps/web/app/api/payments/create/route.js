import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import midtransClient from 'midtrans-client'
import { authOptions } from '../../../../lib/auth'
import { dbConnect, Payment } from '@publication-prepare/db'
import { getPlanSettings } from '../../../../lib/planSettings'

// Harga dibaca dari pengaturan paket (diatur superadmin); null = belum ditetapkan, pembayaran ditolak.
const amountFor = async (plan) => {
  const p = (await getPlanSettings()).plans
  return { pro_monthly: p.pro.priceMonthlyIdr, pro_yearly: p.pro.priceYearlyIdr, institutional: p.institutional.priceMonthlyIdr }[plan]
}

export async function POST(request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const { plan } = await request.json()
  const amount = await amountFor(plan)
  if (!amount) return NextResponse.json({ error: 'Paket tidak valid atau harga belum ditetapkan' }, { status: 400 })

  await dbConnect()

  const orderId = `PUB-${session.user.id}-${Date.now()}`
  const payment = await Payment.create({
    userId: session.user.id,
    plan,
    amount,
    status: 'pending',
    paymentGateway: 'midtrans',
    gatewayOrderId: orderId,
    expiredAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
  })

  const snap = new midtransClient.Snap({
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY
  })

  const transaction = await snap.createTransaction({
    transaction_details: { order_id: orderId, gross_amount: amount },
    customer_details: { email: session.user.email, first_name: session.user.name }
  })

  payment.gatewayTransactionId = transaction.token
  await payment.save()

  return NextResponse.json({ paymentId: payment._id, redirectUrl: transaction.redirect_url })
}
