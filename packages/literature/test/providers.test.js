'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { createHttp, LiteratureProviderError, openalex, crossref, semanticscholar, createFixtureProvider, createLiteratureProvidersFromEnv, CORPUS } = require('../index')

const res = (status, body, headers = {}) => ({ status, ok: status >= 200 && status < 300, json: async () => body, headers: { get: (k) => headers[k.toLowerCase()] } })
const noSleep = async () => {}

test('http: sukses, cache TTL menghindari permintaan kedua', async () => {
  let n = 0
  const http = createHttp({ provider: 'p', fetchFn: async () => (n++, res(200, { a: 1 })), cacheTtlMs: 60000 })
  assert.deepEqual(await http.getJson('https://x/1'), { a: 1 })
  assert.deepEqual(await http.getJson('https://x/1'), { a: 1 })
  assert.equal(n, 1)
})

test('http: 404 -> null; 5xx dicoba ulang lalu berhasil; 429 menghormati retry-after (dibatasi)', async () => {
  const seq = [res(503), res(200, { ok: 1 })]
  const http = createHttp({ provider: 'p', retries: 1, fetchFn: async () => seq.shift(), sleepFn: noSleep })
  assert.deepEqual(await http.getJson('u'), { ok: 1 })
  assert.equal(await createHttp({ provider: 'p', fetchFn: async () => res(404) }).getJson('u'), null)
  const sleeps = []
  const seq2 = [res(429, null, { 'retry-after': '120' }), res(200, { z: 1 })]
  const h2 = createHttp({ provider: 'p', retries: 1, fetchFn: async () => seq2.shift(), sleepFn: async (ms) => sleeps.push(ms) })
  await h2.getJson('u')
  assert.ok(sleeps.includes(5000), 'retry-after dibatasi 5 detik')
})

test('http: galat berkelanjutan dinormalisasi (rate limit, galat server, timeout, jaringan) tanpa membocorkan pesan asli', async () => {
  const rl = createHttp({ provider: 'oa', retries: 0, fetchFn: async () => res(429) })
  await assert.rejects(() => rl.getJson('u'), (e) => e instanceof LiteratureProviderError && e.code === 'PROVIDER_RATE_LIMITED' && e.provider === 'oa')
  await assert.rejects(() => createHttp({ provider: 'oa', retries: 0, fetchFn: async () => res(500) }).getJson('u'), (e) => e.code === 'PROVIDER_ERROR')
  await assert.rejects(() => createHttp({ provider: 'oa', retries: 0, fetchFn: async () => res(400) }).getJson('u'), (e) => e.code === 'PROVIDER_ERROR' && !e.retryable)
  const slow = createHttp({ provider: 'oa', retries: 0, timeoutMs: 20, fetchFn: (u, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('x'), { name: 'AbortError' })))) })
  await assert.rejects(() => slow.getJson('u'), (e) => e.code === 'PROVIDER_TIMEOUT')
  const net = createHttp({ provider: 'oa', retries: 0, fetchFn: async () => { throw new Error('getaddrinfo ENOTFOUND rahasia.internal') } })
  await assert.rejects(() => net.getJson('u'), (e) => e.code === 'PROVIDER_ERROR' && !/rahasia/.test(e.message))
})

test('http: jarak minimum antar permintaan (rate limit sopan) diterapkan', async () => {
  let t = 0
  const waits = []
  const http = createHttp({ provider: 'p', minIntervalMs: 100, now: () => t, sleepFn: async (ms) => { waits.push(ms); t += ms }, fetchFn: async () => res(200, {}) })
  await http.getJson('a'); await http.getJson('b'); await http.getJson('c')
  assert.deepEqual(waits, [100, 100])
})

test('adapter openalex/crossref/semanticscholar: URL, parameter, dan pemetaan hasil (HTTP palsu, tanpa jaringan)', async () => {
  const seen = []
  const mk = (provider, body) => ({ getJson: async (url, opt) => (seen.push({ provider, url, opt }), body) })
  const oa = openalex({ contactEmail: 'a@b.test', http: mk('oa', { results: [{ id: 'W1', doi: 'https://doi.org/10.99999/a', title: 'T', publication_year: 2020 }] }) })
  const r1 = await oa.search({ query: 'graph networks', yearFrom: 2019, limit: 5, language: 'en' })
  assert.equal(r1[0].doi, '10.99999/a')
  assert.match(seen[0].url, /api\.openalex\.org\/works\?search=graph%20networks&per-page=5&filter=from_publication_date:2019-01-01,language:en&mailto=a%40b\.test/)
  const cr = crossref({ http: mk('cr', { message: { items: [{ DOI: '10.99999/b', title: ['T2'], issued: { 'date-parts': [[2021]] } }] } }) })
  assert.equal((await cr.search({ query: 'x y z', yearFrom: 2020 }))[0].year, 2021)
  assert.match(seen[1].url, /query\.bibliographic=x%20y%20z&rows=10&filter=from-pub-date:2020/)
  const s2 = semanticscholar({ apiKey: 'dummy-key', http: mk('s2', { data: [{ paperId: 'p', title: 'T3', externalIds: { DOI: '10.99999/c' } }] }) })
  assert.equal((await s2.search({ query: 'abc' }))[0].doi, '10.99999/c')
  assert.equal(seen[2].opt.headers['x-api-key'], 'dummy-key')
  // getByDoi: DOI tidak valid tidak memanggil jaringan; 404 -> null
  const before = seen.length
  assert.equal(await oa.getByDoi('bukan-doi'), null)
  assert.equal(seen.length, before)
  assert.equal(await crossref({ http: mk('cr', null) }).getByDoi('10.99999/zz'), null)
})

test('fixture provider: pencarian, getByDoi, kegagalan terinjeksi, korpus berlabel sintetis', async () => {
  const p = createFixtureProvider(CORPUS)
  assert.match(p.attribution, /BUKAN sumber literatur nyata/)
  const found = await p.search({ query: 'adaptive sparse attention', limit: 3 })
  assert.equal(found[0].doi, '10.99999/fx.2021.001')
  assert.equal((await p.getByDoi('https://doi.org/10.99999/FX.2021.001')).title.startsWith('Adaptive'), true)
  assert.equal(await p.getByDoi('10.99999/tidak.ada'), null)
  assert.ok(CORPUS.every((r) => !r.doi || r.doi.startsWith('10.99999/')), 'semua DOI korpus fiktif')
  const bad = createFixtureProvider(CORPUS, { failWith: new LiteratureProviderError('fixture', 'PROVIDER_TIMEOUT', 'x') })
  await assert.rejects(() => bad.search({ query: 'abc def' }), (e) => e.code === 'PROVIDER_TIMEOUT')
})

test('pemilihan provider dari env: kosong -> []; tidak dikenal -> galat; fixture dilarang di produksi tanpa flag', () => {
  assert.deepEqual(createLiteratureProvidersFromEnv({}), [])
  assert.deepEqual(createLiteratureProvidersFromEnv({ LITERATURE_PROVIDERS: 'openalex, crossref ,semanticscholar' }).map((p) => p.name), ['openalex', 'crossref', 'semanticscholar'])
  assert.throws(() => createLiteratureProvidersFromEnv({ LITERATURE_PROVIDERS: 'google' }), /tidak dikenal/)
  assert.throws(() => createLiteratureProvidersFromEnv({ LITERATURE_PROVIDERS: 'fixture', NODE_ENV: 'production' }), /tidak diizinkan/)
  assert.equal(createLiteratureProvidersFromEnv({ LITERATURE_PROVIDERS: 'fixture', NODE_ENV: 'production', LITERATURE_ALLOW_FIXTURE: 'true' })[0].name, 'fixture')
})
