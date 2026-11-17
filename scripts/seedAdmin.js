// Membuat akun ADMIN (idempoten). Kredensial dibaca dari ENV saat dijalankan, TIDAK pernah disimpan di repo dan TIDAK dicetak:
//   ADMIN_EMAIL=admin@contoh.id ADMIN_PASSWORD='(minimal 12 karakter)' npm run seed:admin
// Akun baru dibuat terverifikasi dan aktif dengan peran admin. Bila email sudah ada: peran admin, aktif, dan terverifikasi ditegakkan, tetapi
// password TIDAK diubah kecuali dengan flag eksplisit --reset-password (mencabut sesi lama). Password minimal 12 karakter bila diperlukan.
// Butuh MONGODB_URI (dari env proses atau apps/web/.env.local / .env).
const path = require('node:path')
const fs = require('node:fs')
for (const f of [process.env.ENV_FILE, path.join(__dirname, '..', 'apps', 'web', '.env.local'), path.join(__dirname, '..', '.env')]) {
  if (f && fs.existsSync(f)) require('dotenv').config({ path: f })
}
const bcrypt = require('bcryptjs')
const mongoose = require('mongoose')
const { dbConnect, User } = require('../packages/db')
const { normalizeEmail, validateName } = require('../packages/core')

;(async () => {
  const email = normalizeEmail(process.env.ADMIN_EMAIL || '')
  const password = process.env.ADMIN_PASSWORD || ''
  const reset = process.argv.includes('--reset-password')
  const name = validateName(process.env.ADMIN_NAME || 'Administrator')
  await dbConnect()
  const existing = await User.findOne({ email }).select('_id').lean()
  const needPassword = !existing || reset
  if (needPassword && (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72)) throw new Error('ADMIN_PASSWORD wajib 12-72 byte')
  if (existing) {
    const set = { role: 'admin', isActive: true, emailVerified: true }
    if (reset) Object.assign(set, { password: await bcrypt.hash(password, 12), sessionsValidAfter: new Date() })
    await User.updateOne({ _id: existing._id }, { $set: set })
    console.log(`Admin diperbarui: ${email}${reset ? ' (password direset)' : ' (password tidak diubah)'}`)
  } else {
    await User.create({ name, email, password: await bcrypt.hash(password, 12), role: 'admin', emailVerified: true, isActive: true })
    console.log(`Admin dibuat: ${email}`)
  }
  await mongoose.disconnect()
})().catch((e) => {
  console.error('seed:admin gagal:', (e && (e.code || e.message)) || 'error') // tidak mencetak nilai kredensial
  process.exit(1)
})
