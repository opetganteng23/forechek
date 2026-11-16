'use strict'
const { AppError, asString } = require('@publication-prepare/core')
const { normalizeSource, MAX_SOURCE_BYTES } = require('./parser')

const LANGUAGES = ['indonesia', 'english']
const PUBLICATION_TYPES = ['conference', 'journal', 'unspecified']
const FORMATS = ['latex', 'markdown']
const ORIGINS = ['paste', 'upload', 'user_edit', 'ai_edit_accepted', 'restore']
const VENUE_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,59}$/

function bad(msg) {
  return new AppError('VALIDATION_ERROR', msg)
}

function validateSource(raw) {
  const s = asString(raw, 'source')
  if (Buffer.byteLength(s, 'utf8') > MAX_SOURCE_BYTES) {
    throw new AppError('PAYLOAD_TOO_LARGE', `Naskah maksimal ${Math.round(MAX_SOURCE_BYTES / 1000)} KB`)
  }
  if (s.includes('\u0000')) throw bad('Naskah mengandung karakter biner (NUL). Unggah berkas teks.')
  const normalized = normalizeSource(s)
  if (!normalized.trim()) throw bad('Naskah tidak boleh kosong')
  return normalized
}

function optionalText(value, field, max) {
  if (value === undefined || value === null || value === '') return null
  const s = asString(value, field).trim()
  if (s.length > max) throw bad(`${field} maksimal ${max} karakter`)
  return s || null
}

function validateTitle(value) {
  const s = asString(value, 'title').trim()
  if (s.length < 1 || s.length > 200) throw bad('Judul proyek harus 1-200 karakter')
  return s
}

function validateEnum(value, allowed, field) {
  if (typeof value !== 'string' || !allowed.includes(value)) throw bad(`${field} tidak valid`)
  return value
}

function validateVenueSlug(value) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !VENUE_SLUG_RE.test(value)) throw bad('venueSlug tidak valid')
  return value
}

function validateBool(value, field) {
  if (typeof value !== 'boolean') throw bad(`${field} harus true atau false`)
  return value
}

function validateRetentionDays(value) {
  if (value === undefined || value === null || value === '') return null
  if (!Number.isInteger(value) || value < 7 || value > 3650) throw bad('retentionDays harus bilangan bulat 7-3650')
  return value
}

function validateProjectInput(input, { partial = false } = {}) {
  if (input === null || typeof input !== 'object') throw bad('Data proyek tidak valid')
  const out = {}
  const has = (k) => input[k] !== undefined
  if (!partial || has('title')) out.title = validateTitle(input.title)
  if (!partial || has('language')) out.language = has('language') ? validateEnum(input.language, LANGUAGES, 'language') : 'indonesia'
  if (!partial || has('publicationType')) {
    out.publicationType = has('publicationType') ? validateEnum(input.publicationType, PUBLICATION_TYPES, 'publicationType') : 'unspecified'
  }
  if (!partial || has('fieldOfStudy')) out.fieldOfStudy = optionalText(input.fieldOfStudy, 'fieldOfStudy', 120)
  if (!partial || has('venueSlug')) out.venueSlug = validateVenueSlug(input.venueSlug)
  if (!partial || has('retentionDays')) out.retentionDays = validateRetentionDays(input.retentionDays)
  if (has('indicatorsEnabled')) out.indicatorsEnabled = validateBool(input.indicatorsEnabled, 'indicatorsEnabled')
  return out
}

function validateSaveInput(input) {
  if (input === null || typeof input !== 'object') throw bad('Data versi tidak valid')
  const source = validateSource(input.source)
  const format = input.format === undefined || input.format === null || input.format === 'auto'
    ? undefined
    : validateEnum(input.format, FORMATS, 'format')
  const origin = input.origin === undefined ? 'user_edit' : validateEnum(input.origin, ORIGINS, 'origin')
  const note = optionalText(input.note, 'note', 200)
  if (!Number.isInteger(input.baseRevision) || input.baseRevision < 0) {
    throw bad('baseRevision wajib berupa bilangan bulat >= 0')
  }
  return { source, format, origin, note, baseRevision: input.baseRevision }
}

module.exports = {
  validateSource,
  validateProjectInput,
  validateSaveInput,
  LANGUAGES,
  PUBLICATION_TYPES,
  FORMATS,
  ORIGINS
}
