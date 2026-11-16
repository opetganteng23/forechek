import bcrypt from 'bcryptjs'
import { dbConnect, User } from '@publication-prepare/db'
import { AppError, asString, hashToken, validatePassword } from '@publication-prepare/core'
import { withApi, readJson, enforceLimit } from '../../../../lib/api'

export const POST = withApi(
  async ({ request, ip }) => {
    await enforceLimit({ name: 'reset-password', key: ip, windowMs: 60 * 60 * 1000, max: 10 })

    const body = await readJson(request)
    const tokenHash = hashToken(asString(body.token, 'token'))
    const password = validatePassword(body.password)
    const passwordHash = await bcrypt.hash(password, 12)

    await dbConnect()
    // Satu operasi atomik: token hanya bisa dipakai sekali, bahkan jika dua permintaan datang bersamaan.
    const user = await User.findOneAndUpdate(
      { passwordResetToken: tokenHash, passwordResetExpires: { $gt: new Date() } },
      { $set: { password: passwordHash, sessionsValidAfter: new Date() }, $unset: { passwordResetToken: 1, passwordResetExpires: 1 } }
    )
    if (!user) throw new AppError('VALIDATION_ERROR', 'Token tidak valid atau sudah kedaluwarsa')

    return { message: 'Password berhasil direset' }
  },
  { auth: false }
)
