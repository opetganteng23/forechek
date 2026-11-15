// Perhitungan periode kuota. Memperbaiki temuan audit: `analysisUsed` lama tidak pernah di-reset.
// Fungsi di sini murni (tanpa DB); pembaruan atomik ke database dikerjakan di Tahap 3.
function periodStartOf(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

// Mengembalikan usage untuk periode berjalan. Bila periode tersimpan sudah lewat, penghitung di-reset.
function resolveUsage(usage, now = new Date()) {
  const current = periodStartOf(now)
  const stored = usage && usage.periodStart ? new Date(usage.periodStart) : null
  if (!stored || stored.getTime() < current.getTime()) {
    return { periodStart: current, tokensUsed: 0, messagesUsed: 0, wasReset: true }
  }
  return {
    periodStart: stored,
    tokensUsed: usage.tokensUsed || 0,
    messagesUsed: usage.messagesUsed || 0,
    wasReset: false
  }
}

// Paket berbayar yang sudah kedaluwarsa diperlakukan sebagai 'free'.
function effectivePlan(subscription, now = new Date()) {
  const s = subscription || {}
  const active = s.plan && s.plan !== 'free' && s.isActive && s.endDate && new Date(s.endDate) > now
  return active ? s.plan : 'free'
}

function checkQuota({ plan, usage, limits, estimatedTokens = 0, now = new Date() }) {
  const limit = limits[plan] || limits.free
  const u = resolveUsage(usage, now)
  if (u.messagesUsed + 1 > limit.messagesPerMonth) {
    return { allowed: false, reason: 'messages', limit, usage: u }
  }
  if (u.tokensUsed + estimatedTokens > limit.tokensPerMonth) {
    return { allowed: false, reason: 'tokens', limit, usage: u }
  }
  return { allowed: true, reason: null, limit, usage: u }
}

module.exports = { periodStartOf, resolveUsage, effectivePlan, checkQuota }
