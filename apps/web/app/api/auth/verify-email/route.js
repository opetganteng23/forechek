import { NextResponse } from 'next/server'
import { dbConnect, User } from '@publication-prepare/db'

export async function GET(request) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.json({ error: 'Token tidak valid' }, { status: 400 })
  }

  await dbConnect()

  const user = await User.findOne({ emailVerificationToken: token })
  if (!user) {
    return NextResponse.json({ error: 'Token tidak ditemukan atau kedaluwarsa' }, { status: 404 })
  }

  user.emailVerified = true
  user.emailVerificationToken = undefined
  await user.save()

  return NextResponse.json({ message: 'Email berhasil diverifikasi' })
}
