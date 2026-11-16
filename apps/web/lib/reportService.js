import mongoose from 'mongoose'
import { dbConnect, ReadinessReport } from '@publication-prepare/db'
import { AppError, isAppError, checkQuota, effectivePlan, loadConfig } from '@publication-prepare/core'
import { createReportService } from '@publication-prepare/checks'
import { recordUsage, loadAiConfig, createProviderFromEnv } from '@publication-prepare/ai'
import { projects } from './projectsService'
import { literature } from './literatureService'
import { getVenue } from './venueService'
import { ledger, usageStore } from './chatService'

// Penyimpanan Mongoose untuk laporan kesiapan. Semua pembacaan difilter userId + projectId (kepemilikan).
const valid = (id) => typeof id === 'string' && /^[0-9a-f]{24}$/i.test(id) && mongoose.isValidObjectId(id)
const view = (d) => (d ? { ...d, id: String(d._id) } : null)

const reports = {
  async insert(doc) {
    return view((await ReadinessReport.create(doc)).toObject())
  },
  async update(id, patch) {
    return view(await ReadinessReport.findOneAndUpdate({ _id: id }, { $set: patch }, { new: true }).lean())
  },
  async findById(userId, projectId, id) {
    return valid(id) ? view(await ReadinessReport.findOne({ _id: id, userId, projectId }).lean()) : null
  },
  async findActive(userId, projectId) {
    return view(await ReadinessReport.findOne({ userId, projectId, status: { $in: ['queued', 'running'] } }).sort({ createdAt: -1 }).lean())
  },
  async list(userId, projectId, limit) {
    const rows = await ReadinessReport.find({ userId, projectId }).select({ 'result.deterministic': 0, 'result.criteria': 0 }).sort({ createdAt: -1 }).limit(limit).lean()
    return rows.map(view)
  }
}

const source = {
  async getForReport(userId, projectId) {
    const svc = await projects()
    try {
      const { project, currentVersion } = await svc.getProject(userId, projectId)
      return {
        project: { venueSlug: project.venueSlug || null },
        version: currentVersion ? { id: String(currentVersion._id), number: currentVersion.number, source: currentVersion.source, parse: currentVersion.parse } : null
      }
    } catch (err) {
      if (isAppError(err) && err.code === 'NOT_FOUND') return null
      throw err
    }
  }
}

// Penilai AI hanya dipakai bila layanan AI terkonfigurasi (model report/chat dari env). Tanpa itu laporan deterministik saja
// dan kriteria berbasis model berstatus not_assessed (AI_NOT_CONFIGURED).
let aiProvider
function ai() {
  try {
    const cfg = loadAiConfig(process.env)
    const model = cfg.models.report || cfg.models.chat
    if (!model) return null
    aiProvider = aiProvider || createProviderFromEnv(process.env)
    return { provider: aiProvider, model }
  } catch {
    return null
  }
}

const billing = {
  async preflight(userId, estimatedTokens) {
    if (!ai()) return
    const u = await usageStore.getUser(userId)
    const q = checkQuota({ plan: effectivePlan(u.subscription), usage: u.usage, limits: loadConfig(process.env).quota, estimatedTokens })
    if (!q.allowed) {
      throw new AppError('QUOTA_EXCEEDED', q.reason === 'messages' ? 'Kuota pesan bulan ini habis' : 'Kuota token bulan ini habis', {
        details: { reason: q.reason, limit: q.limit, used: { tokens: q.usage.tokensUsed, messages: q.usage.messagesUsed }, provisional: true }
      })
    }
  },
  async record({ userId, projectId, reportId, status, usage, provider, model, errorCode }) {
    await recordUsage({ ledger, usageStore, userId, projectId, messageId: reportId, attempt: 1, requestId: reportId, provider, model, status, usage, hasText: true, errorCode, task: 'report' })
  }
}

let service
export async function reportsService() {
  await dbConnect()
  if (!service) {
    const lit = await literature()
    service = createReportService({ reports, source, refs: { listForContext: (u, p) => lit.listForContext(u, p) }, venues: { get: getVenue }, ai, billing })
  }
  return service
}

export function publicReport(r, { full = true } = {}) {
  return {
    id: r.id,
    status: r.status,
    versionNumber: r.versionNumber,
    venueSlug: r.venueSlug || null,
    venueVersion: r.venueVersion || null,
    errorCode: r.errorCode || null,
    createdAt: r.createdAt,
    startedAt: r.startedAt || null,
    finishedAt: r.finishedAt || null,
    result: r.result ? (full ? r.result : { overall: r.result.overall, versions: r.result.versions }) : null
  }
}
