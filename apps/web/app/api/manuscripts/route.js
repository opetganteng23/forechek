import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { v2 as cloudinary } from 'cloudinary'
import { authOptions } from '../../../lib/auth'
import { parseManuscriptFile } from '../../../lib/fileParser'
import { dbConnect, Manuscript } from '@publication-prepare/db'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  await dbConnect()
  const manuscripts = await Manuscript.find({ userId: session.user.id }).sort({ createdAt: -1 })
  return NextResponse.json(manuscripts)
}

export async function POST(request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file')
  const title = formData.get('title')
  const fieldOfStudy = formData.get('fieldOfStudy')
  const targetJournalType = formData.get('targetJournalType') || 'any'
  const language = formData.get('language') || 'indonesia'

  if (!file || !title) {
    return NextResponse.json({ error: 'file dan title wajib diisi' }, { status: 400 })
  }

  const lowerName = file.name.toLowerCase()
  const fileType = lowerName.endsWith('.pdf') ? 'pdf' : lowerName.endsWith('.docx') ? 'docx' : null
  if (!fileType) {
    return NextResponse.json({ error: 'Hanya file PDF atau DOCX yang diterima' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  // Parse dulu sebelum upload agar file yang gagal dibaca tidak menghasilkan asset yatim di Cloudinary.
  let extractedText
  try {
    extractedText = await parseManuscriptFile(buffer, fileType)
  } catch (err) {
    return NextResponse.json(
      { error: 'File tidak dapat dibaca. Pastikan file tidak rusak atau terkunci password.', details: err.message },
      { status: 422 }
    )
  }

  let uploadResult
  try {
    uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { resource_type: 'raw', folder: 'manuscripts' },
        (err, result) => (err ? reject(err) : resolve(result))
      )
      uploadStream.end(buffer)
    })
  } catch (err) {
    return NextResponse.json({ error: 'Gagal mengunggah file', details: err.message }, { status: 502 })
  }

  await dbConnect()
  const manuscript = await Manuscript.create({
    userId: session.user.id,
    title,
    fileUrl: uploadResult.secure_url,
    filePublicId: uploadResult.public_id,
    fileName: file.name,
    fileSize: buffer.length,
    fileType,
    extractedText,
    targetJournalType,
    fieldOfStudy,
    language,
    status: 'uploaded'
  })

  return NextResponse.json(manuscript, { status: 201 })
}
