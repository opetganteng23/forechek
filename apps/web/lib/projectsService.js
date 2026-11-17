import { dbConnect, Project, ManuscriptVersion, User, newObjectId } from '@publication-prepare/db'
import { createProjectService, createTrialGate } from '@publication-prepare/manuscript'
import { getTrialLimit } from './planSettings'

// Trial: akun tanpa langganan aktif hanya dapat membuat TRIAL_PAPER_LIMIT paper (default 1) seumur akun. Klaim atomik di MongoDB:
// $expr atas penghitung (field yang belum ada dianggap 0), jadi pembuatan paralel tidak dapat melewati batas.
const idOk = (id) => /^[0-9a-f]{24}$/i.test(String(id))
export const trialGate = createTrialGate({
  limit: getTrialLimit, // dinamis: dapat diubah superadmin
  users: {
    get: async (id) => (idOk(id) ? User.findById(id).select('subscription trialPapersCreated role').lean() : null),
    claim: async (id, limit) => Boolean(limit > 0 && (await User.findOneAndUpdate({ _id: id, $expr: { $lt: [{ $ifNull: ['$trialPapersCreated', 0] }, limit] } }, { $inc: { trialPapersCreated: 1 } }))),
    release: async (id) => { await User.updateOne({ _id: id, trialPapersCreated: { $gt: 0 } }, { $inc: { trialPapersCreated: -1 } }) }
  }
})

const service = createProjectService({ Project, ManuscriptVersion, newObjectId, projectGate: trialGate })

// Memastikan koneksi DB sebelum setiap operasi service.
export async function projects() {
  await dbConnect()
  return service
}
