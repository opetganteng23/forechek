const mongoose = require('mongoose')

const KumCalculationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    publicationType: {
      type: String,
      enum: [
        'jurnal_internasional_bereputasi', // Scopus/WoS
        'jurnal_internasional',
        'jurnal_nasional_terakreditasi', // SINTA 1-2
        'jurnal_nasional_sinta3_4',
        'jurnal_nasional_sinta5_6',
        'prosiding_internasional',
        'prosiding_nasional',
        'buku_referensi',
        'book_chapter'
      ],
      required: true
    },
    authorPosition: {
      type: String,
      enum: ['pertama', 'kedua', 'ketiga', 'keempat_dst', 'korespondensi'],
      required: true
    },
    totalAuthors: { type: Number, required: true },
    kumValue: {
      base: Number,
      multiplier: Number,
      final: Number
    },
    notes: String,
    reference: String // acuan peraturan (misal: Permendikbud No. X Tahun Y)
  },
  { timestamps: true }
)

module.exports = mongoose.models.KumCalculation || mongoose.model('KumCalculation', KumCalculationSchema)
