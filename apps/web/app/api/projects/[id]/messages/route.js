import { AppError } from '@publication-prepare/core'
import { withApi } from '../../../../../lib/api'
import { chat, publicMessage } from '../../../../../lib/chatService'

export const dynamic = 'force-dynamic'

// Riwayat chat. Kursor `before` = id pesan (ObjectId) untuk halaman yang lebih lama.
export const GET = withApi(async ({ request, session, params }) => {
  const sp = new URL(request.url).searchParams
  const before = sp.get('before')
  if (before && !/^[0-9a-f]{24}$/i.test(before)) throw new AppError('VALIDATION_ERROR', 'before tidak valid')
  const limit = Number.parseInt(sp.get('limit') || '50', 10)
  const svc = await chat()
  const rows = await svc.listMessages({ userId: session.user.id, projectId: params.id, limit, before })
  return { messages: rows.map(publicMessage) }
})
