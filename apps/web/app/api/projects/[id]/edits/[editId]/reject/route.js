import { withApi } from '../../../../../../../lib/api'
import { editsService } from '../../../../../../../lib/editService'

export const dynamic = 'force-dynamic'

export const POST = withApi(
  async ({ session, params }) => {
    const svc = await editsService()
    return { edit: await svc.reject({ userId: session.user.id, projectId: params.id, editId: params.editId }) }
  },
  { rateLimit: { name: 'edit-reject', windowMs: 60_000, max: 60 } }
)
