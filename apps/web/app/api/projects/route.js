import { withApi, readJson, created } from '../../../lib/api'
import { projects } from '../../../lib/projectsService'

export const GET = withApi(async ({ request, session }) => {
  const status = new URL(request.url).searchParams.get('status') || 'active'
  const svc = await projects()
  const items = await svc.listProjects(session.user.id, { status })
  return { projects: items }
})

export const POST = withApi(
  async ({ request, session }) => {
    const body = await readJson(request)
    const svc = await projects()
    return created({ project: await svc.createProject(session.user.id, body) })
  },
  { rateLimit: { name: 'projects-create', windowMs: 60_000, max: 20 } }
)
