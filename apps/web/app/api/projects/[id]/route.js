import { withApi, readJson } from '../../../../lib/api'
import { projects } from '../../../../lib/projectsService'

export const GET = withApi(async ({ session, params }) => {
  const svc = await projects()
  return svc.getProject(session.user.id, params.id)
})

export const PATCH = withApi(async ({ request, session, params }) => {
  const body = await readJson(request)
  const svc = await projects()
  return { project: await svc.updateProject(session.user.id, params.id, body) }
})

export const DELETE = withApi(async ({ session, params }) => {
  const svc = await projects()
  return svc.deleteProject(session.user.id, params.id)
})
