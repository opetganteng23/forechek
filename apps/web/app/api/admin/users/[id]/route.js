import { withApi, readJson } from '../../../../../lib/api'
import { requireAdmin, updateUser, deleteUser } from '../../../../../lib/adminService'

export const dynamic = 'force-dynamic'

export const PATCH = withApi(
  async ({ request, session, params }) => {
    const admin = await requireAdmin(session)
    return { user: await updateUser(admin, params.id, await readJson(request, 5_000)) }
  },
  { rateLimit: { name: 'admin-update-user', windowMs: 60_000, max: 60 } }
)

export const DELETE = withApi(
  async ({ request, session, params }) => {
    const admin = await requireAdmin(session)
    const body = await readJson(request, 2_000)
    return deleteUser(admin, params.id, body.confirmEmail)
  },
  { rateLimit: { name: 'admin-delete-user', windowMs: 60_000, max: 20 } }
)
