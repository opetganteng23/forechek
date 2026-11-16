import bcrypt from 'bcryptjs'
import { v2 as cloudinary } from 'cloudinary'
import { dbConnect, User, Manuscript, deleteAccountCompletely } from '@publication-prepare/db'
import { getToken } from 'next-auth/jwt'
import { AppError, asString, createLogger, isFreshGoogleAuth } from '@publication-prepare/core'
import { withApi, readJson } from '../../../lib/api'

export const dynamic = 'force-dynamic'
const log = createLogger()

// Hapus akun (QA-09, MTS 14): menghapus SEMUA proyek, versi naskah, chat, referensi, laporan, usulan, dan data model lama
// milik pengguna, berkas unggahan lama di Cloudinary (best effort), lalu akun itu sendiri. Tidak dapat dibatalkan.
// Konfirmasi: kata "HAPUS" + email persis + password (bila akun memakai password). Akun Google-only: wajib masuk Google ulang <= 5 menit (REAUTH_REQUIRED);
// cookie sesi yang dicuri saja tidak cukup.
// UsageLedger dan Payment dipertahankan (catatan teknis/keuangan tanpa isi naskah), hanya mereferensikan userId.
export const DELETE = withApi(
  async ({ request, session }) => {
    const body = await readJson(request, 2_000)
    await dbConnect()
    const user = await User.findById(session.user.id).select('email password').lean()
    if (!user) throw new AppError('NOT_FOUND', 'Data tidak ditemukan')
    if (body.confirmText !== 'HAPUS') throw new AppError('VALIDATION_ERROR', 'Ketik HAPUS untuk mengonfirmasi')
    if (asString(body.confirmEmail, 'confirmEmail').trim().toLowerCase() !== user.email) throw new AppError('VALIDATION_ERROR', 'Email konfirmasi tidak cocok')
    if (user.password) {
      const pw = typeof body.password === 'string' ? body.password : ''
      if (!pw || !(await bcrypt.compare(pw, user.password))) throw new AppError('VALIDATION_ERROR', 'Password salah')
    } else {
      // Akun tanpa password (Google saja): wajib masuk Google ulang dalam 5 menit (cookie sesi curian tidak cukup).
      const token = await getToken({ req: request })
      if (!isFreshGoogleAuth(token)) throw new AppError('FORBIDDEN', 'Verifikasi ulang dengan Google diperlukan sebelum menghapus akun', { details: { code: 'REAUTH_REQUIRED' } })
    }
    // Berkas unggahan lama (Cloudinary) dihapus lebih dulu selagi daftar publicId masih ada; kegagalan dicatat dan dilaporkan.
    let legacyFilesFailed = 0
    const files = await Manuscript.find({ userId: session.user.id }).select('filePublicId').lean()
    if (files.some((f) => f.filePublicId) && process.env.CLOUDINARY_CLOUD_NAME) {
      cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET })
      for (const f of files) {
        if (!f.filePublicId) continue
        try {
          await cloudinary.uploader.destroy(f.filePublicId, { resource_type: 'raw' })
        } catch (err) {
          legacyFilesFailed++
          log.warn('account_delete_cloudinary_failed', { err })
        }
      }
    } else if (files.some((f) => f.filePublicId)) legacyFilesFailed = files.filter((f) => f.filePublicId).length // Cloudinary tidak terkonfigurasi: tidak dapat dihapus
    const r = await deleteAccountCompletely(session.user.id)
    return { deleted: true, projects: r.projects, legacyFilesFailed }
  },
  { rateLimit: { name: 'account-delete', windowMs: 60 * 60 * 1000, max: 5 } }
)
