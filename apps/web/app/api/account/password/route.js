import bcrypt from 'bcryptjs'
import { dbConnect, User } from '@publication-prepare/db'
import { AppError, validatePassword } from '@publication-prepare/core'
import { withApi, readJson } from '../../../../lib/api'

export const dynamic = 'force-dynamic'

// Ganti password sendiri (wajib password lama). Semua sesi lama dicabut; klien keluar lalu masuk ulang.
// Akun Google-only tidak memiliki password lokal: gunakan "Lupa password" untuk menetapkannya.
export const PATCH = withApi(
  async ({ request, session }) => {
    const body = await readJson(request, 2_000)
    await dbConnect()
    const user = await User.findById(session.user.id).select('password').lean()
    if (!user) throw new AppError('NOT_FOUND', 'Data tidak ditemukan')
    if (!user.password) throw new AppError('VALIDATION_ERROR', 'Akun ini belum memiliki password. Gunakan Lupa password untuk menetapkannya.')
    const current = typeof body.currentPassword === 'string' ? body.currentPassword : ''
    if (!current || !(await bcrypt.compare(current, user.password))) throw new AppError('VALIDATION_ERROR', 'Password lama salah')
    const next = validatePassword(body.newPassword)
    if (next === current) throw new AppError('VALIDATION_ERROR', 'Password baru harus berbeda dari password lama')
    await User.updateOne({ _id: user._id }, { $set: { password: await bcrypt.hash(next, 12), sessionsValidAfter: new Date() } })
    return { changed: true }
  },
  { rateLimit: { name: 'account-password', windowMs: 60 * 60 * 1000, max: 10 } }
)
