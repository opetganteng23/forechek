import { withApi } from '../../../lib/api'
import { chat } from '../../../lib/chatService'

export const dynamic = 'force-dynamic'

// Pemakaian dan batas kuota bulan berjalan. Angka batas bersifat PROVISIONAL (keputusan D3-02/D3-03).
export const GET = withApi(async ({ session }) => {
  const svc = await chat()
  return svc.getUsage(session.user.id)
})
