const mongoose = require('mongoose')

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String }, // null jika login via Google OAuth
    avatar: { type: String, default: null },
    role: { type: String, enum: ['user', 'admin', 'institution'], default: 'user' },
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
      analysisQuota: { type: Number, default: 2 }, // free: 2/bulan, pro: unlimited
      analysisUsed: { type: Number, default: 0 }
    },
    oauthProvider: { type: String, enum: ['google', null], default: null },
    oauthId: String,
    emailVerified: { type: Boolean, default: false },
    emailVerificationToken: String,
    passwordResetToken: String,
    passwordResetExpires: Date,
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
)

module.exports = mongoose.models.User || mongoose.model('User', UserSchema)
