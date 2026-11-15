import bcrypt from 'bcryptjs'
import { dbConnect, User } from '@publication-prepare/db'
import { sendVerificationEmail } from '@publication-prepare/mailer'
import { AppError, normalizeEmail, validatePassword, validateName, generateToken } from '@publication-prepare/core'
import { withApi, readJson, enforceLimit, created } from '../../../../lib/api'

const PROFESSIONS = ['dosen', 'mahasiswa_s2', 'mahasiswa_s3', 'peneliti', 'lainnya']
const DAY_MS = 24 * 60 * 60 * 1000

export const POST = withApi(
  async ({ request, ip, log }) => {
    enforceLimit({ name: 'register', key: ip, windowMs: 60 * 60 * 1000, max: 5 })

    const body = await readJson(request)
    const name = validateName(body.name)
    const email = normalizeEmail(body.email)
    const password = validatePassword(body.password)
    const profession = PROFESSIONS.includes(body.profession) ? body.profession : undefined
    const institution =
      typeof body.institution === 'string' && body.institution.trim()
        ? body.institution.trim().slice(0, 200)
        : undefined

    await dbConnect()
    if (await User.findOne({ email })) throw new AppError('CONFLICT', 'Email sudah terdaftar')

    const token = generateToken()
    let user
    try {
      user = await User.create({
        name,
        email,
        password: await bcrypt.hash(password, 12),
        profession,
        institution,
        emailVerificationToken: token.hash,
        emailVerificationExpires: new Date(Date.now() + DAY_MS)
      })
    } catch (err) {
      if (err?.code === 11000) throw new AppError('CONFLICT', 'Email sudah terdaftar')
      throw err
    }

    try {
      await sendVerificationEmail(user.email, user.name, token.raw)
    } catch (err) {
      log.warn('verification_email_failed', { err })
    }

    return created({ id: String(user._id), email: user.email })
  },
  { auth: false }
)
