import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { dbConnect, User } from '@publication-prepare/db'

export async function POST(request) {
  const { token, password } = await request.json()
  if (!token || !password) {
    return NextResponse.json({ error: 'token dan password wajib diisi' }, { status: 400 })
  }

  await dbConnect()

  const user = await User.findOne({
    passwordResetToken: token,
    passwordResetExpires: { $gt: new Date() }
  })

  if (!user) {
    return NextResponse.json({ error: 'Token tidak valid atau kedaluwarsa' }, { status: 400 })
  }

  user.password = await bcrypt.hash(password, 10)
  user.passwordResetToken = undefined
  user.passwordResetExpires = undefined
  await user.save()

  return NextResponse.json({ message: 'Password berhasil direset' })
}
