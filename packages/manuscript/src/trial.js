'use strict'
const { AppError, effectivePlan, isAdminRole } = require('@publication-prepare/core')

// Trial: akun tanpa langganan aktif (plan efektif 'free') hanya boleh membuat sejumlah paper (proyek) SEUMUR AKUN (default 1).
// Penghitung `trialPapersCreated` hanya naik: menghapus proyek TIDAK mengembalikan jatah (mencegah hapus-lalu-buat-lagi). Jatah diklaim
// secara ATOMIK (pembuatan paralel tidak dapat melewati batas) dan dikembalikan bila pembuatan proyek gagal. Akun berlangganan aktif
// tidak dibatasi oleh trial (tetap oleh batas proyek aktif).
//   users.get(userId) -> { subscription, trialPapersCreated } | null
//   users.claim(userId, limit) -> boolean          (atomik: naikkan penghitung hanya bila masih di bawah limit)
//   users.release(userId) -> void                   (kembalikan satu jatah)
// limit: angka atau fungsi async yang mengembalikan angka (agar dapat diubah superadmin tanpa restart).
function createTrialGate({ users, limit = 1 }) {
  if (!users) throw new Error('createTrialGate: users wajib')
  const noop = async () => {}
  const lim = async () => Math.max(0, Number(typeof limit === 'function' ? await limit() : limit) || 0)
  return {
    get limit() { return typeof limit === 'function' ? undefined : limit },
    async acquire(userId) {
      const u = await users.get(userId)
      if (!u) throw new AppError('NOT_FOUND', 'Data tidak ditemukan')
      if (isAdminRole(u.role) || effectivePlan(u.subscription) !== 'free') return noop // admin dan superadmin tidak dibatasi trial
      const limit = await lim()
      if (!(await users.claim(userId, limit))) {
        throw new AppError('QUOTA_EXCEEDED', `Akun trial hanya dapat membuat ${limit} paper. Berlangganan untuk membuat paper lain.`, { details: { code: 'TRIAL_LIMIT', limit, plan: 'free' } })
      }
      return () => users.release(userId)
    },
    async status(userId) {
      const u = await users.get(userId)
      const limit = await lim()
      const plan = u && isAdminRole(u.role) ? 'admin' : u ? effectivePlan(u.subscription) : 'free'
      const used = (u && u.trialPapersCreated) || 0
      return { plan, trial: plan === 'free', limit, used: Math.min(used, limit), remaining: plan === 'free' ? Math.max(0, limit - used) : null }
    }
  }
}

module.exports = { createTrialGate }
