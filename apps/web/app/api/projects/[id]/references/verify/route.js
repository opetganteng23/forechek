import { AppError } from '@publication-prepare/core'
import { withApi, readJson, created } from '../../../../../../lib/api'
import { literature } from '../../../../../../lib/literatureService'

export const dynamic = 'force-dynamic'

// Verifikasi manual (MTS 12): referensi buatan pengguna. add=true menyimpan hasilnya APA ADANYA (termasuk unverified,
// ditandai jelas); tidak pernah dinaikkan menjadi verified tanpa bukti.
export const POST = withApi(
  async ({ request, session, params }) => {
    const body = await readJson(request, 20_000)
    if (body.add !== undefined && typeof body.add !== 'boolean') throw new AppError('VALIDATION_ERROR', 'add harus boolean')
    const { add, ...input } = body
    const svc = await literature()
    const out = await svc.verifyManual({ userId: session.user.id, projectId: params.id, input, add: add === true })
    return add === true ? created(out) : out
  },
  { rateLimit: { name: 'references-verify', windowMs: 60_000, max: 20 } }
)
