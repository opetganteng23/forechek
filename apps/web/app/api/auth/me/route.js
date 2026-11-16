import { dbConnect, User } from '@publication-prepare/db'
import { withApi } from '../../../../lib/api'
import { trialGate } from '../../../../lib/projectsService'

export const GET = withApi(async ({ session }) => {
  const { id, name, email, role } = session.user
  await dbConnect()
  const u = await User.findById(id).select('password').lean()
  return { id, name, email, role, hasPassword: Boolean(u && u.password), trial: await trialGate.status(id) } // hasPassword: UI hapus akun meminta password atau masuk Google ulang
})
