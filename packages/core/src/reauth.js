'use strict'

// Re-autentikasi segar untuk tindakan tidak dapat dibatalkan pada akun TANPA password (login Google saja, QA/T7-06).
// Token JWT membawa `authProvider` dan `authAt` (detik) yang dicatat hanya saat SIGN-IN (bukan saat token diperbarui), sehingga
// sesi curian yang sudah lama tidak dapat menghapus akun: pengguna harus menyelesaikan masuk Google ulang dalam `maxAgeSec`.
const REAUTH_MAX_AGE_SEC = 300

function isFreshGoogleAuth(token, nowSec = Math.floor(Date.now() / 1000), maxAgeSec = REAUTH_MAX_AGE_SEC) {
  if (!token || token.authProvider !== 'google') return false
  const at = Number(token.authAt)
  return Number.isFinite(at) && at <= nowSec + 5 && nowSec - at <= maxAgeSec
}

module.exports = { isFreshGoogleAuth, REAUTH_MAX_AGE_SEC }
