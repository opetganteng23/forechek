import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../../lib/auth'
import { dbConnect, Analysis } from '@publication-prepare/db'

export async function GET(_request, { params }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  await dbConnect()
  const analysis = await Analysis.findOne({ _id: params.id, userId: session.user.id })
  if (!analysis) return NextResponse.json({ error: 'Analisis tidak ditemukan' }, { status: 404 })

  if (!analysis.pdfReportUrl) {
    return NextResponse.json({ error: 'Laporan PDF belum tersedia untuk analisis ini' }, { status: 404 })
  }

  return NextResponse.redirect(analysis.pdfReportUrl)
}
