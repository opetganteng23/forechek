const mongoose = require('mongoose')

// Pengaturan aplikasi berkunci (mis. _id 'plans' untuk harga/kuota paket). Hanya ditulis lewat layanan admin.
const SettingSchema = new mongoose.Schema(
  {
    _id: { type: String },
    value: { type: mongoose.Schema.Types.Mixed, default: {} },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true }
)

module.exports = mongoose.models.Setting || mongoose.model('Setting', SettingSchema)
