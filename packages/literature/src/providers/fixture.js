'use strict'
const { normalizeDoi, normalizeTitle } = require('../normalize')

// Provider FIXTURE: korpus sintetis dalam memori untuk tes, benchmark, dan demo tanpa jaringan.
// Judul/penulis/DOI di korpus FIKTIF (prefiks DOI 10.99999) dan bukan fakta tentang literatur nyata.
// name = 'fixture' agar UI/laporan menandainya sebagai data uji.
function createFixtureProvider(corpus, { name = 'fixture', failWith = null } = {}) {
  const records = corpus.map((r) => ({ provider: name, providerId: r.doi || r.title, authors: [], year: null, venueName: null, type: 'article', url: null, abstract: null, retracted: false, fetchedAt: new Date().toISOString(), ...r }))
  const calls = { search: 0, getByDoi: 0 }
  const maybeFail = () => {
    if (failWith) throw failWith
  }
  return {
    name,
    detectsRetraction: true,
    attribution: 'Data uji sintetis (fixture): BUKAN sumber literatur nyata',
    calls,
    async search({ query, yearFrom, limit = 10 }) {
      calls.search++
      maybeFail()
      const q = new Set(normalizeTitle(query).split(' ').filter((w) => w.length > 2))
      return records
        .map((r) => {
          const words = new Set(normalizeTitle(`${r.title} ${r.abstract || ''}`).split(' '))
          let hit = 0
          for (const w of q) if (words.has(w)) hit++
          return { r, hit }
        })
        .filter((x) => x.hit > 0 && (!yearFrom || (x.r.year || 0) >= yearFrom))
        .sort((a, b) => b.hit - a.hit)
        .slice(0, limit)
        .map((x) => ({ ...x.r }))
    },
    async getByDoi(doi) {
      calls.getByDoi++
      maybeFail()
      const d = normalizeDoi(doi)
      const r = d && records.find((x) => x.doi === d)
      return r ? { ...r } : null
    }
  }
}

module.exports = { createFixtureProvider }
