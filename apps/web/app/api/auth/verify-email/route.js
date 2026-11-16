import { dbConnect, User } from '@publication-prepare/db'
import { AppError, asString, hashToken } from '@publication-prepare/core'
import { withApi, readJson, enforceLimit } from '../../../../lib/api'

// POST (bukan GET) agar pemindai tautan di email tidak menghabiskan token tanpa sepengetahuan pengguna.
export const POST = withApi(
  async ({ request, ip }) => {
    await enforceLimit({ name: 'verify-email', key: ip, windowMs: 60 * 60 * 1000, max: 20 })

    const body = await readJson(request)
    const tokenHash = hashToken(asString(body.token, 'token'))

    await dbConnect()
    const user = await User.findOneAndUpdate(
      { emailVerificationToken: tokenHash, emailVerificationExpires: { $gt: new Date() } },
      { $set: { emailVerified: true }, $unset: { emailVerificationToken: 1, emailVerificationExpires: 1 } }
    )
    if (!user) throw new AppError('VALIDATION_ERROR', 'Token tidak valid atau sudah kedaluwarsa')

    return { message: 'Email berhasil diverifikasi' }
  },
  { auth: false }
)
