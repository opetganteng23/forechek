import mongoose from 'mongoose'
import { dbConnect, EditProposal, AiUsageLog } from '@publication-prepare/db'
import { isAppError } from '@publication-prepare/core'
import { createEditService } from '@publication-prepare/edits'
import { projects } from './projectsService'
import { literature } from './literatureService'

// Penyimpanan Mongoose untuk usulan edit. Semua pembacaan difilter userId + projectId (kepemilikan).
const valid = (id) => typeof id === 'string' && /^[0-9a-f]{24}$/i.test(id) && mongoose.isValidObjectId(id)
const view = (d) => (d ? { ...d, id: String(d._id), userId: String(d.userId), projectId: String(d.projectId), baseVersionId: String(d.baseVersionId) } : null)

const store = {
  async insert(doc) {
    return view((await EditProposal.create(doc)).toObject())
  },
  async findById(userId, projectId, id) {
    return valid(id) && valid(String(projectId)) && valid(String(userId)) ? view(await EditProposal.findOne({ _id: id, userId, projectId }).lean()) : null
  },
  // Usulan pending dari versi lama menjadi stale (tidak mengisi batas pending).
  async staleOthers(userId, projectId, versionId) {
    const r = await EditProposal.updateMany({ userId, projectId, status: 'pending', baseVersionId: { $ne: versionId } }, { $set: { status: 'stale', decidedAt: new Date() } })
    return r.modifiedCount
  },
  async list(userId, projectId) {
    return (await EditProposal.find({ userId, projectId }).sort({ createdAt: -1 }).limit(50).lean()).map(view)
  },
  async countPending(userId, projectId) {
    return EditProposal.countDocuments({ userId, projectId, status: 'pending' })
  },
  async transition(id, from, patch) {
    return view(await EditProposal.findOneAndUpdate({ _id: id, status: from }, { $set: patch }, { new: true }).lean())
  }
}

const current = {
  async getCurrent(userId, projectId) {
    const svc = await projects()
    try {
      const { project, currentVersion } = await svc.getProject(userId, projectId)
      return {
        project: { revision: project.revision },
        version: currentVersion ? { id: String(currentVersion._id), number: currentVersion.number, format: currentVersion.format, source: currentVersion.source, parse: currentVersion.parse } : null
      }
    } catch (err) {
      if (isAppError(err) && err.code === 'NOT_FOUND') return null
      throw err
    }
  }
}

const versions = {
  async save({ userId, projectId, source, format, baseRevision, note }) {
    const svc = await projects()
    return svc.saveVersion(userId, projectId, { source, format, baseRevision, origin: 'ai_edit_accepted', note })
  }
}

let service
export async function editsService() {
  await dbConnect()
  if (!service) {
    const lit = await literature()
    service = createEditService({
      current,
      store,
      versions,
      refs: { listForContext: (u, p) => lit.listForContext(u, p) },
      log: (e) => AiUsageLog.create({ projectId: e.projectId, userId: e.userId, kind: e.kind, sections: e.sections, summary: e.summary })
    })
  }
  return service
}
