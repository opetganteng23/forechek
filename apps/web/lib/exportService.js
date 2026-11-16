import { dbConnect } from '@publication-prepare/db'
import { AppError } from '@publication-prepare/core'
import { buildExportPackage, getOverleafProvider } from '@publication-prepare/export'
import { evaluateFreshness } from '@publication-prepare/venues'
import { projects } from './projectsService'
import { literature } from './literatureService'
import { getVenue } from './venueService'

// Ekspor paket (MTS 41.2 D). Kepemilikan diperiksa lewat getProject (filter userId). Hanya referensi terverifikasi yang diekspor.
export async function exportsService() {
  await dbConnect()
  return {
    async build({ userId, projectId }) {
      const svc = await projects()
      const ctx = await svc.getProject(userId, projectId)
      const v = ctx.currentVersion
      if (!v) throw new AppError('CONFLICT', 'Proyek belum memiliki naskah tersimpan', { details: { code: 'NO_MANUSCRIPT' } })
      const refs = await (await literature()).listForExport(userId, projectId)
      const slug = ctx.project.venueSlug || null
      const venue = slug ? await getVenue(slug) : null
      const pkg = buildExportPackage({
        project: { title: ctx.project.title },
        version: { number: v.number, format: v.format, source: v.source, checksum: v.checksum },
        references: refs,
        venue: venue ? venue.profile : null,
        freshness: venue ? venue.freshness || evaluateFreshness(venue.profile) : null
      })
      return { ...pkg, overleaf: getOverleafProvider().describe() }
    }
  }
}
