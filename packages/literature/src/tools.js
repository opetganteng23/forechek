'use strict'

// Tool agen untuk literatur (MTS 7.3). Registry (packages/ai) menolak parameter asing sehingga userId/projectId
// tidak dapat dipilih model; layanan (ctx.literature) tetap memeriksa kepemilikan sekali lagi.
// Hasil tool adalah DATA; abstrak dipotong agar hemat token.
const cut = (s, n) => (s && s.length > n ? `${s.slice(0, n)}...` : s || null)

function createLiteratureTools() {
  return [
    {
      name: 'search_literature',
      description: 'Mencari kandidat literatur ilmiah pada provider aktif. Hasil adalah KANDIDAT, bukan referensi terverifikasi; gunakan add_reference untuk memasukkan kandidat ke daftar referensi proyek.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', minLength: 3, maxLength: 300 },
          year_from: { type: 'integer', minimum: 1900, maximum: 2100 },
          limit: { type: 'integer', minimum: 1, maximum: 15 },
          language: { type: 'string', pattern: '^[a-z]{2}$' }
        },
        required: ['query'],
        additionalProperties: false
      },
      timeoutMs: 20000,
      async handler(input, ctx) {
        const r = await ctx.literature.search({ userId: ctx.userId, projectId: ctx.projectId, params: { query: input.query, yearFrom: input.year_from, limit: input.limit, language: input.language } })
        return {
          candidates: r.candidates.map((c) => ({
            candidateId: c.candidateId,
            title: c.title,
            authors: c.authors.slice(0, 3).map((a) => a.family),
            authorCount: c.authors.length,
            year: c.year,
            venue: c.venueName,
            doi: c.doi,
            providers: c.providers,
            abstract: cut(c.abstract, 400),
            retractionFlag: Boolean(c.retracted)
          })),
          providers: r.providers.map((p) => ({ name: p.name, ok: p.ok, count: p.count })),
          limitations: r.limitations
        }
      }
    },
    {
      name: 'verify_reference',
      description: 'Memverifikasi referensi (DOI dan/atau judul, penulis, tahun) ke sumber. Mengembalikan status verified/partial/unverified/retracted beserta bidang yang cocok. Tidak menambah ke daftar referensi.',
      inputSchema: {
        type: 'object',
        properties: {
          doi: { type: 'string', maxLength: 200 },
          title: { type: 'string', maxLength: 500 },
          authors: { type: 'array', items: { type: 'string', maxLength: 120 }, maxItems: 30 },
          year: { type: 'integer', minimum: 1800, maximum: 2100 }
        },
        additionalProperties: false
      },
      timeoutMs: 25000,
      async handler(input, ctx) {
        const v = await ctx.literature.verify(input)
        return { status: v.status, matchedFields: v.matchedFields, mismatches: v.mismatches, notes: v.notes, provider: v.provider, checkedAt: v.checkedAt, canonical: v.canonical ? { title: v.canonical.title, year: v.canonical.year, doi: v.canonical.doi, venue: v.canonical.venueName } : null }
      }
    },
    {
      name: 'add_reference',
      description: 'Menambahkan kandidat (dari search_literature) ke daftar referensi proyek. Hanya kandidat yang lolos verifikasi server (verified) yang diterima. Mengembalikan citeKey untuk disitasi.',
      inputSchema: { type: 'object', properties: { candidateId: { type: 'string', minLength: 8, maxLength: 64 } }, required: ['candidateId'], additionalProperties: false },
      timeoutMs: 30000,
      async handler(input, ctx) {
        const ref = await ctx.literature.addCandidate({ userId: ctx.userId, projectId: ctx.projectId, candidateId: input.candidateId })
        return { citeKey: ref.citeKey, status: ref.verification.status, title: ref.title, year: ref.year }
      }
    },
    {
      name: 'check_claim_support',
      description: 'Memeriksa apakah abstrak sebuah referensi proyek (citeKey) mendukung sebuah klaim. Evaluasi berbasis abstrak; hasil unknown berarti bukti tidak cukup.',
      inputSchema: {
        type: 'object',
        properties: { claim: { type: 'string', minLength: 5, maxLength: 600 }, citeKey: { type: 'string', minLength: 2, maxLength: 80 } },
        required: ['claim', 'citeKey'],
        additionalProperties: false
      },
      timeoutMs: 40000,
      async handler(input, ctx) {
        return ctx.literature.checkClaim({ userId: ctx.userId, projectId: ctx.projectId, claim: input.claim, citeKey: input.citeKey })
      }
    }
  ]
}

module.exports = { createLiteratureTools }
