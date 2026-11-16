'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { AppError } = require('@publication-prepare/core')
const { createReportService, STALE_MS } = require('../index')
const { evaluateFreshness } = require('@publication-prepare/venues')
const { createFakeProvider } = require('@publication-prepare/ai')
const { GOOD_MD, REFS, venues, parse } = require('./fixtures')

const NOW = new Date('2026-11-15T00:00:00Z')
let seq = 0

function env({ owner = { p1: 'u1' }, version = true, venueSlug = 'ieee-conference-generic', ai, billing, refsFn, now = () => NOW } = {}) {
  const rows = []
  const reports = {
    async insert(d) { const r = { ...d, id: `rep${++seq}`, createdAt: now() }; rows.push(r); return { ...r } }, // salinan, seperti Mongo
    async update(id, patch) { return Object.assign(rows.find((r) => r.id === id), patch) },
    async findById(u, p, id) { return rows.find((r) => r.id === id && r.userId === u && r.projectId === p) || null },
    async findActive(u, p) { return rows.find((r) => r.userId === u && r.projectId === p && ['queued', 'running'].includes(r.status)) || null },
    async list(u, p, n) { return rows.filter((r) => r.userId === u && r.projectId === p).slice(-n) }
  }
  const src = {
    async getForReport(u, p) {
      if (owner[p] !== u) return null
      return { project: { venueSlug }, version: version ? { id: 'ver1', number: 2, source: GOOD_MD, parse: parse(GOOD_MD) } : null }
    }
  }
  const v = { async get(slug) { const p = venues[slug]; return p ? { profile: p, freshness: evaluateFreshness(p, NOW) } : null } }
  const svc = createReportService({ reports, source: src, refs: { listForContext: refsFn || (async () => REFS) }, venues: v, ai, billing, now, schedule: (fn) => Promise.resolve().then(fn) })
  return { rows, svc }
}

test('start -> job queued dikembalikan segera, lalu completed dengan hasil dan jejak venue/versi', async () => {
  const { svc, rows } = env()
  const { report, done } = await svc.start({ userId: 'u1', projectId: 'p1' })
  assert.equal(report.status, 'queued')
  assert.equal(report.venueSlug, 'ieee-conference-generic')
  assert.equal(report.venueVersion, 1)
  assert.equal(report.versionNumber, 2)
  assert.deepEqual(await done, { status: 'completed' })
  const r = rows[0]
  assert.equal(r.status, 'completed')
  assert.ok(r.startedAt && r.finishedAt)
  assert.equal(r.result.venue.slug, 'ieee-conference-generic')
  assert.ok(r.result.deterministic.length > 10)
  assert.equal(r.result.overall.provisional, true)
})

test('kepemilikan: pengguna lain mendapat NOT_FOUND pada start/get/list; tidak ada laporan dibuat', async () => {
  const { svc, rows } = env()
  const nf = (e) => e.code === 'NOT_FOUND'
  await assert.rejects(() => svc.start({ userId: 'u2', projectId: 'p1' }), nf)
  await assert.rejects(() => svc.list({ userId: 'u2', projectId: 'p1' }), nf)
  const { report } = await svc.start({ userId: 'u1', projectId: 'p1' })
  await assert.rejects(() => svc.get({ userId: 'u2', projectId: 'p1', reportId: report.id }), nf)
  assert.equal(rows.length, 1)
})

test('prasyarat: tanpa naskah -> NO_MANUSCRIPT; venue tak dikenal -> VENUE_UNKNOWN; tanpa venue tetap berjalan', async () => {
  await assert.rejects(() => env({ version: false }).svc.start({ userId: 'u1', projectId: 'p1' }), (e) => e.details.code === 'NO_MANUSCRIPT')
  await assert.rejects(() => env({ venueSlug: 'venue-ajaib' }).svc.start({ userId: 'u1', projectId: 'p1' }), (e) => e.details.code === 'VENUE_UNKNOWN')
  const e = env({ venueSlug: null })
  const { report, done } = await e.svc.start({ userId: 'u1', projectId: 'p1' })
  await done
  assert.equal(report.venueSlug, null)
  assert.equal(e.rows[0].result.venue, null)
})

test('satu laporan aktif per proyek; job usang digantikan', async () => {
  let t = NOW
  const e = env({ now: () => t })
  const first = await e.svc.start({ userId: 'u1', projectId: 'p1' })
  e.rows[0].status = 'running' // tahan sebelum selesai
  await first.done
  e.rows[0].status = 'running'
  await assert.rejects(() => e.svc.start({ userId: 'u1', projectId: 'p1' }), (err) => err.code === 'REQUEST_IN_PROGRESS')
  t = new Date(NOW.getTime() + STALE_MS + 1000)
  const second = await e.svc.start({ userId: 'u1', projectId: 'p1' })
  await second.done
  assert.equal(e.rows[0].status, 'failed')
  assert.equal(e.rows[0].errorCode, 'STALE')
  assert.equal(e.rows.length, 2)
})

test('get: job queued/running yang usang ditandai failed STALE saat dibaca', async () => {
  let t = NOW
  const e = env({ now: () => t })
  const { report, done } = await e.svc.start({ userId: 'u1', projectId: 'p1' })
  await done
  e.rows[0].status = 'running'
  t = new Date(NOW.getTime() + STALE_MS + 1)
  const r = await e.svc.get({ userId: 'u1', projectId: 'p1', reportId: report.id })
  assert.equal(r.status, 'failed')
  assert.equal(r.errorCode, 'STALE')
})

test('kuota: pra-pemeriksaan gagal -> tidak ada laporan dibuat', async () => {
  const billing = { preflight: async () => { throw new AppError('QUOTA_EXCEEDED', 'habis') }, record: async () => {} }
  const e = env({ billing })
  await assert.rejects(() => e.svc.start({ userId: 'u1', projectId: 'p1' }), (err) => err.code === 'QUOTA_EXCEEDED')
  assert.equal(e.rows.length, 0)
})

test('penagihan: tercatat sekali dengan pemakaian token dari penilai AI; tidak dicatat bila AI tidak dipakai', async () => {
  const calls = []
  const billing = { preflight: async () => {}, record: async (x) => calls.push(x) }
  const provider = createFakeProvider({ script: () => ({ text: JSON.stringify({ score: 3, rationale: 'Alasan memadai untuk skor ini.', evidence: [{ section: 'introduction', quote: 'Network anomalies threaten constrained IoT deployments' }], suggestions: [] }), usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 } }) })
  const withAi = env({ billing, ai: () => ({ provider, model: 'model-uji' }) })
  await (await withAi.svc.start({ userId: 'u1', projectId: 'p1' })).done
  assert.equal(calls.length, 1)
  assert.equal(calls[0].status, 'completed')
  assert.equal(calls[0].reportId, withAi.rows[0].id)
  assert.ok(calls[0].usage.inputTokens >= 100 && calls[0].usage.outputTokens >= 20, JSON.stringify(calls[0].usage))
  assert.equal(withAi.rows[0].result.model.id, 'model-uji')
  const noAi = env({ billing: { preflight: async () => {}, record: async (x) => calls.push(x) } })
  await (await noAi.svc.start({ userId: 'u1', projectId: 'p1' })).done
  assert.equal(calls.length, 1, 'tanpa AI tidak ada pencatatan')
})

test('kegagalan saat membangun laporan: status failed INTERNAL_ERROR, penagihan dicatat sebagai failed, tidak ada rahasia di dokumen', async () => {
  const calls = []
  const provider = createFakeProvider({ script: [{ text: '{}' }] })
  const e = env({ refsFn: async () => { throw new Error('mongodb://user:pass@host gagal') }, billing: { preflight: async () => {}, record: async (x) => calls.push(x) }, ai: () => ({ provider, model: 'm' }) })
  const { done } = await e.svc.start({ userId: 'u1', projectId: 'p1' })
  assert.deepEqual(await done, { status: 'failed' })
  assert.equal(e.rows[0].status, 'failed')
  assert.equal(e.rows[0].errorCode, 'INTERNAL_ERROR')
  assert.ok(!JSON.stringify(e.rows[0]).includes('mongodb://'))
  assert.equal(calls[0].status, 'failed')
})

test('reproduksibilitas: dua laporan pada versi dan venue yang sama memberi hasil deterministik identik', async () => {
  const e = env()
  await (await e.svc.start({ userId: 'u1', projectId: 'p1' })).done
  e.rows[0].status = 'completed'
  await (await e.svc.start({ userId: 'u1', projectId: 'p1' })).done
  assert.deepEqual(e.rows[0].result.deterministic, e.rows[1].result.deterministic)
  assert.deepEqual(e.rows[0].result.overall, e.rows[1].result.overall)
})
