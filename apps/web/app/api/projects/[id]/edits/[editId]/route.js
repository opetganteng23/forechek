import { withApi } from '../../../../../../lib/api'
import { editsService } from '../../../../../../lib/editService'

export const dynamic = 'force-dynamic'

export const GET = withApi(async ({ session, params }) => {
  const svc = await editsService()
  return { edit: await svc.get({ userId: session.user.id, projectId: params.id, editId: params.editId }) }
})
