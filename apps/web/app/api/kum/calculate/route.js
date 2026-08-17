import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../lib/auth'
import { calculateKum } from '../../../../lib/kum'
import { hasActiveSubscription } from '../../../../lib/subscription'
import { dbConnect, KumCalculation, User } from '@publication-prepare/db'

export async function POST(request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  await dbConnect()
  const user = await User.findById(session.user.id)
  if (!hasActiveSubscription(user)) {
    return NextResponse.json({ error: 'Kalkulator KUM adalah fitur Pro' }, { status: 403 })
  }

  const { publicationType, authorPosition, totalAuthors, notes, reference } = await request.json()
  if (!publicationType || !authorPosition || !totalAuthors) {
    return NextResponse.json(
      { error: 'publicationType, authorPosition, dan totalAuthors wajib diisi' },
      { status: 400 }
    )
  }

  let kumValue
  try {
    kumValue = calculateKum({ publicationType, authorPosition, totalAuthors })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }

  const calculation = await KumCalculation.create({
    userId: session.user.id,
    publicationType,
    authorPosition,
    totalAuthors,
    kumValue,
    notes,
    reference
  })

  return NextResponse.json(calculation, { status: 201 })
}
