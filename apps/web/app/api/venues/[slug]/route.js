import { AppError } from '@publication-prepare/core'
import { withApi } from '../../../../lib/api'
import { getVenueSummary } from '../../../../lib/venueService'

export const dynamic = 'force-dynamic'

export const GET = withApi(async ({ params }) => {
  const venue = await getVenueSummary(params.slug)
  if (!venue) throw new AppError('NOT_FOUND', 'Venue tidak ditemukan')
  return { venue }
})
