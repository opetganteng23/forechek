import { withApi, readJson } from '../../../../../../../lib/api'
import { editsService } from '../../../../../../../lib/editService'

export const dynamic = 'force-dynamic'

// Menerima usulan membuat versi baru (origin ai_edit_accepted). baseRevision wajib (kontrol konkurensi naskah).
export const POST = withApi(
  async ({ request, session, params }) => {
    const body = await readJson(request, 2_000)
    const svc = await editsService()
    const r = await svc.accept({ userId: session.user.id, projectId: params.id, editId: params.editId, baseRevision: body.baseRevision })
    return { edit: r.edit, version: { number: r.version.number }, revision: r.project.revision }
  },
  { rateLimit: { name: 'edit-accept', windowMs: 60_000, max: 30 } }
)
