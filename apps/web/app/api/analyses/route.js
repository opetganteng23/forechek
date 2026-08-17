import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../lib/auth'
import { dbConnect, Analysis, Manuscript, User } from '@publication-prepare/db'
import { analyzeManuscript } from '@publication-prepare/ai'
import { sendAnalysisCompleteEmail } from '@publication-prepare/mailer'
import { hasActiveSubscription } from '../../../lib/subscription'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  await dbConnect()
  const analyses = await Analysis.find({ userId: session.user.id }).sort({ createdAt: -1 })
  return NextResponse.json(analyses)
}

export async function POST(request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const { manuscriptId } = await request.json()
  if (!manuscriptId) {
    return NextResponse.json({ error: 'manuscriptId wajib diisi' }, { status: 400 })
  }

  await dbConnect()

  const user = await User.findById(session.user.id)
  if (!hasActiveSubscription(user) && user.subscription.analysisUsed >= user.subscription.analysisQuota) {
    return NextResponse.json({ error: 'Kuota analisis bulan ini sudah habis' }, { status: 403 })
  }

  const manuscript = await Manuscript.findOne({ _id: manuscriptId, userId: session.user.id })
  if (!manuscript) {
    return NextResponse.json({ error: 'Naskah tidak ditemukan' }, { status: 404 })
  }

  manuscript.status = 'processing'
  await manuscript.save()

  let analysis = await Analysis.create({
    userId: session.user.id,
    manuscriptId: manuscript._id,
    status: 'processing'
  })

  try {
    const result = await analyzeManuscript(manuscript)

    Object.assign(analysis, result, { status: 'completed' })
    await analysis.save()

    manuscript.status = 'analyzed'
    await manuscript.save()

    user.subscription.analysisUsed += 1
    await user.save()

    sendAnalysisCompleteEmail(user.email, user.name, analysis._id, analysis.grade, analysis.overallScore).catch(
      (err) => console.error('Gagal mengirim email hasil analisis:', err.message)
    )
  } catch (err) {
    analysis.status = 'failed'
    analysis.errorMessage = err.message
    await analysis.save()

    manuscript.status = 'failed'
    await manuscript.save()

    return NextResponse.json({ error: 'Analisis gagal', details: err.message }, { status: 500 })
  }

  return NextResponse.json(analysis, { status: 201 })
}
