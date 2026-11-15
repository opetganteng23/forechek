# Master Technical Specification
## Publication Prepare: Asisten Publikasi Ilmiah Berbasis Claude

> Versi 2.0 (draf) | Menggantikan arah "form upload → skor" pada `Publication Prepare.md` v1.0
> Stack: Next.js 14 + MongoDB (Mongoose) + Anthropic API + Nodemailer + Midtrans

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
