// Pekerja retensi (QA-09, D0-08). Menghapus proyek yang PENGGUNANYA beri retentionDays dan yang sudah lewat
// kedaluwarsa + masa tenggang. Proyek tanpa retentionDays tidak pernah disentuh.
//   node scripts/retention.js            -> dry-run (hanya melaporkan kandidat) kecuali RETENTION_ENABLED=true
// Env: MONGODB_URI (wajib), RETENTION_ENABLED=true (aktifkan penghapusan nyata), RETENTION_GRACE_DAYS (default 7).
// Jalankan dari penjadwal (cron/Task Scheduler) di luar aplikasi. Keluaran hanya angka dan id proyek, tanpa isi naskah.
const path = require('node:path')
require('dotenv').config({ path: path.join(__dirname, '..', 'apps', 'web', '.env.local') })
require('dotenv').config()
const mongoose = require('mongoose')
const { dbConnect, retentionStore } = require('../packages/db')
const { createRetentionService } = require('../packages/manuscript')

;(async () => {
  const graceDays = Number(process.env.RETENTION_GRACE_DAYS || 7) // kosong/0 -> default 7 (0 harus eksplisit lewat nilai lain; lihat dokumentasi)
  const enabled = process.env.RETENTION_ENABLED === 'true'
  await dbConnect()
  const svc = createRetentionService({ store: retentionStore, enabled, graceDays, log: (l) => console.error(JSON.stringify(l)) })
  const r = await svc.run()
  console.log(JSON.stringify(r))
  await mongoose.disconnect()
  process.exit(r.failed ? 1 : 0)
})().catch((e) => { console.error('retention gagal:', (e && e.code) || (e && e.name) || 'error'); process.exit(2) })
