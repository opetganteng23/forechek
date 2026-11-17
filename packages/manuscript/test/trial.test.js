'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { createTrialGate, createProjectService } = require('../index')

function memUsers(init = {}) {
  const u = { free: { subscription: { plan: 'free' }, trialPapersCreated: 0 }, pro: { subscription: { plan: 'pro', isActive: true, endDate: new Date(Date.now() + 864e5) }, trialPapersCreated: 0 }, expired: { subscription: { plan: 'pro', isActive: true, endDate: new Date(Date.now() - 864e5) }, trialPapersCreated: 0 }, ...init }
  const tick = () => new Promise((r) => setImmediate(r))
  return {
    u,
    users: {
      async get(id) { await tick(); return u[id] || null },
      async claim(id, limit) { if ((u[id].trialPapersCreated || 0) >= limit) return false; u[id].trialPapersCreated = (u[id].trialPapersCreated || 0) + 1; return true }, // atomik (sinkron)
      async release(id) { u[id].trialPapersCreated -= 1 }
    }
  }
}
const err = async (fn) => { try { await fn(); return null } catch (e) { return e } }

test('akun free: paper pertama diizinkan, kedua ditolak TRIAL_LIMIT (402-setara 403 QUOTA_EXCEEDED) dengan pesan jelas', async () => {
  const { users, u } = memUsers()
  const g = createTrialGate({ users, limit: 1 })
  await g.acquire('free')
  const e = await err(() => g.acquire('free'))
  assert.equal(e.code, 'QUOTA_EXCEEDED')
  assert.equal(e.details.code, 'TRIAL_LIMIT')
  assert.match(e.message, /Akun trial hanya dapat membuat 1 paper/)
  assert.equal(u.free.trialPapersCreated, 1)
})

test('permintaan paralel: tepat satu lolos', async () => {
  const { users } = memUsers()
  const g = createTrialGate({ users })
  const r = await Promise.allSettled(Array.from({ length: 8 }, () => g.acquire('free')))
  assert.equal(r.filter((x) => x.status === 'fulfilled').length, 1)
})

test('akun berlangganan aktif tidak dibatasi trial; langganan kedaluwarsa kembali ke trial', async () => {
  const { users } = memUsers()
  const g = createTrialGate({ users })
  for (let i = 0; i < 5; i++) await g.acquire('pro')
  await g.acquire('expired')
  assert.equal((await err(() => g.acquire('expired'))).details.code, 'TRIAL_LIMIT')
})

test('release mengembalikan jatah (pembuatan gagal); batas dapat dikonfigurasi; limit 0 menolak semua', async () => {
  const { users, u } = memUsers()
  const g = createTrialGate({ users, limit: 2 })
  const rel = await g.acquire('free')
  await rel()
  assert.equal(u.free.trialPapersCreated, 0)
  await g.acquire('free'); await g.acquire('free')
  assert.ok(await err(() => g.acquire('free')))
  const z = memUsers()
  assert.ok(await err(() => createTrialGate({ users: z.users, limit: 0 }).acquire('free')))
})

test('status: sisa jatah untuk free, null untuk berlangganan', async () => {
  const { users } = memUsers()
  const g = createTrialGate({ users })
  assert.deepEqual(await g.status('free'), { plan: 'free', trial: true, limit: 1, used: 0, remaining: 1 })
  await g.acquire('free')
  assert.equal((await g.status('free')).remaining, 0)
  assert.deepEqual(await g.status('pro'), { plan: 'pro', trial: false, limit: 1, used: 0, remaining: null })
})

test('integrasi layanan proyek: hapus proyek TIDAK mengembalikan jatah; kegagalan membuat mengembalikan jatah', async () => {
  const { users, u } = memUsers()
  const gate = createTrialGate({ users })
  const docs = []
  const Project = {
    async create(d) { if (d.title === 'gagal') throw new Error('db'); const p = { _id: String(docs.length + 1).padStart(24, '0'), ...d }; docs.push(p); return { ...p, toObject: () => p } },
    async countDocuments() { return docs.length },
    find() { const q = { sort: () => q, limit: () => q, lean: async () => docs.slice() }; return q },
    async deleteOne({ _id }) { const i = docs.findIndex((d) => d._id === _id); if (i >= 0) docs.splice(i, 1); return { deletedCount: 1 } },
    findOne() { return { lean: async () => docs[0] || null } }
  }
  const svc = createProjectService({ Project, ManuscriptVersion: {}, newObjectId: () => 'x', projectGate: gate })
  const U = 'free'.padEnd(24, '0')
  void U
  const real = { ...u }
  users.get = async () => real.free
  users.claim = async () => { if (real.free.trialPapersCreated >= 1) return false; real.free.trialPapersCreated++; return true }
  users.release = async () => { real.free.trialPapersCreated-- }
  const uid = 'a'.repeat(24)
  assert.ok(await err(() => svc.createProject(uid, { title: 'gagal' })), 'pembuatan gagal')
  assert.equal(real.free.trialPapersCreated, 0, 'jatah dikembalikan setelah gagal')
  await svc.createProject(uid, { title: 'paper trial' })
  await svc.deleteProject(uid, docs[0]._id).catch(() => {})
  docs.length = 0
  const e = await err(() => svc.createProject(uid, { title: 'lagi' }))
  assert.equal(e.details.code, 'TRIAL_LIMIT', 'setelah hapus tetap tidak boleh membuat lagi')
})

test('admin dibebaskan dari trial (acquire berkali-kali, status plan admin)', async () => {
  const { users, u } = memUsers({ adm: { role: 'admin', subscription: { plan: 'free' }, trialPapersCreated: 0 } })
  const g = createTrialGate({ users })
  await g.acquire('adm'); await g.acquire('adm'); await g.acquire('adm')
  assert.equal(u.adm.trialPapersCreated, 0)
  assert.equal((await g.status('adm')).plan, 'admin')
})

test('limit dapat berupa fungsi async (diubah superadmin tanpa restart): perubahan berlaku pada permintaan berikutnya', async () => {
  const { users } = memUsers()
  let lim = 1
  const g = createTrialGate({ users, limit: async () => lim })
  await g.acquire('free')
  assert.equal((await err(() => g.acquire('free'))).details.limit, 1)
  lim = 2
  await g.acquire('free') // jatah dinaikkan: satu lagi diizinkan
  assert.equal((await err(() => g.acquire('free'))).details.code, 'TRIAL_LIMIT')
  assert.deepEqual((({ limit, used, remaining }) => ({ limit, used, remaining }))(await g.status('free')), { limit: 2, used: 2, remaining: 0 })
})

test('superadmin juga dibebaskan dari trial', async () => {
  const { users } = memUsers({ sup: { role: 'superadmin', subscription: { plan: 'free' }, trialPapersCreated: 0 } })
  const g = createTrialGate({ users })
  await g.acquire('sup'); await g.acquire('sup')
  assert.equal((await g.status('sup')).plan, 'admin')
})
