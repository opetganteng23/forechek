const crypto = require('node:crypto')

// Verifikasi signature notifikasi Midtrans: sha512(order_id + status_code + gross_amount + serverKey).
// Kunci kosong HARUS menolak: tanpa ini signature yang dihitung dengan string "undefined" akan lolos (QA-01).
function verifyMidtransSignature(body, serverKey) {
  if (typeof serverKey !== 'string' || serverKey.length === 0) return false
  if (!body || typeof body !== 'object') return false
  const { order_id, status_code, gross_amount, signature_key } = body
  for (const v of [order_id, status_code, gross_amount, signature_key]) {
    if (typeof v !== 'string' || v.length === 0) return false
  }
  const expected = crypto.createHash('sha512').update(`${order_id}${status_code}${gross_amount}${serverKey}`).digest()
  let given
  try {
    given = Buffer.from(signature_key, 'hex')
  } catch {
    return false
  }
  return given.length === expected.length && crypto.timingSafeEqual(given, expected)
}

module.exports = { verifyMidtransSignature }
