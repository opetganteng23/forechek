'use strict'
const { AppError } = require('./errors')
const { loadConfig } = require('./config')

// Pengaturan paket (harga, kuota, deskripsi) yang dapat diubah SUPERADMIN. Default berasal dari konfigurasi env (loadConfig);
// nilai tersimpan di database menimpa default. Harga null = belum ditetapkan (pembayaran untuk paket itu tidak dapat dibuat).
//   Bentuk: { trialPapers, plans: { free|pro|institutional: { name, note, priceMonthlyIdr, priceYearlyIdr, tokensPerMonth, messagesPerMonth, features[] } } }
const PLAN_KEYS = ['free', 'pro', 'institutional']
const MAX_PRICE = 1_000_000_000
const MAX_QUOTA = 1_000_000_000

function defaultPlanSettings(env = process.env) {
  const c = loadConfig(env)
  return {
    trialPapers: c.trialPapers,
    plans: {
      free: { name: 'Trial', note: 'Gratis', priceMonthlyIdr: 0, priceYearlyIdr: null, tokensPerMonth: c.quota.free.tokensPerMonth, messagesPerMonth: c.quota.free.messagesPerMonth, features: ['Semua fitur persiapan naskah', 'Jatah paper terbatas seumur akun'] },
      pro: { name: 'Pro', note: '', priceMonthlyIdr: null, priceYearlyIdr: null, tokensPerMonth: c.quota.pro.tokensPerMonth, messagesPerMonth: c.quota.pro.messagesPerMonth, features: ['Paper tanpa batas jumlah'] },
      institutional: { name: 'Institusi', note: '', priceMonthlyIdr: null, priceYearlyIdr: null, tokensPerMonth: c.quota.institutional.tokensPerMonth, messagesPerMonth: c.quota.institutional.messagesPerMonth, features: ['Paper tanpa batas jumlah', 'Hubungi pengelola untuk kebutuhan lembaga'] }
    }
  }
}

const bad = (msg) => new AppError('VALIDATION_ERROR', msg)

function intField(v, label, { min = 0, max, nullable = false }) {
  if (v === null || v === undefined || v === '') {
    if (nullable) return null
    throw bad(`${label} wajib diisi`)
  }
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${label} harus bilangan bulat ${min} sampai ${max}`)
  return n
}

function textField(v, label, max) {
  if (v === undefined || v === null) return ''
  if (typeof v !== 'string') throw bad(`${label} harus berupa teks`)
  const t = v.trim()
  if (t.length > max) throw bad(`${label} maksimal ${max} karakter`)
  if (/[—←-⇿]|->|=>/.test(t)) throw bad(`${label} tidak boleh memuat em dash atau tanda panah`)
  return t
}

// Memvalidasi dan menormalkan masukan dari admin. Menolak kunci tak dikenal pada paket; tidak mengubah apa pun bila ada yang salah.
function validatePlanSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw bad('Pengaturan paket tidak valid')
  const out = { trialPapers: intField(input.trialPapers, 'Jatah paper trial', { min: 0, max: 1000 }), plans: {} }
  if (!input.plans || typeof input.plans !== 'object') throw bad('Data paket wajib diisi')
  for (const k of Object.keys(input.plans)) if (!PLAN_KEYS.includes(k)) throw bad(`Paket "${k}" tidak dikenal`)
  for (const k of PLAN_KEYS) {
    const p = input.plans[k]
    if (!p || typeof p !== 'object') throw bad(`Data paket ${k} wajib diisi`)
    const name = textField(p.name, `Nama paket ${k}`, 40)
    if (!name) throw bad(`Nama paket ${k} wajib diisi`)
    const features = Array.isArray(p.features) ? p.features : []
    if (features.length > 8) throw bad(`Paket ${k}: maksimal 8 butir fitur`)
    out.plans[k] = {
      name,
      note: textField(p.note, `Catatan paket ${k}`, 80),
      priceMonthlyIdr: intField(p.priceMonthlyIdr, `Harga bulanan ${k}`, { max: MAX_PRICE, nullable: true }),
      priceYearlyIdr: intField(p.priceYearlyIdr, `Harga tahunan ${k}`, { max: MAX_PRICE, nullable: true }),
      tokensPerMonth: intField(p.tokensPerMonth, `Kuota token ${k}`, { max: MAX_QUOTA }),
      messagesPerMonth: intField(p.messagesPerMonth, `Kuota pesan ${k}`, { max: MAX_QUOTA }),
      features: features.map((f, i) => textField(f, `Butir fitur ${k} #${i + 1}`, 120)).filter(Boolean)
    }
  }
  return out
}

// Nilai tersimpan (bisa lama/parsial) ditimpakan di atas default; nilai tak valid diabaikan per bidang (default dipakai).
function mergePlanSettings(defaults, stored) {
  if (!stored || typeof stored !== 'object') return defaults
  try {
    return validatePlanSettings({ trialPapers: stored.trialPapers ?? defaults.trialPapers, plans: Object.fromEntries(PLAN_KEYS.map((k) => [k, { ...defaults.plans[k], ...((stored.plans && stored.plans[k]) || {}) }])) })
  } catch {
    return defaults
  }
}

// Bentuk {free:{tokensPerMonth,messagesPerMonth},...} yang dipakai checkQuota.
const quotaFromSettings = (s) => ({ free: { tokensPerMonth: s.plans.free.tokensPerMonth, messagesPerMonth: s.plans.free.messagesPerMonth }, pro: { tokensPerMonth: s.plans.pro.tokensPerMonth, messagesPerMonth: s.plans.pro.messagesPerMonth }, institutional: { tokensPerMonth: s.plans.institutional.tokensPerMonth, messagesPerMonth: s.plans.institutional.messagesPerMonth } })

// Peran: admin dan superadmin memiliki akses admin; hanya superadmin yang mengatur harga dan akun admin.
const isAdminRole = (r) => r === 'admin' || r === 'superadmin'
const isSuperAdminRole = (r) => r === 'superadmin'

module.exports = { PLAN_KEYS, defaultPlanSettings, validatePlanSettings, mergePlanSettings, quotaFromSettings, isAdminRole, isSuperAdminRole }
