import { withApi } from '../../../../../lib/api'
import { reportsService, publicReport } from '../../../../../lib/reportService'

export const dynamic = 'force-dynamic'

// Menjalankan laporan kesiapan sebagai JOB (MTS 23.3): respons 202 segera dengan ID; klien memantau lewat
// GET /reports/:reportId. Satu laporan aktif per proyek. Laporan memakai versi naskah aktif dan venue proyek.
export const POST = withApi(
  async ({ session, params }) => {
    const svc = await reportsService()
    const { report } = await svc.start({ userId: session.user.id, projectId: params.id })
    return { __status: 202, __data: { report: publicReport(report) } }
  },
  { rateLimit: { name: 'report-start', windowMs: 60_000, max: 5 } }
)
