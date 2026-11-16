import bcrypt from 'bcryptjs'
import { dbConnect, User, Project, deleteAccountCompletely } from '@publication-prepare/db'
import { AppError, normalizeEmail, validateName, validatePassword, effectivePlan, createLogger } from '@publication-prepare/core'

// Manajemen pengguna oleh admin. Peran dibaca dari DATABASE pada setiap permintaan (bukan dari JWT yang bisa basi).
// Pengaman: admin tidak dapat menonaktifkan/menghapus/menurunkan dirinya sendiri, dan admin aktif terakhir tidak dapat hilang.
const log = createLogger()
const PLANS = ['free', 'pro', 'institutional']
const isId = (id) => typeof id === 'string' && /^[0-9a-f]{24}$/i.test(id)

export async function requireAdmin(session) {
  await dbConnect()
  const id = session && session.user && session.user.id
  const me = isId(id) ? await User.findById(id).select('role isActive email').lean() : null
  if (!me || me.isActive === false || me.role !== 'admin') throw new AppError('FORBIDDEN', 'Hanya admin yang dapat mengakses fitur ini')
  return { id: String(me._id), email: me.email }
}

export function publicUser(u, projectCount = 0, now = new Date()) {
  return {
    id: String(u._id),
    name: u.name,
    email: u.email,
    role: u.role,
    isActive: u.isActive !== false,
    emailVerified: Boolean(u.emailVerified),
    plan: effectivePlan(u.subscription, now),
    subscriptionEnd: (u.subscription && u.subscription.endDate) || null,
    trialPapersCreated: u.trialPapersCreated || 0,
    projects: projectCount,
    oauth: u.oauthProvider || null,
    createdAt: u.createdAt
  }
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export async function listUsers({ q = '', page = 1, limit = 20 }) {
  await dbConnect()
  const lim = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 100)
  const pg = Math.max(Number.parseInt(page, 10) || 1, 1)
  const term = typeof q === 'string' ? q.trim().slice(0, 100) : ''
  const filter = term ? { $or: [{ email: { $regex: escapeRe(term), $options: 'i' } }, { name: { $regex: escapeRe(term), $options: 'i' } }] } : {}
  const [total, rows] = await Promise.all([User.countDocuments(filter), User.find(filter).sort({ createdAt: -1 }).skip((pg - 1) * lim).limit(lim).select('-password -emailVerificationToken -passwordResetToken').lean()])
  const counts = await Project.aggregate([{ $match: { userId: { $in: rows.map((r) => r._id) } } }, { $group: { _id: '$userId', n: { $sum: 1 } } }])
  const byUser = new Map(counts.map((c) => [String(c._id), c.n]))
  return { users: rows.map((u) => publicUser(u, byUser.get(String(u._id)) || 0)), total, page: pg, limit: lim }
}

async function activeAdminCount(exceptId) {
  return User.countDocuments({ role: 'admin', isActive: { $ne: false }, ...(exceptId ? { _id: { $ne: exceptId } } : {}) })
}

export async function createUser(admin, input) {
  await dbConnect()
  const name = validateName(input.name)
  const email = normalizeEmail(input.email)
  const password = validatePassword(input.password)
  const role = input.role === 'admin' ? 'admin' : 'user'
  if (await User.findOne({ email })) throw new AppError('CONFLICT', 'Email sudah terdaftar')
  let u
  try {
    u = await User.create({ name, email, password: await bcrypt.hash(password, 12), role, emailVerified: true })
  } catch (err) {
    if (err && err.code === 11000) throw new AppError('CONFLICT', 'Email sudah terdaftar')
    throw err
  }
  log.info('admin_action', { action: 'create_user', actor: admin.id, target: String(u._id), role })
  return publicUser(u.toObject())
}

export async function updateUser(admin, targetId, patch) {
  await dbConnect()
  if (!isId(targetId)) throw new AppError('NOT_FOUND', 'Data tidak ditemukan')
  const target = await User.findById(targetId).lean()
  if (!target) throw new AppError('NOT_FOUND', 'Data tidak ditemukan')
  const self = String(target._id) === admin.id
  const set = {}
  const unset = {}
  let revoke = false
  const actions = []

  if (patch.name !== undefined) { set.name = validateName(patch.name); actions.push('name') }
  if (patch.isActive !== undefined) {
    if (typeof patch.isActive !== 'boolean') throw new AppError('VALIDATION_ERROR', 'isActive harus true atau false')
    if (self && !patch.isActive) throw new AppError('CONFLICT', 'Anda tidak dapat menonaktifkan akun Anda sendiri', { details: { code: 'SELF_ACTION' } })
    if (!patch.isActive && target.role === 'admin' && (await activeAdminCount(target._id)) === 0) throw new AppError('CONFLICT', 'Admin aktif terakhir tidak dapat dinonaktifkan', { details: { code: 'LAST_ADMIN' } })
    set.isActive = patch.isActive
    if (!patch.isActive) revoke = true
    actions.push(patch.isActive ? 'activate' : 'deactivate')
  }
  if (patch.role !== undefined) {
    if (!['user', 'admin'].includes(patch.role)) throw new AppError('VALIDATION_ERROR', 'role harus user atau admin')
    if (self && patch.role !== 'admin') throw new AppError('CONFLICT', 'Anda tidak dapat menurunkan peran Anda sendiri', { details: { code: 'SELF_ACTION' } })
    if (target.role === 'admin' && patch.role !== 'admin' && (await activeAdminCount(target._id)) === 0) throw new AppError('CONFLICT', 'Admin aktif terakhir tidak dapat diturunkan', { details: { code: 'LAST_ADMIN' } })
    set.role = patch.role
    if (patch.role !== target.role) revoke = true
    actions.push(`role:${patch.role}`)
  }
  if (patch.plan !== undefined) {
    if (!PLANS.includes(patch.plan)) throw new AppError('VALIDATION_ERROR', 'plan tidak valid')
    if (patch.plan === 'free') {
      set['subscription.plan'] = 'free'
      set['subscription.isActive'] = false
      unset['subscription.endDate'] = ''
    } else {
      const days = Number.isInteger(patch.planDays) ? patch.planDays : 30
      if (days < 1 || days > 3650) throw new AppError('VALIDATION_ERROR', 'planDays harus 1-3650')
      set['subscription.plan'] = patch.plan
      set['subscription.isActive'] = true
      set['subscription.startDate'] = target.subscription && target.subscription.startDate ? target.subscription.startDate : new Date()
      set['subscription.endDate'] = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    }
    actions.push(`plan:${patch.plan}`)
  }
  if (patch.resetTrial === true) { set.trialPapersCreated = 0; actions.push('reset_trial') }
  if (patch.newPassword !== undefined) {
    set.password = await bcrypt.hash(validatePassword(patch.newPassword), 12)
    revoke = true
    actions.push('set_password')
  }
  if (!actions.length) throw new AppError('VALIDATION_ERROR', 'Tidak ada perubahan yang valid')
  if (revoke && !self) set.sessionsValidAfter = new Date() // cabut sesi lama pengguna lain (sesi admin sendiri tidak diputus)
  const update = { $set: set }
  if (Object.keys(unset).length) update.$unset = unset
  const u = await User.findByIdAndUpdate(targetId, update, { new: true }).select('-password -emailVerificationToken -passwordResetToken').lean()
  log.info('admin_action', { action: 'update_user', actor: admin.id, target: targetId, changes: actions })
  return publicUser(u, await Project.countDocuments({ userId: u._id }))
}

export async function deleteUser(admin, targetId, confirmEmail) {
  await dbConnect()
  if (!isId(targetId)) throw new AppError('NOT_FOUND', 'Data tidak ditemukan')
  const target = await User.findById(targetId).select('email role').lean()
  if (!target) throw new AppError('NOT_FOUND', 'Data tidak ditemukan')
  if (String(target._id) === admin.id) throw new AppError('CONFLICT', 'Gunakan halaman Akun untuk menghapus akun Anda sendiri', { details: { code: 'SELF_ACTION' } })
  if (target.role === 'admin' && (await activeAdminCount(target._id)) === 0) throw new AppError('CONFLICT', 'Admin aktif terakhir tidak dapat dihapus', { details: { code: 'LAST_ADMIN' } })
  if (typeof confirmEmail !== 'string' || confirmEmail.trim().toLowerCase() !== target.email) throw new AppError('VALIDATION_ERROR', 'Email konfirmasi tidak cocok')
  const r = await deleteAccountCompletely(targetId)
  log.info('admin_action', { action: 'delete_user', actor: admin.id, target: targetId, projects: r.projects })
  return { deleted: true, projects: r.projects }
}
