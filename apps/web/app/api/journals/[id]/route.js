import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { dbConnect, Journal } from '@publication-prepare/db'

export async function GET(_request, { params }) {
  if (!mongoose.isValidObjectId(params.id)) {
    return NextResponse.json({ error: 'Jurnal tidak ditemukan' }, { status: 404 })
  }

  await dbConnect()
  const journal = await Journal.findById(params.id)
  if (!journal) return NextResponse.json({ error: 'Jurnal tidak ditemukan' }, { status: 404 })

  return NextResponse.json(journal)
}
