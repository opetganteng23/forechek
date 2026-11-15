'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizeDoi, normalizeTitle, titleSimilarity, compareAuthors, compareYear, THRESHOLDS, fromOpenAlex, fromCrossref, fromSemanticScholar, abstractFromInverted, splitName } = require('../index')

test('normalizeDoi: URL, prefiks doi:, huruf besar, tanda baca akhir; tidak valid -> null', () => {
  assert.equal(normalizeDoi('https://doi.org/10.1000/ABC.123'), '10.1000/abc.123')
  assert.equal(normalizeDoi('doi: 10.1000/xyz-1.'), '10.1000/xyz-1')
  assert.equal(normalizeDoi('  http://dx.doi.org/10.5555/a(b)c) '), '10.5555/a(b)c')
  for (const bad of ['', 'abc', '10.12/short', '11.1000/x', null, undefined, 123, { a: 1 }]) assert.equal(normalizeDoi(bad), null)
})

test('normalizeTitle: huruf kecil, tanpa diakritik/tag/tanda baca', () => {
  assert.equal(normalizeTitle('<i>Réseaux</i> de Neurones: Étude!'), 'reseaux de neurones etude')
  assert.equal(normalizeTitle(null), '')
})

test('titleSimilarity: identik=1, variasi kecil >= ambang, karya berbeda < ambang dekat', () => {
  assert.equal(titleSimilarity('Deep Learning for Crops', 'deep learning for crops!'), 1)
  assert.ok(titleSimilarity('Adaptive Sparse Attention for Language Modeling', 'Adaptive sparse attention for language modelling') >= THRESHOLDS.titleMatch)
  assert.ok(titleSimilarity('Graph Neural Networks for Traffic Forecasting', 'Graph Neural Networks for Traffic Forecasting: An Extended Study') < THRESHOLDS.titleMatch)
  assert.ok(titleSimilarity('Graph Neural Networks for Traffic Forecasting', 'Kernel Methods for Large Synthetic Graphs') < THRESHOLDS.titleNear)
  assert.equal(titleSimilarity('', 'x'), 0)
})

test('compareAuthors dan compareYear', () => {
  const a = [{ given: 'A', family: 'Wulandari' }, { given: 'B', family: 'Chen' }]
  assert.deepEqual(compareAuthors(a, [{ family: 'wulandari' }, { family: 'Berg' }]), { comparable: true, firstAuthorMatch: true, overlap: 0.5, listConsistent: false })
  assert.equal(compareAuthors(a, [{ family: 'Chen' }]).firstAuthorMatch, false)
  assert.equal(compareAuthors([], a).comparable, false)
  assert.equal(compareYear(2020, 2021).match, true)
  assert.equal(compareYear(2020, 2023).match, false)
  assert.equal(compareYear(null, 2020).comparable, false)
})

test('splitName', () => {
  assert.deepEqual(splitName('Budi Santoso'), { given: 'Budi', family: 'Santoso' })
  assert.deepEqual(splitName('Santoso, Budi'), { given: 'Budi', family: 'Santoso' })
})

// Fixture berbentuk dokumentasi resmi tiap provider (BUKAN rekaman respons nyata).
test('OpenAlex: pemetaan, abstrak dari inverted index, retracted', () => {
  const w = { id: 'https://openalex.org/W1', doi: 'https://doi.org/10.99999/oa.1', title: 'Judul <i>OA</i>', publication_year: 2022, type: 'article', is_retracted: true, abstract_inverted_index: { Halo: [0], dunia: [1] }, authorships: [{ author: { display_name: 'Budi Santoso' } }], primary_location: { landing_page_url: 'https://x.test', source: { display_name: 'Jurnal X' } } }
  const c = fromOpenAlex(w)
  assert.equal(c.provider, 'openalex')
  assert.equal(c.doi, '10.99999/oa.1')
  assert.equal(c.title, 'Judul OA')
  assert.equal(c.abstract, 'Halo dunia')
  assert.equal(c.retracted, true)
  assert.deepEqual(c.authors, [{ given: 'Budi', family: 'Santoso' }])
  assert.equal(c.venueName, 'Jurnal X')
  assert.equal(fromOpenAlex({ id: 'x' }), null)
  assert.equal(abstractFromInverted(null), null)
})

test('Crossref: pemetaan, tahun dari issued, retraction dari updated-by', () => {
  const m = { DOI: '10.99999/CR.2', title: ['Judul CR'], author: [{ given: 'A', family: 'Satu' }, { name: 'Konsorsium' }], issued: { 'date-parts': [[2019, 5]] }, 'container-title': ['Venue CR'], type: 'journal-article', URL: 'https://x', abstract: '<jats:p>Abstrak.</jats:p>', 'updated-by': [{ type: 'retraction', DOI: '10.99999/ret' }] }
  const c = fromCrossref(m)
  assert.equal(c.doi, '10.99999/cr.2')
  assert.equal(c.year, 2019)
  assert.equal(c.retracted, true)
  assert.equal(c.abstract, 'Abstrak.')
  assert.equal(c.authors.length, 2)
  assert.equal(fromCrossref({ DOI: '10.1000/x' }), null)
  assert.equal(fromCrossref({ DOI: '10.99999/ok', title: ['T'], 'update-to': [{ type: 'correction' }] }).retracted, false)
})

test('Semantic Scholar: pemetaan externalIds.DOI', () => {
  const c = fromSemanticScholar({ paperId: 'abc', title: 'Judul S2', year: 2018, venue: 'V', externalIds: { DOI: '10.99999/S2.3' }, authors: [{ name: 'Ani Budi' }], abstract: 'x', publicationTypes: ['JournalArticle'] })
  assert.equal(c.doi, '10.99999/s2.3')
  assert.equal(c.providerId, 'abc')
  assert.equal(c.type, 'JournalArticle')
})
