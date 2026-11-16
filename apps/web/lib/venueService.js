import { dbConnect, VenueProfile } from '@publication-prepare/db'
import { loadBuiltinProfiles, evaluateFreshness, summarizeProfile, assertValidVenueProfile } from '@publication-prepare/venues'

// Profil venue disimpan di DB per (slug, versi) dan TIDAK diubah di tempat (perubahan aturan = versi baru).
// Profil bawaan (data JSON di packages/venues) di-seed secara idempoten saat pertama dipakai. Seluruh profil bawaan
// berstatus needs_review/unverified: aturan belum diverifikasi manusia terhadap sumber resmi.
let seeded

export async function ensureVenuesSeeded() {
  await dbConnect()
  if (seeded) return
  for (const p of loadBuiltinProfiles()) {
    try {
      await VenueProfile.updateOne({ slug: p.slug, version: p.version }, { $setOnInsert: { slug: p.slug, version: p.version, status: p.status, profile: p } }, { upsert: true })
    } catch (err) {
      if (!err || err.code !== 11000) throw err // seed bersamaan oleh permintaan lain: aman diabaikan
    }
  }
  seeded = true
}

const latest = async (slug) => {
  const doc = await VenueProfile.findOne({ slug }).sort({ version: -1 }).lean()
  return doc ? assertValidVenueProfile(doc.profile) : null
}

export async function listVenues() {
  await ensureVenuesSeeded()
  const docs = await VenueProfile.find({}).sort({ slug: 1, version: -1 }).lean()
  const seen = new Set()
  const out = []
  for (const d of docs) {
    if (seen.has(d.slug)) continue // hanya versi terbaru tiap slug
    seen.add(d.slug)
    out.push(summarizeProfile(d.profile))
  }
  return out
}

// Untuk layanan laporan: profil lengkap + kesegaran. slug harus berbentuk aman (tidak pernah dipakai sebagai path).
export async function getVenue(slug) {
  if (typeof slug !== 'string' || !/^[a-z0-9-]{3,60}$/.test(slug)) return null
  await ensureVenuesSeeded()
  const profile = await latest(slug)
  return profile ? { profile, freshness: evaluateFreshness(profile) } : null
}

export async function getVenueSummary(slug) {
  const v = await getVenue(slug)
  return v ? summarizeProfile(v.profile) : null
}
