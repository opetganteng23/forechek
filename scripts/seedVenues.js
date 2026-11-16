// Seed profil venue bawaan ke MongoDB (idempoten: $setOnInsert per (slug, versi); tidak menimpa profil yang sudah ada).
//   MONGODB_URI=mongodb://localhost:27017/publikasi_db node scripts/seedVenues.js
// Jangan arahkan ke database produksi tanpa sengaja. Profil bawaan berstatus needs_review/unverified (lihat D5-01).
const mongoose = require('mongoose')
const { loadBuiltinProfiles } = require('../packages/venues')
const VenueProfile = require('../packages/db/models/VenueProfile')

;(async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI belum diset')
  await mongoose.connect(process.env.MONGODB_URI)
  let inserted = 0
  for (const p of loadBuiltinProfiles()) {
    const r = await VenueProfile.updateOne({ slug: p.slug, version: p.version }, { $setOnInsert: { slug: p.slug, version: p.version, status: p.status, profile: p } }, { upsert: true })
    if (r.upsertedCount) inserted++
    console.log(`${p.slug} v${p.version}: ${r.upsertedCount ? 'ditambahkan' : 'sudah ada'}`)
  }
  console.log(`Selesai. ${inserted} profil baru.`)
  await mongoose.disconnect()
})().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
