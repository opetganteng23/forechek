const mongoose = require('mongoose')

const JournalSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    issn: {
      print: String,
      electronic: String
    },
    publisher: String,
    country: String,
    language: [String],

    ranking: {
      sinta: {
        level: { type: Number, min: 1, max: 6 },
        year: Number
      },
      scopus: {
        quartile: { type: String, enum: ['Q1', 'Q2', 'Q3', 'Q4'] },
        sjr: Number,
        hIndex: Number,
        year: Number
      },
      wos: {
        quartile: String,
        impactFactor: Number,
        year: Number
      }
    },

    subjects: [String],
    keywords: [String],

    submissionInfo: {
      url: String,
      processingTime: String,
      apc: {
        amount: Number,
        currency: String,
        isWaivable: Boolean
      },
      openAccess: Boolean
    },

    stats: {
      acceptanceRate: Number,
      articlesPerYear: Number
    },

    isActive: { type: Boolean, default: true },
    lastUpdated: Date
  },
  { timestamps: true }
)

JournalSchema.index({ name: 'text', subjects: 'text', keywords: 'text' })
JournalSchema.index({ 'ranking.sinta.level': 1 })
JournalSchema.index({ 'ranking.scopus.quartile': 1 })

module.exports = mongoose.models.Journal || mongoose.model('Journal', JournalSchema)
