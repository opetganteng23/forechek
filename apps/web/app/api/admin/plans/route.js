import { withApi, readJson } from '../../../../lib/api'
import { requireSuperAdmin } from '../../../../lib/adminService'
import { getPlanSettings, savePlanSettings } from '../../../../lib/planSettings'

export const dynamic = 'force-dynamic'

// Pengaturan paket: hanya SUPERADMIN (peran dibaca dari database). Nilai tersimpan menimpa default konfigurasi.
export const GET = withApi(async ({ session }) => {
  await requireSuperAdmin(session)
  return { settings: await getPlanSettings({ fresh: true }) }
})

export const PUT = withApi(
  async ({ request, session }) => {
    const admin = await requireSuperAdmin(session)
    return { settings: await savePlanSettings(admin.id, await readJson(request, 20_000)) }
  },
  { rateLimit: { name: 'admin-plans', windowMs: 60_000, max: 30 } }
)
