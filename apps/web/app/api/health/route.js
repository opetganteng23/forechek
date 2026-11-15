import { NextResponse } from 'next/server'
import { dbConnect } from '@publication-prepare/db'
import { newRequestId } from '@publication-prepare/core'

export const dynamic = 'force-dynamic'

// Health check publik: hanya status ringkas, tanpa detail konfigurasi atau pesan error.
export async function GET() {
  const requestId = newRequestId()
  let db = 'ok'
  try {
    const m = await dbConnect()
    if (m.connection.readyState !== 1) db = 'error'
  } catch {
    db = 'error'
  }
  const healthy = db === 'ok'
  return NextResponse.json(
    { success: healthy, data: { status: healthy ? 'ok' : 'degraded', checks: { db }, time: new Date().toISOString() }, error: null, requestId },
    { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store', 'x-request-id': requestId } }
  )
}
