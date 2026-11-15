import { dbConnect, User } from '@publication-prepare/db'
import { sendVerificationEmail } from '@publication-prepare/mailer'
import { normalizeEmail, generateToken } from '@publication-prepare/core'
import { withApi, readJson, enforceLimit } from '../../../../lib/api'

const DAY_MS = 24 * 60 * 60 * 1000

export const POST = withApi(
  async ({ request, ip, log }) => {
    const body = await readJson(request)
    const email = normalizeEmail(body.email)
    enforceLimit({ name: 'resend-ip', key: ip, windowMs: 60 * 60 * 1000, max: 10 })
    enforceLimit({ name: 'resend-email', key: email, windowMs: 60 * 60 * 1000, max: 3 })

    await dbConnect()
    const user = await User.findOne({ email })
    if (user && !user.emailVerified && user.password) {
      const token = generateToken()
      await User.updateOne(
        { _id: user._id },
        { $set: { emailVerificationToken: token.hash, emailVerificationExpires: new Date(Date.now() + DAY_MS) } }
      )
      try {
        await sendVerificationEmail(user.email, user.name, token.raw)
      } catch (err) {
        log.warn('verification_email_failed', { err })
      }
    }

    // Respons selalu sama agar tidak membocorkan apakah email terdaftar.
    return { message: 'Jika email terdaftar dan belum terverifikasi, tautan verifikasi baru telah dikirim' }
  },
  { auth: false }
)
