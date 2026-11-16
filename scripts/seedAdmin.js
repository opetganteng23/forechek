// Membuat/memperbarui akun ADMIN (idempoten). Kredensial dibaca dari ENV saat dijalankan, TIDAK pernah disimpan di repo dan TIDAK dicetak:
//   ADMIN_EMAIL=admin@contoh.id ADMIN_PASSWORD='...' npm run seed:admin
// Akun dibuat terverifikasi dan aktif dengan peran admin. Bila email sudah ada: peran admin, aktif, terverifikasi, dan password diatur ulang
// (sesi lama dicabut). Butuh MONGODB_URI (dari env proses atau apps/web/.env.local / .env).
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
  if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) throw new Error('ADMIN_PASSWORD wajib 8-72 byte')
  const name = validateName(process.env.ADMIN_NAME || 'Administrator')
  await dbConnect()
  const hash = await bcrypt.hash(password, 12)
  const existing = await User.findOne({ email }).select('_id').lean()
  if (existing) {
    await User.updateOne({ _id: existing._id }, { $set: { role: 'admin', isActive: true, emailVerified: true, password: hash, sessionsValidAfter: new Date() } })
    console.log(`Admin diperbarui: ${email}`)
  } else {
    await User.create({ name, email, password: hash, role: 'admin', emailVerified: true, isActive: true })
    console.log(`Admin dibuat: ${email}`)
  }
  await mongoose.disconnect()
})().catch((e) => {
  console.error('seed:admin gagal:', (e && (e.code || e.message)) || 'error') // tidak mencetak nilai kredensial
  process.exit(1)
})
