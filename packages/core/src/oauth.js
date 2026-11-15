// Aturan penautan login Google ke akun yang sudah ada.
// Pencegahan "pre-hijacking": penyerang mendaftar dengan email korban + password miliknya (belum
// terverifikasi), lalu menunggu korban login via Google. Jika akun ditautkan begitu saja, penyerang
// tetap bisa masuk dengan password lamanya. Maka untuk akun yang emailnya belum terverifikasi,
// password dan token lama dibuang saat penautan.
function googleLinkUpdate(user, providerAccountId) {
  const set = { emailVerified: true }
  const unset = []

  if (!user.oauthId) {
    set.oauthProvider = 'google'
    set.oauthId = providerAccountId
  }

  if (!user.emailVerified) {
    unset.push('password', 'emailVerificationToken', 'emailVerificationExpires', 'passwordResetToken', 'passwordResetExpires')
  }

  return { set, unset }
}

module.exports = { googleLinkUpdate }
