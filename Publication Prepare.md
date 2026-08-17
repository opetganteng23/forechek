# 📄 Spesifikasi Sistem: Platform Cek Kesiapan Publikasi Ilmiah
> Versi 1.0 | Stack: Next.js + MongoDB + Google Mailer + Claude AI

---

## 📌 Daftar Isi
1. [Gambaran Umum](#gambaran-umum)
2. [Fitur Utama](#fitur-utama)
3. [Tech Stack](#tech-stack)
4. [Arsitektur Sistem](#arsitektur-sistem)
5. [Skema Database MongoDB](#skema-database-mongodb)
6. [API Endpoints](#api-endpoints)
7. [Alur Kerja Sistem](#alur-kerja-sistem)
8. [Konfigurasi Google Mailer](#konfigurasi-google-mailer)
9. [Struktur Folder Proyek](#struktur-folder-proyek)
10. [Environment Variables](#environment-variables)
11. [Rencana Pengembangan (Roadmap)](#roadmap)

---

## Gambaran Umum

Platform ini adalah layanan analisis kesiapan naskah ilmiah berbasis AI yang membantu dosen, mahasiswa S2/S3, dan peneliti mengetahui skor dan kelemahan naskah mereka **sebelum** disubmit ke jurnal ilmiah.

### Masalah yang Diselesaikan
- Peneliti menunggu 8–12 bulan hanya untuk mendapat feedback "naskah ditolak"
- Tidak ada cara cepat mengetahui kelemahan naskah secara mandiri
- Kurangnya panduan target jurnal yang sesuai kualitas naskah

### Solusi
Sistem ini memberikan analisis otomatis dalam hitungan menit menggunakan AI, mencakup skor keseluruhan, deteksi similaritas, feedback per bagian, dan rekomendasi jurnal.

---

## Fitur Utama

### 🔵 Core Features
| Fitur | Deskripsi |
|-------|-----------|
| **Overall Score & Grade** | Skor 0–100 dengan grade A/B/C/D berdasarkan standar editor jurnal |
| **Similarity Index** | Deteksi tingkat kemiripan dengan literatur yang ada (estimasi, bukan Turnitin) |
| **Analisis per Bagian** | Feedback spesifik untuk Title, Abstract, Introduction, Methodology, Results, Discussion, Conclusion, References |
| **Rekomendasi Jurnal** | Saran jurnal berdasarkan topik dan skor (SINTA 1–4, Scopus Q1–Q4) |
| **Fokus Perbaikan** | Daftar prioritas perbaikan yang harus dilakukan |

### 🟡 Bonus Features
| Fitur | Deskripsi |
|-------|-----------|
| **Database Jurnal** | 15.000+ jurnal yang bisa difilter berdasarkan bidang, ranking, dan publisher |
| **Kalkulator KUM** | Hitung nilai KUM otomatis berdasarkan jenis publikasi dan peran penulis |
| **Riwayat Analisis** | Menyimpan semua hasil analisis per user |
| **Export PDF** | Laporan analisis bisa diunduh sebagai PDF |

### 🔐 Auth & User Management
- Register / Login (email + password)
- OAuth Google
- Paket berlangganan (Free / Pro / Institutional)

---

## Tech Stack

```
Frontend      : Next.js 14 (App Router) + Tailwind CSS + shadcn/ui
Backend       : Next.js API Routes (atau Express.js terpisah)
Database      : MongoDB (via Mongoose)
AI Engine     : Anthropic Claude API (analisis naskah)
File Upload   : Multer + AWS S3 / Cloudinary (untuk simpan PDF naskah)
Auth          : NextAuth.js (credential + Google OAuth)
Email         : Nodemailer + Gmail SMTP (Google Mailer)
Payment       : Midtrans / Xendit (untuk pasar Indonesia)
Deployment    : Vercel (frontend) + Railway / Render (backend)
```

---

## Arsitektur Sistem

```
┌─────────────────────────────────────────────────────────┐
│                        CLIENT                           │
│              Next.js + Tailwind + shadcn                │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP / REST API
┌───────────────────────▼─────────────────────────────────┐
│                    API LAYER                            │
│              Next.js API Routes / Express               │
│                                                         │
│  ┌──────────────┐  ┌─────────────┐  ┌───────────────┐  │
│  │  Auth Module │  │ Upload Module│  │ Analysis Module│ │
│  │ (NextAuth)   │  │ (Multer+S3) │  │ (Claude API)  │  │
│  └──────────────┘  └─────────────┘  └───────────────┘  │
│                                                         │
│  ┌──────────────┐  ┌─────────────┐  ┌───────────────┐  │
│  │ Journal DB   │  │ KUM Calc    │  │ Email Service │  │
│  │ Module       │  │ Module      │  │ (Nodemailer)  │  │
│  └──────────────┘  └─────────────┘  └───────────────┘  │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│                   DATABASE                              │
│                    MongoDB                              │
│                                                         │
│  users │ manuscripts │ analyses │ journals │ payments   │
└─────────────────────────────────────────────────────────┘
```

---

## Skema Database MongoDB

### 1. Collection: `users`
```javascript
// models/User.js
const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  password: {
    type: String,
    // null jika login via Google OAuth
  },
  avatar: {
    type: String,
    default: null
  },
  role: {
    type: String,
    enum: ['user', 'admin', 'institution'],
    default: 'user'
  },
  profession: {
    type: String,
    enum: ['dosen', 'mahasiswa_s2', 'mahasiswa_s3', 'peneliti', 'lainnya']
  },
  institution: {
    type: String
  },
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'pro', 'institutional'],
      default: 'free'
    },
    startDate: Date,
    endDate: Date,
    isActive: {
      type: Boolean,
      default: false
    },
    analysisQuota: {
      type: Number,
      default: 2  // free: 2/bulan, pro: unlimited
    },
    analysisUsed: {
      type: Number,
      default: 0
    }
  },
  oauthProvider: {
    type: String,
    enum: ['google', null],
    default: null
  },
  oauthId: String,
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  passwordResetToken: String,
  passwordResetExpires: Date,
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true  // createdAt, updatedAt otomatis
})
```

---

### 2. Collection: `manuscripts`
```javascript
// models/Manuscript.js
const ManuscriptSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true
  },
  abstract: {
    type: String
  },
  fileUrl: {
    type: String,  // URL ke S3/Cloudinary
    required: true
  },
  fileName: String,
  fileSize: Number,  // dalam bytes
  fileType: {
    type: String,
    enum: ['pdf', 'docx'],
    required: true
  },
  extractedText: {
    // Teks yang diekstrak dari file untuk dianalisis AI
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
    enum: ['sinta1', 'sinta2', 'sinta3', 'sinta4', 'scopus_q1', 'scopus_q2', 'scopus_q3', 'scopus_q4', 'any'],
    default: 'any'
  },
  fieldOfStudy: String,
  language: {
    type: String,
    enum: ['indonesia', 'english'],
    default: 'indonesia'
  },
  status: {
    type: String,
    enum: ['uploaded', 'processing', 'analyzed', 'failed'],
    default: 'uploaded'
  }
}, {
  timestamps: true
})
```

---

### 3. Collection: `analyses`
```javascript
// models/Analysis.js
const AnalysisSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  manuscriptId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Manuscript',
    required: true
  },

  // === HASIL SKOR UTAMA ===
  overallScore: {
    type: Number,  // 0–100
    min: 0,
    max: 100
  },
  grade: {
    type: String,
    enum: ['A', 'B', 'C', 'D', 'F']
    // A: 85–100, B: 70–84, C: 55–69, D: 40–54, F: <40
  },
  readinessLevel: {
    type: String,
    enum: ['siap_submit', 'perlu_revisi_minor', 'perlu_revisi_major', 'tidak_siap']
  },

  // === SIMILARITY INDEX ===
  similarityIndex: {
    estimatedPercentage: Number,  // 0–100
    riskLevel: {
      type: String,
      enum: ['low', 'medium', 'high']
      // low: <20%, medium: 20–40%, high: >40%
    },
    notes: String
  },

  // === SKOR PER BAGIAN ===
  sectionScores: {
    title: {
      score: Number,        // 0–100
      maxScore: Number,     // bobot maksimal (misal: 5)
      feedback: String,
      suggestions: [String],
      issues: [String]
    },
    abstract: {
      score: Number,
      maxScore: Number,
      feedback: String,
      suggestions: [String],
      issues: [String]
    },
    introduction: {
      score: Number,
      maxScore: Number,
      feedback: String,
      suggestions: [String],
      issues: [String]
    },
    methodology: {
      score: Number,
      maxScore: Number,
      feedback: String,
      suggestions: [String],
      issues: [String]
    },
    results: {
      score: Number,
      maxScore: Number,
      feedback: String,
      suggestions: [String],
      issues: [String]
    },
    discussion: {
      score: Number,
      maxScore: Number,
      feedback: String,
      suggestions: [String],
      issues: [String]
    },
    conclusion: {
      score: Number,
      maxScore: Number,
      feedback: String,
      suggestions: [String],
      issues: [String]
    },
    references: {
      score: Number,
      maxScore: Number,
      feedback: String,
      suggestions: [String],
      issues: [String],
      totalRefs: Number,
      recentRefsPercentage: Number  // % referensi 5 tahun terakhir
    }
  },

  // === FOKUS PERBAIKAN ===
  priorityImprovements: [
    {
      priority: Number,         // 1 = paling penting
      section: String,          // bagian mana
      issue: String,            // masalahnya apa
      suggestion: String,       // saran konkret
      impact: {
        type: String,
        enum: ['high', 'medium', 'low']
      }
    }
  ],

  // === REKOMENDASI JURNAL ===
  journalRecommendations: [
    {
      journalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Journal'
      },
      journalName: String,
      publisher: String,
      ranking: String,          // "SINTA 2", "Scopus Q2", dll
      matchScore: Number,       // seberapa cocok (0–100)
      reason: String,           // alasan direkomendasikan
      submissionUrl: String
    }
  ],

  // === METADATA AI ===
  aiModel: {
    type: String,
    default: 'claude-sonnet-4-6'
  },
  processingTimeMs: Number,
  tokensUsed: Number,

  // === STATUS ===
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  errorMessage: String,

  // === EXPORT ===
  pdfReportUrl: String,   // URL laporan PDF yang sudah digenerate
  isPublic: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
})
```

---

### 4. Collection: `journals`
```javascript
// models/Journal.js
const JournalSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  issn: {
    print: String,
    electronic: String
  },
  publisher: String,
  country: String,
  language: [String],

  ranking: {
    sinta: {
      level: {
        type: Number,
        min: 1,
        max: 6
      },
      year: Number
    },
    scopus: {
      quartile: {
        type: String,
        enum: ['Q1', 'Q2', 'Q3', 'Q4']
      },
      sjr: Number,          // SCImago Journal Rank
      hIndex: Number,
      year: Number
    },
    wos: {
      quartile: String,
      impactFactor: Number,
      year: Number
    }
  },

  subjects: [String],       // bidang ilmu
  keywords: [String],       // kata kunci terkait

  submissionInfo: {
    url: String,
    processingTime: String, // misal: "3–6 months"
    apc: {                  // Article Processing Charge
      amount: Number,
      currency: String,
      isWaivable: Boolean
    },
    openAccess: Boolean
  },

  stats: {
    acceptanceRate: Number,  // persen
    articlesPerYear: Number
  },

  isActive: {
    type: Boolean,
    default: true
  },
  lastUpdated: Date
}, {
  timestamps: true
})

// Index untuk pencarian cepat
JournalSchema.index({ name: 'text', subjects: 'text', keywords: 'text' })
JournalSchema.index({ 'ranking.sinta.level': 1 })
JournalSchema.index({ 'ranking.scopus.quartile': 1 })
```

---

### 5. Collection: `payments`
```javascript
// models/Payment.js
const PaymentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  plan: {
    type: String,
    enum: ['pro_monthly', 'pro_yearly', 'institutional'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'IDR'
  },
  status: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded', 'expired'],
    default: 'pending'
  },
  paymentGateway: {
    type: String,
    enum: ['midtrans', 'xendit'],
    default: 'midtrans'
  },
  gatewayTransactionId: String,
  gatewayOrderId: String,
  paymentMethod: String,    // 'bank_transfer', 'gopay', 'qris', dll
  paidAt: Date,
  expiredAt: Date,
  metadata: mongoose.Schema.Types.Mixed
}, {
  timestamps: true
})
```

---

### 6. Collection: `kum_calculations`
```javascript
// models/KumCalculation.js
const KumCalculationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  publicationType: {
    type: String,
    enum: [
      'jurnal_internasional_bereputasi',  // Scopus/WoS
      'jurnal_internasional',
      'jurnal_nasional_terakreditasi',    // SINTA 1–2
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
  totalAuthors: {
    type: Number,
    required: true
  },
  kumValue: {
    base: Number,       // nilai KUM dasar (dari Pedoman BKD)
    multiplier: Number, // pengali berdasarkan posisi penulis
    final: Number       // nilai KUM akhir
  },
  notes: String,
  reference: String   // acuan peraturan (misal: Permendikbud No. X Tahun Y)
}, {
  timestamps: true
})
```

---

## API Endpoints

### Auth
```
POST   /api/auth/register          - Daftar akun baru
POST   /api/auth/login             - Login (credential)
POST   /api/auth/logout            - Logout
GET    /api/auth/verify-email      - Verifikasi email
POST   /api/auth/forgot-password   - Request reset password
POST   /api/auth/reset-password    - Reset password baru
GET    /api/auth/me                - Profil user aktif
```

### Manuscript & Analysis
```
POST   /api/manuscripts/upload     - Upload file naskah (PDF/DOCX)
GET    /api/manuscripts            - List semua naskah user
GET    /api/manuscripts/:id        - Detail naskah
DELETE /api/manuscripts/:id        - Hapus naskah

POST   /api/analyses               - Mulai analisis naskah
GET    /api/analyses               - Riwayat semua analisis
GET    /api/analyses/:id           - Detail hasil analisis
GET    /api/analyses/:id/report    - Download laporan PDF
```

### Journal Database
```
GET    /api/journals               - List jurnal (dengan filter & pagination)
GET    /api/journals/:id           - Detail jurnal
GET    /api/journals/search        - Pencarian jurnal (full-text)
```

### KUM Calculator
```
POST   /api/kum/calculate          - Hitung nilai KUM
GET    /api/kum/history            - Riwayat kalkulasi
```

### Subscription & Payment
```
GET    /api/plans                  - List paket berlangganan
POST   /api/payments/create        - Buat transaksi pembayaran
POST   /api/payments/webhook       - Webhook dari payment gateway
GET    /api/payments/history       - Riwayat pembayaran user
```

---

## Alur Kerja Sistem

### Alur Analisis Naskah
```
1. User upload PDF/DOCX naskah
        │
        ▼
2. Sistem ekstrak teks dari file
   (pdf-parse untuk PDF, mammoth untuk DOCX)
        │
        ▼
3. Teks dibagi per bagian (Title, Abstract, 
   Introduction, Methodology, dst.)
        │
        ▼
4. Kirim ke Claude AI dengan prompt terstruktur
   untuk analisis mendalam
        │
        ▼
5. Claude mengembalikan JSON berisi:
   - Overall score & grade
   - Skor per bagian + feedback
   - Similarity risk estimation
   - Fokus perbaikan
   - Rekomendasi jurnal
        │
        ▼
6. Simpan hasil analisis ke MongoDB
        │
        ▼
7. Kirim email notifikasi ke user
   (Nodemailer + Gmail)
        │
        ▼
8. User lihat hasil di dashboard
```

---

## Konfigurasi Google Mailer

### Setup Gmail SMTP dengan Nodemailer

```javascript
// lib/mailer.js
const nodemailer = require('nodemailer')

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    type: 'OAuth2',
    user: process.env.GMAIL_USER,           // email@gmail.com
    clientId: process.env.GMAIL_CLIENT_ID,
    clientSecret: process.env.GMAIL_CLIENT_SECRET,
    refreshToken: process.env.GMAIL_REFRESH_TOKEN,
    accessToken: process.env.GMAIL_ACCESS_TOKEN
  }
})

// --- TEMPLATE EMAIL ---

// 1. Verifikasi Email Saat Daftar
const sendVerificationEmail = async (to, name, token) => {
  const verifyUrl = `${process.env.BASE_URL}/verify-email?token=${token}`

  await transporter.sendMail({
    from: `"Platform Analisis Naskah" <${process.env.GMAIL_USER}>`,
    to,
    subject: '✅ Verifikasi Email Anda',
    html: `
      <h2>Halo, ${name}!</h2>
      <p>Terima kasih sudah mendaftar. Klik tombol di bawah untuk verifikasi email:</p>
      <a href="${verifyUrl}" 
         style="background:#4F46E5;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;">
        Verifikasi Email
      </a>
      <p>Link berlaku selama 24 jam.</p>
    `
  })
}

// 2. Reset Password
const sendPasswordResetEmail = async (to, name, token) => {
  const resetUrl = `${process.env.BASE_URL}/reset-password?token=${token}`

  await transporter.sendMail({
    from: `"Platform Analisis Naskah" <${process.env.GMAIL_USER}>`,
    to,
    subject: '🔐 Reset Password Anda',
    html: `
      <h2>Halo, ${name}!</h2>
      <p>Kami menerima permintaan reset password. Klik tombol berikut:</p>
      <a href="${resetUrl}"
         style="background:#DC2626;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;">
        Reset Password
      </a>
      <p>Link berlaku selama 1 jam. Abaikan email ini jika tidak merasa meminta.</p>
    `
  })
}

// 3. Analisis Selesai
const sendAnalysisCompleteEmail = async (to, name, analysisId, grade, score) => {
  const resultUrl = `${process.env.BASE_URL}/dashboard/analyses/${analysisId}`
  const gradeColor = { A: '#16A34A', B: '#2563EB', C: '#D97706', D: '#DC2626', F: '#991B1B' }

  await transporter.sendMail({
    from: `"Platform Analisis Naskah" <${process.env.GMAIL_USER}>`,
    to,
    subject: `📊 Hasil Analisis Naskah Anda Sudah Siap! Grade: ${grade}`,
    html: `
      <h2>Halo, ${name}!</h2>
      <p>Analisis naskah Anda telah selesai. Berikut ringkasan hasilnya:</p>

      <div style="background:#F3F4F6;padding:20px;border-radius:8px;margin:20px 0;">
        <p style="margin:0;font-size:14px;color:#6B7280;">Overall Score</p>
        <p style="margin:4px 0;font-size:36px;font-weight:bold;color:#111827;">${score}/100</p>
        <p style="margin:0;">
          Grade: 
          <span style="font-weight:bold;color:${gradeColor[grade] || '#111827'}">
            ${grade}
          </span>
        </p>
      </div>

      <a href="${resultUrl}"
         style="background:#4F46E5;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;">
        Lihat Hasil Lengkap
      </a>

      <p style="color:#6B7280;font-size:12px;margin-top:24px;">
        Platform Analisis Kesiapan Publikasi Ilmiah
      </p>
    `
  })
}

// 4. Konfirmasi Pembayaran
const sendPaymentConfirmationEmail = async (to, name, plan, expiredAt) => {
  await transporter.sendMail({
    from: `"Platform Analisis Naskah" <${process.env.GMAIL_USER}>`,
    to,
    subject: '🎉 Pembayaran Berhasil - Akun Pro Aktif!',
    html: `
      <h2>Halo, ${name}!</h2>
      <p>Pembayaran Anda berhasil. Akun <strong>${plan}</strong> kini aktif hingga 
         <strong>${new Date(expiredAt).toLocaleDateString('id-ID')}</strong>.</p>
      <p>Selamat menggunakan semua fitur premium!</p>
      <a href="${process.env.BASE_URL}/dashboard"
         style="background:#16A34A;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;">
        Buka Dashboard
      </a>
    `
  })
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendAnalysisCompleteEmail,
  sendPaymentConfirmationEmail
}
```

### Cara Mendapatkan Gmail OAuth2 Credentials
```
1. Buka https://console.cloud.google.com
2. Buat project baru
3. Enable "Gmail API"
4. Buat OAuth 2.0 Client ID (Web Application)
5. Tambahkan redirect URI: https://developers.google.com/oauthplayground
6. Buka https://developers.google.com/oauthplayground
7. Setting (⚙) → centang "Use your own OAuth credentials" 
   → masukkan Client ID & Client Secret
8. Pilih scope: https://mail.google.com
9. Authorize & Exchange authorization code for tokens
10. Salin Refresh Token ke .env
```

---

## Struktur Folder Proyek

```
/
├── app/                          # Next.js App Router
│   ├── (auth)/
│   │   ├── login/page.jsx
│   │   ├── register/page.jsx
│   │   └── forgot-password/page.jsx
│   ├── dashboard/
│   │   ├── page.jsx              # Overview & statistik
│   │   ├── analyses/
│   │   │   ├── page.jsx          # Riwayat analisis
│   │   │   └── [id]/page.jsx     # Detail hasil analisis
│   │   ├── manuscripts/page.jsx
│   │   ├── journals/page.jsx     # Database jurnal
│   │   └── kum/page.jsx          # Kalkulator KUM
│   └── api/
│       ├── auth/[...nextauth]/route.js
│       ├── manuscripts/
│       │   ├── route.js          # GET list, POST upload
│       │   └── [id]/route.js
│       ├── analyses/
│       │   ├── route.js
│       │   └── [id]/
│       │       ├── route.js
│       │       └── report/route.js
│       ├── journals/route.js
│       ├── kum/route.js
│       └── payments/
│           ├── create/route.js
│           └── webhook/route.js
│
├── lib/
│   ├── mongodb.js                # Koneksi MongoDB
│   ├── mailer.js                 # Nodemailer + Gmail
│   ├── claude.js                 # Wrapper Anthropic API
│   ├── fileParser.js             # Ekstrak teks dari PDF/DOCX
│   └── auth.js                   # NextAuth config
│
├── models/
│   ├── User.js
│   ├── Manuscript.js
│   ├── Analysis.js
│   ├── Journal.js
│   ├── Payment.js
│   └── KumCalculation.js
│
├── components/
│   ├── ui/                       # shadcn components
│   ├── analysis/
│   │   ├── ScoreCard.jsx
│   │   ├── SectionFeedback.jsx
│   │   ├── JournalRecommendation.jsx
│   │   └── SimilarityBadge.jsx
│   ├── journal/
│   │   ├── JournalFilter.jsx
│   │   └── JournalTable.jsx
│   └── kum/
│       └── KumForm.jsx
│
├── prompts/
│   └── analysisPrompt.js         # Prompt AI untuk analisis naskah
│
└── scripts/
    └── seedJournals.js           # Seed data jurnal ke MongoDB
```

---

## Environment Variables

```env
# === APP ===
BASE_URL=http://localhost:3000
NODE_ENV=development

# === MONGODB ===
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/publikasi_db?retryWrites=true&w=majority

# === NEXTAUTH ===
NEXTAUTH_SECRET=your-super-secret-key-min-32-chars
NEXTAUTH_URL=http://localhost:3000

# === GOOGLE OAUTH (untuk Login) ===
GOOGLE_CLIENT_ID=xxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxx

# === GMAIL MAILER (OAuth2) ===
GMAIL_USER=your-email@gmail.com
GMAIL_CLIENT_ID=xxxxxx.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=GOCSPX-xxxxxxxxxx
GMAIL_REFRESH_TOKEN=1//xxxxxxxxxxxxxxxxxx
GMAIL_ACCESS_TOKEN=ya29.xxxxxxxxxxxxxxxxxx

# === ANTHROPIC (Claude AI) ===
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxx

# === FILE UPLOAD ===
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=xxxxxxxxxx
CLOUDINARY_API_SECRET=xxxxxxxxxx

# === PAYMENT ===
MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxxxxxxx
MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxxxxxxx
MIDTRANS_IS_PRODUCTION=false
```

---

## Roadmap

### Phase 1 — MVP (Bulan 1–2)
- [x] Auth (register, login, verifikasi email)
- [x] Upload naskah (PDF/DOCX)
- [x] Analisis AI dengan Claude (overall score, grade, feedback per bagian)
- [x] Email notifikasi hasil analisis
- [x] Dashboard basic

### Phase 2 — Core Features (Bulan 3–4)
- [ ] Similarity index estimation
- [ ] Rekomendasi jurnal dari database
- [ ] Kalkulator KUM
- [ ] Export laporan PDF
- [ ] Sistem subscription (Free / Pro)
- [ ] Integrasi payment gateway (Midtrans)

### Phase 3 — Growth (Bulan 5–6)
- [ ] Database jurnal 15.000+ (import dari Sinta API & Scimago)
- [ ] Filter & search jurnal canggih
- [ ] Paket Institutional (multi-user)
- [ ] Riwayat revisi (perbandingan versi naskah)
- [ ] Dashboard admin
- [ ] Referral program

### Phase 4 — Scale (Bulan 7+)
- [ ] Integrasi Turnitin API (jika ada akses)
- [ ] Analisis sitasi & referensi otomatis
- [ ] AI writing assistant untuk perbaikan naskah
- [ ] Mobile app (React Native)
- [ ] API publik untuk institusi
```
