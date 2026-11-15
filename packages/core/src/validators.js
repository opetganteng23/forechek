const { AppError } = require('./errors')

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizeEmail(email) {
  if (typeof email !== 'string') throw new AppError('VALIDATION_ERROR', 'Email harus berupa teks')
  const value = email.trim().toLowerCase()
  if (value.length > 254 || !EMAIL_RE.test(value)) {
    throw new AppError('VALIDATION_ERROR', 'Format email tidak valid')
  }
  return value
}

// bcrypt hanya memakai 72 byte pertama; password lebih panjang akan terpotong diam-diam.
const MAX_PASSWORD_BYTES = 72

function validatePassword(password) {
  if (typeof password !== 'string') throw new AppError('VALIDATION_ERROR', 'Password harus berupa teks')
  if (password.length < 8) throw new AppError('VALIDATION_ERROR', 'Password minimal 8 karakter')
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    throw new AppError('VALIDATION_ERROR', `Password maksimal ${MAX_PASSWORD_BYTES} byte`)
  }
  return password
}

function validateName(name) {
  if (typeof name !== 'string') throw new AppError('VALIDATION_ERROR', 'Nama harus berupa teks')
  const value = name.trim()
  if (value.length < 2 || value.length > 100) {
    throw new AppError('VALIDATION_ERROR', 'Nama harus 2-100 karakter')
  }
  return value
}

// Token acak 32 byte (hex) yang dikirim ke pengguna; yang disimpan di DB hanya hash-nya.
const crypto = require('crypto')
function generateToken() {
  const raw = crypto.randomBytes(32).toString('hex')
  return { raw, hash: hashToken(raw) }
}

function hashToken(raw) {
  if (typeof raw !== 'string' || raw.length < 16 || raw.length > 256) {
    throw new AppError('VALIDATION_ERROR', 'Token tidak valid')
  }
  return crypto.createHash('sha256').update(raw).digest('hex')
}

module.exports = { normalizeEmail, validatePassword, validateName, generateToken, hashToken, MAX_PASSWORD_BYTES }
