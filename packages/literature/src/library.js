'use strict'
const { AppError } = require('@publication-prepare/core')
const { normalizeTitle, normalizeFamily, normalizeDoi } = require('./normalize')
const { searchLiterature } = require('./search')
const { verifyReference } = require('./verify')
const { checkClaimSupport } = require('./claims')

const MAX_REFERENCES_PER_PROJECT = 300
const STOP = new Set(['the', 'a', 'an', 'of', 'for', 'and', 'in', 'on', 'to', 'with', 'yang', 'dan', 'untuk', 'pada', 'dengan', 'terhadap', 'pengaruh', 'analisis'])

function baseKey(ref) {
  const fam = normalizeFamily(ref.authors && ref.authors[0] && ref.authors[0].family).replace(/[^a-z]/g, '') || 'anon'
  const word = normalizeTitle(ref.title).split(' ').find((w) => w.length > 3 && !STOP.has(w)) || 'ref'
  return `${fam}${ref.year || 'nd'}${word}`.slice(0, 40)
}

// citeKey unik per proyek: tambahkan a, b, c... bila bentrok.
function uniqueCiteKey(ref, existing) {
  const base = baseKey(ref)
  if (!existing.has(base)) return base
  for (const suf of 'abcdefghijklmnopqrstuvwxyz') if (!existing.has(base + suf)) return base + suf
  return `${base}${existing.size + 1}`
}

// Kunci duplikat atomik (indeks unik di DB): DOI bila ada, selain itu judul ternormalisasi + tahun.
const dedupKeyOf = (m) => (m.doi ? `doi:${m.doi}` : `t:${normalizeTitle(m.title)}|${m.year || ''}`)

const publicRef = (r) => ({
  id: String(r.id),
  citeKey: r.citeKey,
  doi: r.doi || null,
  title: r.title,
  authors: r.authors,
  year: r.year || null,
  venueName: r.venueName || null,
  type: r.type || null,
  url: r.url || null,
  hasAbstract: Boolean(r.abstract),
  source: r.source,
  provider: r.verification && r.verification.provider,
  verification: r.verification,
  statusHistory: r.statusHistory || []
})

// Layanan perpustakaan referensi per proyek (MTS 39.2 D). Semua operasi memeriksa kepemilikan lewat assertOwned.
// Stores: refs {list, findById, findByCiteKey, insert (lempar {duplicate:true} bila citeKey bentrok), update, remove},
//         candidates {insertMany, get}.
function createReferenceService({ refs, candidates, assertOwned, providers, judge, now = () => new Date() }) {
  const verifyInput = (input) => verifyReference({ input, resolvers: providers, searchers: providers, now })

  async function list(userId, projectId) {
    await assertOwned(userId, projectId)
    return (await refs.list(userId, projectId)).map(publicRef)
  }

  async function listForContext(userId, projectId) {
    return (await refs.list(userId, projectId)).map((r) => ({ citeKey: r.citeKey, title: r.title, year: r.year, authors: r.authors, doi: r.doi, verification: r.verification, verificationStatus: r.verification && r.verification.status, abstract: r.abstract }))
  }

  async function search({ userId, projectId, params }) {
    await assertOwned(userId, projectId)
    const res = await searchLiterature({ providers, params, now })
    const stored = await candidates.insertMany(userId, projectId, res.candidates)
    return { ...res, candidates: stored }
  }

  async function findDuplicate(userId, projectId, c) {
    const all = await refs.list(userId, projectId)
    const nt = normalizeTitle(c.title)
    return all.find((r) => (c.doi && r.doi === c.doi) || (normalizeTitle(r.title) === nt && (r.year || null) === (c.year || null))) || null
  }

  async function persist(userId, projectId, meta, verification, source, raw) {
    if ((await refs.list(userId, projectId)).length >= MAX_REFERENCES_PER_PROJECT) throw new AppError('QUOTA_EXCEEDED', `Batas ${MAX_REFERENCES_PER_PROJECT} referensi per proyek tercapai`)
    const dup = await findDuplicate(userId, projectId, meta)
    if (dup) throw new AppError('CONFLICT', `Referensi duplikat dengan ${dup.citeKey}`, { details: { citeKey: dup.citeKey, code: 'REFERENCE_DUPLICATE' } })
    for (let i = 0; i < 5; i++) {
      const keys = new Set((await refs.list(userId, projectId)).map((r) => r.citeKey))
      const citeKey = uniqueCiteKey(meta, keys)
      const doc = {
        userId,
        projectId,
        citeKey,
        dedupKey: dedupKeyOf(meta),
        doi: meta.doi || null,
        title: meta.title,
        authors: meta.authors || [],
        year: meta.year || null,
        venueName: meta.venueName || null,
        type: meta.type || null,
        url: meta.url || null,
        abstract: meta.abstract || null,
        source,
        rawMetadata: raw || null,
        verification,
        statusHistory: [{ status: verification.status, at: verification.checkedAt, reason: source === 'user_provided' ? 'manual_verification' : 'candidate_verified' }]
      }
      try {
        return publicRef(await refs.insert(doc))
      } catch (err) {
        if (err && err.duplicateRef) throw new AppError('CONFLICT', 'Referensi duplikat', { details: { code: 'REFERENCE_DUPLICATE' } })
        if (!err || !err.duplicate) throw err // bentrok citeKey karena balapan: coba kunci berikutnya
      }
    }
    throw new AppError('CONFLICT', 'Gagal membuat citeKey unik')
  }

  // Menambah dari kandidat (MTS 39.2 D + 7.3): kandidat DIVERIFIKASI ulang di server; hanya `verified` yang masuk
  // (atau `retracted` bila allowRetracted, agar validator dapat menandainya). Selain itu ditolak dengan detail.
  async function addCandidate({ userId, projectId, candidateId, allowRetracted = false }) {
    await assertOwned(userId, projectId)
    const cand = await candidates.get(userId, projectId, candidateId)
    if (!cand) throw new AppError('NOT_FOUND', 'Kandidat tidak ditemukan atau sudah kedaluwarsa')
    const v = await verifyInput({ doi: cand.doi || undefined, title: cand.title, authors: cand.authors, year: cand.year || undefined })
    const ok = v.status === 'verified' || (allowRetracted && v.status === 'retracted')
    if (!ok) throw new AppError('CONFLICT', 'Kandidat belum terverifikasi sehingga tidak dapat ditambahkan', { details: { code: 'REFERENCE_NOT_VERIFIED', status: v.status, notes: v.notes, mismatches: v.mismatches } })
    // Metadata KANONIS dari sumber (bukan data kandidat tersimpan, yang tidak dipercaya setelah verifikasi ulang).
    const c = v.canonical
    const meta = { doi: c.doi || cand.doi || null, title: c.title, authors: c.authors || [], year: c.year || null, venueName: c.venueName || null, type: c.type || null, url: c.url || null, abstract: c.abstract || null }
    return persist(userId, projectId, meta, { status: v.status, checkedAt: v.checkedAt, matchedFields: v.matchedFields, mismatches: v.mismatches, notes: v.notes, provider: v.provider, providers: v.providers }, cand.providers && cand.providers[0] ? cand.providers[0] : cand.provider, cand)
  }

  // Jalur manual (MTS 39.2 D): pengguna memasukkan metadata; hasil verifikasi apa adanya (termasuk unverified, ditandai jelas).
  async function verifyManual({ userId, projectId, input, add = false }) {
    await assertOwned(userId, projectId)
    const v = await verifyInput(input)
    if (!add) return { verification: v, added: null }
    // Rekaman verified/retracted menyimpan metadata KANONIS dari sumber (bukan input pengguna, yang boleh berbeda toleransi).
    const canon = v.canonical && (v.status === 'verified' || v.status === 'retracted') ? v.canonical : null
    const inputAuthors = input.authors && input.authors.length ? input.authors.map((a) => (typeof a === 'string' ? { given: a.split(' ').slice(0, -1).join(' '), family: a.split(' ').slice(-1)[0] } : a)) : []
    const meta = canon
      ? { doi: canon.doi || normalizeDoi(input.doi || '') || null, title: canon.title, authors: canon.authors || [], year: canon.year || null, venueName: canon.venueName || null, type: canon.type || null, url: canon.url || null, abstract: v.status === 'verified' ? canon.abstract || null : null }
      : { doi: normalizeDoi(input.doi || '') || null, title: String(input.title || '').trim() || (v.canonical && v.canonical.title) || null, authors: inputAuthors.length ? inputAuthors : (v.canonical && v.canonical.authors) || [], year: Number(input.year) || (v.canonical && v.canonical.year) || null, venueName: (v.canonical && v.canonical.venueName) || null, type: (v.canonical && v.canonical.type) || null, url: (v.canonical && v.canonical.url) || null, abstract: null }
    if (!meta.title) throw new AppError('VALIDATION_ERROR', 'Judul wajib diisi untuk menambahkan referensi')
    const added = await persist(userId, projectId, meta, { status: v.status, checkedAt: v.checkedAt, matchedFields: v.matchedFields, mismatches: v.mismatches, notes: v.notes, provider: v.provider, providers: v.providers }, 'user_provided', { input })
    return { verification: v, added }
  }

  const EDITABLE = ['title', 'authors', 'year', 'venueName', 'doi', 'url']

  // Edit manual metadata MENURUNKAN status ke unverified sampai diverifikasi ulang (MTS 39.2 D).
  async function updateMetadata({ userId, projectId, refId, patch }) {
    await assertOwned(userId, projectId)
    const ref = await refs.findById(userId, projectId, refId)
    if (!ref) throw new AppError('NOT_FOUND', 'Data tidak ditemukan')
    const set = {}
    for (const k of EDITABLE) if (patch && patch[k] !== undefined) set[k] = patch[k]
    if (set.doi !== undefined) {
      set.doi = set.doi ? normalizeDoi(set.doi) : null
      if (set.doi === null && patch.doi) throw new AppError('VALIDATION_ERROR', 'Format DOI tidak valid')
    }
    if (set.title !== undefined && (typeof set.title !== 'string' || !set.title.trim() || set.title.length > 500)) throw new AppError('VALIDATION_ERROR', 'Judul tidak valid')
    if (set.year !== undefined && set.year !== null && (!Number.isInteger(set.year) || set.year < 1800 || set.year > new Date().getUTCFullYear() + 1)) throw new AppError('VALIDATION_ERROR', 'Tahun tidak valid')
    if (set.authors !== undefined && (!Array.isArray(set.authors) || set.authors.length > 100 || !set.authors.every((a) => a && typeof a.family === 'string' && a.family.trim() && a.family.length <= 120 && (a.given === undefined || (typeof a.given === 'string' && a.given.length <= 120))))) throw new AppError('VALIDATION_ERROR', 'authors harus array maksimal 100 objek {given, family} bertipe teks')
    if (set.authors) set.authors = set.authors.map((a) => ({ given: a.given || '', family: a.family.trim() }))
    if (set.venueName !== undefined && set.venueName !== null && (typeof set.venueName !== 'string' || set.venueName.length > 300)) throw new AppError('VALIDATION_ERROR', 'venueName harus teks maksimal 300 karakter')
    if (set.url !== undefined && set.url !== null && (typeof set.url !== 'string' || set.url.length > 500 || !/^https?:\/\//i.test(set.url))) throw new AppError('VALIDATION_ERROR', 'url harus berupa tautan http(s) maksimal 500 karakter')
    if (Object.keys(set).length === 0) throw new AppError('VALIDATION_ERROR', 'Tidak ada field yang dapat diubah')
    const at = now().toISOString()
    set.verification = { status: 'unverified', checkedAt: at, matchedFields: [], mismatches: [], notes: ['METADATA_EDITED_REVERIFY_REQUIRED'], provider: null, providers: [] }
    set.statusHistory = [...(ref.statusHistory || []), { status: 'unverified', at, reason: 'metadata_edited' }]
    set.abstract = null // abstrak berasal dari sumber terverifikasi; tidak dipercaya setelah edit
    set.dedupKey = dedupKeyOf({ doi: set.doi !== undefined ? set.doi : ref.doi, title: set.title !== undefined ? set.title : ref.title, year: set.year !== undefined ? set.year : ref.year })
    try {
      return publicRef(await refs.update(refId, set))
    } catch (err) {
      if (err && err.duplicateRef) throw new AppError('CONFLICT', 'Perubahan membuat referensi ini duplikat dengan referensi lain', { details: { code: 'REFERENCE_DUPLICATE' } })
      throw err
    }
  }

  async function reverify({ userId, projectId, refId }) {
    await assertOwned(userId, projectId)
    const ref = await refs.findById(userId, projectId, refId)
    if (!ref) throw new AppError('NOT_FOUND', 'Data tidak ditemukan')
    const v = await verifyInput({ doi: ref.doi || undefined, title: ref.title, authors: ref.authors, year: ref.year || undefined })
    // Provider tidak tersedia bukan bukti: jangan menurunkan status referensi yang sudah ada.
    if (v.notes.includes('PROVIDER_UNAVAILABLE')) throw new AppError('PROVIDER_ERROR', 'Penyedia literatur tidak dapat dihubungi; status referensi tidak diubah')
    const set = {
      verification: { status: v.status, checkedAt: v.checkedAt, matchedFields: v.matchedFields, mismatches: v.mismatches, notes: v.notes, provider: v.provider, providers: v.providers },
      statusHistory: [...(ref.statusHistory || []), { status: v.status, at: v.checkedAt, reason: 'reverified' }]
    }
    // verified/retracted: simpan metadata KANONIS (hasil edit pengguna yang lolos toleransi tidak boleh bertahan sebagai data terverifikasi).
    if ((v.status === 'verified' || v.status === 'retracted') && v.canonical) {
      const c = v.canonical
      Object.assign(set, { title: c.title, authors: c.authors || [], year: c.year || null, venueName: c.venueName || null, doi: c.doi || ref.doi || null, type: c.type || null, url: c.url || null })
      set.dedupKey = dedupKeyOf({ doi: set.doi, title: set.title, year: set.year })
      set.abstract = v.status === 'verified' ? c.abstract || null : null
    }
    try {
      return publicRef(await refs.update(refId, set))
    } catch (err) {
      if (err && err.duplicateRef) throw new AppError('CONFLICT', 'Referensi duplikat dengan referensi lain', { details: { code: 'REFERENCE_DUPLICATE' } })
      throw err
    }
  }

  async function remove({ userId, projectId, refId }) {
    await assertOwned(userId, projectId)
    const ok = await refs.remove(userId, projectId, refId)
    if (!ok) throw new AppError('NOT_FOUND', 'Data tidak ditemukan')
    return { removed: true }
  }

  async function checkClaim({ userId, projectId, claim, citeKey }) {
    await assertOwned(userId, projectId)
    const ref = await refs.findByCiteKey(userId, projectId, citeKey)
    if (!ref) return { verdict: 'unknown', reason: 'REFERENCE_NOT_FOUND', basis: 'abstract', evidence: null, limitations: 'Referensi tidak ada di daftar proyek.' }
    return checkClaimSupport({ claim, reference: { citeKey: ref.citeKey, abstract: ref.abstract, verification: ref.verification }, judge })
  }

  return { list, listForContext, search, addCandidate, verifyManual, updateMetadata, reverify, remove, checkClaim, verify: verifyInput }
}

module.exports = { createReferenceService, uniqueCiteKey, baseKey, MAX_REFERENCES_PER_PROJECT }
