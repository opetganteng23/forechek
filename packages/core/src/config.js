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
      if (v === undefined || v === '' || /^your-|<[^>]+>|x{5,}/i.test(String(v))) missing.push(n)
    }
  }
  return missing
}

function assertEnv(env, groups) {
  const missing = missingVars(env, groups)
  if (missing.length) throw new Error(`Environment belum lengkap: ${missing.join(', ')}`)
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

module.exports = { GROUPS, missingVars, assertEnv, loadConfig }
