import { NextResponse } from 'next/server'
import { dbConnect, Journal } from '@publication-prepare/db'

export async function GET(request) {
  const q = request.nextUrl.searchParams.get('q')
  if (!q) return NextResponse.json({ error: 'q wajib diisi' }, { status: 400 })

  await dbConnect()
  const journals = await Journal.find(
    { $text: { $search: q }, isActive: true },
    { score: { $meta: 'textScore' } }
  )
    .sort({ score: { $meta: 'textScore' } })
    .limit(50)

  return NextResponse.json(journals)
}
