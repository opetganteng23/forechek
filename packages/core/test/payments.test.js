const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { verifyMidtransSignature } = require('../index')

const KEY = 'SB-Mid-server-dummy-key-for-tests'
const sign = (p, key) => crypto.createHash('sha512').update(`${p.order_id}${p.status_code}${p.gross_amount}${key}`).digest('hex')
const payload = { order_id: 'PUB-1-1', status_code: '200', gross_amount: '99000.00' }

test('signature sah diterima', () => {
  assert.equal(verifyMidtransSignature({ ...payload, signature_key: sign(payload, KEY) }, KEY), true)
})

test('signature salah atau hilang ditolak', () => {
  assert.equal(verifyMidtransSignature({ ...payload, signature_key: 'deadbeef' }, KEY), false)
  assert.equal(verifyMidtransSignature({ ...payload }, KEY), false)
  assert.equal(verifyMidtransSignature({ ...payload, signature_key: '' }, KEY), false)
})

test('regresi QA-01: kunci server kosong menolak signature yang dihitung dengan "undefined"', () => {
  const forged = { ...payload, signature_key: sign(payload, 'undefined') }
  assert.equal(verifyMidtransSignature(forged, undefined), false)
  assert.equal(verifyMidtransSignature(forged, ''), false)
  assert.equal(verifyMidtransSignature(forged, null), false)
})

test('field bukan string atau body bukan objek ditolak tanpa melempar', () => {
  assert.equal(verifyMidtransSignature(null, KEY), false)
  assert.equal(verifyMidtransSignature({ order_id: 1, status_code: 2, gross_amount: 3, signature_key: 4 }, KEY), false)
  assert.equal(verifyMidtransSignature({ ...payload, signature_key: { $ne: '' } }, KEY), false)
})

test('payload diubah (jumlah) setelah ditandatangani ditolak', () => {
  const sig = sign(payload, KEY)
  assert.equal(verifyMidtransSignature({ ...payload, gross_amount: '1.00', signature_key: sig }, KEY), false)
})
