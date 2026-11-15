import { withApi } from '../../../../../../lib/api'
import { projects } from '../../../../../../lib/projectsService'

export const GET = withApi(async ({ session, params }) => {
  const svc = await projects()
  return { version: await svc.getVersion(session.user.id, params.id, Number(params.number)) }
})
