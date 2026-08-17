import { NextResponse } from 'next/server'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { dbConnect, User } from '@publication-prepare/db'
import { sendVerificationEmail } from '@publication-prepare/mailer'

export async function POST(request) {
  const { name, email, password, profession, institution } = await request.json()

  if (!name || !email || !password) {
    return NextResponse.json({ error: 'name, email, dan password wajib diisi' }, { status: 400 })
  }

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  if (!isValidEmail) {
    return NextResponse.json({ error: 'Format email tidak valid' }, { status: 400 })
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'Password minimal 8 karakter' }, { status: 400 })
  }

  await dbConnect()

  const existing = await User.findOne({ email: email.toLowerCase() })
  if (existing) {
    return NextResponse.json({ error: 'Email sudah terdaftar' }, { status: 409 })
  }

  const hashedPassword = await bcrypt.hash(password, 10)
  const emailVerificationToken = crypto.randomBytes(32).toString('hex')

  const user = await User.create({
    name,
    email,
    password: hashedPassword,
    profession,
    institution,
    emailVerificationToken
  })

  try {
    await sendVerificationEmail(user.email, user.name, emailVerificationToken)
  } catch (err) {
    console.error('Gagal mengirim email verifikasi:', err.message)
  }

  return NextResponse.json(
    { id: user._id, name: user.name, email: user.email },
    { status: 201 }
  )
}
