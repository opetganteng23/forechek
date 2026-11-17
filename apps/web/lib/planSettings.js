import { dbConnect, Setting } from '@publication-prepare/db'
import { AppError, createLogger, defaultPlanSettings, mergePlanSettings, validatePlanSettings, quotaFromSettings } from '@publication-prepare/core'

// Pengaturan paket (harga, kuota, jatah trial): default dari env, ditimpa nilai tersimpan di database (hanya superadmin yang menulis).
// Cache 10 detik per proses; penyimpanan menghapus cache proses ini. Gagal membaca DB tidak menjatuhkan layanan: default dipakai.
const log = createLogger()
const TTL_MS = 10_000
let cache = null

export async function getPlanSettings({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cache.at < TTL_MS) return cache.value
  const defaults = defaultPlanSettings(process.env)
  let value = defaults
  try {
    await dbConnect()
    const doc = await Setting.findById('plans').lean()
    value = mergePlanSettings(defaults, doc && doc.value)
    value = { ...value, updatedAt: (doc && doc.updatedAt) || null, customized: Boolean(doc) }
  } catch (err) {
    log.warn('plan_settings_read_failed', { err })
    value = { ...defaults, updatedAt: null, customized: false }
  }
  cache = { at: Date.now(), value }
  return value
}

export const getQuota = async () => quotaFromSettings(await getPlanSettings())
export const getTrialLimit = async () => (await getPlanSettings()).trialPapers

export async function savePlanSettings(actorId, input) {
  const v = validatePlanSettings(input)
  await dbConnect()
  try {
    await Setting.findOneAndUpdate({ _id: 'plans' }, { $set: { value: v, updatedBy: actorId } }, { upsert: true, new: true })
  } catch (err) {
    log.error('plan_settings_write_failed', { err })
    throw new AppError('INTERNAL_ERROR', 'Pengaturan paket gagal disimpan')
  }
  cache = null
  log.info('admin_action', { action: 'update_plans', actor: String(actorId) }) // tanpa nilai harga di log
  return getPlanSettings({ fresh: true })
}
