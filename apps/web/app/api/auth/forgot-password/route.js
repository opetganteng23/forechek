import { dbConnect, User } from '@publication-prepare/db'
import { sendPasswordResetEmail } from '@publication-prepare/mailer'
import { normalizeEmail, generateToken } from '@publication-prepare/core'
import { withApi, readJson, enforceLimit } from '../../../../lib/api'

const HOUR_MS = 60 * 60 * 1000

export const POST = withApi(
  async ({ request, ip, log }) => {
    const body = await readJson(request)
    const email = normalizeEmail(body.email)
    await enforceLimit({ name: 'forgot-ip', key: ip, windowMs: HOUR_MS, max: 10 })
    await enforceLimit({ name: 'forgot-email', key: email, windowMs: HOUR_MS, max: 3 })

    await dbConnect()
    const user = await User.findOne({ email })
    if (user && user.isActive !== false) {
      const token = generateToken()
      await User.updateOne(
        { _id: user._id },
        { $set: { passwordResetToken: token.hash, passwordResetExpires: new Date(Date.now() + HOUR_MS) } }
      )
      // Tidak di-await: waktu respons tidak boleh membedakan email terdaftar dan tidak (QA-13).
      sendPasswordResetEmail(user.email, user.name, token.raw).catch((err) => log.warn('reset_email_failed', { err }))
    }

    return { message: 'Jika email terdaftar, instruksi reset telah dikirim' }
  },
  { auth: false }
)
