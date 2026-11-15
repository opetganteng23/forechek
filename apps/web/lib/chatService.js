import { dbConnect, Message, UsageLedger, AiUsageLog, User } from '@publication-prepare/db'
import { createChatService, createToolRegistry, readSectionTool, loadAiConfig, createProviderFromEnv } from '@publication-prepare/ai'
import { loadConfig, isAppError } from '@publication-prepare/core'
import { projects } from './projectsService'

// Penyimpanan Mongoose untuk layanan chat. Semua pembacaan difilter userId (kepemilikan).
const view = (d) => (d ? { ...d, id: String(d._id) } : null)

const messages = {
  async findByClientRequest(userId, projectId, role, clientRequestId) {
    return view(await Message.findOne({ userId, projectId, role, clientRequestId }).lean())
  },
  async insert(doc) {
    try {
      return view((await Message.create(doc)).toObject())
    } catch (err) {
      if (err && err.code === 11000) {
        const e = new Error('duplicate')
        e.duplicate = true
        throw e
      }
      throw err
    }
  },
  // Compare-and-set: hanya satu retry paralel yang menang (nomor percobaan harus masih sama).
  async claimRetry(id, expectedAttempts, patch) {
    const r = await Message.updateOne({ _id: id, attempts: expectedAttempts }, { $set: patch })
    return r.modifiedCount === 1
  },
  async update(id, patch) {
    await Message.updateOne({ _id: id }, { $set: patch })
  },
  async listRecent(userId, projectId, limit) {
    const rows = await Message.find({ userId, projectId }).sort({ createdAt: -1 }).limit(limit).lean()
    return rows.reverse().map(view)
  },
  async list(userId, projectId, { limit, before }) {
    const q = { userId, projectId }
    if (before) q._id = { $lt: before }
    const rows = await Message.find(q).sort({ _id: -1 }).limit(limit).lean()
    return rows.reverse().map(view)
  }
}

const ledger = {
  async insertOnce(entry) {
    try {
      await UsageLedger.create(entry)
      return true
    } catch (err) {
      if (err && err.code === 11000) return false
      throw err
    }
  }
}

const logStore = {
  async insertOnce(entry) {
    try {
      await AiUsageLog.create(entry)
      return true
    } catch (err) {
      if (err && err.code === 11000) return false
      throw err
    }
  }
}

// Pembaruan kuota atomik: reset periode (hanya bila periode tersimpan sudah lewat), lalu $inc.
const usageStore = {
  async getUser(userId) {
    const u = await User.findById(userId).select('subscription usage').lean()
    return { subscription: u && u.subscription, usage: u && u.usage }
  },
  async applyUsage(userId, delta, periodStart) {
    await User.updateOne(
      { _id: userId, $or: [{ 'usage.periodStart': { $exists: false } }, { 'usage.periodStart': null }, { 'usage.periodStart': { $lt: periodStart } }] },
      { $set: { 'usage.periodStart': periodStart, 'usage.tokensUsed': 0, 'usage.messagesUsed': 0 } }
    )
    await User.updateOne({ _id: userId }, { $inc: { 'usage.tokensUsed': delta.tokens, 'usage.messagesUsed': delta.messages } })
  }
}

async function getCurrent(userId, projectId) {
  const svc = await projects()
  try {
    const { project, currentVersion } = await svc.getProject(userId, projectId)
    return { project, currentVersion }
  } catch (err) {
    if (isAppError(err) && err.code === 'NOT_FOUND') return null
    throw err
  }
}

const projectsApi = {
  async getForChat(userId, projectId) {
    const r = await getCurrent(userId, projectId)
    if (!r) return null
    const v = r.currentVersion
    return {
      project: { title: r.project.title, fieldOfStudy: r.project.fieldOfStudy, language: r.project.language, publicationType: r.project.publicationType },
      version: v ? { id: String(v._id), number: v.number, format: v.format, parse: v.parse } : null,
      references: [] // diisi mulai Tahap 4
    }
  }
}

const reader = {
  async getCurrentVersion(userId, projectId) {
    const r = await getCurrent(userId, projectId)
    return r && r.currentVersion ? { number: r.currentVersion.number, source: r.currentVersion.source, parse: r.currentVersion.parse } : null
  }
}

let service
let provider

export async function chat() {
  await dbConnect()
  if (!service) {
    const aiConfig = loadAiConfig(process.env)
    service = createChatService({
      messages,
      ledger,
      usageStore,
      logStore,
      projects: projectsApi,
      reader,
      registry: createToolRegistry([readSectionTool]),
      getProvider: () => (provider = provider || createProviderFromEnv(process.env)),
      aiConfig,
      quota: loadConfig(process.env).quota
    })
  }
  return service
}

// Bentuk aman untuk client: tanpa userId/requestId internal.
export function publicMessage(m) {
  return {
    id: m.id,
    role: m.role,
    text: m.text,
    status: m.status,
    errorCode: m.errorCode || null,
    provider: m.provider || null,
    model: m.model || null,
    toolCalls: (m.toolCalls || []).map((t) => ({ name: t.name, ok: t.ok })),
    createdAt: m.createdAt
  }
}
