import { withApi } from '../../../../../lib/api'
import { editsService } from '../../../../../lib/editService'

export const dynamic = 'force-dynamic'

// Usulan edit dibuat oleh agen (tool propose_edit); API hanya membaca dan memutuskan.
export const GET = withApi(async ({ session, params }) => {
  const svc = await editsService()
  return { edits: await svc.list({ userId: session.user.id, projectId: params.id }) }
})
