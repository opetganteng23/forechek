'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { createFixtureProvider, CORPUS, createReferenceService, verifyReference, compareAuthors, sanitizeCitations } = require('../index')

const A1 = { doi: '10.99999/fx.2021.001', title: 'Adaptive Sparse Attention for Low-Resource Language Modeling', authors: ['Ratna Wulandari', 'Chen Mei'], year: 2021 }
const fx = () => createFixtureProvider(CORPUS)

function mem(candidatesStore) {
  const rows = []
  let n = 0
  const refs = {
    list: async (u, p) => rows.filter((r) => r.userId === u && r.projectId === p),
    findById: async (u, p, id) => rows.find((r) => r.id === id) || null,
    findByCiteKey: async (u, p, k) => rows.find((r) => r.citeKey === k) || null,
    insert: async (d) => { const r = { ...d, id: `r${++n}` }; rows.push(r); return r },
    update: async (id, set) => Object.assign(rows.find((r) => r.id === id), set),
    remove: async () => true
  }
  return { rows, svc: createReferenceService({ refs, candidates: candidatesStore || { insertMany: async (u, p, l) => l, get: async () => null }, assertOwned: async () => {}, providers: [fx()] }) }
}

test('QC2-A: reverify yang menghasilkan verified MENGADOPSI metadata kanonis (tahun/penulis/judul dari sumber, bukan hasil edit pengguna)', async () => {
  const { svc, rows } = mem()
  const added = await svc.verifyManual({ userId: 'u', projectId: 'p', input: { doi: A1.doi, title: A1.title, authors: A1.authors, year: 2021 }, add: true })
  // pengguna mengedit metadata mendekati toleransi: tahun 2022 (selisih 1), judul sedikit beda, penulis ditambah karangan
  await svc.updateMetadata({ userId: 'u', projectId: 'p', refId: added.added.id, patch: { year: 2022, title: 'Adaptive Sparse Attention for Low Resource Language Modelling', authors: [{ given: 'Ratna', family: 'Wulandari' }, { given: 'Chen', family: 'Mei' }, { given: 'X', family: 'Karangan' }] } })
  const re = await svc.reverify({ userId: 'u', projectId: 'p', refId: added.added.id })
  const stored = rows[0]
  if (re.verification.status === 'verified') {
    assert.equal(stored.year, 2021, 'tahun harus dari sumber')
    assert.equal(stored.title, A1.title)
    assert.deepEqual(stored.authors.map((a) => a.family), ['Wulandari', 'Mei', 'Berg'])
  }
  // apa pun hasilnya, sitasi karangan terhadap data hasil edit tidak boleh sah
  const refsForCtx = await svc.listForContext('u', 'p')
  assert.equal(sanitizeCitations('(Wulandari, Mei, Karangan, 2022)', refsForCtx).changed, true)
})

test('QC2-A: addCandidate memakai metadata KANONIS walau data kandidat tersimpan berbeda (kandidat dimanipulasi)', async () => {
  const tampered = { candidateId: 'cand-tampered-1', doi: A1.doi, title: A1.title, authors: [{ given: 'R', family: 'Wulandari' }, { given: 'C', family: 'Mei' }], year: 2022, providers: ['fixture'] }
  const { svc, rows } = mem({ insertMany: async (u, p, l) => l, get: async () => tampered })
  const ref = await svc.addCandidate({ userId: 'u', projectId: 'p', candidateId: 'cand-tampered-1' })
  assert.equal(ref.verification.status, 'verified')
  assert.equal(rows[0].year, 2021, 'tahun dari sumber, bukan dari kandidat')
  assert.deepEqual(rows[0].authors.map((a) => a.family), ['Wulandari', 'Mei', 'Berg'])
})

test('QC2-B: daftar penulis dengan nama berulang/penambahan karangan tidak dapat lolos overlap', async () => {
  const rec = [{ family: 'Wulandari' }, { family: 'Mei' }, { family: 'Berg' }]
  const gamed = compareAuthors([{ family: 'Wulandari' }, { family: 'Wulandari' }, { family: 'Mei' }, { family: 'Invented' }, { family: 'Invented2' }], rec)
  assert.equal(gamed.listConsistent, false)
  assert.equal(compareAuthors([{ family: 'Wulandari' }, { family: 'Mei' }, { family: 'Invented' }], rec).listConsistent, false, '2 dari 3 asli + 1 karangan ditolak')
  assert.equal(compareAuthors([{ family: 'Wulandari' }, { family: 'Mei' }, { family: 'Berg' }], rec).listConsistent, true)
  assert.equal(compareAuthors([{ family: 'Wulandari' }, { family: 'Mei' }], rec).listConsistent, true, 'daftar terpotong yang semuanya asli diterima')
  const p = [fx()]
  const v = await verifyReference({ input: { ...A1, authors: ['Ratna Wulandari', 'Chen Mei', 'Orang Invented'] }, resolvers: p, searchers: p })
  assert.notEqual(v.status, 'verified')
})
