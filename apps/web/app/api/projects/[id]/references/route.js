import { AppError } from '@publication-prepare/core'
import { withApi, readJson, created } from '../../../../../lib/api'
import { literature } from '../../../../../lib/literatureService'

export const dynamic = 'force-dynamic'

export const GET = withApi(async ({ session, params }) => {
  const svc = await literature()
  return { references: await svc.list(session.user.id, params.id) }
})

// Menambah referensi dari kandidat (candidateId). Kandidat diverifikasi ULANG di server; hanya yang `verified` diterima.
export const POST = withApi(
  async ({ request, session, params }) => {
    const body = await readJson(request, 10_000)
    if (typeof body.candidateId !== 'string') throw new AppError('VALIDATION_ERROR', 'candidateId wajib berupa teks')
    const svc = await literature()
    return created({ reference: await svc.addCandidate({ userId: session.user.id, projectId: params.id, candidateId: body.candidateId }) })
  },
  { rateLimit: { name: 'references-add', windowMs: 60_000, max: 30 } }
)
