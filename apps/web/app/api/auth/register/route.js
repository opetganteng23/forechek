import bcrypt from 'bcryptjs'
import { dbConnect, User } from '@publication-prepare/db'
import { sendVerificationEmail } from '@publication-prepare/mailer'
import { normalizeEmail, validatePassword, validateName, generateToken } from '@publication-prepare/core'
import { withApi, readJson, enforceLimit, created } from '../../../../lib/api'

const PROFESSIONS = ['dosen', 'mahasiswa_s2', 'mahasiswa_s3', 'peneliti', 'lainnya']
const DAY_MS = 24 * 60 * 60 * 1000

export const POST = withApi(
  async ({ request, ip, log }) => {
    await enforceLimit({ name: 'register', key: ip, windowMs: 60 * 60 * 1000, max: 5 })

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
    // Respons SAMA untuk email baru dan email yang sudah terdaftar (QA-25: tidak membocorkan keberadaan akun). Hash tetap dihitung agar
    // waktu respons tidak membedakan. Pemilik akun lama tidak diubah; tidak ada email dikirim untuk percobaan duplikat.
    const passwordHash = await bcrypt.hash(password, 12)
    const GENERIC = { message: 'Jika email dapat didaftarkan, akun dibuat dan tautan verifikasi dikirim ke email tersebut. Periksa kotak masuk Anda.' }
    if (await User.findOne({ email })) return created(GENERIC)

    const token = generateToken()
    let user
    try {
      user = await User.create({
        name,
        email,
        password: passwordHash,
        profession,
        institution,
        emailVerificationToken: token.hash,
        emailVerificationExpires: new Date(Date.now() + DAY_MS)
      })
    } catch (err) {
      if (err?.code === 11000) return created(GENERIC) // balapan: email baru saja terdaftar
      throw err
    }

    try {
      await sendVerificationEmail(user.email, user.name, token.raw)
    } catch (err) {
      log.warn('verification_email_failed', { err })
    }

    return created(GENERIC)
  },
  { auth: false }
)
