import { AppError } from '@publication-prepare/core'
import { buildIndicators } from '@publication-prepare/indicators'
import { withApi } from '../../../../../lib/api'
import { projects } from '../../../../../lib/projectsService'
import { literature } from '../../../../../lib/literatureService'

export const dynamic = 'force-dynamic'

// Indikator kemiripan teks dan gaya (Tahap 8, MTS P4): OPSIONAL per proyek (indicatorsEnabled, default mati), dihitung saat diminta,
// TIDAK disimpan, TIDAK masuk skor kesiapan maupun ekspor. Hanya angka deskriptif dan keterbatasan; tanpa vonis.
export const POST = withApi(
  async ({ session, params }) => {
    const svc = await projects()
    const { project, currentVersion } = await svc.getProject(session.user.id, params.id) // 404 bila bukan milik pengguna
    if (!project.indicatorsEnabled) throw new AppError('CONFLICT', 'Indikator belum diaktifkan untuk proyek ini', { details: { code: 'INDICATORS_DISABLED' } })
    if (!currentVersion) throw new AppError('CONFLICT', 'Proyek belum memiliki naskah tersimpan', { details: { code: 'NO_MANUSCRIPT' } })
    const refs = await (await literature()).listForContext(session.user.id, params.id)
    return { indicators: buildIndicators({ source: currentVersion.source, parse: currentVersion.parse, references: refs }), versionNumber: currentVersion.number }
  },
  { rateLimit: { name: 'indicators', windowMs: 60_000, max: 10 } }
)
