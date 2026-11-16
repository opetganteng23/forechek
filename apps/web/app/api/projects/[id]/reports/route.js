import { withApi } from '../../../../../lib/api'
import { reportsService, publicReport } from '../../../../../lib/reportService'

export const dynamic = 'force-dynamic'

// Riwayat laporan (ringkasan tanpa rincian pemeriksaan/kriteria).
export const GET = withApi(async ({ request, session, params }) => {
  const limit = Number.parseInt(new URL(request.url).searchParams.get('limit') || '20', 10)
  const svc = await reportsService()
  const rows = await svc.list({ userId: session.user.id, projectId: params.id, limit })
  return { reports: rows.map((r) => publicReport(r, { full: false })) }
})
