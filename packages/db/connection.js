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
    cached.promise = mongoose
      .connect(MONGODB_URI, { bufferCommands: false })
      .then((m) => m)
  }

  cached.conn = await cached.promise
  return cached.conn
}

module.exports = dbConnect
