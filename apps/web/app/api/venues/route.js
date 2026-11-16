import { withApi } from '../../../lib/api'
import { listVenues } from '../../../lib/venueService'

export const dynamic = 'force-dynamic'

// Daftar profil venue (versi terbaru) dengan status, sumber, dan kesegaran. Profil bawaan BELUM diverifikasi manusia.
export const GET = withApi(async () => ({ venues: await listVenues() }))
