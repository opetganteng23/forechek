import { withApi, readJson } from '../../../../lib/api'
import { projects } from '../../../../lib/projectsService'
import { deleteProjectData } from '../../../../lib/projectCascade'

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
  const result = await svc.deleteProject(session.user.id, params.id) // memeriksa kepemilikan; 404 bila bukan milik pengguna
  await deleteProjectData(session.user.id, params.id)
  return result
})
