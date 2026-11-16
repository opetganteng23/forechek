'use strict'
const { AppError } = require('@publication-prepare/core')
const { buildReport } = require('./report')

const STALE_MS = 10 * 60 * 1000 // job 'running' lebih lama dari ini dianggap gagal (proses mati/serverless)
const ESTIMATED_TOKENS = 30000 // estimasi kasar (6 kriteria x ~4,5 rb token masuk + keluaran) untuk pra-pemeriksaan kuota (provisional)

// Layanan laporan kesiapan sebagai JOB (MTS 23.3, 40.2 E): start() membuat laporan berstatus queued dan menjalankannya di
// latar belakang; klien memantau lewat get(). Satu laporan aktif per proyek. Penyimpanan dan layanan lain diinjeksi:
//   reports : insert, update(id, patch), findById(userId, projectId, id), findActive(userId, projectId), list(userId, projectId, limit)
//   source  : getForReport(userId, projectId) -> {project, version:{id, number, source, parse}} | null   (filter kepemilikan)
//   refs    : listForContext(userId, projectId)       venues : get(slug) -> {profile, freshness} | null
//   ai      : () -> {provider, model} | null           billing : {preflight(userId, est), record({...})} (opsional)
function createReportService({ reports, source, refs, venues, ai, billing, now = () => new Date(), schedule = (fn) => setImmediate(fn) }) {
  async function start({ userId, projectId }) {
    const ctx = await source.getForReport(userId, projectId)
    if (!ctx) throw new AppError('NOT_FOUND', 'Data tidak ditemukan')
    if (!ctx.version) throw new AppError('CONFLICT', 'Proyek belum memiliki naskah tersimpan', { details: { code: 'NO_MANUSCRIPT' } })

    const active = await reports.findActive(userId, projectId)
    if (active && now() - new Date(active.createdAt) < STALE_MS) throw new AppError('REQUEST_IN_PROGRESS', 'Laporan sebelumnya masih diproses', { details: { reportId: active.id } })
    if (active) await reports.update(active.id, { status: 'failed', errorCode: 'STALE', finishedAt: now() })

    const slug = ctx.project.venueSlug || null
    const venue = slug ? await venues.get(slug) : null
    if (slug && !venue) throw new AppError('VALIDATION_ERROR', 'Venue proyek tidak dikenal. Pilih venue yang tersedia.', { details: { code: 'VENUE_UNKNOWN' } })
    if (billing) await billing.preflight(userId, ESTIMATED_TOKENS) // QUOTA_EXCEEDED dilempar bila habis (hanya relevan bila AI dipakai)

    // Indeks unik parsial (satu laporan queued/running per proyek) membuat penyisipan kedua gagal secara atomik (E11000).
    let report
    try {
      report = await reports.insert({ userId, projectId, versionId: ctx.version.id, versionNumber: ctx.version.number, status: 'queued', venueSlug: venue ? venue.profile.slug : null, venueVersion: venue ? venue.profile.version : null })
    } catch (err) {
      if (err && err.code === 11000) throw new AppError('REQUEST_IN_PROGRESS', 'Laporan sebelumnya masih diproses')
      throw err
    }
    const done = new Promise((resolve) => schedule(() => execute(report.id, { userId, projectId, ctx, venue }).then(resolve, resolve)))
    return { report, done }
  }

  async function execute(reportId, { userId, projectId, ctx, venue }) {
    const usageSink = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
    let model = null
    try {
      model = ai ? ai() : null
      await reports.update(reportId, { status: 'running', startedAt: now() })
      const references = await refs.listForContext(userId, projectId)
      const result = await buildReport({
        source: ctx.version.source,
        parse: ctx.version.parse,
        references,
        venue: venue ? venue.profile : null,
        freshness: venue ? venue.freshness : null,
        provider: model ? model.provider : null,
        model: model ? model.model : null,
        usageSink,
        now: now()
      })
      await reports.update(reportId, { status: 'completed', result, finishedAt: now() })
    } catch (err) {
      console.error('[report] execute gagal', reportId, (err && (err.code || err.name)) || 'unknown') // tanpa isi naskah/pesan
      await reports.update(reportId, { status: 'failed', errorCode: 'INTERNAL_ERROR', finishedAt: now() }).catch(() => {})
      // Token yang sudah terpakai pada penilai tetap dicatat (kegagalan internal tidak menghapus biaya yang sudah terjadi).
      const spent = usageSink.inputTokens + usageSink.outputTokens > 0
      if (billing && model) await billing.record({ userId, projectId, reportId, status: spent ? 'completed' : 'failed', usage: usageSink, provider: model.provider.name, model: model.model, errorCode: spent ? undefined : 'INTERNAL_ERROR' }).catch(() => {})
      return { status: 'failed' }
    }
    // Laporan sudah completed: kegagalan penagihan tidak boleh menimpanya; ditandai untuk rekonsiliasi.
    if (billing && model) {
      try {
        await billing.record({ userId, projectId, reportId, status: 'completed', usage: usageSink, provider: model.provider.name, model: model.model })
      } catch {
        console.error('[report] penagihan gagal', reportId)
        await reports.update(reportId, { billingFailed: true }).catch(() => {})
      }
    }
    return { status: 'completed' }
  }

  async function get({ userId, projectId, reportId }) {
    const r = await reports.findById(userId, projectId, reportId)
    if (!r) throw new AppError('NOT_FOUND', 'Data tidak ditemukan')
    if ((r.status === 'queued' || r.status === 'running') && now() - new Date(r.startedAt || r.createdAt) > STALE_MS) return reports.update(r.id, { status: 'failed', errorCode: 'STALE', finishedAt: now() })
    return r
  }

  async function list({ userId, projectId, limit = 20 }) {
    const ctx = await source.getForReport(userId, projectId)
    if (!ctx) throw new AppError('NOT_FOUND', 'Data tidak ditemukan')
    return reports.list(userId, projectId, Math.min(Math.max(Number(limit) || 20, 1), 50))
  }

  return { start, get, list, execute, STALE_MS }
}

module.exports = { createReportService, STALE_MS }
