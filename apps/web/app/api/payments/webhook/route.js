import { NextResponse } from 'next/server'
import { dbConnect, Payment, User } from '@publication-prepare/db'
import { verifyMidtransSignature, processMidtransNotification } from '@publication-prepare/core'
import { sendPaymentConfirmationEmail } from '@publication-prepare/mailer'

export async function POST(request) {
  // Tanpa kunci server, signature tidak dapat diverifikasi: tolak (jangan pernah menerima payload tanpa verifikasi).
  if (!process.env.MIDTRANS_SERVER_KEY) {
    return NextResponse.json({ error: 'Pembayaran belum dikonfigurasi' }, { status: 503 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body harus berupa JSON yang valid' }, { status: 400 })
  }

  if (!verifyMidtransSignature(body, process.env.MIDTRANS_SERVER_KEY)) {
    return NextResponse.json({ error: 'Signature tidak valid' }, { status: 401 })
  }

  await dbConnect()
  // Klaim atomik + cek jumlah + perpanjangan atomik: lihat packages/core/src/paymentWebhook.js (idempoten walau notifikasi bersamaan).
  const r = await processMidtransNotification({ body, Payment, User })
  if (r.activated && r.activated.user) {
    sendPaymentConfirmationEmail(r.activated.user.email, r.activated.user.name, r.activated.plan, r.activated.endDate).catch((err) =>
      console.error('Gagal mengirim email konfirmasi pembayaran:', err.message)
    )
  }
  return NextResponse.json(r.body, { status: r.status })
}
