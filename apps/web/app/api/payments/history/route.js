import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../lib/auth'
import { dbConnect, Payment } from '@publication-prepare/db'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  await dbConnect()
  const history = await Payment.find({ userId: session.user.id }).sort({ createdAt: -1 })
  return NextResponse.json(history)
}
