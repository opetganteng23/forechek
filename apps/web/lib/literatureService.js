import mongoose from 'mongoose'
import { dbConnect, Project, Reference, ReferenceCandidate } from '@publication-prepare/db'
import { AppError } from '@publication-prepare/core'
import { createReferenceService, createLiteratureProvidersFromEnv, createLlmJudge } from '@publication-prepare/literature'
import { createProviderFromEnv, loadAiConfig } from '@publication-prepare/ai'

// Penyimpanan Mongoose untuk perpustakaan referensi. Semua pembacaan difilter userId + projectId (kepemilikan).
const valid = (id) => typeof id === 'string' && mongoose.isValidObjectId(id) && /^[0-9a-f]{24}$/i.test(id)
const view = (d) => (d ? { ...d, id: String(d._id) } : null)

const refs = {
  async list(userId, projectId) {
    return (await Reference.find({ userId, projectId }).sort({ createdAt: 1 }).lean()).map(view)
  },
  async findById(userId, projectId, id) {
    return valid(id) ? view(await Reference.findOne({ _id: id, userId, projectId }).lean()) : null
  },
  async findByCiteKey(userId, projectId, citeKey) {
    return typeof citeKey === 'string' ? view(await Reference.findOne({ userId, projectId, citeKey }).lean()) : null
  },
  async insert(doc) {
    try {
      return view((await Reference.create(doc)).toObject())
    } catch (err) {
      if (err && err.code === 11000) throw Object.assign(new Error('duplicate'), err.keyPattern && err.keyPattern.dedupKey ? { duplicateRef: true } : { duplicate: true })
      throw err
    }
  },
  async update(id, set) {
    try {
      return view(await Reference.findOneAndUpdate({ _id: id }, { $set: set }, { new: true }).lean())
    } catch (err) {
      if (err && err.code === 11000) throw Object.assign(new Error('duplicate'), { duplicateRef: true })
      throw err
    }
  },
  async remove(userId, projectId, id) {
    if (!valid(id)) return false
    return (await Reference.deleteOne({ _id: id, userId, projectId })).deletedCount === 1
  }
}

const candidates = {
  async insertMany(userId, projectId, list) {
    if (list.length === 0) return []
    const rows = await ReferenceCandidate.insertMany(list.map((data) => ({ userId, projectId, data })))
    // Batasi kandidat tersimpan per proyek (pertumbuhan penyimpanan): buang yang terlama di atas 150.
    const stale = await ReferenceCandidate.find({ userId, projectId }).sort({ _id: -1 }).skip(150).select('_id').lean()
    if (stale.length) await ReferenceCandidate.deleteMany({ _id: { $in: stale.map((x) => x._id) } })
    return rows.map((r, i) => ({ ...list[i], candidateId: String(r._id) }))
  },
  async get(userId, projectId, id) {
    if (!valid(id)) return null
    const r = await ReferenceCandidate.findOne({ _id: id, userId, projectId }).lean()
    return r ? { ...r.data, candidateId: String(r._id) } : null
  }
}

async function assertOwned(userId, projectId) {
  if (!valid(String(projectId)) || !(await Project.exists({ _id: projectId, userId }))) throw new AppError('NOT_FOUND', 'Data tidak ditemukan')
}

let service
export async function literature() {
  await dbConnect()
  if (!service) {
    let providers
    try {
      providers = createLiteratureProvidersFromEnv(process.env)
    } catch (err) {
      throw new AppError('PROVIDER_NOT_CONFIGURED', 'Konfigurasi LITERATURE_PROVIDERS tidak valid')
    }
    // Juri klaim memakai model ringan bila layanan AI terkonfigurasi; bila tidak, klaim selalu "unknown" (JUDGE_UNAVAILABLE).
    let judge
    try {
      const cfg = loadAiConfig(process.env)
      const model = cfg.models.light || cfg.models.chat
      if (model) judge = createLlmJudge({ provider: createProviderFromEnv(process.env), model })
    } catch {
      judge = undefined
    }
    service = createReferenceService({ refs, candidates, assertOwned, providers, judge })
  }
  return service
}
