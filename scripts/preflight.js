// Preflight sebelum start/deploy: memeriksa env, koneksi MongoDB, (opsional) Redis, dan SMTP; mencetak LULUS/GAGAL/PERINGATAN/DILEWATI per
// butir. HANYA nama variabel yang dicetak, tidak pernah nilainya. Kode keluar 1 bila ada GAGAL.
//   npm run preflight                 pemeriksaan penuh (termasuk koneksi nyata ke Mongo/Redis/SMTP bila dikonfigurasi)
//   npm run preflight -- --no-network hanya pemeriksaan konfigurasi (tanpa koneksi)
//   npm run preflight -- --json       keluaran JSON
//   npm run preflight -- --no-env-file jangan memuat apps/web/.env.local (hanya env proses)
// Env dibaca dari proses; bila ada, apps/web/.env.local ikut dimuat (tidak menimpa env proses).
const path = require('node:path')
const fs = require('node:fs')
const { createRequire } = require('node:module')

const envFile = path.join(__dirname, '..', 'apps', 'web', '.env.local')
if (!process.argv.includes('--no-env-file') && fs.existsSync(envFile)) require('dotenv').config({ path: envFile })

const { preflightConfigItems } = require('../packages/core')
const args = new Set(process.argv.slice(2))
const noNet = args.has('--no-network')
const hasModule = (name) => {
  try {
    createRequire(path.join(__dirname, '..', 'package.json')).resolve(name)
    return true
  } catch {
    return false
  }
}

const withTimeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label}: batas waktu ${ms} ms`)), ms))])

async function checkMongo(env) {
  if (!env.MONGODB_URI) return { name: 'Koneksi MongoDB', status: 'DILEWATI', detail: 'MONGODB_URI kosong' }
  if (noNet) return { name: 'Koneksi MongoDB', status: 'DILEWATI', detail: '--no-network' }
  const mongoose = require('mongoose')
  const conn = mongoose.createConnection()
  try {
    await withTimeout(conn.openUri(env.MONGODB_URI, { serverSelectionTimeoutMS: 4000, connectTimeoutMS: 4000 }), 6000, 'MongoDB')
    await withTimeout(conn.db.admin().ping(), 4000, 'ping MongoDB')
    return { name: 'Koneksi MongoDB', status: 'LULUS', detail: 'ping berhasil' }
  } catch (err) {
    // Pesan driver dapat memuat host/URI: hanya kelas galat yang dicetak.
    return { name: 'Koneksi MongoDB', status: 'GAGAL', detail: `tidak dapat terhubung (${(err && (err.name || err.code)) || 'error'}); periksa MONGODB_URI, jaringan, dan allowlist IP` }
  } finally {
    conn.close().catch(() => {})
  }
}

async function checkRedis(env) {
  if (!env.REDIS_URL) return { name: 'Koneksi Redis', status: 'DILEWATI', detail: 'REDIS_URL kosong (batas laju per proses; opsional)' }
  if (!hasModule('ioredis')) return { name: 'Koneksi Redis', status: 'GAGAL', detail: 'REDIS_URL diisi tetapi paket ioredis belum terpasang (npm i ioredis)' }
  if (noNet) return { name: 'Koneksi Redis', status: 'DILEWATI', detail: '--no-network' }
  const IORedis = require('ioredis')
  const client = new IORedis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 3000, retryStrategy: () => null })
  client.on('error', () => {})
  try {
    await withTimeout(client.connect(), 5000, 'Redis')
    const pong = await withTimeout(client.ping(), 3000, 'ping Redis')
    return { name: 'Koneksi Redis', status: pong === 'PONG' ? 'LULUS' : 'GAGAL', detail: 'ping' }
  } catch (err) {
    return { name: 'Koneksi Redis', status: 'GAGAL', detail: `tidak dapat terhubung (${(err && (err.name || err.code)) || 'error'})` }
  } finally {
    client.disconnect()
  }
}

async function checkSmtp(env) {
  const need = ['GMAIL_USER', 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN']
  const missing = need.filter((n) => !env[n])
  if (missing.length) return { name: 'SMTP (Gmail OAuth2)', status: 'DILEWATI', detail: `GMAIL_* belum lengkap: ${missing.join(', ')}` }
  if (noNet) return { name: 'SMTP (Gmail OAuth2)', status: 'DILEWATI', detail: '--no-network' }
  try {
    const nodemailer = require('nodemailer')
    const t = nodemailer.createTransport({ service: 'gmail', connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 10000, auth: { type: 'OAuth2', user: env.GMAIL_USER, clientId: env.GMAIL_CLIENT_ID, clientSecret: env.GMAIL_CLIENT_SECRET, refreshToken: env.GMAIL_REFRESH_TOKEN, accessToken: env.GMAIL_ACCESS_TOKEN } })
    await withTimeout(t.verify(), 15000, 'SMTP')
    return { name: 'SMTP (Gmail OAuth2)', status: 'LULUS', detail: 'autentikasi OAuth2 diterima (tidak ada email dikirim)' }
  } catch (err) {
    return { name: 'SMTP (Gmail OAuth2)', status: 'GAGAL', detail: `verifikasi gagal (${(err && (err.code || err.name)) || 'error'}); periksa refresh token/klien OAuth` }
  }
}

;(async () => {
  const env = process.env
  const items = [...preflightConfigItems(env, { hasModule }), await checkMongo(env), await checkRedis(env), await checkSmtp(env)]
  if (args.has('--json')) console.log(JSON.stringify(items, null, 2))
  else {
    for (const i of items) console.log(`[${i.status}] ${i.name} - ${i.detail}`)
    const c = (s) => items.filter((i) => i.status === s).length
    console.log(`\nRingkasan: ${c('LULUS')} LULUS, ${c('GAGAL')} GAGAL, ${c('PERINGATAN')} PERINGATAN, ${c('DILEWATI')} DILEWATI`)
  }
  process.exit(items.some((i) => i.status === 'GAGAL') ? 1 : 0)
})().catch((e) => { console.error('preflight error:', (e && e.name) || 'error'); process.exit(2) })
