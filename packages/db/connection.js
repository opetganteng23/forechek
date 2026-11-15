const mongoose = require('mongoose')

const MONGODB_URI = process.env.MONGODB_URI

let cached = global._mongooseConn

if (!cached) {
  cached = global._mongooseConn = { conn: null, promise: null }
}

async function dbConnect() {
  if (cached.conn) return cached.conn

  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not set in environment variables')
  }

  if (!cached.promise) {
    // serverSelectionTimeoutMS: tanpa ini request menggantung 30 detik saat DB mati (QA-15).
    cached.promise = mongoose
      .connect(MONGODB_URI, { bufferCommands: false, serverSelectionTimeoutMS: 5000 })
      .then((m) => m)
  }

  try {
    cached.conn = await cached.promise
  } catch (err) {
    // Promise yang ditolak tidak boleh di-cache, kalau tidak kegagalan pertama menjadi permanen (QA-04).
    cached.promise = null
    throw err
  }
  return cached.conn
}

module.exports = dbConnect
