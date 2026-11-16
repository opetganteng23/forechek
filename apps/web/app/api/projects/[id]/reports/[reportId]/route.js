import { withApi } from '../../../../../../lib/api'
import { reportsService, publicReport } from '../../../../../../lib/reportService'

export const dynamic = 'force-dynamic'

export const GET = withApi(async ({ session, params }) => {
  const svc = await reportsService()
  return { report: publicReport(await svc.get({ userId: session.user.id, projectId: params.id, reportId: params.reportId })) }
})
