const { AppError } = require('./errors')

const OBJECT_ID_RE = /^[a-f\d]{24}$/i

function isObjectId(value) {
  return typeof value === 'string' && OBJECT_ID_RE.test(value)
}

// Menolak non-string (mis. { "$ne": null }) agar tidak bisa disisipkan ke query Mongo.
function asString(value, field = 'value') {
  if (typeof value !== 'string') {
    throw new AppError('VALIDATION_ERROR', `${field} harus berupa teks`)
  }
  return value
}

function assertObjectId(value, field = 'id') {
  if (!isObjectId(value)) {
    // Sengaja NOT_FOUND, bukan VALIDATION_ERROR: tidak membedakan "tidak ada" dan "bukan milik Anda".
    throw new AppError('NOT_FOUND', 'Data tidak ditemukan')
  }
  return value
}

// Filter kepemilikan: SEMUA query resource milik pengguna wajib lewat sini (MTS Bagian 25.2).
function ownedFilter(userId, id) {
  assertObjectId(userId, 'userId')
  assertObjectId(id)
  return { _id: id, userId }
}

module.exports = { isObjectId, asString, assertObjectId, ownedFilter }
