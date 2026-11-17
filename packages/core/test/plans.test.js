'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { defaultPlanSettings, validatePlanSettings, mergePlanSettings, quotaFromSettings, isAdminRole, isSuperAdminRole } = require('../index')

const ok = () => JSON.parse(JSON.stringify(defaultPlanSettings({})))
const code = (fn) => { try { fn(); return null } catch (e) { return e.code } }

test('default mengikuti konfigurasi (kuota, trial) dan harga berbayar belum ditetapkan', () => {
  const d = defaultPlanSettings({ QUOTA_PRO_TOKENS: '123', TRIAL_PAPER_LIMIT: '3' })
  assert.equal(d.trialPapers, 3)
  assert.equal(d.plans.pro.tokensPerMonth, 123)
  assert.equal(d.plans.pro.priceMonthlyIdr, null)
  assert.equal(d.plans.free.priceMonthlyIdr, 0)
})

test('validasi menerima pengaturan sah dan menormalkan (trim, harga null)', () => {
  const s = ok()
  s.plans.pro.name = '  Pro Plus  '
  s.plans.pro.priceMonthlyIdr = '149000'
  s.plans.pro.features = ['  Satu  ', '', 'Dua']
  const v = validatePlanSettings(s)
  assert.equal(v.plans.pro.name, 'Pro Plus')
  assert.equal(v.plans.pro.priceMonthlyIdr, 149000)
  assert.deepEqual(v.plans.pro.features, ['Satu', 'Dua'])
  assert.equal(v.plans.institutional.priceMonthlyIdr, null)
})

test('validasi menolak: harga negatif/pecahan/terlalu besar, kuota kosong, nama kosong, kunci paket tak dikenal, fitur > 8, panah/em dash', () => {
  const mut = (f) => { const s = ok(); f(s); return s }
  assert.equal(code(() => validatePlanSettings(mut((s) => { s.plans.pro.priceMonthlyIdr = -1 }))), 'VALIDATION_ERROR')
  assert.equal(code(() => validatePlanSettings(mut((s) => { s.plans.pro.priceMonthlyIdr = 10.5 }))), 'VALIDATION_ERROR')
  assert.equal(code(() => validatePlanSettings(mut((s) => { s.plans.pro.priceYearlyIdr = 2_000_000_000 }))), 'VALIDATION_ERROR')
  assert.equal(code(() => validatePlanSettings(mut((s) => { s.plans.pro.tokensPerMonth = '' }))), 'VALIDATION_ERROR')
  assert.equal(code(() => validatePlanSettings(mut((s) => { s.plans.pro.name = '   ' }))), 'VALIDATION_ERROR')
  assert.equal(code(() => validatePlanSettings(mut((s) => { s.plans.platinum = s.plans.pro }))), 'VALIDATION_ERROR')
  assert.equal(code(() => validatePlanSettings(mut((s) => { s.plans.pro.features = Array(9).fill('x') }))), 'VALIDATION_ERROR')
  assert.equal(code(() => validatePlanSettings(mut((s) => { s.plans.pro.note = 'hemat — banyak' }))), 'VALIDATION_ERROR')
  assert.equal(code(() => validatePlanSettings(mut((s) => { s.plans.pro.features = ['a -> b'] }))), 'VALIDATION_ERROR')
  assert.equal(code(() => validatePlanSettings(mut((s) => { s.trialPapers = -1 }))), 'VALIDATION_ERROR')
  assert.equal(code(() => validatePlanSettings(null)), 'VALIDATION_ERROR')
  assert.equal(code(() => validatePlanSettings({ trialPapers: 1 })), 'VALIDATION_ERROR')
})

test('merge: nilai tersimpan menimpa default; data rusak jatuh ke default', () => {
  const d = defaultPlanSettings({})
  const m = mergePlanSettings(d, { trialPapers: 5, plans: { pro: { priceMonthlyIdr: 99000, name: 'Pro' } } })
  assert.equal(m.trialPapers, 5)
  assert.equal(m.plans.pro.priceMonthlyIdr, 99000)
  assert.equal(m.plans.pro.tokensPerMonth, d.plans.pro.tokensPerMonth)
  assert.deepEqual(mergePlanSettings(d, { trialPapers: 'abc' }), d)
  assert.deepEqual(mergePlanSettings(d, null), d)
})

test('quotaFromSettings dan peran', () => {
  const d = defaultPlanSettings({})
  const q = quotaFromSettings(d)
  assert.equal(q.pro.tokensPerMonth, d.plans.pro.tokensPerMonth)
  assert.equal(isAdminRole('admin') && isAdminRole('superadmin'), true)
  assert.equal(isAdminRole('user') || isAdminRole(undefined), false)
  assert.equal(isSuperAdminRole('superadmin') && !isSuperAdminRole('admin'), true)
})
