import { AppError } from '@publication-prepare/core'
import { withApi, readJson, created } from '../../../../../lib/api'
import { projects } from '../../../../../lib/projectsService'

export const GET = withApi(async ({ session, params }) => {
  const svc = await projects()
  return svc.listVersions(session.user.id, params.id)
})

// Batas body 2,5 MB: naskah maksimal 1 MB, tetapi JSON meng-escape karakter sehingga bisa membengkak.
export const POST = withApi(
  async ({ request, session, params }) => {
    const body = await readJson(request, 2_500_000)
    // Asal 'ai_edit_accepted' dan 'restore' hanya boleh dibuat server (terima usulan / pulihkan versi): klien tidak boleh memalsukan jejak asal.
    if (['ai_edit_accepted', 'restore'].includes(body.origin)) throw new AppError('VALIDATION_ERROR', 'origin tidak boleh diatur klien')
    const svc = await projects()
    const result = await svc.saveVersion(session.user.id, params.id, body)
    return result.unchanged ? result : created(result)
  },
  { rateLimit: { name: 'versions-save', windowMs: 60_000, max: 60 } }
)
