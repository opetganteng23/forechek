import { withApi, readJson, created } from '../../../../lib/api'
import { requireAdmin, listUsers, createUser } from '../../../../lib/adminService'

export const dynamic = 'force-dynamic'

// Hanya admin (peran dibaca dari database). Daftar pengguna tidak pernah memuat password/token.
export const GET = withApi(async ({ request, session }) => {
  await requireAdmin(session)
  const sp = new URL(request.url).searchParams
  return listUsers({ q: sp.get('q') || '', page: sp.get('page'), limit: sp.get('limit'), role: sp.get('role') || '', status: sp.get('status') || '', plan: sp.get('plan') || '' })
})

export const POST = withApi(
  async ({ request, session }) => {
    const admin = await requireAdmin(session)
    return created({ user: await createUser(admin, await readJson(request, 5_000)) })
  },
  { rateLimit: { name: 'admin-create-user', windowMs: 60_000, max: 20 } }
)
