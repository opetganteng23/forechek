import { withApi } from '../../../../lib/api'
import { requireAdmin, listAllProjects } from '../../../../lib/adminService'

export const dynamic = 'force-dynamic'

// Pemantauan paper semua pengguna (metadata saja). Hanya admin/superadmin; peran dibaca dari database.
export const GET = withApi(async ({ request, session }) => {
  await requireAdmin(session)
  const sp = new URL(request.url).searchParams
  return listAllProjects({ q: sp.get('q') || '', page: sp.get('page'), limit: sp.get('limit'), status: sp.get('status') || '', type: sp.get('type') || '', language: sp.get('language') || '', owner: sp.get('owner') || '' })
})
