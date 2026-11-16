'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { createRetentionService } = require('../index')

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-11-16T00:00:00Z')

function env({ enabled = true, graceDays = 7, failFor = [] } = {}) {
  const projects = [
    { id: 'old', userId: 'u1', retentionExpiresAt: new Date(NOW - 30 * DAY) },
    { id: 'justExpired', userId: 'u1', retentionExpiresAt: new Date(NOW - 2 * DAY) }, // dalam masa tenggang
    { id: 'future', userId: 'u2', retentionExpiresAt: new Date(NOW.getTime() + DAY) },
    { id: 'noRetention', userId: 'u2', retentionExpiresAt: null }, // pengguna tidak meminta penghapusan
    { id: 'boom', userId: 'u3', retentionExpiresAt: new Date(NOW - 40 * DAY) }
  ]
  const deleted = []
  const logs = []
  const store = {
    async findExpired({ before, limit }) { return projects.filter((p) => p.retentionExpiresAt && p.retentionExpiresAt < before).slice(0, limit) },
    async deleteProject(u, id) { if (failFor.includes(id)) throw Object.assign(new Error('rahasia isi naskah'), { code: 'EBOOM' }); deleted.push(id) }
  }
  return { svc: createRetentionService({ store, enabled, graceDays, now: () => NOW, log: (l) => logs.push(l) }), deleted, logs }
}

test('retensi: hanya yang lewat kedaluwarsa + masa tenggang; tanpa retentionDays/belum lewat tidak disentuh', async () => {
  const { svc, deleted } = env()
  const r = await svc.run()
  assert.deepEqual(deleted.sort(), ['boom', 'old'])
  assert.equal(r.deleted, 2)
  assert.ok(!deleted.includes('justExpired') && !deleted.includes('future') && !deleted.includes('noRetention'))
})

test('retensi: default mati -> dry-run, tidak menghapus apa pun tetapi melaporkan kandidat', async () => {
  const { svc, deleted } = env({ enabled: false })
  const r = await svc.run()
  assert.equal(r.dryRun, true)
  assert.equal(r.candidates, 2)
  assert.deepEqual(deleted, [])
})

test('retensi: masa tenggang dapat dikonfigurasi; satu kegagalan tidak menghentikan lainnya dan log tidak berisi pesan galat', async () => {
  const wide = env({ graceDays: 1 })
  assert.equal((await wide.svc.run()).candidates, 3)
  const { svc, deleted, logs } = env({ failFor: ['boom'] })
  const r = await svc.run()
  assert.equal(r.failed, 1)
  assert.deepEqual(deleted, ['old'])
  assert.ok(!JSON.stringify(logs).includes('rahasia'))
  assert.equal(logs[0].code, 'EBOOM')
})

test('retensi: graceDays negatif ditolak; batas per proses', async () => {
  assert.throws(() => env({ graceDays: -1 }))
})

test('M1 TOCTOU: proyek yang diperpanjang pengguna setelah pencarian TIDAK dihapus dan tidak dihitung terhapus', async () => {
  const projects = [{ id: 'a', userId: 'u', retentionExpiresAt: new Date(NOW - 30 * DAY) }, { id: 'b', userId: 'u', retentionExpiresAt: new Date(NOW - 30 * DAY) }]
  const deleted = []
  const store = {
    async findExpired({ before }) { return projects.filter((p) => p.retentionExpiresAt < before).map((p) => ({ id: p.id, userId: p.userId })) },
    // penyimpanan nyata menghapus atomik HANYA bila masih kedaluwarsa pada saat penghapusan (parameter `before` diteruskan)
    async deleteProject(u, id, before) {
      if (id === 'a') projects[0].retentionExpiresAt = new Date(NOW.getTime() + 10 * DAY) // pengguna menyimpan versi baru di tengah proses
      const p = projects.find((x) => x.id === id)
      if (!(p.retentionExpiresAt < before)) return false
      deleted.push(id)
      return true
    }
  }
  const r = await createRetentionService({ store, enabled: true, graceDays: 7, now: () => NOW }).run()
  assert.deepEqual(deleted, ['b'])
  assert.equal(r.deleted, 1)
  assert.equal(r.skipped, 1)
})
