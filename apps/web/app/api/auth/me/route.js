import { withApi } from '../../../../lib/api'

export const GET = withApi(async ({ session }) => {
  const { id, name, email, role } = session.user
  return { id, name, email, role }
})
