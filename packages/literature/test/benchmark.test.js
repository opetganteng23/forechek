'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { evaluate } = require('../benchmark/evaluate')
const { verification, claims, citations } = require('../benchmark/cases')

test('benchmark (Gate 4): TIDAK ADA kasus fiktif/salah yang lolos sebagai verified/supports/sitasi valid', async () => {
  const r = await evaluate()
  assert.deepEqual(r.fictitiousLeaks, [], `kebocoran: ${JSON.stringify(r.fictitiousLeaks)}`)
})

test('benchmark: akurasi seluruh kategori pada baseline fixture = 100% (regresi akan terdeteksi)', async () => {
  const r = await evaluate()
  assert.deepEqual(r.failures, [], `gagal: ${JSON.stringify(r.failures)}`)
  assert.equal(r.accuracy, 1)
})

test('benchmark: cakupan kategori sesuai MTS 39.3 dan setiap kategori punya kasus', () => {
  const cats = new Set(verification.map((c) => c.category))
  for (const need of ['doi_valid_cocok', 'doi_valid_metadata_salah', 'doi_palsu', 'retracted', 'metadata_tidak_lengkap', 'judul_mirip', 'tanpa_doi']) assert.ok(cats.has(need), `kategori ${need} hilang`)
  const cc = new Set(claims.map((c) => c.category))
  for (const need of ['didukung', 'didukung_sebagian', 'tidak_didukung', 'bukti_tidak_cukup']) assert.ok(cc.has(need), `kategori klaim ${need} hilang`)
  assert.ok(citations.filter((c) => c.fictitious).length >= 8)
  assert.ok(verification.length + claims.length + citations.length >= 40)
})

test('benchmark peka: bila ambang diperlonggar secara salah, metrik kritis akan bocor (uji mutasi pada kasus)', async () => {
  // Kasus v11 (penulis salah) hanya partial karena first_author diperiksa; bila dianggap verified, itu kebocoran yang harus terdeteksi.
  const { verifyReference, createFixtureProvider, CORPUS } = require('../index')
  const p = [createFixtureProvider(CORPUS)]
  const v11 = verification.find((c) => c.id === 'v11')
  const r = await verifyReference({ input: v11.input, resolvers: p, searchers: p })
  assert.notEqual(r.status, 'verified')
  assert.equal(v11.fictitious, true)
})
