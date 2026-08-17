import { NextResponse } from 'next/server'
import { dbConnect, Journal } from '@publication-prepare/db'

export async function GET(request) {
  const { searchParams } = request.nextUrl
  const page = Number(searchParams.get('page') || 1)
  const limit = Number(searchParams.get('limit') || 20)
  const sintaLevel = searchParams.get('sinta')
  const scopusQuartile = searchParams.get('scopus')
  const subject = searchParams.get('subject')

  const filter = { isActive: true }
  if (sintaLevel) filter['ranking.sinta.level'] = Number(sintaLevel)
  if (scopusQuartile) filter['ranking.scopus.quartile'] = scopusQuartile
  if (subject) filter.subjects = subject

  await dbConnect()

  const [journals, total] = await Promise.all([
    Journal.find(filter)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ name: 1 }),
    Journal.countDocuments(filter)
  ])

  return NextResponse.json({ journals, total, page, limit })
}
