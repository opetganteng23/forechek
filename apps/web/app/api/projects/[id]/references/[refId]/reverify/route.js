import { withApi } from '../../../../../../../lib/api'
import { literature } from '../../../../../../../lib/literatureService'

export const dynamic = 'force-dynamic'

export const POST = withApi(
  async ({ session, params }) => {
    const svc = await literature()
    return { reference: await svc.reverify({ userId: session.user.id, projectId: params.id, refId: params.refId }) }
  },
  { rateLimit: { name: 'references-reverify', windowMs: 60_000, max: 20 } }
)
