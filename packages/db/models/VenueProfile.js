const mongoose = require('mongoose')

// Profil venue (MTS 6.5, 9, 40.2 A). Isi profil adalah DATA bervalidasi (packages/venues); dokumen disimpan apa adanya
// per (slug, version) dan tidak pernah diubah di tempat: perubahan aturan = versi baru. Laporan merujuk (slug, version).
const VenueProfileSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true },
    version: { type: Number, required: true },
    status: { type: String, enum: ['active', 'needs_review', 'deprecated'], required: true },
    profile: { type: mongoose.Schema.Types.Mixed, required: true }
  },
  { timestamps: true }
)

VenueProfileSchema.index({ slug: 1, version: 1 }, { unique: true })

module.exports = mongoose.models.VenueProfile || mongoose.model('VenueProfile', VenueProfileSchema)
