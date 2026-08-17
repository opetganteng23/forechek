import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { dbConnect, User } from '@publication-prepare/db'
import { sendPasswordResetEmail } from '@publication-prepare/mailer'

export async function POST(request) {
  const { email } = await request.json()
  if (!email) {
    return NextResponse.json({ error: 'email wajib diisi' }, { status: 400 })
  }

  await dbConnect()

  const user = await User.findOne({ email: email.toLowerCase() })
  // Selalu balas sukses agar tidak membocorkan keberadaan akun.
  if (user) {
    const token = crypto.randomBytes(32).toString('hex')
    user.passwordResetToken = token
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000)
    await user.save()

    try {
      await sendPasswordResetEmail(user.email, user.name, token)
    } catch (err) {
      console.error('Gagal mengirim email reset password:', err.message)
    }
  }

  return NextResponse.json({ message: 'Jika email terdaftar, instruksi reset telah dikirim' })
}
