// Validasi environment. Hanya nama variabel yang dilaporkan, tidak pernah nilainya.
const GROUPS = {
  app: ['BASE_URL', 'NEXTAUTH_URL', 'NEXTAUTH_SECRET'],
  db: ['MONGODB_URI'],
  ai: ['ANTHROPIC_API_KEY'],
  mail: ['GMAIL_USER', 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'],
  google: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
  payment: ['MIDTRANS_SERVER_KEY', 'MIDTRANS_CLIENT_KEY']
}

function missingVars(env, groups) {
  const missing = []
  for (const g of groups) {
    const names = GROUPS[g]
    if (!names) throw new Error(`Grup env tidak dikenal: ${g}`)
    for (const n of names) {
      const v = env[n]
      if (v === undefined || v === '' || /^your-|<[^>]+>|x{5,}/i.test(String(v)) || /GANTI/.test(String(v))) missing.push(n) // placeholder dari .env.example bukan nilai
    }
  }
  return missing
}

function assertEnv(env, groups) {
  const missing = missingVars(env, groups)
  if (missing.length) throw new Error(`Environment belum lengkap: ${missing.join(', ')}`)
}

// Pemeriksaan boot (QA-16). Mengembalikan {errors, warnings}: HANYA nama variabel dan alasan, tidak pernah nilainya.
// Error menghentikan boot di produksi; di non-produksi hanya peringatan agar pengembangan lokal tetap berjalan.
function bootProblems(env = process.env, { hasModule } = {}) {
  const errors = []
  const warnings = []
  const prod = env.NODE_ENV === 'production'
  const need = (names) => missingVars(env, ['app', 'db'].filter((g) => GROUPS[g].some((n) => names.includes(n)))).filter((n) => names.includes(n))
  errors.push(...need(['MONGODB_URI', 'NEXTAUTH_SECRET', 'NEXTAUTH_URL']).map((n) => `${n} belum diisi`))
  if (prod) errors.push(...need(['BASE_URL']).map((n) => `${n} belum diisi (dipakai untuk tautan email)`))
  if (env.NEXTAUTH_SECRET && env.NEXTAUTH_SECRET.length < 32) (prod ? errors : warnings).push('NEXTAUTH_SECRET terlalu pendek (minimal 32 karakter)')
  if (prod && env.NEXTAUTH_URL && !/^https:\/\//.test(env.NEXTAUTH_URL)) warnings.push('NEXTAUTH_URL bukan https (cookie sesi aman membutuhkan HTTPS)')
  if (env.AI_PROVIDER === 'anthropic') errors.push(...missingVars(env, ['ai']).map((n) => `${n} belum diisi (AI_PROVIDER=anthropic)`))
  if (env.AI_PROVIDER === 'fake' && prod && env.AI_ALLOW_FAKE !== 'true') errors.push('AI_PROVIDER=fake di produksi membutuhkan AI_ALLOW_FAKE=true (provider palsu)')
  // TRUST_PROXY wajib EKSPLISIT di produksi: tanpa itu semua klien berbagi satu bucket batas laju dan satu klien dapat mengunci login seluruh situs.
  if (env.TRUST_PROXY !== undefined && env.TRUST_PROXY !== '' && !['true', 'false'].includes(env.TRUST_PROXY)) errors.push('TRUST_PROXY harus tepat true atau false')
  else if (prod && (env.TRUST_PROXY === undefined || env.TRUST_PROXY === '')) errors.push('TRUST_PROXY belum diisi (wajib eksplisit true atau false di produksi)')
  if (env.TRUST_PROXY_HOPS !== undefined && env.TRUST_PROXY_HOPS !== '' && !/^[1-9]\d?$/.test(env.TRUST_PROXY_HOPS)) errors.push('TRUST_PROXY_HOPS harus bilangan bulat 1-99')
  if (prod && env.TRUST_PROXY === 'false') warnings.push('TRUST_PROXY=false: semua klien berbagi satu bucket batas laju (login/register); aman dari pemalsuan header tetapi satu klien dapat menghabiskan kuota semua pengguna. Pasang di belakang proxy tepercaya dan set true')
  if (prod && !env.ALLOWED_ORIGINS) warnings.push('ALLOWED_ORIGINS kosong: hanya Origin yang sama dengan host permintaan (atau X-Forwarded-Host bila TRUST_PROXY=true) yang boleh mengirim POST/PATCH/DELETE dari browser. Isi dengan URL publik (mis. https://forechek.ailo.ai.id) bila ada domain lain/alias')
  if (prod && !env.REDIS_URL) warnings.push('REDIS_URL kosong: batas laju hanya per proses (tidak berlaku lintas instance)')
  if (env.REQUIRE_EMAIL_VERIFICATION === 'true') errors.push(...missingVars(env, ['mail']).map((n) => `${n} belum diisi (REQUIRE_EMAIL_VERIFICATION=true membutuhkan pengirim email)`))
  if (env.REDIS_URL && typeof hasModule === 'function' && !hasModule('ioredis')) errors.push('REDIS_URL diisi tetapi paket ioredis tidak terpasang (npm i ioredis)')
  if (prod && !env.AI_PROVIDER && !env.ANTHROPIC_API_KEY) warnings.push('AI_PROVIDER kosong dan ANTHROPIC_API_KEY kosong di produksi: fitur chat/laporan AI tidak akan berfungsi (PROVIDER_NOT_CONFIGURED)')
  return { errors, warnings }
}

function assertBootEnv(env = process.env, opts) {
  const { errors, warnings } = bootProblems(env, opts)
  if (errors.length && env.NODE_ENV === 'production') throw new Error(`Konfigurasi tidak valid: ${errors.join('; ')}`)
  return { errors, warnings }
}

function intFrom(env, name, fallback) {
  const raw = env[name]
  if (raw === undefined || raw === '') return fallback
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} harus bilangan bulat >= 0`)
  return n
}

// Nilai default kuota bersifat SEMENTARA. MTS Bagian 13 mensyaratkan angka final dari pengukuran biaya.
function loadConfig(env = process.env) {
  return Object.freeze({
    isProduction: env.NODE_ENV === 'production',
    requireEmailVerification: env.REQUIRE_EMAIL_VERIFICATION === 'true',
    quota: Object.freeze({
      free: { tokensPerMonth: intFrom(env, 'QUOTA_FREE_TOKENS', 100000), messagesPerMonth: intFrom(env, 'QUOTA_FREE_MESSAGES', 30) },
      pro: { tokensPerMonth: intFrom(env, 'QUOTA_PRO_TOKENS', 2000000), messagesPerMonth: intFrom(env, 'QUOTA_PRO_MESSAGES', 1000) },
      institutional: { tokensPerMonth: intFrom(env, 'QUOTA_INST_TOKENS', 10000000), messagesPerMonth: intFrom(env, 'QUOTA_INST_MESSAGES', 5000) }
    })
  })
}

module.exports = { GROUPS, missingVars, assertEnv, bootProblems, assertBootEnv, preflightConfigItems, loadConfig }

// Butir preflight berbasis KONFIGURASI saja (tanpa jaringan): [{ name, status: 'LULUS'|'GAGAL'|'PERINGATAN'|'DILEWATI', detail }].
// Hanya NAMA variabel yang disebut, tidak pernah nilainya. Pemeriksaan koneksi nyata ada di scripts/preflight.js.
function preflightConfigItems(env = process.env, opts = {}) {
  const items = []
  const item = (name, status, detail) => items.push({ name, status, detail })
  const { errors, warnings } = bootProblems(env, opts)
  item('Konfigurasi dasar (boot check)', errors.length ? 'GAGAL' : 'LULUS', errors.length ? errors.join('; ') : 'Semua variabel wajib terisi dan valid')
  for (const w of warnings) item('Peringatan konfigurasi', 'PERINGATAN', w)

  const ai = env.AI_PROVIDER
  if (ai === 'fake') item('Provider AI', 'PERINGATAN', 'AI_PROVIDER=fake (provider PALSU untuk uji, bukan Claude)')
  else if (missingVars(env, ['ai']).length === 0 && env.AI_MODEL_CHAT) item('Provider AI (Anthropic)', 'LULUS', 'ANTHROPIC_API_KEY dan AI_MODEL_CHAT terisi (panggilan nyata TIDAK DIVERIFIKASI oleh preflight)')
  else item('Provider AI (Anthropic)', 'DILEWATI', `belum dikonfigurasi: ${[...missingVars(env, ['ai']), ...(env.AI_MODEL_CHAT ? [] : ['AI_MODEL_CHAT'])].join(', ')}; fitur chat/laporan AI akan menjawab PROVIDER_NOT_CONFIGURED`)
  const lit = (env.LITERATURE_PROVIDERS || '').split(',').map((s) => s.trim()).filter(Boolean)
  item('Penyedia literatur', lit.length ? (lit.includes('fixture') ? 'PERINGATAN' : 'LULUS') : 'DILEWATI', lit.length ? (lit.includes('fixture') ? 'fixture = korpus SINTETIS (bukan sumber nyata)' : `provider: ${lit.join(', ')} (panggilan nyata TIDAK DIVERIFIKASI)`) : 'LITERATURE_PROVIDERS kosong: pencarian/verifikasi literatur ditolak (PROVIDER_NOT_CONFIGURED)')
  const mailMissing = missingVars(env, ['mail']).filter((n) => n !== 'GMAIL_ACCESS_TOKEN')
  item('Email (Gmail OAuth2)', mailMissing.length ? 'DILEWATI' : 'LULUS', mailMissing.length ? `belum lengkap: ${mailMissing.join(', ')}` : 'GMAIL_* terisi')
  const g = missingVars(env, ['google'])
  item('Login Google', g.length ? 'DILEWATI' : 'LULUS', g.length ? `belum lengkap: ${g.join(', ')} (tombol Google tidak akan berfungsi)` : 'GOOGLE_CLIENT_ID/SECRET terisi')
  const mid = missingVars(env, ['payment'])
  item('Midtrans', mid.length ? 'DILEWATI' : 'LULUS', mid.length ? `belum lengkap: ${mid.join(', ')} (webhook menolak 503 tanpa MIDTRANS_SERVER_KEY)` : `kunci terisi (${env.MIDTRANS_IS_PRODUCTION === 'true' ? 'PRODUKSI' : 'sandbox'})`)
  return items
}
