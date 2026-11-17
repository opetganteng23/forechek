const mongoose = require('mongoose')

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String }, // kosong jika login via Google OAuth
    avatar: { type: String, default: null },
    role: { type: String, enum: ['user', 'admin', 'superadmin', 'institution'], default: 'user' },
    profession: {
      type: String,
      enum: ['dosen', 'mahasiswa_s2', 'mahasiswa_s3', 'peneliti', 'lainnya']
    },
    institution: { type: String },
    subscription: {
      plan: { type: String, enum: ['free', 'pro', 'institutional'], default: 'free' },
      startDate: Date,
      endDate: Date,
      isActive: { type: Boolean, default: false },
      // Legacy (alur analisis lama). Digantikan oleh `usage` di bawah; dipertahankan agar data lama tetap terbaca.
      analysisQuota: { type: Number, default: 2 },
      analysisUsed: { type: Number, default: 0 }
    },
    // Penghitung kuota bulanan (MTS Bagian 13). Di-reset otomatis lewat resolveUsage() di @publication-prepare/core.
    usage: {
      periodStart: Date,
      tokensUsed: { type: Number, default: 0 },
      messagesUsed: { type: Number, default: 0 }
    },
    oauthProvider: { type: String, enum: ['google', null], default: null },
    oauthId: String,
    // Jatah paper trial yang SUDAH dipakai seumur akun (hanya naik; menghapus proyek tidak mengembalikannya).
    trialPapersCreated: { type: Number, default: 0 },
    emailVerified: { type: Boolean, default: false },
    // Yang disimpan adalah HASH SHA-256 token, bukan token mentah (token mentah hanya ada di email).
    emailVerificationToken: String,
    emailVerificationExpires: Date,
    passwordResetToken: String,
    sessionsValidAfter: { type: Date, default: null }, // sesi (JWT) yang diterbitkan sebelum waktu ini tidak berlaku lagi
    passwordResetExpires: Date,
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
)

UserSchema.index({ emailVerificationToken: 1 }, { sparse: true })
UserSchema.index({ passwordResetToken: 1 }, { sparse: true })

module.exports = mongoose.models.User || mongoose.model('User', UserSchema)
