const mongoose = require('mongoose')

const ManuscriptSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    abstract: { type: String },
    fileUrl: { type: String, required: true }, // URL ke S3/Cloudinary
    filePublicId: String, // public_id Cloudinary, untuk penghapusan asset
    fileName: String,
    fileSize: Number, // bytes
    fileType: { type: String, enum: ['pdf', 'docx'], required: true },
    extractedText: {
      full: String,
      sections: {
        title: String,
        abstract: String,
        introduction: String,
        methodology: String,
        results: String,
        discussion: String,
        conclusion: String,
        references: String
      }
    },
    targetJournalType: {
      type: String,
      enum: [
        'sinta1',
        'sinta2',
        'sinta3',
        'sinta4',
        'scopus_q1',
        'scopus_q2',
        'scopus_q3',
        'scopus_q4',
        'any'
      ],
      default: 'any'
    },
    fieldOfStudy: String,
    language: { type: String, enum: ['indonesia', 'english'], default: 'indonesia' },
    status: {
      type: String,
      enum: ['uploaded', 'processing', 'analyzed', 'failed'],
      default: 'uploaded'
    }
  },
  { timestamps: true }
)

module.exports = mongoose.models.Manuscript || mongoose.model('Manuscript', ManuscriptSchema)
