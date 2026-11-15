'use strict'
const { createFixtureProvider, CORPUS, verifyReference, checkClaimSupport, sanitizeCitations, THRESHOLDS } = require('../index')
const { verification, claims, citations, REFS } = require('./cases')

// Menjalankan benchmark dan mengembalikan metrik. Dipakai oleh tes (mengunci metrik kritis) dan skrip laporan.
async function evaluate() {
  const providers = [createFixtureProvider(CORPUS)]
  const rows = []
  const byCat = new Map()
  const note = (kind, c, ok, got) => {
    rows.push({ kind, id: c.id, category: c.category, ok, expected: c.expected ?? c.expectPass, got, fictitious: Boolean(c.fictitious) })
    const key = `${kind}/${c.category}`
    const s = byCat.get(key) || { total: 0, ok: 0 }
    s.total++
    if (ok) s.ok++
    byCat.set(key, s)
  }

  for (const c of verification) {
    const r = await verifyReference({ input: c.input, resolvers: providers, searchers: providers })
    note('verifikasi', c, r.status === c.expected, r.status)
  }
  for (const c of claims) {
    const r = await checkClaimSupport({ claim: c.claim, reference: c.ref, judge: async () => c.judge })
    note('klaim', c, r.verdict === c.expected, r.verdict)
  }
  for (const c of citations) {
    const out = sanitizeCitations(c.text, REFS)
    const passed = !out.changed
    note('sitasi', c, passed === c.expectPass, passed ? 'lolos' : 'ditolak')
  }

  const failures = rows.filter((r) => !r.ok)
  // METRIK KRITIS: kasus fiktif/salah yang lolos sebagai valid. Target: 0.
  const leaks = rows.filter((r) => r.fictitious && ((r.kind === 'verifikasi' && r.got === 'verified') || (r.kind === 'klaim' && r.got === 'supports') || (r.kind === 'sitasi' && r.got === 'lolos')))
  return {
    thresholds: THRESHOLDS,
    total: rows.length,
    correct: rows.length - failures.length,
    accuracy: (rows.length - failures.length) / rows.length,
    categories: [...byCat.entries()].map(([k, v]) => ({ category: k, ...v })),
    failures,
    fictitiousLeaks: leaks
  }
}

module.exports = { evaluate }
