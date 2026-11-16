import { withApi, enforceLimit } from '../../../../../lib/api'
import { exportsService } from '../../../../../lib/exportService'

export const dynamic = 'force-dynamic'

// ?format=json -> pratinjau (peringatan, manifest, panduan Overleaf) tanpa berkas. Tanpa parameter -> unduh ZIP privat.
// Paket dibangun saat diminta dan tidak disimpan di server; akses hanya untuk pemilik proyek (sesi).
// Batas laju terpisah: pratinjau tidak menghabiskan kuota unduhan.
export const GET = withApi(async ({ request, session, params }) => {
  const preview = new URL(request.url).searchParams.get('format') === 'json'
  enforceLimit(preview ? { name: 'export-preview', key: session.user.id, windowMs: 60_000, max: 30 } : { name: 'export', key: session.user.id, windowMs: 60_000, max: 10 })
  const svc = await exportsService()
  const pkg = await svc.build({ userId: session.user.id, projectId: params.id })
  if (preview) return { manifest: pkg.manifest, warnings: pkg.warnings, overleaf: pkg.overleaf }
  const name = `naskah-v${pkg.manifest.manuscriptVersion.number}.zip`
  return new Response(pkg.zip, {
    status: 200,
    headers: { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  })
})
