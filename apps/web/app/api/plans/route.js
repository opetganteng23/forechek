import { withApi } from '../../../lib/api'
import { getPlanSettings } from '../../../lib/planSettings'

export const dynamic = 'force-dynamic'

// Publik: paket, kuota, dan harga yang berlaku (harga null = belum ditetapkan). Tanpa data internal.
export const GET = withApi(
  async () => {
    const s = await getPlanSettings()
    return { trialPapers: s.trialPapers, plans: s.plans }
  },
  { auth: false, rateLimit: { name: 'plans-public', windowMs: 60_000, max: 120 } }
)
