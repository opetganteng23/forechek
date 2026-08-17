const mongoose = require('mongoose')

const sectionScoreShape = {
  score: Number,
  maxScore: Number,
  feedback: String,
  suggestions: [String],
  issues: [String]
}

const AnalysisSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    manuscriptId: { type: mongoose.Schema.Types.ObjectId, ref: 'Manuscript', required: true },

    // === HASIL SKOR UTAMA ===
    overallScore: { type: Number, min: 0, max: 100 },
    grade: { type: String, enum: ['A', 'B', 'C', 'D', 'F'] },
    readinessLevel: {
      type: String,
      enum: ['siap_submit', 'perlu_revisi_minor', 'perlu_revisi_major', 'tidak_siap']
    },

    // === SIMILARITY INDEX ===
    similarityIndex: {
      estimatedPercentage: Number,
      riskLevel: { type: String, enum: ['low', 'medium', 'high'] },
      notes: String
    },

    // === SKOR PER BAGIAN ===
    sectionScores: {
      title: sectionScoreShape,
      abstract: sectionScoreShape,
      introduction: sectionScoreShape,
      methodology: sectionScoreShape,
      results: sectionScoreShape,
      discussion: sectionScoreShape,
      conclusion: sectionScoreShape,
      references: {
        ...sectionScoreShape,
        totalRefs: Number,
        recentRefsPercentage: Number
      }
    },

    // === FOKUS PERBAIKAN ===
    priorityImprovements: [
      {
        priority: Number,
        section: String,
        issue: String,
        suggestion: String,
        impact: { type: String, enum: ['high', 'medium', 'low'] }
      }
    ],

    // === REKOMENDASI JURNAL ===
    journalRecommendations: [
      {
        journalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Journal' },
        journalName: String,
        publisher: String,
        ranking: String,
        matchScore: Number,
        reason: String,
        submissionUrl: String
      }
    ],

    // === METADATA AI ===
    aiModel: { type: String, default: 'claude-sonnet-4-6' },
    processingTimeMs: Number,
    tokensUsed: Number,

    // === STATUS ===
    status: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' },
    errorMessage: String,

    // === EXPORT ===
    pdfReportUrl: String,
    isPublic: { type: Boolean, default: false }
  },
  { timestamps: true }
)

module.exports = mongoose.models.Analysis || mongoose.model('Analysis', AnalysisSchema)
