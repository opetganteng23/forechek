import { AppError } from '@publication-prepare/core'
import { withApi, readJson } from '../../../../../../lib/api'
import { literature } from '../../../../../../lib/literatureService'

export const dynamic = 'force-dynamic'

// Edit metadata manual: status verifikasi turun ke unverified sampai diverifikasi ulang (MTS 39.2 D).
export const PATCH = withApi(async ({ request, session, params }) => {
  const body = await readJson(request, 20_000)
  if (body.authors !== undefined && !Array.isArray(body.authors)) throw new AppError('VALIDATION_ERROR', 'authors harus array')
  const svc = await literature()
  return { reference: await svc.updateMetadata({ userId: session.user.id, projectId: params.id, refId: params.refId, patch: body }) }
}, { rateLimit: { name: 'references-edit', windowMs: 60_000, max: 30 } })

export const DELETE = withApi(async ({ session, params }) => {
  const svc = await literature()
  return svc.remove({ userId: session.user.id, projectId: params.id, refId: params.refId })
}, { rateLimit: { name: 'references-delete', windowMs: 60_000, max: 30 } })
