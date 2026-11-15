import { withApi, readJson } from '../../../../../../lib/api'
import { literature } from '../../../../../../lib/literatureService'

export const dynamic = 'force-dynamic'

// Pencarian kandidat literatur (bukan referensi terverifikasi). Respons memuat provider, waktu, dan keterbatasan cakupan.
export const POST = withApi(
  async ({ request, session, params }) => {
    const body = await readJson(request, 5_000)
    const svc = await literature()
    return svc.search({ userId: session.user.id, projectId: params.id, params: { query: body.query, yearFrom: body.yearFrom, limit: body.limit, language: body.language } })
  },
  { rateLimit: { name: 'literature-search', windowMs: 60_000, max: 20 } }
)
