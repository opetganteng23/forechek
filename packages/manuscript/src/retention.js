'use strict'

// Retensi dan penghapusan terjadwal (MTS 42, keputusan D0-08/D7-02). Hanya proyek yang PENGGUNANYA beri retentionDays
// dan yang sudah lewat tanggal kedaluwarsa + masa tenggang yang dihapus; proyek tanpa retentionDays tidak pernah dihapus
// otomatis. Penghapusan nyata hanya bila `enabled` (default mati); selain itu hanya laporan (dry-run).
//   store.findExpired({ before, limit }) -> [{ id, userId }]   (retentionExpiresAt < before)
//   store.deleteProject(userId, projectId, before) -> true/false (false = dilewati); melempar bila gagal (satu kegagalan tidak menghentikan proyek lain)
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_PER_RUN = 200

function createRetentionService({ store, enabled = false, graceDays = 7, now = () => new Date(), log = () => {} }) {
  if (!Number.isFinite(graceDays) || graceDays < 0) throw new Error('graceDays harus >= 0')
  async function run({ dryRun = !enabled, limit = MAX_PER_RUN } = {}) {
    const before = new Date(now().getTime() - graceDays * DAY_MS)
    const candidates = await store.findExpired({ before, limit: Math.min(limit, MAX_PER_RUN) })
    const result = { dryRun, graceDays, before: before.toISOString(), candidates: candidates.length, deleted: 0, skipped: 0, failed: 0 }
    if (dryRun) return result
    for (const c of candidates) {
      try {
        // `before` diteruskan agar penyimpanan menghapus secara ATOMIK hanya bila proyek masih kedaluwarsa saat penghapusan
        // (pengguna dapat memperpanjang retensi setelah pencarian). `false` = dilewati (sudah berubah/dihapus pihak lain).
        const done = await store.deleteProject(c.userId, c.id, before)
        if (done === false) result.skipped++
        else result.deleted++
      } catch (err) {
        result.failed++
        log({ event: 'retention_delete_failed', projectId: String(c.id), code: (err && (err.code || err.name)) || 'unknown' }) // tanpa isi naskah
      }
    }
    return result
  }
  return { run }
}

module.exports = { createRetentionService, MAX_PER_RUN }
