---

## Dokumen Control

| Item | Keterangan |
|---|---|
| Nama dokumen | Master Technical Specification – Publication Prepare |
| Versi | 3.0 |
| Status | Baseline rancangan terpadu; keputusan terbuka harus disahkan sebelum implementasi terkait |
| Dokumen dasar | Master Technical Specification v2.0 |
| Penyempurnaan | Addendum v2.1 dan phased implementation plan |
| Pemilik produk | Product Owner yang ditunjuk |
| Pemilik teknis | Technical Lead yang ditunjuk |
| Target pembaca | Product Owner, UI/UX, frontend, backend, AI engineer, QA, DevOps, security reviewer |
| Prinsip perubahan | Perubahan requirement harus memiliki alasan, dampak, pemilik keputusan, dan nomor versi |

### Riwayat versi

| Versi | Perubahan |
|---|---|
| 1.0 | Arah awal berbasis unggah dokumen dan pemberian skor |
| 2.0 | Beralih menjadi asisten percakapan per proyek, agent, literatur terverifikasi, venue profile, readiness report, ekspor |
| 2.1 | Penambahan spesifikasi workflow, API, file management, keamanan, kualitas ilmiah, reliability, testing, deployment |
| 3.0 | Integrasi rancangan ke MTS terpadu dan penambahan tahapan implementasi, deliverable, dependency, gate, serta definition of done per tahap |

### Cara menggunakan MTS

1. Bagian 1–20 memuat rancangan produk dan teknis inti yang menjadi baseline.
2. Bagian 21–33 memuat spesifikasi penguatan yang wajib dipertimbangkan dalam desain dan implementasi.
3. Bagian 34–45 memuat tahapan pelaksanaan proyek, tata kelola, dan release checklist. Tahap hanya boleh dinyatakan selesai jika acceptance criteria terpenuhi.
4. Setiap keputusan yang belum final ditandai **TBD / perlu persetujuan**. Rekomendasi dalam dokumen bukan keputusan otomatis.
5. Sebelum coding pada modul yang sudah ada, tim wajib melakukan audit repository, dependency, konfigurasi, dan data aktual.

### Konvensi prioritas

- **P0 – Critical:** wajib untuk keamanan, integritas data, atau fungsi inti MVP.
- **P1 – High:** wajib sebelum beta tertutup atau production terbatas.
- **P2 – Later:** setelah MVP stabil.
- **TBD:** keputusan belum disahkan.

### Batas interpretasi

MTS ini adalah spesifikasi produk dan rancangan teknis. Dokumen ini tidak menyatakan bahwa semua API provider, integrasi Overleaf, akses sumber literatur, atau kemampuan library sudah terbukti. Setiap dependensi eksternal wajib diverifikasi melalui dokumentasi resmi dan proof of concept (PoC). Nilai kapasitas, SLA, harga, dan target performa harus ditentukan dari pengukuran, bukan asumsi.

---

## Daftar Isi

1. Ringkasan
2. Prinsip Desain
3. Persona
4. Ruang Lingkup
5. Arsitektur
6. Model Data
7. Agent Runtime dan Tools
8. Aturan Sitasi dan Validator
9. Profil Venue
10. Laporan Kesiapan
11. Naskah dan Ekspor
12. API
13. Kuota, Biaya, dan Paket
14. Keamanan dan Privasi
15. Observabilitas dan Evaluasi
16. Pasca-MVP
17. Risiko dan Mitigasi
18. Milestone MVP
19. Perubahan terhadap Kode Saat Ini
20. Pertanyaan Terbuka
21–33. Spesifikasi penyempurnaan
34. Prinsip pelaksanaan bertahap
35. Tahap 0 – Discovery dan audit kondisi saat ini
36. Tahap 1 – Fondasi arsitektur dan platform
37. Tahap 2 – Project workspace, manuscript, dan versioning
38. Tahap 3 – Conversational AI agent dan streaming
39. Tahap 4 – Literature intelligence dan citation integrity
40. Tahap 5 – Venue rules, deterministic checks, dan readiness assessment
41. Tahap 6 – Edit workflow, export, dan Overleaf
42. Tahap 7 – Security hardening, QA, beta, dan production readiness
43. Tahap 8 – Pasca-MVP dan pengembangan lanjutan
44. RACI, artefak proyek, dan tata kelola perubahan
45. Requirement traceability dan release checklist

---

# MASTER TECHNICAL SPECIFICATION (MTS)
## Publication Prepare – AI-Powered Scientific Research & Publication Assistant

> Versi 3.0 – Integrated & Phased Implementation Blueprint | Mengonsolidasikan rancangan v2.0, penyempurnaan v2.1, dan tahapan implementasi.
> Stack awal: Next.js 14 + MongoDB (Mongoose) + Anthropic API + Nodemailer + Midtrans. Versi runtime, library, dan provider wajib dikunci melalui audit repository serta proof of concept sebelum production.

---

## 1. Ringkasan

Publication Prepare adalah asisten percakapan yang membantu peneliti membawa naskah ilmiah dari ide sampai siap submit ke venue target (mis. IEEE, jurnal terindeks Scopus, jurnal SINTA). Pengalaman utamanya mirip bekerja dengan Claude di sebuah Project: satu naskah = satu proyek, dengan konteks, riwayat chat, dan berkas yang menyatu.

Pembeda dari memakai Claude biasa:

1. **Referensi dijamin nyata.** Sitasi hanya boleh berasal dari hasil pencarian dan verifikasi ke sumber terbuka, tidak pernah dari ingatan model.
2. **Aturan venue.** Naskah diperiksa terhadap profil aturan venue target (format, gaya referensi, kelengkapan, rubrik).
3. **Pemeriksaan deterministik.** Hal yang bisa dihitung (jumlah kata, format sitasi, validitas DOI) dihitung oleh kode, bukan ditebak model.
4. **Alur kerja sampai siap submit.** Template, ekspor LaTeX/BibTeX, dan jalur ke Overleaf.
5. **Konteks Indonesia.** SINTA, KUM, literatur Garuda/Neliti.
6. **Jejak penggunaan AI** yang bisa dijadikan bahan pernyataan disclosure ke publisher.

### 1.1 Non-goals (tidak dijanjikan)

- Tidak menjanjikan naskah diterima. Keluaran adalah kesiapan terhadap kriteria venue, bukan prediksi keputusan editor.
- Tidak menghasilkan data, hasil eksperimen, atau temuan yang tidak diberikan pengguna.
- Tidak memvonis sebuah teks "ditulis AI".
- Tidak mengklaim setara Turnitin.

---

## 2. Prinsip Desain

| # | Prinsip | Konsekuensi teknis |
|---|---------|--------------------|
| P1 | Model tidak boleh mengarang sitasi | Sitasi hanya lewat tool; ada validator di server yang menolak sitasi tanpa rekaman terverifikasi |
| P2 | Hitung dulu, nilai belakangan | Cek deterministik dijalankan sebelum/bersamaan dengan penilaian LLM; hasilnya diberikan ke Claude sebagai tool/konteks |
| P3 | AI sebagai pendamping, penulis tetap pengguna | Tidak ada fitur "tulis Results tanpa data"; ada log penggunaan AI |
| P4 | Jujur tentang batas | Label seperti "similarity terhadap sumber terbuka", bukan "bebas plagiarisme" |
| P5 | Naskah adalah data sensitif | Retensi terbatas, enkripsi, tidak untuk training, penghapusan atas permintaan |
| P6 | Satu sumber kebenaran naskah | LaTeX/Markdown di database; format lain adalah hasil ekspor |
| P7 | Konfigurasi, bukan hardcode | Nama model, bobot rubrik, dan profil venue berada di config/DB |

---

## 3. Persona

- **Dosen/peneliti Indonesia** yang mengejar SINTA/Scopus untuk KUM dan BKD.
- **Mahasiswa S2/S3** yang menulis artikel untuk syarat lulus.
- **Peneliti teknik/informatika** yang menarget konferensi/jurnal IEEE.
- (Pasca-MVP) **Institusi** yang mengelola banyak pengguna.

---

## 4. Ruang Lingkup

### 4.1 MVP

| Area | Isi |
|------|-----|
| Akun | Registrasi, login, Google OAuth, verifikasi email, reset password (sudah ada) |
| Proyek & chat | Proyek per naskah, chat streaming, riwayat, konteks naskah |
| Tool referensi | `search_literature`, `verify_reference`, simpan ke daftar referensi proyek |
| Profil venue | 3–5 venue dikurasi manual |
| Laporan kesiapan | Output terstruktur + cek deterministik |
| Ekspor | `.bib`, LaTeX dalam template venue, zip, "Open in Overleaf" |
| Jejak AI | Log sesi + ringkasan penggunaan AI |
| Kuota & paket | Kuota berbasis token/pesan; pembayaran Midtrans (sudah ada) |

### 4.2 Ditunda (pasca-MVP)

Similarity checker, indikator gaya teks, draw.io, Zotero/Mendeley, sinkronisasi Git Overleaf, kompilasi PDF server, input DOCX, paket institusional, database jurnal skala besar, dashboard admin. Lihat bagian 16.

---

## 5. Arsitektur

```
┌──────────────────────────────────────────────────────────────┐
│                          CLIENT                              │
│     Next.js + Tailwind: Chat (stream) | Panel Naskah | Ref   │
└──────────────────────────────┬───────────────────────────────┘
                               │ HTTPS / SSE
┌──────────────────────────────▼───────────────────────────────┐
│                       API LAYER (Next.js)                    │
│  Auth │ Projects │ Chat/Agent │ Venues │ Export │ Payments    │
└───────┬──────────────────────┬───────────────────────────────┘
        │                      │
┌───────▼────────┐   ┌─────────▼──────────────────────────────┐
│    MongoDB     │   │            AGENT RUNTIME (packages/ai) │
│ users, projects│   │  loop: model → tool_use → hasil → model│
│ messages, refs │   │  Validator sitasi │ Pencatat token/log │
│ venueProfiles  │   └─────────┬──────────────────────────────┘
│ manuscriptVers.│             │
└────────────────┘   ┌─────────▼──────────────────────────────┐
                     │              TOOLS                     │
                     │ search_literature │ verify_reference   │
                     │ get_venue_rules   │ read_section       │
                     │ run_checks        │ export_*           │
                     └─────────┬──────────────────────────────┘
                               │
              OpenAlex │ Crossref │ Semantic Scholar │ (Garuda/Neliti)
```

### 5.1 Struktur monorepo (target)

```
apps/web/                 # UI + API routes
packages/
  db/                     # koneksi + model (diperluas)
  ai/                     # agent runtime, tool definitions, validator
  checks/                 # cek deterministik (format, referensi, panjang)
  literature/             # klien OpenAlex/Crossref/S2, normalisasi metadata
  export/                 # LaTeX, BibTeX, zip, Open in Overleaf
  venues/                 # profil venue (JSON) + loader
  mailer/                 # (sudah ada)
scripts/                  # seed venue, evaluasi
```

---

## 6. Model Data

Skema ringkas (Mongoose). Field `timestamps: true` berlaku untuk semuanya.

### 6.1 `projects`
```js
{
  userId: ObjectId,          // ref User, wajib
  title: String,
  venueId: ObjectId,         // ref VenueProfile, boleh kosong
  fieldOfStudy: String,
  language: 'indonesia' | 'english',
  currentVersionId: ObjectId, // ref ManuscriptVersion
  status: 'active' | 'archived',
  retentionExpiresAt: Date
}
```

### 6.2 `manuscriptVersions`
```js
{
  projectId: ObjectId,
  number: Number,            // 1, 2, 3, ...
  format: 'latex' | 'markdown',
  source: String,            // isi naskah
  sections: { title, abstract, introduction, methodology,
              results, discussion, conclusion, references },
  origin: 'upload' | 'ai_edit_accepted' | 'user_edit',
  note: String
}
```

### 6.3 `messages`
```js
{
  projectId: ObjectId,
  role: 'user' | 'assistant' | 'tool',
  content: Mixed,            // blok konten sesuai format Anthropic API
  usage: { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens },
  model: String,
  toolCalls: [{ name, inputHash, ok, latencyMs }]
}
```

### 6.4 `references` (daftar referensi terverifikasi per proyek)
```js
{
  projectId: ObjectId,
  citeKey: String,           // unik per proyek, mis. "smith2023deep"
  doi: String,
  title: String,
  authors: [{ given, family }],
  year: Number,
  venueName: String,
  type: String,              // article, inproceedings, book, ...
  url: String,
  abstract: String,
  source: 'openalex' | 'crossref' | 'semanticscholar' | 'user_provided',
  verification: {
    status: 'verified' | 'partial' | 'unverified' | 'retracted',
    checkedAt: Date,
    matchedFields: [String]
  },
  usedInSections: [String],
  claimSupport: [{ claimText, verdict: 'supports'|'partial'|'unsupported'|'unknown' }]
}
```

### 6.5 `venueProfiles`
Lihat bagian 9.

### 6.6 `readinessReports`
```js
{
  projectId, versionId,
  venueId,
  overall: { score: Number, band: 'siap'|'revisi_minor'|'revisi_major'|'belum_siap' },
  deterministic: [{ checkId, status: 'pass'|'warn'|'fail', detail, evidence }],
  criteria: [{ id, label, weight, score, rationale, suggestions: [String] }],
  priorityImprovements: [{ priority, section, issue, suggestion, impact }],
  rubricVersion: String,
  model: String
}
```

### 6.7 `aiUsageLog`
```js
{
  projectId, userId,
  at: Date,
  kind: 'chat' | 'edit_suggested' | 'edit_accepted' | 'references_found' | 'report',
  sections: [String],
  summary: String
}
```

### 6.8 Perubahan pada `users`
Tambahkan `usage: { periodStart, tokensUsed, messagesUsed }` dan `limits` per paket. Reset otomatis saat `periodStart` lewat sebulan (memperbaiki masalah `analysisUsed` yang tidak pernah direset).

Koleksi lama `analyses` dipertahankan atau dimigrasikan menjadi `readinessReports`. `journals` dipertahankan untuk rekomendasi jurnal pasca-MVP. `payments` dan `kum_calculations` tidak berubah.

---

## 7. Agent Runtime dan Tools

### 7.1 Loop

1. Bangun konteks: instruksi sistem, profil venue, ringkasan naskah, daftar referensi proyek, riwayat chat (dipangkas).
2. Panggil Anthropic Messages API dengan streaming dan definisi tool.
3. Jika model meminta tool: jalankan di server, catat, kembalikan hasil, ulangi.
4. Sebelum jawaban ditampilkan: jalankan **validator sitasi** (bagian 8).
5. Simpan pesan, hitung token, perbarui kuota, tulis `aiUsageLog` bila relevan.

Batas keamanan loop: maksimum iterasi tool per giliran (mis. 8), batas waktu total, dan batas token per giliran.

### 7.2 Konfigurasi model

Nama model tidak ditulis keras di kode; dibaca dari config (`AI_MODEL_CHAT`, `AI_MODEL_REPORT`, `AI_MODEL_LIGHT`). Pembagian awal:

| Tugas | Kelas model |
|-------|-------------|
| Chat umum, penyuntingan, penulisan | model utama |
| Laporan kesiapan (struktur ketat) | model utama, keluaran terstruktur |
| Ringkasan, penamaan, klasifikasi ringan | model ringan |

Fitur API yang dipakai (verifikasi ketersediaan dan batasan terbaru di dokumentasi saat implementasi): tool use, streaming, prompt caching untuk naskah/profil venue yang dikirim berulang, keluaran terstruktur untuk laporan, dan Citations bila memakai dokumen unggahan sebagai dasar jawaban.

### 7.3 Definisi tool

| Tool | Input | Output | Catatan |
|------|-------|--------|---------|
| `search_literature` | `query`, `year_from?`, `limit?`, `language?` | daftar kandidat (metadata + abstrak) | Sumber: OpenAlex, Crossref, Semantic Scholar. Hasil dinormalisasi dan di-dedup per DOI |
| `verify_reference` | `doi?` atau `{title, authors, year}` | `{status, matchedFields, canonicalMetadata}` | Cek DOI di Crossref; cocokkan judul/penulis/tahun; cek status retraction bila tersedia |
| `add_reference` | `candidateId` | `citeKey` | Hanya kandidat yang sudah `verified` yang bisa ditambahkan |
| `check_claim_support` | `claim`, `citeKey` | `{verdict, evidence}` | Dibandingkan dengan abstrak (atau teks OA bila tersedia); verdict `unknown` bila data tidak cukup |
| `get_venue_rules` | `venueId` | profil venue | Dari DB |
| `read_section` | `section`, `versionId?` | teks | Menghindari mengirim seluruh naskah tiap giliran |
| `propose_edit` | `section`, `diff`, `reason` | `editId` | Tidak langsung mengubah naskah; menunggu persetujuan pengguna |
| `run_checks` | `versionId` | hasil cek deterministik | Lihat bagian 10.1 |
| `export_bib` / `export_latex` / `export_package` | `versionId` | tautan berkas | Lihat bagian 11 |

Semua tool: validasi input (schema), batas waktu, percobaan ulang terbatas, dan pencatatan. Kegagalan tool dikembalikan ke model sebagai hasil terstruktur ("sumber tidak tersedia"), bukan dihaluskan.

---

## 8. Aturan Sitasi dan Validator

Ini kontrol inti produk.

1. Model diinstruksikan: sitasi hanya dengan `citeKey` yang ada di daftar referensi proyek.
2. **Validator server** memindai jawaban dan teks naskah yang diusulkan:
   - Setiap sitasi (`\cite{...}`, `[n]`, `(Penulis, tahun)`) harus menunjuk ke `references` dengan `verification.status = verified`.
   - Pola yang tampak seperti sitasi tetapi tidak punya rekaman → ditolak; model diminta memperbaiki (satu kali ulang) atau kalimat ditandai `[referensi belum terverifikasi]`.
3. Daftar pustaka diekspor **hanya** dari `references`, bukan dari teks yang ditulis model.
4. Referensi yang dimasukkan sendiri oleh pengguna melewati `verify_reference`; yang gagal ditandai jelas (`unverified`) dan tidak diperlakukan sebagai terverifikasi.
5. `check_claim_support` memberi sinyal apakah sumber memang mendukung kalimat yang menyitasinya. Hasil `unknown` ditampilkan apa adanya.

Kriteria penerimaan: pada set uji, tidak ada sitasi di keluaran akhir yang tidak punya rekaman terverifikasi.

---

## 9. Profil Venue

### 9.1 Skema
```js
{
  slug: 'ieee-conference',
  name: String,
  publisher: String,
  kind: 'conference' | 'journal',
  indexing: { sinta: Number|null, scopus: 'Q1'|'Q2'|'Q3'|'Q4'|null, doaj: Boolean },
  language: [String],
  format: {
    maxPages: Number|null,
    columns: 1 | 2,
    abstractMaxWords: Number|null,
    keywordsRange: [min, max],
    sectionOrder: [String],
    template: { type: 'latex'|'docx', files: [String], docClass: String }
  },
  references: { style: 'ieee'|'apa'|'vancouver'|'custom', minCount: Number|null, recencyYears: Number },
  required: ['abstract','keywords', ...],  // elemen wajib (mis. data availability, CRediT, ORCID)
  review: { blind: 'single'|'double' },
  aiPolicy: { summary: String, sourceUrl: String, checkedAt: Date },
  rubric: { id: String, criteria: [{ id, label, weight, guidance }] },
  sources: [{ url, checkedAt }],
  curatedBy: String,
  version: String
}
```

### 9.2 Aturan pengelolaan
- Profil dikurasi manual dan diberi tanggal pengecekan (`checkedAt`). Aturan venue berubah; profil lama harus terlihat usang di UI.
- Setiap profil menyimpan tautan sumber resmi (author guidelines).
- MVP: 3–5 profil (IEEE conference, IEEE journal, satu Elsevier, 1–2 SINTA).

### 9.3 Contoh rubrik (ringkas, bobot ilustratif)
| Kriteria | Bobot |
|----------|------:|
| Kejelasan kontribusi dan novelty | 20 |
| Kedalaman tinjauan pustaka dan positioning | 15 |
| Kelayakan metodologi dan reproducibility | 20 |
| Kualitas hasil dan analisis | 20 |
| Kejelasan penulisan dan struktur | 10 |
| Kualitas dan kesesuaian referensi | 10 |
| Kepatuhan format venue | 5 |

Bobot berbeda per bidang (mis. teknik vs. kesehatan dengan checklist CONSORT/PRISMA) dan disimpan di profil/rubrik, bukan di kode.

---

## 10. Laporan Kesiapan

### 10.1 Cek deterministik (`packages/checks`)

| Cek | Cara |
|-----|------|
| Panjang abstrak, jumlah kata, jumlah halaman | Hitung dari sumber (halaman: dari PDF terkompilasi pasca-MVP; MVP: estimasi) |
| Jumlah dan rentang keyword | Hitung |
| Urutan dan kelengkapan bagian | Parse struktur LaTeX/Markdown |
| Format sitasi sesuai gaya venue | Aturan per gaya |
| Setiap sitasi punya entri di daftar pustaka dan sebaliknya | Pencocokan `citeKey` |
| Validitas DOI, status retraction | Crossref |
| Persentase referensi dalam N tahun terakhir | Hitung |
| Porsi self-citation | Cocokkan nama penulis |
| Elemen wajib venue (mis. pernyataan etika, data availability) | Deteksi kata kunci/struktur |
| Identitas penulis pada naskah double-blind | Deteksi nama/afiliasi/ucapan terima kasih |

Setiap cek mengembalikan `pass | warn | fail`, penjelasan, dan bukti (lokasi di teks).

### 10.2 Penilaian LLM
- Memakai rubrik venue; keluaran **terstruktur** (skema JSON ketat), bukan JSON bebas yang di-`JSON.parse`.
- Setiap skor harus disertai `rationale` dan kutipan lokasi di naskah.
- Hasil cek deterministik diberikan sebagai input sehingga model tidak menilai ulang hal yang sudah pasti.

### 10.3 Skor akhir
Gabungan: skor kriteria LLM berbobot + penalti/bonus dari cek deterministik. Pita (`siap`, `revisi_minor`, `revisi_major`, `belum_siap`) ditentukan dari ambang yang tersimpan di rubrik. Skor adalah **kesiapan terhadap kriteria venue ini**.

### 10.4 Konsistensi
- Suhu rendah dan rubrik tetap.
- Evaluasi stabilitas: naskah yang sama dinilai berulang; selisih skor dipantau (bagian 15).

---

## 11. Naskah dan Ekspor

### 11.1 Sumber naskah
- Unggahan: LaTeX/Markdown langsung; PDF/DOCX diekstrak (pdf-parse/mammoth) dan dikonversi ke Markdown dengan peringatan bahwa deteksi bagian pada PDF dua kolom tidak selalu akurat.
- Perubahan dari AI selalu lewat `propose_edit` → pengguna menerima/menolak → versi baru.

### 11.2 Ekspor
| Keluaran | Isi |
|----------|-----|
| `.bib` | Dari `references` terverifikasi saja |
| LaTeX | Naskah dalam template venue (class/file template dari profil) |
| Paket zip | `main.tex`, `references.bib`, figur, template, `README` |
| Open in Overleaf | Mengirim paket ke Overleaf lewat mekanisme "Open in Overleaf" (verifikasi spesifikasi dan batasannya di dokumentasi Overleaf saat implementasi) |

Sinkronisasi dua arah Overleaf via Git adalah fitur opsional pasca-MVP dan memerlukan akun/paket Overleaf yang mendukung.

### 11.3 Kompilasi (pasca-MVP)
Kontainer TeX Live terisolasi: tanpa jaringan, tanpa eksekusi shell, batas waktu dan memori, direktori kerja sekali pakai. Dipakai untuk pratinjau PDF dan cek jumlah halaman/format.

---

## 12. API

Semua endpoint di bawah `/api` memerlukan sesi kecuali disebut lain.

```
# Auth (sudah ada)
POST /auth/register | GET /auth/verify-email | POST /auth/forgot-password
POST /auth/reset-password | GET /auth/me | /auth/[...nextauth]

# Proyek
POST   /projects                        buat proyek (judul, venue, bidang, bahasa)
GET    /projects                        daftar proyek
GET    /projects/:id                    detail
DELETE /projects/:id                    hapus proyek dan seluruh datanya

# Naskah
POST   /projects/:id/manuscript         unggah / tempel naskah (membuat versi)
GET    /projects/:id/versions           daftar versi
GET    /projects/:id/versions/:n        isi versi
POST   /projects/:id/edits/:editId/accept | /reject

# Chat
POST   /projects/:id/chat               kirim pesan; respons SSE (streaming)
GET    /projects/:id/messages           riwayat

# Referensi
GET    /projects/:id/references
POST   /projects/:id/references/verify  verifikasi referensi buatan pengguna
DELETE /projects/:id/references/:refId

# Laporan
POST   /projects/:id/report             jalankan laporan kesiapan
GET    /projects/:id/reports            riwayat laporan

# Venue
GET    /venues                          daftar profil
GET    /venues/:slug

# Ekspor
GET    /projects/:id/export/bib | /export/latex | /export/package
POST   /projects/:id/export/overleaf

# Jejak AI
GET    /projects/:id/ai-usage           ringkasan untuk pernyataan disclosure

# Kuota, paket, pembayaran
GET    /usage | GET /plans
POST   /payments/create | POST /payments/webhook | GET /payments/history
POST   /kum/calculate | GET /kum/history
```

Endpoint lama `POST /analyses` dipertahankan sementara dan ditandai deprecated.

---

## 13. Kuota, Biaya, dan Paket

- Satuan kuota: **token** (atau pesan) per bulan, bukan jumlah analisis. Dicatat dari `usage` setiap respons API, termasuk token cache.
- Reset periode otomatis berdasarkan `periodStart`.
- Paket (angka diisi setelah pengukuran biaya nyata): Free (kuota kecil), Pro, Institutional.
- Kontrol biaya: prompt caching untuk naskah dan profil venue; pemangkasan riwayat; `read_section` alih-alih mengirim naskah penuh; batas token per giliran; model ringan untuk tugas ringan.
- Sebelum menetapkan harga: ukur biaya rata-rata per sesi dari 5–10 naskah uji.

---

## 14. Keamanan dan Privasi

| Area | Kebijakan |
|------|-----------|
| Kerahasiaan naskah | Hanya pemilik proyek yang dapat mengakses; semua query dibatasi `userId` |
| Retensi | Naskah dan chat dihapus otomatis setelah `retentionExpiresAt` (default dapat diatur pengguna); penghapusan proyek menghapus semua data terkait |
| Pemakaian data | Tidak dipakai untuk pelatihan; sampaikan jelas di kebijakan privasi. Periksa syarat API Anthropic yang berlaku untuk penyimpanan dan penggunaan data |
| Rahasia | Kunci API dan kredensial hanya di environment server; `.env.local` tidak masuk git |
| Webhook pembayaran | Verifikasi signature, idempoten (sudah ada) |
| Kompilasi LaTeX | Sandbox ketat (bagian 11.3) |
| Prompt injection | Isi naskah dan hasil web/tool adalah **data**, bukan instruksi; instruksi sistem menegaskan hal ini; tool berdampak (hapus, ekspor ke luar) memerlukan aksi eksplisit pengguna |
| Batas laju | Per pengguna pada chat dan tool eksternal |
| Sumber eksternal | Hormati batas laju dan ketentuan OpenAlex/Crossref/Semantic Scholar; kirim identitas kontak sesuai praktik "polite pool" bila tersedia |
| Log | Jangan mencatat isi naskah ke log aplikasi; simpan hash input tool |

---

## 15. Observabilitas dan Evaluasi

### 15.1 Metrik
Token dan biaya per sesi, latensi per tool, tingkat kegagalan tool, jumlah sitasi ditolak validator, proporsi referensi `verified`.

### 15.2 Set uji (wajib sebelum rilis)
- 5–10 naskah nyata (beragam bidang, bahasa, dan venue).
- Skenario referensi: topik sempit, topik tanpa literatur, DOI palsu dari pengguna, referensi retracted.
- Skenario injeksi: naskah berisi instruksi tersembunyi.
- Uji stabilitas skor: tiap naskah dinilai beberapa kali.

### 15.3 Kriteria lulus MVP
1. Nol sitasi tanpa rekaman terverifikasi pada semua keluaran uji.
2. Selisih skor kesiapan antar-ulangan pada naskah yang sama berada dalam toleransi yang disepakati (tetapkan angkanya setelah pengukuran awal).
3. Naskah sampel dapat dibawa dari unggahan sampai terbuka di Overleaf dalam satu sesi.
4. Biaya rata-rata per sesi terukur dan di bawah batas yang mendukung harga paket.
5. Tidak ada kebocoran data antar-pengguna pada uji otorisasi.

---

## 16. Pasca-MVP

| Fitur | Catatan desain dan batas |
|-------|--------------------------|
| **Similarity** | Shingling/MinHash untuk kecocokan literal + embedding untuk parafrase; korpus: arXiv, CORE, OpenAlex/Semantic Scholar (abstrak dan teks OA), repositori kampus, pencarian web. Label wajib: "terhadap sumber terbuka". Tidak mencakup paper berbayar dan database tugas akhir. Opsi resmi: integrasi iThenticate/Turnitin untuk institusi |
| **Indikator gaya teks** | Sinyal (repetitif, klise, variasi struktur rendah), **bukan** skor "% AI". Detektor teks AI tidak andal dan berisiko false positive terutama untuk penulis non-native; jangan dijadikan vonis. Pendampingnya: riwayat versi sebagai bukti proses |
| **Diagram** | Mermaid/TikZ (mudah dihasilkan akurat) dan draw.io (XML terbuka, mode embed); aturan figur per venue (resolusi, format vektor, lebar kolom). Grafik hasil dari data pengguna; tidak ada data buatan |
| **Kompilasi PDF** | Bagian 11.3; cek halaman/format dari PDF |
| **DOCX** | Pandoc + template Word per venue |
| **Zotero/Mendeley** | Impor/ekspor pustaka |
| **Git Overleaf** | Sinkron dua arah, opsional, butuh token pengguna |
| **ORCID** | Login dan metadata penulis |
| **Paket submission** | Cover letter, checklist, figur terpisah (sistem submission umumnya tidak punya API publik) |
| **Rekomendasi jurnal** | Dari OpenAlex/SCImago/DOAJ + kurasi; mulai dari 50–100 venue berkualitas, bukan angka 15.000 |
| **Institusional** | Multi-user, dasbor admin, laporan agregat |

---

## 17. Risiko dan Mitigasi

| Risiko | Dampak | Mitigasi |
|--------|--------|----------|
| Halusinasi sitasi | Kehilangan kepercayaan | Bagian 8; validator; uji khusus |
| Skor LLM tidak konsisten | Laporan tidak kredibel | Rubrik terstruktur, cek deterministik, uji stabilitas |
| Profil venue usang | Saran salah | `checkedAt`, tautan sumber, tampilan "usang" |
| Biaya token membengkak | Margin negatif | Caching, pemangkasan, kuota token, pengukuran sebelum harga |
| Naskah bocor | Reputasi dan hukum | Bagian 14 |
| Penyalahgunaan (naskah tanpa riset) | Reputasi, isu integritas | Tanpa fitur pembuat data/hasil; jejak AI; kebijakan penggunaan |
| Label palsu (tuduhan AI/plagiarisme) | Sengketa | Tidak ada vonis AI; label similarity jujur |
| Ketergantungan API sumber literatur | Gangguan layanan | Beberapa sumber, cache hasil, degradasi anggun |
| Ruang lingkup melebar | Tidak ada fitur yang matang | Disiplin MVP; pasca-MVP berurutan |
| Perubahan API pihak ketiga (Overleaf, dll.) | Fitur rusak | Verifikasi dokumentasi saat implementasi; abstraksi di `packages/export` |

---

## 18. Milestone MVP

| M | Isi | Selesai bila |
|---|-----|--------------|
| M1 | Model data baru, rangka chat streaming, loop agen dasar, pencatatan token, reset kuota | Chat berjalan per proyek dengan kuota akurat |
| M2 | `packages/literature` + tool referensi + validator sitasi + ekspor `.bib` | Uji referensi lulus (bagian 15.3 no. 1) |
| M3 | `packages/venues` (3–5 profil) + `packages/checks` + laporan kesiapan terstruktur | Laporan konsisten pada set uji |
| M4 | Ekspor LaTeX/zip + Open in Overleaf + `propose_edit` dan versi | Alur unggah → Overleaf berjalan |
| M5 | Jejak AI, UI proyek/chat/referensi/laporan, uji otorisasi dan injeksi, pengukuran biaya, penyesuaian paket | Semua kriteria lulus MVP terpenuhi |

Estimasi waktu ditetapkan setelah M1 selesai, karena kecepatan awal membuat estimasi lebih akurat.

---

## 19. Perubahan Terhadap Kode Saat Ini

| Berkas/paket | Tindakan |
|--------------|----------|
| `packages/ai/index.js` | Ganti: dari satu panggilan JSON menjadi agent runtime (loop + tool + validator) |
| `packages/ai/prompts/analysisPrompt.js` | Pecah: instruksi sistem agen + rubrik per venue |
| `packages/db/models/*` | Tambah `Project`, `Message`, `Reference`, `VenueProfile`, `ManuscriptVersion`, `ReadinessReport`, `AiUsageLog`; ubah `User.usage` |
| `apps/web/app/api/analyses/route.js` | Deprecated; logika kuota dipindah ke middleware penggunaan |
| `apps/web/lib/subscription.js` | Diperluas untuk batas token per paket |
| `apps/web/app/api/payments/*`, `packages/mailer` | Dipertahankan |
| `apps/web/lib/kum.js` | Dipertahankan |
| `scripts/seedJournals.js` | Ditambah `seedVenues.js` |
| `.env.example` | Tambah: `AI_MODEL_*`, kontak untuk API literatur, batas kuota |

---

## 20. Pertanyaan Terbuka

1. Pengguna utama MVP: pengguna LaTeX (teknik/informatika) atau pengguna Word (dosen umum)? Menentukan prioritas template dan input.
2. Venue awal yang dikurasi: daftar pasti 3–5 venue.
3. Antarmuka: chat murni atau chat dengan editor naskah di sampingnya?
4. Penagihan: kuota token/pesan atau per analisis?
5. Similarity: cukup sumber terbuka dengan label jujur, atau perlu menjajaki lisensi iThenticate/Turnitin?
6. Cakupan literatur: internasional saja, Indonesia, atau keduanya (cakupan Garuda/Neliti jauh berbeda dari OpenAlex)?
7. Kebijakan retensi default dan bahasa kebijakan privasi.
8. Target harga paket setelah biaya per sesi terukur.


---

# Addendum Penyempurnaan – Master Technical Specification v2.1

> Dokumen ini mempertahankan isi dan arah v2.0, lalu menambahkan spesifikasi yang dibutuhkan agar dokumen lebih siap digunakan sebagai acuan desain, implementasi, pengujian, dan operasional. Bagian yang belum diputuskan tetap ditandai sebagai keputusan terbuka; jangan dianggap sebagai keputusan final tanpa persetujuan pemilik produk.

## 21. Alur Pengguna dan Status Proyek

### 21.1 Alur utama pengguna

Alur minimum yang harus didukung:

1. Pengguna membuat akun dan menyelesaikan verifikasi.
2. Pengguna membuat proyek untuk satu naskah.
3. Pengguna menentukan bidang ilmu, bahasa, jenis publikasi (conference/journal), dan venue target jika sudah diketahui.
4. Pengguna memasukkan naskah melalui metode yang didukung MVP.
5. Sistem membuat versi awal dan menampilkan hasil ekstraksi/parse untuk dikonfirmasi pengguna.
6. Pengguna berdiskusi dengan AI dalam konteks proyek dan bagian naskah.
7. Pengguna mencari, memeriksa, dan menambahkan referensi.
8. Pengguna menjalankan pemeriksaan deterministik dan readiness assessment.
9. Pengguna meninjau usulan perubahan, menerima atau menolaknya.
10. Sistem menyimpan versi baru dan menyediakan ekspor sesuai kemampuan MVP.
11. Pengguna melihat ringkasan penggunaan AI dan menghapus atau mengarsipkan proyek.

### 21.2 Status proyek dan proses

Tetapkan status yang eksplisit agar UI dan backend tidak menafsirkan status secara berbeda.

- Project: `active`, `archived`, `deletion_pending`, `deleted`.
- Manuscript version: `draft`, `parsed`, `parse_warning`, `superseded`.
- Edit proposal: `pending`, `accepted`, `rejected`, `expired`.
- Readiness report: `queued`, `running`, `completed`, `failed`, `cancelled`.
- Export job: `queued`, `running`, `completed`, `failed`, `expired`.

Status `deleted` dapat berupa tombstone untuk kebutuhan audit teknis, sedangkan data isi naskah harus mengikuti kebijakan penghapusan yang ditetapkan.

### 21.3 Peran dan hak akses

MVP dapat dimulai dengan satu peran `project_owner`. Namun, otorisasi harus dirancang agar dapat diperluas menjadi:

- `owner`: mengelola proyek, naskah, referensi, ekspor, dan penghapusan.
- `collaborator` (pasca-MVP): membaca atau mengedit sesuai izin.
- `institution_admin` (pasca-MVP): mengelola pengguna institusi dan laporan agregat.
- `platform_admin`: mengelola venue, paket, dan operasional; tidak otomatis berhak membaca isi naskah.

Prinsip wajib: hak akses ke proyek tidak boleh disimpulkan hanya dari ID proyek yang dikirim client. Setiap operasi harus memeriksa kepemilikan atau izin di server.

## 22. Spesifikasi Antarmuka dan Pengalaman Pengguna

### 22.1 Layout utama

Antarmuka proyek disarankan memiliki tiga area:

1. **Panel navigasi proyek:** daftar proyek, status, venue, dan versi aktif.
2. **Area kerja:** chat AI dan/atau editor naskah.
3. **Panel konteks:** struktur naskah, daftar referensi, hasil pemeriksaan, serta laporan kesiapan.

Pada layar kecil, panel dapat berubah menjadi tab atau drawer. Pengguna harus selalu mengetahui proyek dan versi naskah yang sedang aktif.

### 22.2 Komponen dan keadaan UI

Setiap fitur harus mendefinisikan keadaan:

- loading/proses berjalan;
- berhasil dengan hasil dan waktu pembaruan;
- kosong (belum ada naskah/referensi/laporan);
- gagal dengan pesan yang dapat ditindaklanjuti;
- data parsial atau hasil ekstraksi dengan peringatan;
- kuota habis atau batas paket tercapai;
- sesi kedaluwarsa;
- koneksi streaming terputus dan mekanisme melanjutkan/mengulang.

### 22.3 Editor dan perubahan naskah

Jika editor naskah masuk MVP, spesifikasikan:

- format sumber kanonis dan aturan konversi;
- autosave, indikator tersimpan, dan penanganan konflik;
- penanda perubahan per bagian;
- tampilan diff sebelum/sesudah;
- penerimaan atau penolakan per usulan edit;
- pemulihan versi sebelumnya;
- pencegahan overwrite ketika dua proses mengubah versi yang sama.

Jika editor belum masuk MVP, tetapkan dengan jelas bahwa pengguna mengedit melalui chat dan mengunduh hasil ekspor. Jangan menjanjikan pengalaman editor kolaboratif sebelum mekanismenya tersedia.

## 23. Kontrak API dan Protokol Streaming

Daftar endpoint pada bagian 12 perlu diturunkan menjadi kontrak API yang konsisten.

### 23.1 Standar respons

Gunakan bentuk respons standar, misalnya:

```json
{
  "success": true,
  "data": {},
  "error": null,
  "requestId": "server-generated-id"
}
```

Untuk kegagalan:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "PROJECT_NOT_FOUND",
    "message": "Proyek tidak ditemukan",
    "details": null
  },
  "requestId": "server-generated-id"
}
```

Tetapkan kode HTTP dan kode error aplikasi untuk validasi, autentikasi, otorisasi, konflik versi, kuota, rate limit, provider timeout, dan kesalahan internal. Pesan internal, stack trace, prompt sistem, serta kredensial tidak boleh dikirim ke client.

### 23.2 SSE untuk chat

Dokumentasikan event SSE minimal:

- `message_start`
- `content_delta`
- `tool_start`
- `tool_result`
- `usage`
- `message_complete`
- `error`

Setiap event harus membawa `requestId` dan, bila relevan, `messageId`. Tetapkan perilaku reconnect, pembatalan dari pengguna, timeout, deduplikasi request, dan penyimpanan pesan parsial. Jangan menyimpan pesan assistant sebagai selesai jika proses tool masih berjalan atau respons berakhir karena error.

### 23.3 Idempotensi dan konkurensi

- Endpoint pembayaran dan operasi yang berpotensi diulang harus idempoten.
- Permintaan chat perlu `clientRequestId` atau idempotency key untuk mencegah pesan ganda saat reconnect.
- Penerimaan edit harus mengacu pada `baseVersionId`; jika versi aktif berubah, kembalikan konflik dan minta pengguna meninjau ulang.
- Pembuatan laporan dan ekspor yang lama sebaiknya menggunakan job ID, bukan menahan request HTTP tanpa batas.

### 23.4 Dokumentasi endpoint

Untuk setiap endpoint, lengkapi: tujuan, autentikasi, role/permission, path/query/body schema, batas ukuran, respons sukses, error, efek samping database, idempotensi, dan contoh request/response. OpenAPI dapat digunakan sebagai kontrak bersama frontend dan backend.

## 24. Pengelolaan Berkas dan Penyimpanan

Bagian unggah naskah belum menjelaskan penyimpanan berkas sumber dan artefak ekspor.

### 24.1 Kebijakan penyimpanan

- Simpan file asli secara terpisah dari teks hasil ekstraksi.
- Gunakan object storage privat; jangan menyimpan file sensitif pada direktori publik aplikasi.
- Simpan metadata file di database: `fileId`, `projectId`, `versionId`, nama asli yang telah disanitasi, MIME type terdeteksi, ukuran, checksum, storage key, status pemindaian, dan waktu unggah.
- URL unduhan harus berupa signed URL berumur pendek atau melalui endpoint terotorisasi.
- Tetapkan masa berlaku artefak ekspor dan proses penghapusan file terkait.

### 24.2 Validasi unggahan

- Batasi ekstensi, MIME type yang terdeteksi, ukuran, dan jumlah file.
- Periksa magic bytes; jangan hanya mempercayai ekstensi atau header dari browser.
- Tolak file rusak, terenkripsi bila tidak didukung, atau format yang tidak diizinkan.
- Jalankan malware scanning bila infrastruktur mendukung.
- Ekstraksi PDF/DOCX dilakukan di worker terisolasi dengan batas CPU, memori, waktu, dan ukuran hasil.
- Jangan menjalankan macro, embedded script, atau konten aktif dari dokumen.

### 24.3 Batas format MVP

Bagian 4.2 menyebut input DOCX ditunda, tetapi bagian 11.1 menyebut PDF/DOCX diekstrak. Ini harus diputuskan. Rekomendasi: pilih secara eksplisit salah satu:
- MVP hanya menerima LaTeX/Markdown; atau
- MVP menerima LaTeX/Markdown dan PDF; DOCX masuk pasca-MVP.

Jika PDF didukung, nyatakan bahwa hasil ekstraksi dapat memerlukan koreksi manual, terutama tabel, rumus, sitasi, dan dokumen dua kolom.

## 25. Keamanan Aplikasi dan Privasi – Spesifikasi Minimum

Bagian 14 sudah menetapkan prinsip, tetapi belum menjadi kontrol implementasi yang dapat diuji.

### 25.1 Kontrol keamanan

- Password disimpan menggunakan algoritma hashing modern yang sesuai, bukan enkripsi reversibel.
- Terapkan proteksi brute force, rate limiting login, reset password yang aman, dan masa berlaku token verifikasi.
- Terapkan secure, HttpOnly, SameSite cookie serta proteksi CSRF sesuai pola autentikasi.
- Validasi dan sanitasi input; cegah NoSQL injection, XSS, SSRF, path traversal, dan mass assignment.
- Terapkan Content Security Policy dan security headers.
- Pisahkan secret development, staging, dan production; rotasi kunci dan kredensial.
- Gunakan least privilege untuk database, object storage, dan service account.
- Enkripsi data saat transit dan at-rest sesuai kemampuan infrastruktur.
- Audit akses administratif dan perubahan konfigurasi venue/paket.
- Jangan memasukkan naskah, abstrak, DOI privat, atau prompt pengguna ke log analitik pihak ketiga.

### 25.2 Isolasi data

Setiap query terhadap proyek, versi, pesan, referensi, laporan, dan file harus melakukan pemeriksaan otorisasi di server. Tambahkan pengujian negatif: pengguna A tidak dapat membaca, mengubah, mengekspor, atau menghapus resource pengguna B dengan mengganti ID pada URL atau body.

### 25.3 Retensi dan penghapusan

`retentionExpiresAt` perlu dilengkapi dengan:
- nilai default dan pilihan pengguna;
- apakah retensi dihitung sejak proyek dibuat atau aktivitas terakhir;
- masa tenggang sebelum penghapusan permanen;
- cakupan penghapusan pada database, object storage, cache, indeks pencarian, dan backup;
- jadwal worker penghapusan dan pencatatan hasilnya;
- penjelasan bahwa backup dapat memiliki siklus kedaluwarsa tersendiri.

### 25.4 Tata kelola data dan kepatuhan

Sediakan Privacy Policy dan Terms of Service yang menjelaskan pengendali/pemroses data, tujuan pemrosesan, kategori data, pihak ketiga (termasuk penyedia model dan penyimpanan), transfer lintas negara bila terjadi, retensi, hak pengguna, prosedur penghapusan, serta kanal pengaduan. Tinjau kesesuaian dengan UU Pelindungan Data Pribadi Indonesia dan ketentuan terkait sebelum peluncuran. Jangan menyatakan "tidak digunakan untuk training" tanpa memastikan kontrak dan konfigurasi layanan pihak ketiga yang benar-benar digunakan.

## 26. Penyempurnaan Model Data dan Integritas

Tambahkan indeks, constraint, dan relasi yang eksplisit.

| Koleksi | Indeks/constraint yang disarankan |
|---|---|
| `projects` | `{ userId: 1, status: 1, updatedAt: -1 }` |
| `manuscriptVersions` | unique `{ projectId: 1, number: 1 }` |
| `messages` | `{ projectId: 1, createdAt: 1 }` |
| `references` | unique `{ projectId: 1, citeKey: 1 }`; indeks DOI yang dinormalisasi per proyek |
| `readinessReports` | `{ projectId: 1, versionId: 1, createdAt: -1 }` |
| `aiUsageLog` | `{ userId: 1, at: -1 }`, `{ projectId: 1, at: -1 }` |

Tambahkan field yang diperlukan untuk audit dan integritas:

- Semua dokumen yang dimiliki pengguna memiliki `userId` atau dapat ditelusuri ke pemilik melalui relasi yang tervalidasi.
- `createdAt` dan `updatedAt` dikelola konsisten.
- `deletedAt` atau status penghapusan digunakan bila diperlukan.
- Versi naskah memiliki checksum/hash sumber untuk mendeteksi perubahan.
- Laporan menyimpan `versionId`, `venueProfileVersion`, `rubricVersion`, model, parameter evaluasi yang relevan, serta versi prompt.
- Referensi menyimpan metadata mentah sumber dan metadata hasil normalisasi secara terpisah bila diperlukan untuk audit.
- Simpan `providerRequestId` bila tersedia, tetapi jangan menyimpan secret atau payload sensitif yang tidak diperlukan.

Untuk operasi multi-dokumen seperti membuat versi dan mengubah `currentVersionId`, gunakan transaksi MongoDB bila deployment mendukung replica set/transaction. Jika tidak, definisikan strategi konsistensi dan recovery.

## 27. Kualitas Ilmiah dan Batas Penilaian AI

### 27.1 Pisahkan empat jenis validasi

1. **Metadata validation:** apakah DOI, judul, penulis, tahun, dan venue cocok dengan sumber bibliografi.
2. **Existence/status validation:** apakah publikasi ditemukan dan apakah ada informasi retraction/correction.
3. **Claim-support assessment:** apakah isi sumber mendukung klaim tertentu.
4. **Scientific quality assessment:** apakah argumen, metode, analisis, dan kesimpulan naskah memadai.

Keempatnya tidak boleh digabung menjadi satu label "referensi valid". Referensi dengan metadata benar belum tentu mendukung klaim yang disitasi.

### 27.2 Keterbatasan verifikasi klaim

Abstrak saja tidak cukup untuk menyimpulkan bahwa sebuah paper mendukung klaim spesifik. Jika full text tidak tersedia atau tidak dapat diakses, sistem harus memberi verdict `unknown` atau `insufficient_evidence`, bukan `supports`. Simpan bukti berupa bagian/halaman sumber bila tersedia, dan tampilkan tingkat keyakinan beserta keterbatasannya.

### 27.3 Struktur sitasi

Jangan mengandalkan regex sederhana untuk memastikan semua bentuk sitasi benar. Parsing sitasi author-year, numeric, dan LaTeX perlu dilakukan berdasarkan format naskah dan gaya venue. Idealnya, sitasi internal direpresentasikan sebagai referensi terstruktur/cite key, lalu dirender ke format target saat ekspor.

Untuk sitasi yang tidak dapat diparse dengan yakin, hasilnya harus `warn` atau `manual_review`, bukan dianggap valid. Validator juga harus memeriksa sitasi yatim (tanpa entri daftar pustaka), entri pustaka yang tidak pernah disitasi, duplikasi, dan referensi yang status verifikasinya berubah.

### 27.4 Penilaian readiness yang dapat dipertanggungjawabkan

- Setiap kriteria memiliki definisi operasional, skala skor, contoh skor, dan bukti minimum.
- Skor LLM tidak boleh mengarang bukti atau mengutip lokasi yang tidak ada.
- Bedakan `not_assessed` dari skor nol.
- Laporkan skor per kriteria, temuan deterministik, keterbatasan penilaian, dan prioritas revisi.
- Skor total tidak boleh menyamarkan kegagalan kritis, misalnya etika penelitian atau elemen wajib venue yang tidak ada.
- Label kesiapan harus disertai disclaimer bahwa penilaian bersifat bantuan internal, bukan keputusan editor/reviewer.

### 27.5 Integritas akademik

Tambahkan kebijakan penggunaan yang melarang fabrikasi data, hasil eksperimen, gambar, sumber, dan klaim. Untuk bagian Results, Discussion, dan Conclusion, AI hanya boleh membantu mengolah atau menjelaskan data/hasil yang disediakan pengguna dan harus menandai asumsi yang belum dikonfirmasi.

## 28. Keandalan, Observabilitas, dan Operasional

Tambahkan metrik dan prosedur berikut.

### 28.1 Metrik layanan

- availability dan error rate per endpoint;
- p50/p95/p99 latency untuk chat, pencarian literatur, laporan, dan ekspor;
- keberhasilan streaming dan frekuensi reconnect;
- tingkat timeout dan kegagalan per provider/tool;
- biaya per pengguna, proyek, dan jenis pekerjaan;
- penggunaan token input/output/cache;
- antrean dan waktu tunggu job;
- keberhasilan proses retensi dan penghapusan.

### 28.2 Ketahanan sistem

- Timeout dan retry dengan exponential backoff serta jitter.
- Circuit breaker untuk provider eksternal yang sedang gagal.
- Batas konkurensi per pengguna dan global.
- Queue untuk pekerjaan panjang seperti laporan dan ekspor.
- Cache metadata literatur dengan TTL dan kebijakan invalidasi.
- Fallback yang jujur jika satu sumber literatur tidak tersedia; jangan menyajikan cache lama sebagai data real-time.
- Mekanisme pembatalan job dan pembersihan job yang macet.

### 28.3 Backup dan disaster recovery

Tetapkan frekuensi backup database dan file, enkripsi backup, lokasi penyimpanan, retensi backup, serta prosedur restore yang diuji. Tentukan target RPO (maksimum kehilangan data yang dapat diterima) dan RTO (target waktu pemulihan). Backup tidak dianggap berhasil sebelum uji pemulihan dilakukan.

### 28.4 Lingkungan deployment

Pisahkan `development`, `staging`, dan `production`. Setiap lingkungan memiliki database, storage, API key, webhook, dan domain yang berbeda. Terapkan CI/CD, migration/seed yang dapat diulang, health check, rollback, dan prosedur rilis. Hindari menjalankan migration destruktif tanpa backup dan rencana rollback.

## 29. Pengujian dan Kriteria Penerimaan yang Dapat Diukur

Bagian 15.3 perlu dilengkapi dengan pengujian per lapisan.

| Jenis pengujian | Contoh kriteria penerimaan |
|---|---|
| Unit test | Parser, validator sitasi, perhitungan kuota, dan aturan rubrik memiliki test untuk kasus normal dan edge case |
| Integration test | Alur database, agent-tool loop, provider error, dan ekspor berjalan pada staging |
| Authorization test | Tidak ada akses silang antar-pengguna pada seluruh resource proyek |
| Security test | Uji XSS, NoSQL injection, SSRF, upload berbahaya, prompt injection, dan rate limit |
| AI evaluation | Dataset evaluasi berlabel untuk referensi, claim support, dan readiness scoring |
| Regression test | Perubahan prompt/model tidak merusak kasus evaluasi yang sebelumnya lulus |
| Load test | Kapasitas ditetapkan dari target concurrent users dan biaya; bukan hanya total akun |
| Recovery test | Backup dapat dipulihkan dan proses penghapusan dapat ditelusuri |

Angka target latency, availability, concurrent users, ukuran file maksimum, toleransi variasi skor, dan batas biaya harus diputuskan sebelum production release. Jangan mengarang angka target tanpa baseline pengukuran.

## 30. Keputusan Produk yang Harus Dikunci Sebelum Implementasi

Berikut keputusan yang sebaiknya tidak dibiarkan menggantung saat tim mulai mengerjakan fitur terkait.

| Keputusan | Rekomendasi awal |
|---|---|
| Format input MVP | LaTeX/Markdown; PDF opsional setelah uji ekstraksi |
| DOCX | Pasca-MVP kecuali kebutuhan pengguna umum terbukti dominan |
| Editor | Chat + panel naskah sederhana; tetapkan apakah editing langsung masuk MVP |
| Jenis venue | Mulai dari 3–5 profil dengan sumber resmi dan tanggal verifikasi |
| Target pengguna pertama | Pilih segmen utama agar UX dan template tidak terlalu luas |
| Sumber literatur Indonesia | Validasi akses/API/ketentuan Garuda dan Neliti sebelum menjanjikan integrasi |
| Skor readiness | Tetapkan rubrik, ambang, dan contoh penilaian sebelum rilis |
| Retensi | Tetapkan default, pilihan pengguna, dan siklus penghapusan backup |
| Kuota | Tentukan token atau unit kerja; jelaskan perlakuan token cache dan request gagal |
| Harga | Berdasarkan pengukuran biaya aktual dan batas margin |
| Overleaf | Buat proof of concept ekspor paket dan uji alur end-to-end |
| Kolaborasi | Single-owner untuk MVP; multi-user pasca-MVP |

## 31. Prioritas Penyempurnaan

### P0 – Wajib sebelum coding fitur inti

1. Putuskan format input MVP dan selesaikan kontradiksi PDF/DOCX.
2. Definisikan alur pengguna, status proyek, versi, dan edit proposal.
3. Lengkapi schema database, indeks, constraint, dan aturan kepemilikan data.
4. Definisikan kontrak API dan protokol SSE.
5. Tetapkan struktur penyimpanan file privat dan batas unggahan.
6. Definisikan mekanisme sitasi terstruktur serta batas klaim verifikasi.
7. Tetapkan rubrik readiness dan format output terstruktur.

### P1 – Wajib sebelum beta tertutup

1. Uji isolasi data dan kontrol keamanan.
2. Implementasikan retensi dan penghapusan end-to-end.
3. Buat evaluasi AI dengan dataset berlabel.
4. Uji ekspor LaTeX/BibTeX/Overleaf pada venue nyata.
5. Tambahkan observabilitas biaya, token, latency, dan kegagalan provider.
6. Siapkan backup, restore, staging, dan rollback.

### P2 – Setelah MVP stabil

1. DOCX editor dan template Word.
2. Similarity terhadap korpus yang diizinkan.
3. Integrasi Zotero/Mendeley dan ORCID.
4. Kolaborasi multi-user dan fitur institusi.
5. Sinkronisasi Overleaf/Git.
6. Rekomendasi venue dan integrasi sumber literatur Indonesia yang telah tervalidasi.

## 32. Revisi Konsistensi terhadap Dokumen v2.0

Sebelum dokumen dibekukan, lakukan koreksi berikut pada bagian yang sudah ada:

1. **Bagian 4.2 vs 11.1:** DOCX disebut ditunda pada 4.2, tetapi disebut dapat diunggah pada 11.1. Putuskan dukungan MVP dan samakan seluruh bagian.
2. **Bagian 5 dan 7:** diagram arsitektur belum menampilkan object storage, background worker/queue, observability, dan proses penghapusan terjadwal.
3. **Bagian 6:** skema belum mencantumkan indeks, constraint, kepemilikan file, status job, dan versi profil venue yang digunakan saat laporan dibuat.
4. **Bagian 8:** regex untuk pola sitasi tidak cukup sebagai satu-satunya kontrol. Gunakan parser yang memahami format dokumen dan tandai kasus ambigu untuk pemeriksaan manual.
5. **Bagian 9:** profil venue perlu menyimpan tanggal efektif aturan, tanggal pemeriksaan terakhir, sumber resmi per aturan, serta versi template yang digunakan.
6. **Bagian 10:** rumus skor akhir dan ambang kategori belum ditetapkan. Definisikan rumus, penalti, bobot, dan aturan kegagalan kritis sebelum implementasi.
7. **Bagian 11:** mekanisme penyimpanan file asli, ekstraksi, signed URL, ekspor, dan alur teknis Overleaf belum dijelaskan.
8. **Bagian 12:** endpoint belum memiliki kontrak request/response, error code, otorisasi, idempotensi, dan batas ukuran.
9. **Bagian 13:** perlakuan token cache, request gagal, retry, dan pekerjaan yang dibatalkan harus dijelaskan agar kuota dan tagihan konsisten.
10. **Bagian 14:** kebijakan keamanan perlu diterjemahkan menjadi kontrol dan test case yang dapat diverifikasi.
11. **Bagian 15:** tetapkan target numerik setelah baseline, lalu masukkan ke acceptance criteria rilis.
12. **Bagian 18:** milestone perlu memiliki deliverable, dependency, owner, estimasi, dan definition of done; estimasi waktu dapat ditentukan setelah scope dan kapasitas tim disepakati.
13. **Bagian 19:** daftar perubahan kode perlu disesuaikan setelah audit repository aktual; jangan menganggap semua path dan modul sudah sesuai kondisi kode saat ini.

## 33. Definition of Done untuk MVP

MVP dinyatakan siap rilis terbatas hanya jika seluruh kondisi berikut terpenuhi:

- Pengguna dapat membuat, membuka, mengarsipkan, dan menghapus proyek.
- Pengguna dapat memasukkan naskah dalam format MVP dan melihat hasil ekstraksi beserta peringatannya.
- Chat berjalan dalam konteks proyek dan versi naskah yang benar.
- Tool literatur mengembalikan metadata sumber dan status verifikasi secara transparan.
- Sitasi yang tidak memiliki referensi terverifikasi tidak dapat lolos sebagai sitasi valid.
- Usulan edit tidak mengubah naskah sebelum disetujui pengguna.
- Laporan readiness menyimpan versi naskah, profil venue, rubrik, dan model yang digunakan.
- Ekspor menghasilkan artefak yang dapat dibuka dan diuji pada template target.
- Kuota, pembayaran, dan webhook tidak menghasilkan penghitungan ganda.
- Tidak ditemukan kebocoran data antar-pengguna dalam pengujian.
- Retensi dan penghapusan mencakup database serta file terkait sesuai kebijakan.
- Backup dan prosedur restore telah diuji.
- Biaya per alur utama telah diukur dan batas paket telah ditetapkan.
- Terms of Service dan Privacy Policy tersedia dan telah ditinjau sebelum peluncuran.

---

## Catatan Akhir

v2.0 sudah kuat sebagai dokumen visi teknis dan rancangan arsitektur. v2.1 sebaiknya diperlakukan sebagai spesifikasi yang masih membutuhkan keputusan produk, proof of concept, dan validasi terhadap repository serta dokumentasi resmi layanan pihak ketiga.

Dokumen ini tidak menganggap integrasi, API, maupun kemampuan provider telah teruji hanya karena sudah tercantum dalam rancangan. Semua ketergantungan eksternal harus dibuktikan melalui proof of concept sebelum dinyatakan siap produksi.


---

# 34. Prinsip Pelaksanaan Bertahap

Pengembangan Publication Prepare dilaksanakan secara bertahap dengan pendekatan **stage-gate**. Tim tidak harus menunggu seluruh produk selesai untuk menguji nilai produk, tetapi setiap tahap harus menghasilkan artefak yang dapat diperiksa dan diuji.

### 34.1 Aturan stage-gate

- Setiap tahap memiliki tujuan, ruang lingkup, dependency, deliverable, acceptance criteria, risiko, dan keputusan yang harus disahkan.
- Tahap berikutnya boleh dimulai untuk pekerjaan yang tidak bergantung pada gate sebelumnya, tetapi integrasi ke production tidak boleh melewati gate kritis.
- Fitur yang belum lolos acceptance criteria tetap berstatus `in_progress` atau `blocked`, bukan `done`.
- Perubahan scope dicatat pada change log dan dianalisis dampaknya terhadap biaya, jadwal, arsitektur, keamanan, dan kompatibilitas data.
- Estimasi waktu ditentukan setelah audit Tahap 0, penetapan kapasitas tim, dan pemilihan scope MVP.

### 34.2 Peta tahapan

| Tahap | Nama | Hasil utama | Prioritas |
|---|---|---|---|
| 0 | Discovery & Existing System Audit | Baseline repository, keputusan MVP, backlog tervalidasi | P0 |
| 1 | Platform Foundation | Environment, database, auth, observability, storage foundation | P0 |
| 2 | Project Workspace & Manuscript | Proyek, file, versi, parsing, status workflow | P0 |
| 3 | Conversational AI Agent | Chat streaming, tool runtime, usage accounting | P0 |
| 4 | Literature Intelligence | Search, metadata normalization, DOI/reference verification | P0 |
| 5 | Venue & Readiness Engine | Venue profiles, deterministic checks, readiness report | P0 |
| 6 | Edit & Export Workflow | Proposed edits, version acceptance, BibTeX/LaTeX/package/Overleaf PoC | P0/P1 |
| 7 | Hardening & Release | Security, QA, load, backup/restore, beta, production gate | P0 |
| 8 | Post-MVP Expansion | DOCX, similarity, integrations, institutional features | P2 |

### 34.3 Jalur kritis MVP

Tahap 0 → Tahap 1 → Tahap 2 → Tahap 3 → Tahap 4 → Tahap 5 → Tahap 6 → Tahap 7.

Pekerjaan desain UX, evaluasi AI, kurasi venue, dan proof of concept provider dapat berjalan paralel sepanjang keputusan dan hasilnya terdokumentasi.

---

# 35. Tahap 0 – Discovery dan Audit Sistem Saat Ini

## 35.1 Tujuan

Memastikan MTS sesuai kondisi aplikasi yang benar-benar ada, bukan mengasumsikan struktur repository, skema database, auth, billing, atau modul lama masih sama dengan rancangan.

## 35.2 Aktivitas

1. Audit repository: struktur monorepo, framework, runtime, dependency, build, lint, test, dan pola routing.
2. Audit database: model Mongoose, indeks, data lama, relasi, dan potensi migrasi.
3. Audit autentikasi: NextAuth/OAuth, session, reset password, verifikasi email, dan proteksi endpoint.
4. Audit billing: paket, kuota, Midtrans, webhook, histori transaksi, dan kemungkinan double counting.
5. Audit AI saat ini: prompt, model, token accounting, error handling, streaming, serta cara menyimpan hasil.
6. Audit deployment: hosting, environment variable, domain, storage, logging, backup, dan pipeline rilis.
7. Audit UI: halaman aktif, alur pengguna, komponen yang dapat dipertahankan, dan kebutuhan redesign.
8. Audit dependency eksternal: Anthropic, OpenAlex, Crossref, Semantic Scholar, Overleaf, email, dan payment provider.
9. Tetapkan target pengguna pertama dan scope input naskah MVP.
10. Susun backlog fitur dengan prioritas P0/P1/P2.

## 35.3 Keputusan wajib

| ID | Keputusan | Status awal |
|---|---|---|
| D0-01 | Pengguna utama MVP: peneliti teknik/informatika atau pengguna lintas bidang | TBD |
| D0-02 | Input MVP: LaTeX/Markdown saja atau ditambah PDF | TBD; rekomendasi LaTeX/Markdown, PDF setelah PoC |
| D0-03 | DOCX masuk MVP atau pasca-MVP | Rekomendasi pasca-MVP |
| D0-04 | Editor langsung atau chat + preview naskah | TBD |
| D0-05 | Daftar 3–5 venue pertama | TBD |
| D0-06 | Provider hosting dan object storage | TBD |
| D0-07 | Target concurrent users dan batas biaya | TBD berdasarkan baseline |
| D0-08 | Retensi default dan kebijakan privasi | TBD; wajib ditinjau sebelum beta |

## 35.4 Deliverables

- Existing System Audit Report.
- Architecture As-Is diagram.
- Architecture To-Be diagram.
- Database inventory dan migration impact.
- API/provider dependency inventory.
- UX flow dan MVP scope.
- Product backlog dengan acceptance criteria.
- Risk register awal.
- Decision log yang ditandatangani Product Owner dan Technical Lead.

## 35.5 Definition of Done

- Repository dapat dijalankan di lingkungan pengembangan.
- Tim memahami modul yang dipertahankan, diubah, dan dihapus.
- Tidak ada asumsi penting tentang kode lama yang belum diverifikasi.
- Konflik requirement (misalnya PDF/DOCX) sudah diputuskan.
- Scope MVP, target pengguna, dan daftar venue awal disetujui.
- Setiap pekerjaan Tahap 1–7 memiliki owner dan acceptance criteria.

**Gate 0:** Product Owner dan Technical Lead menyetujui audit, scope MVP, serta daftar keputusan.

---

# 36. Tahap 1 – Fondasi Arsitektur dan Platform

## 36.1 Tujuan

Membangun fondasi aplikasi yang aman, dapat diamati, dan siap menerima modul proyek, naskah, AI agent, serta pekerjaan asynchronous.

## 36.2 Ruang lingkup

### A. Repository dan struktur aplikasi

- Finalisasi struktur monorepo berdasarkan audit.
- Pisahkan domain package sesuai kebutuhan: `db`, `ai`, `checks`, `literature`, `export`, `venues`, `mailer`.
- Tetapkan standar TypeScript/JavaScript, lint, formatting, test, dan import boundaries.
- Tetapkan pengelolaan konfigurasi dan environment.

### B. Environment

- `development`, `staging`, dan `production` terpisah.
- Database, storage bucket, API key, payment webhook, dan domain tidak digunakan bersama lintas environment.
- Sediakan `.env.example` tanpa secret.
- Terapkan secret manager atau mekanisme secret hosting yang sesuai.
- Terapkan CI untuk lint, type check, unit test, dan build.

### C. Database foundation

- Tetapkan koneksi MongoDB dan kebijakan pooling.
- Buat migration/seed strategy yang dapat diulang.
- Terapkan indeks awal dan pemeriksaan indeks pada deployment.
- Aktifkan backup dan uji restore pada staging.
- Tentukan strategi transaksi MongoDB dan kebutuhan replica set.

### D. Authentication dan authorization

- Pertahankan auth yang telah diaudit jika aman dan sesuai.
- Terapkan role/permission minimal `project_owner`.
- Semua akses resource memerlukan pemeriksaan ownership di server.
- Terapkan rate limit autentikasi dan proteksi session/cookie.
- Uji akses lintas pengguna.

### E. Storage foundation

- Siapkan object storage privat.
- File tidak boleh dapat diakses melalui URL publik permanen.
- Implementasikan signed URL berumur pendek atau endpoint unduhan terotorisasi.
- Tetapkan batas ukuran dan tipe file.

### F. Observability

- Structured logging dengan `requestId`.
- Error tracking tanpa merekam isi naskah atau secret.
- Metrik latency, error rate, database, provider, dan biaya.
- Health check untuk aplikasi dan dependency utama.

## 36.3 Deliverables

- Repository baseline dan CI pipeline.
- Environment staging aktif.
- Database schema foundation dan indeks.
- Auth/authorization test suite.
- Object storage privat.
- Logging, metrics, dan error tracking.
- Backup/restore runbook.
- Security baseline checklist.

## 36.4 Definition of Done

- Build dan test berjalan otomatis pada pull request.
- Staging dapat di-deploy secara repeatable.
- Secret tidak tersimpan di repository.
- Akses lintas pengguna ditolak pada endpoint uji.
- File privat tidak dapat diunduh tanpa otorisasi.
- Backup berhasil dipulihkan dalam uji staging.
- Error log tidak memuat isi naskah, token, password, atau API key.

**Gate 1:** Fondasi staging, auth, database, storage, dan observability lulus pemeriksaan.

---

# 37. Tahap 2 – Project Workspace, Manuscript, dan Versioning

## 37.1 Tujuan

Mengimplementasikan prinsip satu naskah = satu proyek, dengan konteks, file, versi, dan status yang konsisten.

## 37.2 Ruang lingkup

### A. Project management

- Create, list, detail, update title/metadata, archive, restore, dan delete project.
- Metadata: judul, bidang, bahasa, jenis publikasi, venue target, status, waktu aktivitas.
- Daftar proyek hanya menampilkan proyek yang dapat diakses pengguna.
- Sediakan empty state dan project onboarding.

### B. Manuscript ingestion

MVP mengikuti keputusan Tahap 0. Rekomendasi baseline:

- Markdown dan LaTeX sebagai format sumber kanonis.
- PDF sebagai input opsional hanya setelah parser PoC menunjukkan hasil yang dapat diterima.
- DOCX pasca-MVP kecuali kebutuhan produk mengharuskan lebih awal.

Proses unggah:

1. Validasi ekstensi, MIME hasil deteksi, magic bytes, ukuran, dan checksum.
2. Simpan file asli ke storage privat.
3. Ekstrak/parse di worker terisolasi jika diperlukan.
4. Simpan source hasil normalisasi.
5. Buat parse report berisi warning dan confidence.
6. Tampilkan hasil ekstraksi agar pengguna dapat mengonfirmasi atau memperbaiki.

### C. Manuscript versioning

- Versi pertama dibuat saat naskah pertama kali disimpan.
- Perubahan yang diterima membuat versi baru; versi lama tidak ditimpa.
- Simpan `number`, `source`, `format`, `origin`, `note`, `checksum`, `createdBy`, dan `createdAt`.
- `currentVersionId` hanya menunjuk versi yang valid.
- Gunakan optimistic concurrency melalui `baseVersionId`.
- Sediakan daftar versi dan pemulihan versi lama.

### D. Section parsing

Bagian standar: title, abstract, keywords, introduction, related_work/literature_review, methodology, results, discussion, conclusion, acknowledgements, declarations, references.

- Struktur dapat berbeda sesuai bidang dan venue.
- Jangan memaksa semua naskah memiliki seluruh section.
- Simpan offset/lokasi sumber agar temuan dapat menunjuk ke bagian yang tepat.
- Tandai bagian yang tidak dapat dikenali dengan status `unknown`.

### E. File lifecycle

- Status file: `uploaded`, `scanning`, `processing`, `ready`, `rejected`, `failed`, `deletion_pending`.
- Simpan ukuran, MIME, checksum, storage key, dan hasil pemindaian.
- Hapus file turunan ketika project dihapus sesuai retensi.
- Artefak ekspor memiliki TTL dan izin akses.

## 37.3 Deliverables

- Project CRUD UI/API.
- Manuscript upload/paste workflow.
- File metadata model dan storage integration.
- Parser Markdown/LaTeX.
- PDF parser PoC jika PDF dipilih.
- Version history dan restore.
- Section navigator.
- Tests untuk ownership, parsing, upload, dan version conflict.

## 37.4 Definition of Done

- Pengguna dapat membuat dan mengelola proyek.
- Pengguna dapat memasukkan naskah sesuai format MVP.
- File asli dan hasil parse tersimpan terpisah.
- Parsing warning terlihat dan tidak disembunyikan.
- Setiap perubahan yang disimpan membentuk versi yang dapat ditelusuri.
- Konflik versi tidak menimpa perubahan pengguna.
- Penghapusan proyek menghapus/menjadwalkan penghapusan semua file terkait.

**Gate 2:** Satu proyek dapat dibuat, diisi naskah, memiliki versi, dan dipulihkan tanpa kehilangan jejak.

---

# 38. Tahap 3 – Conversational AI Agent dan Streaming

## 38.1 Tujuan

Mengubah pola satu panggilan model menjadi agent runtime yang bekerja dalam konteks proyek, dapat menggunakan tools, serta mencatat biaya dan aktivitas secara akurat.

## 38.2 Ruang lingkup

### A. Context builder

Urutan konteks:

1. System policy dan safety rules.
2. Project metadata.
3. Venue profile dan versinya jika dipilih.
4. Ringkasan naskah aktif.
5. Bagian naskah yang relevan.
6. Daftar referensi proyek yang relevan.
7. Ringkasan percakapan sebelumnya.
8. Pesan terbaru pengguna.

Konteks harus dibatasi berdasarkan token budget. Jangan mengirim seluruh naskah pada setiap giliran jika `read_section` dapat memenuhi kebutuhan.

### B. Agent loop

- Model meminta tool.
- Server memvalidasi schema dan otorisasi.
- Tool dijalankan dengan timeout dan batas resource.
- Hasil tool dikembalikan sebagai data, bukan instruksi.
- Model melanjutkan hingga jawaban final atau batas iterasi tercapai.
- Semua tool call dicatat tanpa menyimpan payload sensitif berlebihan.
- Batasi jumlah iterasi, waktu total, token, dan jumlah tool call.

### C. Tool registry

Setiap tool harus memiliki:
- nama dan deskripsi;
- JSON schema input;
- permission yang dibutuhkan;
- validasi dan normalisasi input;
- timeout;
- retry policy;
- output schema;
- error codes;
- audit log;
- test suite.

### D. Streaming

- SSE events sesuai Bagian 23.
- Simpan pesan user sebelum memulai proses agent.
- Simpan status assistant `streaming`, `completed`, `failed`, atau `cancelled`.
- Reconnect menggunakan request/message ID yang sama.
- Hindari duplikasi akibat retry client.
- Tool call yang belum selesai tidak boleh ditampilkan sebagai hasil final.

### E. Model configuration

- Model chat, report, dan lightweight diatur melalui konfigurasi.
- Catat model ID aktual, bukan alias yang tidak dapat diaudit.
- Simpan versi prompt dan konfigurasi penting.
- Provider timeout dan rate limit ditangani secara eksplisit.
- Prompt caching hanya digunakan setelah kompatibilitas dan implikasi biaya diverifikasi.

### F. Usage accounting

- Catat input/output token, cache read/write token, provider, model, request ID, dan jenis tugas.
- Tetapkan perlakuan retry, cancelled request, provider error, dan cached token.
- Update kuota secara atomik agar tidak terjadi double counting.
- Pisahkan usage teknis dari unit billing yang ditampilkan ke pengguna.

## 38.3 Deliverables

- Agent runtime package.
- Context builder dan context budget.
- Tool registry dan schema validation.
- Chat SSE API dan UI.
- Message state lifecycle.
- Usage ledger.
- Model/prompt configuration.
- Agent integration tests dan provider failure tests.

## 38.4 Definition of Done

- Chat berjalan dalam konteks proyek dan versi yang benar.
- Tool hanya dapat dijalankan setelah validasi server.
- Prompt injection pada dokumen tidak mengubah kebijakan tool.
- Reconnect tidak menggandakan pesan atau tagihan.
- Usage tercatat dan konsisten dengan respons provider.
- Kegagalan provider terlihat jelas dan tidak disamarkan sebagai jawaban sukses.
- Batas iterasi, timeout, dan token efektif.

**Gate 3:** Agent dapat menyelesaikan percakapan multi-turn dan tool-use dengan kontrol keamanan serta usage accounting.

---

# 39. Tahap 4 – Literature Intelligence dan Citation Integrity

## 39.1 Tujuan

Menyediakan pencarian dan verifikasi literatur yang transparan, dapat ditelusuri, serta mencegah referensi fiktif masuk ke naskah sebagai referensi terverifikasi.

## 39.2 Ruang lingkup

### A. Provider adapter

Implementasikan adapter terpisah untuk:
- OpenAlex;
- Crossref;
- Semantic Scholar;
- sumber Indonesia seperti Garuda/Neliti hanya setelah akses, API, ketentuan, dan kelayakan integrasinya diverifikasi.

Setiap adapter memiliki timeout, rate limit, retry, cache, provider attribution, dan normalisasi error.

### B. Search pipeline

1. Terima query, tahun, bahasa, tipe publikasi, dan batas hasil.
2. Validasi parameter.
3. Cari pada provider yang aktif.
4. Normalisasi judul, author, DOI, tahun, venue, URL, abstrak.
5. Deduplicate dengan DOI ternormalisasi; jika tidak ada DOI, gunakan kombinasi metadata dengan confidence.
6. Tandai asal provider dan waktu pengambilan.
7. Tampilkan kandidat beserta keterbatasan metadata.

### C. Verification pipeline

Status:
- `verified`: metadata utama cocok dengan sumber yang dapat dipercaya.
- `partial`: sebagian metadata cocok, tetapi ada field penting yang belum dapat dipastikan.
- `unverified`: tidak cukup bukti atau metadata tidak cocok.
- `retracted`: ada bukti status retraction yang relevan.
- `correction_notice` atau `expression_of_concern` dapat ditambahkan bila provider mendukung dan datanya cukup.

Verifikasi DOI tidak boleh hanya memeriksa apakah endpoint mengembalikan HTTP 200. Cocokkan judul, penulis, tahun, dan venue dengan toleransi yang terdokumentasi.

### D. Reference library per project

- Tambahkan referensi hanya melalui candidate ID atau proses verifikasi manual.
- `citeKey` unik per proyek.
- Simpan raw metadata, normalized metadata, provider, checkedAt, matchedFields, verification status, dan perubahan status.
- Pengguna dapat mengedit metadata manual, tetapi perubahan tersebut menurunkan/mereset status verifikasi sampai diverifikasi ulang.
- Dukung penghapusan dan deteksi referensi duplikat.

### E. Claim support

- Bandingkan klaim dengan abstrak atau full text yang sah tersedia.
- Jika hanya abstrak, tampilkan bahwa evaluasi berbasis abstrak.
- Jika bukti tidak cukup, gunakan `unknown`/`insufficient_evidence`.
- Jangan menyatakan `supports` hanya berdasarkan kesamaan kata kunci.
- Simpan bukti kutipan/lokasi sumber jika full text dapat diakses secara sah.

### F. Citation integrity

- Gunakan representasi referensi terstruktur/cite key.
- Render ke IEEE/APA/Vancouver/custom sesuai profile.
- Validator memeriksa sitasi yatim, entri pustaka tidak digunakan, duplikasi, metadata tidak cocok, dan status referensi.
- Kasus ambigu masuk `manual_review`.
- Referensi tidak terverifikasi tidak boleh diekspor sebagai referensi terverifikasi tanpa label/peringatan.

## 39.3 Dataset evaluasi

Siapkan dataset berlabel yang mencakup:
- DOI valid dengan metadata cocok;
- DOI valid tetapi judul/author mismatch;
- DOI palsu/tidak ditemukan;
- artikel retracted;
- metadata tidak lengkap;
- judul mirip pada beberapa publikasi;
- referensi tanpa DOI;
- klaim didukung, didukung sebagian, tidak didukung, dan tidak cukup bukti.

## 39.4 Deliverables

- Literature provider adapters.
- Search and normalization service.
- Reference candidate UI.
- Verification service.
- Project reference library.
- Citation parser/renderer untuk format MVP.
- Claim-support evaluator dengan label keterbatasan.
- Benchmark dataset dan evaluation report.

## 39.5 Definition of Done

- Setiap referensi memiliki asal dan waktu pemeriksaan.
- DOI palsu tidak ditandai verified.
- Metadata mismatch menghasilkan partial/unverified.
- Retraction yang terdeteksi ditampilkan jelas.
- Klaim tanpa bukti memadai menjadi unknown, bukan supports.
- Sitasi tanpa record verified tidak dapat lolos sebagai sitasi valid.
- Semua hasil pencarian menampilkan keterbatasan cakupan dan provider.

**Gate 4:** Benchmark referensi lulus sesuai target yang ditetapkan dari hasil baseline; tidak ada sitasi fiktif yang lolos pada set uji rilis.

---

# 40. Tahap 5 – Venue Rules, Deterministic Checks, dan Readiness Assessment

## 40.1 Tujuan

Mengevaluasi naskah terhadap ketentuan venue dan rubrik ilmiah secara transparan, terukur, dan dapat direproduksi.

## 40.2 Ruang lingkup

### A. Venue profile management

Setiap venue profile memiliki:
- identitas venue dan publisher;
- jenis conference/journal;
- cakupan dan indexing dengan sumber dan tanggal verifikasi;
- template/version;
- format requirement;
- word/page limits;
- reference style;
- required declarations;
- review/blind policy;
- AI policy dan sumber resmi;
- rubric;
- `effectiveFrom`, `checkedAt`, `version`, `status`.

Status profile: `active`, `needs_review`, `deprecated`. Profile yang usang harus terlihat dan tidak boleh diperlakukan sebagai aturan terbaru.

### B. Deterministic checks

Kelompok cek:
1. Struktur dan kelengkapan bagian.
2. Jumlah kata abstrak dan keyword.
3. Konsistensi sitasi dan daftar pustaka.
4. Gaya sitasi.
5. DOI dan metadata.
6. Referensi terbaru.
7. Self-citation sebagai sinyal, bukan otomatis pelanggaran.
8. Elemen wajib venue.
9. Double-blind identity leakage.
10. Batas halaman hanya jika PDF kompilasi dapat dipercaya; selain itu gunakan estimasi dengan label.
11. Kelengkapan deklarasi etik, data availability, funding, conflict of interest, CRediT, dan ORCID jika diwajibkan venue.

Setiap hasil: `pass`, `warn`, `fail`, `not_applicable`, atau `manual_review`, dengan evidence dan lokasi sumber.

### C. LLM rubric assessment

Setiap kriteria memiliki:
- definisi operasional;
- skala penilaian;
- bobot;
- evidence requirement;
- contoh anchor score;
- prompt/rubric version.

Kriteria contoh:
- novelty dan kontribusi;
- positioning literatur;
- metodologi dan reproducibility;
- kualitas analisis hasil;
- argumentasi dan diskusi;
- penulisan dan struktur;
- kualitas referensi.

Model tidak boleh memberi skor jika bagian atau bukti tidak tersedia; gunakan `not_assessed`.

### D. Formula readiness

Formula final belum ditetapkan dalam MTS. Sebelum implementasi, Product Owner dan academic reviewer harus menyetujui:
- skala skor setiap kriteria;
- normalisasi bobot;
- perlakuan `not_assessed`;
- penalti deterministic fail;
- critical blockers;
- threshold kategori;
- aturan jika venue profile usang.

Jangan menerapkan angka ambang ilustratif sebagai aturan produksi. Critical blocker (misalnya format wajib tidak terpenuhi atau deklarasi etik yang diwajibkan hilang) dapat mencegah label `siap` meskipun skor rata-rata tinggi.

### E. Report persistence

Setiap laporan menyimpan:
- project/version;
- venue profile ID dan version;
- rubric version;
- prompt version;
- model ID;
- deterministic results;
- criteria scores dan evidence;
- formula/threshold version;
- createdAt;
- status job;
- keterbatasan evaluasi.

## 40.3 Deliverables

- Venue profile schema dan admin/seed workflow.
- 3–5 venue profiles yang telah diverifikasi.
- Deterministic checks package.
- Rubric evaluator dengan structured output.
- Readiness report UI/API.
- Evaluation dataset untuk penilaian ilmiah.
- Rubric calibration report.

## 40.4 Definition of Done

- Semua aturan venue yang digunakan memiliki sumber dan tanggal pengecekan.
- Hasil deterministik dapat direproduksi dari versi naskah yang sama.
- Skor AI disertai rationale dan bukti lokasi yang benar.
- Tidak ada skor untuk kriteria yang tidak memiliki bukti memadai.
- Formula, threshold, dan critical blockers telah disetujui.
- Laporan dapat ditelusuri ke model, prompt, venue, rubric, dan versi naskah.

**Gate 5:** Academic reviewer dan Product Owner menyetujui rubrik serta hasil benchmark readiness.

---

# 41. Tahap 6 – Edit Workflow, Export, dan Overleaf

## 41.1 Tujuan

Membawa pengguna dari hasil evaluasi menuju perbaikan yang dapat dikontrol dan paket naskah yang siap digunakan pada proses submission.

## 41.2 Ruang lingkup

### A. Proposed edit workflow

1. AI mengusulkan perubahan pada section tertentu.
2. Sistem menyimpan `editId`, `baseVersionId`, diff, alasan, dan bagian terdampak.
3. Pengguna melihat perbandingan before/after.
4. Pengguna menerima atau menolak.
5. Jika diterima, sistem membuat versi baru.
6. Jika versi dasar sudah berubah, sistem menolak penerapan otomatis dan meminta review ulang.
7. Setiap keputusan tercatat pada AI usage log.

AI tidak boleh mengubah naskah sumber secara diam-diam.

### B. Export BibTeX

- Sumber hanya dari reference library proyek.
- Field yang tidak tersedia tidak boleh diisi dengan tebakan.
- Escaping karakter khusus.
- Konsistensi cite key.
- Validasi file hasil ekspor.

### C. Export LaTeX

- Terapkan template venue yang sudah diverifikasi.
- Pisahkan konten pengguna dari file class/template.
- Jangan menimpa file sumber asli.
- Validasi placeholder yang belum terisi.
- Beri peringatan jika format sumber tidak dapat dipetakan sempurna.

### D. Export package

Paket minimum:
- `main.tex`;
- `references.bib`;
- file gambar yang dirujuk;
- template yang boleh didistribusikan;
- `README` berisi cara membuka/kompilasi;
- metadata versi dan venue.

### E. Overleaf

- Lakukan PoC berdasarkan mekanisme resmi yang tersedia saat implementasi.
- Verifikasi batas ukuran, jenis file, struktur ZIP, dan mekanisme import.
- Jika tidak tersedia API yang sesuai, gunakan paket ZIP yang dapat diunggah manual.
- Jangan menjanjikan integrasi satu klik sebelum alur benar-benar teruji.
- Sinkronisasi Git dua arah tetap pasca-MVP.

### F. Export security

- Artefak ekspor disimpan privat.
- Link unduhan berumur pendek.
- Validasi akses project owner.
- Bersihkan temporary files.
- Jangan menyertakan secret, log internal, atau file yang tidak dimaksudkan untuk ekspor.

## 41.3 Deliverables

- Edit proposal UI/API.
- Diff viewer.
- Accept/reject workflow.
- Version conflict handling.
- BibTeX export.
- LaTeX template renderer.
- ZIP package generator.
- Overleaf import PoC dan hasil uji.
- Export regression tests.

## 41.4 Definition of Done

- AI edit tidak diterapkan tanpa persetujuan pengguna.
- Penerimaan edit membuat versi baru.
- Konflik versi ditangani aman.
- BibTeX tidak berisi metadata hasil tebakan.
- Paket ekspor berhasil dibuka dan diuji pada minimal satu template venue target.
- Alur Overleaf dijelaskan sesuai hasil PoC; fallback ZIP tersedia.
- Unduhan hanya dapat dilakukan pengguna berhak.

**Gate 6:** End-to-end flow dari naskah → evaluasi → revisi yang disetujui → paket ekspor lulus uji.

---

# 42. Tahap 7 – Security Hardening, QA, Beta, dan Production Readiness

## 42.1 Tujuan

Membuktikan bahwa MVP aman, stabil, dapat dipulihkan, dan memiliki biaya operasional yang dapat diperkirakan sebelum dirilis ke pengguna terbatas.

## 42.2 Aktivitas QA

### A. Functional testing

- Registrasi/login/reset password.
- Project lifecycle.
- Manuscript upload/parse/version.
- Chat, tool calls, streaming, reconnect.
- Literature search dan verification.
- Venue checks dan readiness report.
- Proposed edit.
- Export.
- Quota dan payment flow.

### B. Security testing

- Broken access control/IDOR.
- XSS, CSRF, NoSQL injection.
- SSRF melalui URL atau provider parameter.
- Path traversal dan unsafe file upload.
- Prompt injection melalui manuskrip dan hasil pencarian.
- Rate limit bypass.
- Secret leakage pada log dan client bundle.
- Webhook replay dan signature validation.

### C. AI evaluation

- Citation hallucination.
- DOI/reference mismatch.
- Claim-support false positive.
- Unsupported scientific claim.
- Readiness score consistency.
- Evidence location correctness.
- Prompt injection resistance.
- Regression antar model/prompt version.

### D. Performance dan load

Uji berdasarkan target yang disepakati:
- concurrent active users;
- chat streaming duration;
- request rate;
- ukuran file;
- jumlah referensi per proyek;
- laporan readiness paralel;
- export job concurrency.

Tetapkan p95/p99 latency dan error budget setelah baseline dan kapasitas hosting diketahui.

### E. Reliability

- Provider outage.
- Database unavailable.
- Queue backlog.
- Interrupted streaming.
- Duplicate webhook.
- Worker crash.
- Backup restore.
- Retention/deletion job failure.

## 42.3 Beta tertutup

- Undang kelompok kecil peneliti dengan persetujuan penggunaan.
- Gunakan naskah yang pengguna berhak unggah.
- Sediakan kanal laporan kesalahan dan penghapusan.
- Pantau biaya dan kualitas secara berkala.
- Jangan menggunakan naskah pengguna untuk evaluasi atau pelatihan di luar kebijakan yang diinformasikan dan disetujui.

## 42.4 Production readiness checklist

- Privacy Policy dan Terms of Service ditinjau.
- Provider contract dan data handling diverifikasi.
- Security review selesai.
- Backup dan restore diuji.
- Alerting aktif.
- Rollback diuji.
- Kuota dan paket telah dihitung berdasarkan biaya.
- Support/incident contact tersedia.
- Venue profile memiliki owner dan jadwal review.
- Tidak ada P0 defect yang terbuka.

## 42.5 Definition of Done

- Seluruh acceptance test P0 lulus.
- Tidak ada temuan security critical/high yang belum dimitigasi atau diterima secara formal.
- Tidak ada kebocoran data antar-pengguna.
- Tidak ada sitasi tidak terverifikasi yang lolos pada benchmark rilis.
- Backup/restore dan rollback terbukti.
- Biaya per alur utama terukur.
- Legal/privacy review selesai.
- Product Owner menandatangani release approval.

**Gate 7:** MVP boleh dirilis terbatas hanya setelah seluruh production readiness checklist disetujui.

---

# 43. Tahap 8 – Pasca-MVP dan Pengembangan Lanjutan

Tahap ini hanya dimulai setelah metrik penggunaan, kualitas, biaya, dan stabilitas MVP tersedia.

| Workstream | Fitur | Prasyarat / catatan |
|---|---|---|
| W1 | DOCX import/export dan Word templates | Parser dan mapping style teruji |
| W2 | Similarity checker | Korpus dan hak akses data jelas; label hanya untuk cakupan yang diperiksa |
| W3 | Zotero/Mendeley | API/OAuth dan izin pengguna diverifikasi |
| W4 | ORCID | Integrasi resmi dan consent pengguna |
| W5 | Overleaf Git sync | Token pengguna, izin, dan mekanisme resmi |
| W6 | Diagram Mermaid/TikZ/draw.io | Validasi output dan keamanan file |
| W7 | Institutional workspace | Multi-tenancy, role, admin, audit |
| W8 | Journal/venue recommendation | Kualitas metadata, sumber indexing, dan kurasi |
| W9 | Advanced research analytics | Dataset pengguna, provenance, dan reproducibility |
| W10 | Similarity/licensed provider integration | Kajian lisensi dan biaya institusional |

### 43.1 Prioritas pasca-MVP

Urutan ditentukan dari data penggunaan dan kebutuhan pengguna, bukan dari kemudahan implementasi semata. Setiap workstream harus memiliki business case, user demand, dependency, biaya, dan acceptance criteria tersendiri.

### 43.2 Definition of Done

Setiap fitur pasca-MVP harus:
- memiliki requirement dan pemilik;
- lulus security/privacy review;
- memiliki dokumentasi dan telemetry;
- tidak merusak kompatibilitas proyek/versi lama;
- memiliki rencana migrasi dan rollback;
- menunjukkan manfaat yang terukur bagi pengguna.

---

# 44. RACI, Artefak Proyek, dan Tata Kelola Perubahan

## 44.1 Peran minimum

| Peran | Tanggung jawab |
|---|---|
| Product Owner | Prioritas, scope, keputusan produk, acceptance akhir |
| Technical Lead/Architect | Arsitektur, standar teknis, integrasi, technical gate |
| Backend Engineer | API, database, agent runtime, storage, billing |
| Frontend Engineer | UI/UX implementation, streaming, editor, report |
| AI/ML Engineer | Prompt, tools, evaluation, citation/claim support |
| Academic Reviewer | Rubrik ilmiah, venue rules, validasi kualitas akademik |
| QA Engineer | Test plan, automation, regression, release evidence |
| DevOps/Security | CI/CD, secrets, monitoring, backup, security review |

Satu orang dapat memegang lebih dari satu peran pada tim kecil, tetapi tanggung jawab dan approval tetap harus jelas.

## 44.2 Artefak wajib

- Product requirement/backlog.
- Architecture diagram (as-is dan to-be).
- Data model/ERD.
- API specification/OpenAPI.
- UI flow dan design system.
- Threat model dan privacy data flow.
- Venue profile source register.
- Rubric/evaluation dataset.
- Test plan dan test report.
- Deployment/runbook.
- Incident response dan backup/restore runbook.
- Decision log dan change log.

## 44.3 Tata kelola perubahan

Setiap perubahan requirement harus mencatat:
- Change ID;
- latar belakang;
- requirement terdampak;
- dampak ke user journey;
- dampak API/database;
- dampak keamanan/privacy;
- dampak biaya dan jadwal;
- opsi yang dipertimbangkan;
- keputusan dan approver;
- versi dokumen efektif.

Perubahan schema yang breaking harus memiliki migration plan dan rollback plan. Perubahan prompt/model/rubric harus memiliki evaluasi regression sebelum production.

---

# 45. Requirement Traceability dan Release Checklist

## 45.1 Traceability matrix

| Domain | Bagian MTS | Tahap | Bukti penerimaan |
|---|---|---|---|
| Product scope/persona | 1–4, 20 | 0 | Scope dan decision log disetujui |
| Architecture/repository | 5, 19, 28 | 0–1 | Diagram dan audit repository |
| Data model | 6, 26 | 1–2 | Schema, index, migration tests |
| Project/manuscript | 21–22, 24 | 2 | Workflow dan version tests |
| AI agent/streaming | 7, 23 | 3 | Agent integration/SSE tests |
| Citation/literature | 8, 27, 39 | 4 | Benchmark reference/citation |
| Venue/readiness | 9–10, 40 | 5 | Venue source register dan rubric evaluation |
| Edit/export | 11, 41 | 6 | End-to-end export evidence |
| Security/privacy | 14, 25 | 1–7 | Threat model, security test, privacy review |
| Observability/reliability | 15, 28 | 1, 3, 7 | Dashboard, alert, restore report |
| Testing/release | 15, 29, 42 | 7 | Test report dan release approval |
| Post-MVP | 16, 43 | 8 | Business case dan feature acceptance |

## 45.2 Checklist sebelum setiap release

### Product
- [ ] Scope release dan known limitations dipublikasikan.
- [ ] User journey utama dapat diselesaikan.
- [ ] Error dan empty state memiliki pesan yang jelas.

### Engineering
- [ ] Build, lint, type check, unit, integration, dan regression test lulus.
- [ ] Database migration dan rollback telah diuji.
- [ ] API contract dan dokumentasi diperbarui.

### AI quality
- [ ] Model ID, prompt version, dan rubric version tercatat.
- [ ] Evaluation set dijalankan.
- [ ] Tidak ada regression kritis pada citation integrity.
- [ ] Batas kemampuan dan ketidakpastian ditampilkan.

### Security and privacy
- [ ] Authorization test lulus.
- [ ] Tidak ada secret atau manuscript content pada log yang tidak semestinya.
- [ ] File storage privat dan signed URL berumur pendek.
- [ ] Retention/deletion job diuji.
- [ ] Perubahan kebijakan pihak ketiga ditinjau.

### Operations
- [ ] Monitoring dan alert aktif.
- [ ] Backup terbaru tersedia dan restore pernah diuji.
- [ ] Rollback plan tersedia.
- [ ] Provider quota dan biaya terpantau.
- [ ] Incident owner dan jalur eskalasi tersedia.

### Approval
- [ ] QA sign-off.
- [ ] Technical Lead sign-off.
- [ ] Security/privacy sign-off sesuai scope.
- [ ] Academic reviewer sign-off untuk perubahan rubrik atau scientific assessment.
- [ ] Product Owner release approval.

---

## Penutup – Baseline Implementasi

MTS v3.0 menjadi dokumen acuan terpadu untuk pengembangan Publication Prepare. Pelaksanaan dilakukan melalui Tahap 0 sampai Tahap 8 dengan mekanisme stage-gate. Tim wajib membedakan antara:

1. **Requirement yang sudah ditetapkan** dalam dokumen;
2. **Rekomendasi desain** yang masih memerlukan persetujuan;
3. **Asumsi teknis** yang harus dibuktikan melalui audit atau PoC;
4. **Keputusan terbuka** yang harus dicatat pada decision log.

Tidak ada fitur yang boleh dinyatakan siap hanya karena endpoint, prompt, atau UI telah dibuat. Kesiapan ditentukan oleh bukti acceptance test, keamanan, kualitas keluaran, observabilitas, dan kemampuan operasional.
