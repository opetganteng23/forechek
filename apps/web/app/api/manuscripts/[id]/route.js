import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { v2 as cloudinary } from 'cloudinary'
import { authOptions } from '../../../../lib/auth'
import { dbConnect, Manuscript } from '@publication-prepare/db'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})

export async function GET(_request, { params }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  await dbConnect()
  const manuscript = await Manuscript.findOne({ _id: params.id, userId: session.user.id })
  if (!manuscript) return NextResponse.json({ error: 'Naskah tidak ditemukan' }, { status: 404 })

  return NextResponse.json(manuscript)
}

export async function DELETE(_request, { params }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  await dbConnect()
  const manuscript = await Manuscript.findOneAndDelete({ _id: params.id, userId: session.user.id })
  if (!manuscript) return NextResponse.json({ error: 'Naskah tidak ditemukan' }, { status: 404 })

  if (manuscript.filePublicId) {
    cloudinary.uploader.destroy(manuscript.filePublicId, { resource_type: 'raw' }).catch((err) =>
      console.error('Gagal menghapus asset Cloudinary:', err.message)
    )
  }

  return NextResponse.json({ message: 'Naskah dihapus' })
}
