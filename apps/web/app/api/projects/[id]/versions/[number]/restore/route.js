import { withApi, readJson, created } from '../../../../../../../lib/api'
import { projects } from '../../../../../../../lib/projectsService'

export const POST = withApi(
  async ({ request, session, params }) => {
    const body = await readJson(request)
    const svc = await projects()
    return created(await svc.restoreVersion(session.user.id, params.id, Number(params.number), body.baseRevision))
  },
  { rateLimit: { name: 'versions-restore', windowMs: 60_000, max: 20 } }
)
