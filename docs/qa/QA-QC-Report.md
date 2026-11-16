# Laporan QA/QC Independen (akhir): Publication Prepare, Tahap 0-8

- Tanggal audit: 2026-11-16
- Commit yang diaudit: `2c5ab72` (HEAD, `main`), pohon kerja bersih kecuali penggantian nama `QA-QC-Report.md` menjadi `QA-QC-Report-baseline.md` (sudah ter-stage sebelum audit).
- Acuan: `CLAUDE.md`, `docs/progress/STATUS.md`, `docs/decisions/decision-log.md`, `docs/SETUP.md`, `docs/ops/*`, `docs/qa/QA-QC-Report-baseline.md` (audit baseline Tahap 1-2), `docs/spec/MTS_v3.0.md` bagian 38-43.
- Sifat: audit saja. Tidak ada kode aplikasi, tes, konfigurasi, atau dokumen lain yang diubah; berkas yang dibuat hanya laporan ini. Satu kejadian yang harus diungkap: menjalankan `packages/literature/scripts/evaluate.js` menulis ulang `docs/eval/literature-benchmark.md` (hanya baris tanggal berubah). Saya mengembalikannya dengan `git checkout -- docs/eval/literature-benchmark.md`; `git status` akhir hanya menampilkan penggantian nama di atas.
- Lingkungan: Windows 11, Node 24.18, MongoDB lokal yang sudah hidup di 27017 (bukan milik saya; saya hanya memakai database `qa_final_audit` dan menghapusnya di akhir), Next.js 14.2.35 mode produksi (`next start -p 3100`, memakai build di `apps/web/.next` yang sudah ada, tidak membangun ulang), `AI_PROVIDER=fake`, `LITERATURE_PROVIDERS=fixture`, `MIDTRANS_SERVER_KEY` kunci dummy. Server dimatikan lewat port. Tidak ada panggilan ke API eksternal, tidak ada nilai `.env*` yang dibaca atau dicetak (variabel server diberikan lewat environment proses). Skrip uji sementara ada di `C:/Users/maski/AppData/Local/Temp/claude/c--Users-maski-Documents-CODING-Publication-Prepare/677d69ad-38b3-4841-a16d-911098d09216/scratchpad/qa-final/` (disebut `SP/` di bawah).

---

## 1. Verdict (dua penilaian terpisah)

### P1 "Siap dijalankan" (pengembang menjalankan dan memakai secara lokal/staging): **SIAP DENGAN SYARAT**

Alasan:
- `npm test`: 368 tes, 0 gagal, 0 dilewati di 11 workspace (bagian 2, area 1).
- Server produksi hidup dengan konfigurasi minimal; `GET /api/health` 200; fail-fast env terbukti (tanpa `NEXTAUTH_SECRET` proses keluar `exit=1` dengan pesan nama variabel).
- Skrip e2e HTTP terhadap server nyata + MongoDB nyata: webhook 9/9, chat 44/44, references 70/70, report 41/41, edits 57/57, hardening 36/36, indicators 20/20, proxy 2/2 (mode `TRUST_PROXY=true`). Isolasi antar-pengguna terbukti pada 16 titik akhir proyek (bagian 3, F-12).
- Log server tidak memuat isi naskah, kata sandi, email uji, atau token (0 kecocokan pada 688 baris).

Syarat (semua harus dipahami pemakai):
1. MongoDB harus berjalan; semua bukti AI/literatur di laporan ini berasal dari **provider palsu dan korpus fixture**. Chat nyata (Anthropic, SDK `^0.27.0` yang sudah tua), OpenAlex/Crossref/Semantic Scholar nyata, email, Google, Midtrans, Redis, HTTPS tidak pernah dijalankan: TIDAK DIVERIFIKASI (bagian 6).
2. Suite e2e tidak dijalankan di CI dan rapuh bila dijalankan beruntun pada satu server (batas laju login bersama): menjalankan `hardening.js` setelah skrip lain menghasilkan banyak FAIL palsu sampai server di-restart (F-14). Restart server di antara skrip.
3. Tidak ada gerbang lint (QA-20 masih terbuka); CI hanya `npm ci`, `npm test`, `npm run build`.
4. Semua profil venue berstatus `needs_review`; rumus kesiapan `formula-provisional-0.1` belum disetujui. Hasil laporan kesiapan adalah bantuan dengan label PROVISIONAL, bukan penilaian.

### P2 "Siap dirilis ke pengguna" (rilis terbatas menurut Gate 7, MTS 42.4/42.5): **BELUM SIAP**

Alasan (semua diverifikasi di kode, dokumen, atau eksekusi):
1. Checklist produksi MTS 42.4 sebagian besar belum terpenuhi: tabel hasil runbook `docs/ops/RUNBOOK.md` bagian 6 berisi "BELUM DIUJI" untuk restore, rollback, dan alert; tidak ada staging, tracker error, kontak insiden (`[ISI - belum ditetapkan]`), dan tinjauan hukum (halaman `/privacy` dan `/terms` berlabel "DRAF - belum ditinjau hukum"; kontak masih placeholder). Tidak ada persetujuan (consent) pada form daftar (`RegisterForm.jsx` tidak memuat kata setuju/persetujuan/tautan privasi).
2. Pembeda utama produk belum dapat diklaim: 4 dari 4 profil venue `needs_review`/`unverified`/`checkedAt: null` (MTS 40.3 mensyaratkan 3-5 profil yang telah diverifikasi); rumus, ambang, rubrik belum disetujui Product Owner dan reviewer akademik (Gate 5 belum ditandatangani).
3. Provider nyata belum pernah dijalankan. Integritas sitasi terbukti pada simulasi dan benchmark sintetis (57/57, "fiktif lolos = 0") tetapi bukan pada penyedia nyata (D4-06).
4. Temuan integritas baru yang terbukti di audit ini (F-01, F-02): teks bebas dari penilai laporan tidak melewati validator sitasi, dan validator berbasis pola meloloskan beberapa bentuk sitasi naratif/bernomor-spasi pada jalur chat dan gerbang edit.
5. Biaya per alur belum terukur (`docs/ops/COST.md`: "BELUM DIUKUR"), kuota provisional, beta tertutup belum ada, `npm audit` terbuka (next 14.2.35, tidak berubah sejak baseline), uji beban tidak ada.

Kondisi agar P2 dapat dinilai ulang: tutup butir 1-5 di atas, tanda tangan Product Owner pada Gate 5 dan Gate 7, dan jalankan ulang audit ini terhadap provider nyata.

---

## 2. Tabel 13 area

Format B/T/S/R = BLOCKER/TINGGI/SEDANG/RENDAH (nomor temuan di bagian 3). BLOCKER dihitung terhadap P2; tidak ada BLOCKER untuk P1.

| # | Area | Status | Bukti ringkas | B/T/S/R |
|---|---|---|---|---|
| 1 | Build & tes | LULUS bersyarat | `npm test`: ai 63, checks 60, core 42, db 4, edits 21, export 17, indicators 11, literature 99, mailer 1, manuscript 43, venues 7 = **368 lulus / 0 gagal / 0 skip** (`apps/web` dan `config` tanpa tes). Build tidak dibangun ulang (aturan audit); server berjalan dari `.next` (BUILD_ID ada). Lint tidak ada (`.eslintrc*` tidak ada; CI tanpa lint/audit/e2e). Tes tidak dilemahkan: `git diff` atas semua berkas tes tahap 3-8 hanya menambah (tidak ada baris assert yang dihapus). | 0/0/1/0 |
| 2 | Konfigurasi & env | LULUS | Fail-fast terbukti (`NEXTAUTH_SECRET` kosong + `AI_PROVIDER=fake` tanpa izin: dua pesan nama variabel, `exit=1`). Setiap `process.env.X` aplikasi ada di `.env.example`/`docs/SETUP.md` (sisanya internal Next/Vercel/Cloudinary/Ethereal). Hanya `.env.example` yang dilacak git. Pemindaian bundle klien: 0 nama/pola rahasia. | 0/0/0/0 |
| 3 | Keamanan aplikasi | LULUS bersyarat | Webhook ditolak tanpa/dengan signature salah (401), 503 tanpa kunci; cek Origin 403; batas body byte; NoSQL injection tersapu; sesi dicabut setelah reset; HSTS ada. Terbuka: `npm audit` (next 14.2.35, mongoose, nodemailer tidak berubah), tanpa CSP, rute lama tanpa cek Origin dan tanpa envelope, limiter per proses (Redis tidak diuji). | 0/1/3/2 |
| 4 | Integritas data & konkurensi | LULUS bersyarat | e2e: 50 proyek aktif maksimum pada 10 pembuatan paralel; hapus akun/retensi mencascade 7 koleksi; klaim retensi atomik. Cascade tidak transaksional; batas usulan pending tidak atomik; webhook dapat memperpanjang langganan dua kali pada notifikasi serentak (diakui STATUS, tidak diuji ulang). | 0/0/2/0 |
| 5 | Fungsional API | LULUS bersyarat | 47 rute; semua rute proyek memakai `withApi` (401/404/400 berenvelope). Rute lama `manuscripts/[id]` dan `analyses/[id]` dengan id tak valid masih 500 tanpa isi (direproduksi). `journals` publik tanpa batas `limit`. Tidak ada `GET /projects/:id/ai-usage`. | 0/0/2/1 |
| 6 | Fungsional UI | LULUS bersyarat (terbatas) | Saya TIDAK menjalankan browser. Yang diperiksa: label PROVISIONAL, status venue, kata terlarang, tautan Navbar mati, halaman 404 bawaan, favicon 404, `/privacy` `/terms` 200. Klaim puppeteer di STATUS (20/20, 17/17, 11/11) TIDAK DIVERIFIKASI ulang. | 0/0/0/4 |
| 7 | Parser & logika inti | LULUS bersyarat | Parser 1 MB tanpa 500, tetapi CPU: 200.000 heading 4,7 dtk, 250.000 heading 6,0 dtk (memblokir event loop). QA-19 (BAB, `\and`, YAML flow, setext, makro) tetap terbuka (direproduksi). Sanitizer sitasi: 79.000 karakter adversarial 7 pola, maksimum 398 ms (tanpa ReDoS). | 0/0/2/0 |
| 8 | Performa | LULUS bersyarat | Sanitizer linear; tidak ada uji beban/p95 (tidak dijalankan; TIDAK DIVERIFIKASI). Risiko CPU parser di atas. | (di area 7) |
| 9 | Operasional & deploy | GAGAL untuk P2 / LULUS untuk P1 | Log JSON terstruktur, `/api/health`, fail-fast: baik. Restore/rollback/alert: "BELUM DIUJI"; tidak ada staging, tracker error, kontak insiden. | 1/0/0/0 |
| 10 | Privasi & kepatuhan | GAGAL untuk P2 | Hapus akun, retensi, log bersih: terbukti (e2e). Kebijakan/ToS hanya draf, kontak placeholder, tanpa consent registrasi, tinjauan hukum belum, perjanjian penyedia AI belum. | 1/0/1/0 |
| 11 | Kesesuaian MTS | LULUS bersyarat | Tahap 3-6 deliverable ada; DoD tertentu TIDAK TERVERIFIKASI (template venue, kompilasi LaTeX, Overleaf, provider nyata). Tahap 7 gate otomatis lulus, Gate 7 tidak. Tahap 8 dikerjakan sebelum prasyarat MTS 43 (metrik MVP). Matriks di bagian 5. | 1/1/2/0 |
| 12 | Dokumentasi | LULUS bersyarat | `docs/SETUP.md` lengkap (tabel env, uji per integrasi); `docs/ops/*` jujur berstatus BELUM DIUJI/ESTIMASI. README usang (QA-27). STATUS menyebut `scripts/e2e/security.js` yang tidak ada (sapuan keamanan ada di `hardening.js`); jumlah tes di STATUS sebagian usang (ai 54 vs 63, literature 98 vs 99). | 0/0/0/3 |
| 13 | Keputusan terbuka | MEMBLOKIR P2 | Bagian 7 (PROVISIONAL diurut dampak). | - |

Total temuan (bagian 3): BLOCKER 3 (P2), TINGGI 3, SEDANG 10, RENDAH 9.

---

## 3. Temuan (hanya yang saya verifikasi)

Skrip uji: `SP/adv.js`, `SP/adv2.js`, `SP/edit_adv.js`, `SP/rep.js`, `SP/idor.js`, `SP/idor2.js`, `SP/misc.js`, `SP/tex.js`; hasil e2e di `SP/e2e_*.txt`.

### BLOCKER (menghalangi P2; bukan P1)

**F-B1 | Gate 7 / MTS 42.4 belum terpenuhi (operasional dan hukum)**
- Bukti: `docs/ops/RUNBOOK.md` bagian 6: tiga baris "BELUM DIUJI". `docs/ops/RUNBOOK.md` bagian 4: "Kontak insiden dan dukungan: **[ISI - belum ditetapkan]**". `apps/web/app/privacy/page.jsx:1-9` ("DRAF - belum ditinjau hukum", kontak `[ISI ...]`), `apps/web/app/terms/page.jsx:1-8`. `grep -niE "setuju|persetujuan|privacy|terms" apps/web/components/auth/RegisterForm.jsx`: kosong. `docs/ops/COST.md`: "BELUM DIUKUR". `.github/workflows/ci.yml`: hanya `npm ci`, `npm test`, `npm run build`.
- Dampak: tidak ada dasar persetujuan, pemulihan data tak terbukti, tidak ada deteksi insiden.

**F-B2 | Tidak ada profil venue yang terverifikasi; rumus kesiapan belum disetujui**
- Bukti: `packages/venues/data/*.json` semua `"status": "needs_review"` (4 berkas); D5-01 (`checkedAt: null`). `packages/checks/src/readiness.js:6-10` (`provisional: true`, "Belum disetujui Product Owner dan academic reviewer"). Diverifikasi perilaku: e2e report "venue needs_review: label siap tidak pernah diberikan" PASS.
- Dampak: MTS 40.3/40.4 dan Gate 5 tidak terpenuhi. Sistem jujur (label dibatasi `revisi_minor`, ditandai PROVISIONAL), tetapi hasilnya tidak dapat dijual sebagai penilaian kesiapan.

**F-B3 | Semua bukti AI/literatur berasal dari provider palsu dan fixture**
- Bukti: `packages/ai/src/providers/index.js:10-21` (jalur nyata hanya `createAnthropicProvider`, SDK `packages/ai/package.json` `@anthropic-ai/sdk ^0.27.0`); `docs/progress/STATUS.md` bagian TIDAK DIVERIFIKASI; benchmark `docs/eval/literature-benchmark.md` menyatakan korpus sintetis dan juri simulasi. Dijalankan ulang oleh saya: `node packages/literature/scripts/evaluate.js` = 57/57, fiktif lolos 0 (hanya pada kasus sendiri).
- Dampak: perilaku nyata streaming, tool-use, biaya, dan kecocokan metadata pada API sungguhan tidak diketahui.

### TINGGI

**F-01 | Teks bebas penilai laporan (rationale, suggestions) tidak melewati validator sitasi**
- Bukti: `packages/checks/src/assess.js:94-126` menyimpan `rationale` (800 karakter) dan `suggestions` apa adanya; tidak ada panggilan `sanitizeCitations` di `packages/checks` atau `apps/web/lib/reportService.js` (`grep sanitiz` hanya di `chatService.js` dan `edits/service.js`). `apps/web/components/projects/ReportTab.jsx:233-235` menampilkannya. Reproduksi (`SP/rep.js`, juri palsu): keluaran `rationale` memuat "Zhang et al. (2022)", "doi:10.1234/fake.99", dan saran "(Fiction, 2020)" tanpa penanda apa pun.
- Dampak: jalur keluaran model yang kedua (setelah chat) dapat menampilkan sitasi karangan tanpa tanda; prinsip MTS 8/27.5 hanya ditegakkan di chat dan gerbang edit.
- Saran terkecil: panggil `sanitizeCitations` (atau tolak penilaian) atas `rationale`/`suggestions` sebelum disimpan, dengan daftar referensi proyek.

**F-02 | Validator sitasi berbasis pola meloloskan beberapa bentuk sitasi; benchmark "nol kebocoran" tidak mencakupnya**
- Bukti (`SP/adv2.js`, `SP/edit_adv.js`; referensi terverifikasi hanya Vaswani 2017). Lolos tanpa penanda di `sanitizeCitations`: `Per Ghost 2021, x`; `Menurut Ghost dan Fiction pada 2021 hasilnya baik`; `as in [ 7 ]` dan `[7a]` (numerik dengan spasi/huruf); `Ghost [2021]`; `<cite>Ghost 2021</cite>`; `\footnote{Ghost 2021 showed}`; `Smith 2020 serta karya Smith (hlm. 4)`. Gerbang edit: `propose` menerima ("ACCEPTED(pending)") `Teks Zhang 2022 melaporkan hasil baik.` dan `Teks [ 3 ].`. Yang tertangkap: 20+ bentuk lain (lihat F-12 dan bagian 8, tabel 10 bentuk).
- Dampak: sebagian dokumentasi sudah mengakui batasan naratif (D4-08, D4-10), tetapi STATUS/benchmark menyatakan "nol kebocoran" tanpa kualifikasi bentuk-bentuk di atas. Klaim kuat "model tidak pernah menghasilkan sitasi yang diterima sebagai sah" benar dalam arti: tidak ada sitasi tak terverifikasi yang diberi status sah dan tidak ada yang dapat masuk BibTeX (F-12). Klaim "tidak ada teks sitasi karangan yang lolos ke pengguna" TIDAK benar.
- Saran terkecil: tambah kasus-kasus ini ke benchmark sebagai "diketahui lolos" agar klaim eksplisit, atau perluas pola (terutama `[ n ]`).

**F-03 | `npm audit` terbuka (QA-06)**
- Bukti: versi tidak berubah sejak baseline: `next` 14.2.35 (`apps/web/package.json`), `mongoose` terpasang 8.24.3, `nodemailer ^9.0.5`; `npm audit` tidak dijalankan ulang (butuh registry; aturan audit melarang panggilan eksternal), jadi hitungan terkini TIDAK DIVERIFIKASI. `docs/progress/STATUS.md` mencantumkan QA-06 sebagai terbuka.

### SEDANG

**F-04 | Parser memblokir event loop pada masukan sah 1 MB**: `packages/manuscript/src/parser.js:6` `MAX_SOURCE_BYTES = 1000000`. Reproduksi: `node -e "const {parseManuscript}=require('./packages/manuscript');for(const n of [25000,50000,100000,200000,250000]){const s='# x\n'.repeat(n);const t=Date.now();parseManuscript(s,'markdown');console.log(n,Date.now()-t,'ms')}"`: 553, 1191, 1964, 4706 ms, 5989 ms (hasil saya). Perbaikan QA-12 menghilangkan 500, bukan biaya CPU. Satu pengguna dapat menahan satu proses beberapa detik per permintaan.

**F-05 | Rute lama `POST /api/analyses` melewati seluruh kendali integritas**: `apps/web/app/api/analyses/route.js:18-75` memanggil `analyzeManuscript` (`packages/ai/index.js:14-44`, nama model keras `claude-sonnet-4-6`, tanpa guard provider/kuota token, tanpa validator sitasi), menyalin keluaran model ke dokumen `Analysis` (`Object.assign(analysis, result)`, termasuk `journalRecommendations` yang dihalusinasi model), dan mengembalikan `details: err.message` (baris 70). Jangkauan nyata rendah: dokumen `Manuscript` hanya dibuat oleh `POST /api/manuscripts` yang kini 410 (`SP/misc.js`: `legacy POST manuscripts 410`) kecuali `LEGACY_ROUTES_ENABLED=true` atau data lama sudah ada.

**F-06 | Rute lama tidak memakai `withApi`**: tanpa cek Origin (`apps/web/lib/api.js:59,101` hanya di `withApi`; `kum/calculate`, `analyses`, `payments/create` berupa fungsi biasa), 500 tanpa isi untuk id tak valid (`SP/misc.js`: `GET /api/manuscripts/not-an-id 500 len 0`, `GET /api/analyses/not-an-id 500 len 0`), `journals` publik tanpa batas `limit` (`apps/web/app/api/journals/route.js:6`). Webhook: `gross_amount` tidak dicocokkan dengan `Payment.amount` dan pemeriksaan `payment.status === 'paid'` lalu `save()` tidak atomik (`apps/web/app/api/payments/webhook/route.js:30-46`); kunci kosong 503, signature salah 401, JSON rusak 400 sudah benar.

**F-07 | QA-19 parser tetap terbuka** (direproduksi `SP/misc.js`, `SP/tex.js`): `## BAB I PENDAHULUAN` dst. menghasilkan `UNRECOGNIZED_HEADING` x3 + `FEW_SECTIONS`; `\keywords{crop yield \and deep learning \and CNN}` menjadi satu kata kunci `"crop yield deep learning CNN"`; YAML `keywords: [anomaly detection, autoencoder, IoT]` menjadi `["[anomaly detection","autoencoder","IoT]"]`; setext (`====`/`----`) menghasilkan `NO_TITLE`, `NO_SECTIONS`; makro `\newcommand{\bab}[1]{\section{#1}}` menghasilkan bagian `#1`.

**F-08 | Jejak penggunaan AI tidak punya jalur baca**: `AiUsageLog` ditulis (`apps/web/lib/chatService.js`, `editService.js`) tetapi tidak ada rute `ai-usage` dan tidak ada UI ("jejak AI"/"ai-usage" tidak ditemukan di `apps/web/app` atau `components`). Baseline mencantumkannya sebagai P0; `GET /api/usage` hanya kuota.

**F-09 | Renderer sitasi IEEE/APA/Vancouver (MTS 39.2 F, 39.4) tidak ada**: tidak ada fungsi render di `packages/*/src` (pencarian `renderCitation|formatReference|vancouver` hanya menemukan deteksi gaya). Ekspor hanya BibTeX + `\cite{}`; naskah Markdown dengan sitasi penulis-tahun tidak dikonversi (D6-02).

**F-10 | Limiter laju per proses dan bergantung pada konfigurasi proxy**: `TRUST_PROXY=true`: pemalsuan entri kiri tidak melewati batas (e2e proxy 2/2, `[201,201,201,201,201,429,429,429]`). Mode `TRUST_PROXY=false`, Redis, dan lintas-instance TIDAK dijalankan oleh saya. Satu kunci `em:` dapat dihabiskan pihak lain (diakui T7-05).

**F-11 | Tahap 8 dikerjakan sebelum prasyarat MTS 43** ("hanya dimulai setelah metrik penggunaan, kualitas, biaya, dan stabilitas MVP tersedia"); `D8-01` mengerjakan W2 sebagian tanpa metrik MVP. Fiturnya sendiri sesuai aturan (e2e indicators 20/20: tanpa kata vonis, tidak disimpan, tidak masuk skor/ekspor), tetapi urutan tahap menyimpang dari spesifikasi.

**F-14 | Suite e2e tidak ada di CI dan rapuh terhadap urutan**: setelah `webhook`, `chat`, `references`, `report`, `edits` berjalan beruntun pada satu server, `hardening.js` menghasilkan 11 FAIL/FATAL dan `indicators.js` 2 FAIL (IDOR) karena login terkena batas laju bersama (`mk`/`makeUser` mendapat 401). Setelah restart server: hardening 36/36, indicators 20/20, dan pemeriksaan IDOR manual `SP/idor.js` semuanya 404. Jadi kegagalan itu adalah artefak uji, bukan cacat IDOR, tetapi membuat bukti e2e tidak otomatis dan mudah disalahbaca.

**F-15 | Pemakaian log**: `packages/core/src/logger.js:12-22` hanya mengedaksi berdasarkan nama kunci; `err.message` hingga 300 karakter dicatat apa adanya (`apps/web/lib/api.js:117`). Pemindaian log saya bersih (0 kecocokan 11 pola isi/rahasia dalam 688 baris), tetapi galat pihak ketiga yang mengutip nilai dapat membawa fragmen isi. Risiko, bukan kebocoran yang terbukti.

### RENDAH

- **F-16 (QA-22)** Tautan Navbar mati: `/dashboard/journals` dan `/dashboard/kum` 404 (`apps/web/components/layout/Navbar.jsx:10-11`; `SP/misc.js`).
- **F-17 (QA-23)** Tidak ada `error.jsx`/`not-found.jsx`: 404 bawaan Next (13 KB HTML, bahasa Inggris).
- **F-18 (QA-30)** `/favicon.ico` 404.
- **F-19 (QA-24)** CSP tidak ada (`content-security-policy` kosong di semua rute yang diuji); HSTS ada di produksi (terlihat di respons `/api/health`).
- **F-20 (QA-25)** Pendaftaran email ganda masih `CONFLICT` (`apps/web/app/api/auth/register/route.js:25`).
- **F-21 (QA-27)** README merujuk `Publication Prepare.md` v1 dan struktur lama.
- **F-22** STATUS merujuk `scripts/e2e/security.js` yang tidak ada; jumlah tes di STATUS usang.
- **F-23** `packages/literature/scripts/evaluate.js` menulis ke `docs/` saat dijalankan (efek samping tidak terduga bagi auditor).
- **F-24 (QA-26)** `POST .../versions/[number]/restore` selalu `created` (201), `apps/web/app/api/projects/[id]/versions/[number]/restore/route.js:8`.

### F-12 Hal yang diperiksa dan BAIK (PASS dengan bukti)

- **Integritas BibTeX** (`SP/adv.js`): 7 rekaman adversarial dimasukkan ke `buildBibtex`: hanya yang `verification.status === 'verified'` yang diekspor; `unverified`, `partial`, tanpa status, dan hanya `verificationStatus:'verified'` di tingkat atas ditolak; kunci `ok2,evil` ditolak; `doi` berisi `}` dan `url` `javascript:` dihilangkan (tidak ditulis); `venueName` berisi `}\n@article{evil,` di-escape (`J. \} @article\{evil,`); penulis tanpa nama keluarga diperingatkan; `validateBibtex` kosong. Tidak ada kebocoran.
- **Gerbang edit** (`SP/edit_adv.js`): ditolak `CITATION_NOT_VERIFIED`: penulis-tahun karangan, `\cite{zhang2022}`, `[@zhang2022]`, tautan DOI karangan, `Zhang (2022)` naratif berkurung, `[3]`, entri daftar pustaka karangan, nama dengan zero-width, tanda kurung fullwidth. Diterima: sitasi referensi terverifikasi. Lolos (F-02): `Zhang 2022` tanpa kurung dan `[ 3 ]`.
- **Sanitizer chat** (`SP/adv.js`, `SP/adv2.js`): ditandai/diganti: `(Fabricated, 2021)`, `\cite{x}`, `\citep [p. 4] {x}`, `\ci<ZWSP>te{x}`, `[@x]`, `@x`, tautan arXiv, `Ghost et al. (2021)`, DOI karangan (berawalan dan telanjang), entri APA karangan, tiga-penulis palsu, superskrip `^3`/`<sup>`, sitasi ke referensi `unverified` dan `retracted`, `\textcite`, `[Ghost 2021]`, `(GHOST, 2021)`. Campuran `\cite{sah,palsu}` menyisakan yang sah.
- **Kegagalan tertutup**: input > 80.000 karakter melempar (D4-10); e2e chat 44/44 termasuk provider-gagal dan idempotensi.
- **Isolasi data** (`SP/idor.js`, `SP/idor2.js`, e2e chat/edits/report/references): pengguna B terhadap proyek A: GET proyek, versions, references, reports, edits, messages, export, literature/search, references/verify, POST versions, report, indicators, PATCH, DELETE, dan chat semuanya **404**; proyek A tetap 200. Tanpa login: `/api/projects`, `/usage`, `/venues`, `/kum/history`, `/payments/history`, `/analyses`, `/manuscripts`, `DELETE /account` semuanya 401. Daftar rute tanpa penyaring pemilik: `plans` (publik, data statis), `journals`, `journals/[id]`, `journals/search` (publik, koleksi `Journal` global), `venues` dan `venues/[slug]` (login, data global), `payments/webhook` (publik, dilindungi signature), `health`, rute auth publik. Tidak ada rute data-pengguna tanpa filter pemilik. Pembaruan berbasis `_id` saja di `literatureService.js:31`, `editService.js:31`, `reportService.js:20`, `chatService.js:31-35` selalu didahului pencarian bermilik.
- **Webhook**: `SP/e2e_webhook2.txt` 9/9 (tanpa signature 401, salah 401, "undefined" 401, JSON rusak 400, plan tetap free, sah 200 menjadi pro, notifikasi ulang idempoten); kode: kunci kosong 503 (`webhook/route.js:10-12`), `timingSafeEqual` (`packages/core/src/payments.js:12-20`).
- **Rahasia**: `grep` nama variabel rahasia di `apps/web/.next/static`: 0 berkas; pola kunci (`sk-ant-`, `mongodb://`, `GOCSPX-`, `SB-Mid-server-`, `AKIA`, private key): 0; e2e hardening: "pemindaian bundle klien (27 berkas): tanpa nama/pola rahasia". Git: hanya `.env.example` dilacak.
- **Label kejujuran**: kata terlarang (`plagiat`, `ditulis AI`, `pasti`, `terbukti`) hanya muncul sebagai daftar larangan/negasi (`packages/indicators/src/report.js:7`, prompt `packages/ai/src/context.js:17`, `similarity.js:4`). Label PROVISIONAL di `readiness.js`, `ReportTab.jsx:53,162`, `checks/report.js:17`, `usage/route.js`, `venues/route.js`; balasan provider palsu ditandai "[PROVIDER PALSU - mode uji, bukan Claude]" (`demo.js:10`, `ChatTab.jsx:198`); provider palsu ditolak di produksi tanpa `AI_ALLOW_FAKE` (diuji: fail-fast).

---

## 4. Disposisi temuan baseline QA-01 sampai QA-30

| ID | Status | Bukti |
|---|---|---|
| QA-01 webhook dapat dipalsukan | **FIXED** | e2e webhook 9/9; kode `webhook/route.js:10-12` (503), `payments.js` (`timingSafeEqual`, kunci kosong ditolak). Sisa: `gross_amount` tidak dicocokkan, race ganda (F-06). |
| QA-02 fitur P0 belum ada | **PARTIAL** | Tahap 3-6 ada (chat SSE, literatur, venue, laporan, edit, ekspor). Sisa: jejak AI tanpa jalur baca (F-08), renderer sitasi (F-09), template venue/kompilasi/Overleaf nyata TIDAK DIVERIFIKASI. |
| QA-03 tanpa kebijakan/ToS/consent | **PARTIAL** | `/privacy` dan `/terms` ada (200) berlabel DRAF; hapus akun ada (e2e). Tanpa consent registrasi, tanpa tinjauan hukum, kontak placeholder (F-B1). |
| QA-04 koneksi DB tidak pulih | **FIXED** | `packages/db/connection.js:25-31` reset `cached.promise = null`; tes db 4/4. Cold-start DB-mati tidak saya jalankan ulang. |
| QA-05 bypass rate limit XFF | **PARTIAL** | `TRUST_PROXY` + entri kanan: e2e proxy 2/2 (true). Mode false, Redis, lintas instance tidak diuji; limiter tetap per proses (F-10). |
| QA-06 `npm audit` 9 kerentanan | **OPEN** | Versi dependensi tidak berubah (next 14.2.35); audit tidak dijalankan ulang (F-03). |
| QA-07 rute unggah lama Cloudinary | **FIXED** | `POST /api/manuscripts` 410 (misc.js, e2e hardening). Kode lama masih ada di belakang `LEGACY_ROUTES_ENABLED`. |
| QA-08 tanpa staging/alert/restore | **OPEN** | RUNBOOK bagian 6 "BELUM DIUJI"; CI tanpa lint/audit (F-B1). |
| QA-09 retensi/hapus akun | **FIXED** | e2e hardening: hapus akun cascade 7 koleksi, retensi dry-run/aktif, klaim atomik. Penjadwal eksternal belum dikonfigurasi (dokumen). |
| QA-10 kuota 50 proyek dapat dilampaui | **FIXED** (satu proses) | e2e: 46 + 10 paralel = 50 aktif. Lintas instance diterima (D7-01). |
| QA-11 batas ukuran hanya Content-Length | **FIXED** | e2e: chunked 3 MB -> 413; chunked kecil 400 (bukan 413). |
| QA-12 parser 500 pada heading masif | **PARTIAL** | Tidak 500 lagi (250.000 heading OK) tetapi 6,0 dtk CPU (F-04). |
| QA-13 enumerasi lewat waktu forgot-password | **FIXED** | e2e: median selisih < 150 ms (terdaftar 50-98 ms vs tidak 30-60 ms). |
| QA-14 sesi tidak dicabut | **FIXED** | e2e: sesi lama 401 setelah reset, termasuk rute lama; login password baru OK. |
| QA-15 DB mati menggantung 30 dtk | **FIXED** | `connection.js:24` `serverSelectionTimeoutMS: 5000`; tes db. Tidak diuji dinamis. |
| QA-16 env tidak divalidasi saat boot | **FIXED** | Dijalankan: `NEXTAUTH_SECRET` kosong + fake tanpa izin -> pesan nama variabel, `exit=1` (`SP/failfast.log`). |
| QA-17 rute lama 500 tanpa envelope | **PARTIAL** | Webhook JSON rusak kini 400; `manuscripts/[id]` dan `analyses/[id]` id tak valid masih 500 tanpa isi (F-06). |
| QA-18 tanpa cek Origin | **PARTIAL** | e2e: Origin asing -> 403 pada rute `withApi`; tanpa Origin diizinkan. Rute lama tanpa `withApi` tidak dicek (F-06). |
| QA-19 parser BAB/`\and`/YAML/setext/makro | **OPEN** | Direproduksi (F-07). |
| QA-20 tanpa lint | **OPEN** | Tidak ada `.eslintrc*`; CI tanpa lint. |
| QA-21 kontras teks sekunder | **OPEN (tidak diukur ulang)** | Tidak diukur; tidak ada perubahan gaya yang ditemukan. TIDAK DIVERIFIKASI. |
| QA-22 tautan Navbar mati | **OPEN** | 404 untuk kedua tautan (F-16). |
| QA-23 tanpa halaman error/404 | **OPEN** | F-17. |
| QA-24 tanpa CSP/HSTS | **PARTIAL** | HSTS ada di produksi (header terlihat); CSP tidak ada (F-19). |
| QA-25 enumerasi email saat daftar | **OPEN** | F-20 (keputusan produk). |
| QA-26 restore selalu 201 | **OPEN** | F-24. |
| QA-27 README usang | **OPEN** | F-21. |
| QA-28 cookie tanpa Secure di http | **TIDAK DIVERIFIKASI** | Tidak ada HTTPS di lingkungan uji. |
| QA-29 `BASE_URL` kosong merusak tautan email | **FIXED** (produksi) | `bootProblems` mensyaratkan `BASE_URL` di produksi (`packages/core/src/config.js:37`). Non-produksi tetap tanpa pemeriksaan. |
| QA-30 `/favicon.ico` 404 | **OPEN** | F-18. |

Ringkasan: FIXED 11, PARTIAL 7, OPEN 11 (termasuk QA-21 yang tidak diukur ulang), TIDAK DIVERIFIKASI 1 (QA-28).

---

## 5. Matriks kesesuaian MTS tahap 3-8

Legenda: ADA-TERVERIFIKASI = saya jalankan/baca dan buktinya konkret; ADA-TIDAK-TERVERIFIKASI = kode/dokumen ada, perilaku nyata tidak dapat dibuktikan di sini; BELUM-ADA.

### Tahap 3 (MTS 38): agen chat, SSE, usage

| Deliverable / DoD | Status | Bukti |
|---|---|---|
| Agent runtime, context builder, tool registry, schema validation | ADA-TERVERIFIKASI | `packages/ai` tes 63; e2e chat: tool tak dikenal ditolak, `projectId` dari model ditolak |
| Chat SSE API + UI | ADA-TERVERIFIKASI (API) / ADA-TIDAK-TERVERIFIKASI (UI) | e2e chat 44/44; UI tidak dijalankan ulang |
| Usage ledger + kuota | ADA-TERVERIFIKASI | e2e: usage 1 pesan, token > 0, provisional; 429 setelah batas |
| DoD: konteks proyek/versi benar | ADA-TERVERIFIKASI | e2e IDOR + tes |
| DoD: tool hanya setelah validasi server | ADA-TERVERIFIKASI | e2e injeksi: `delete_project` tidak ada |
| DoD: injeksi dokumen tidak mengubah kebijakan tool | ADA-TERVERIFIKASI | e2e "hasil tool hanya data" |
| DoD: reconnect tidak menggandakan pesan/tagihan | ADA-TERVERIFIKASI (idempotensi), PARTIAL (reconnect sejati tidak ada: D3-08) | e2e idempotensi, 409 `REQUEST_IN_PROGRESS` |
| DoD: kegagalan provider terlihat | ADA-TERVERIFIKASI | e2e galat provider |
| DoD: batas iterasi/timeout/token | ADA-TERVERIFIKASI | `config.js:26-31`; tes |
| Provider Anthropic nyata | ADA-TIDAK-TERVERIFIKASI | SDK ^0.27 tidak dijalankan |

### Tahap 4 (MTS 39): literatur dan integritas sitasi

| Deliverable / DoD | Status | Bukti |
|---|---|---|
| Adapter OpenAlex/Crossref/Semantic Scholar | ADA-TIDAK-TERVERIFIKASI | hanya fixture dan klien palsu |
| Search + normalisasi + UI kandidat | ADA-TERVERIFIKASI (fixture) | e2e references 70/70 |
| Verifikasi (verified/partial/unverified/retracted) | ADA-TERVERIFIKASI (fixture) | e2e: DOI palsu unverified, mismatch partial, retracted ditolak |
| Perpustakaan referensi, edit manual menurunkan status, duplikat | ADA-TERVERIFIKASI | e2e: mass assignment diabaikan, PATCH menurunkan ke unverified |
| Renderer sitasi IEEE/APA/Vancouver | **BELUM-ADA** | F-09 |
| Evaluator klaim berlabel keterbatasan | ADA-TERVERIFIKASI (juri palsu) | `claims.js`, benchmark; kualitas LLM nyata TIDAK DIVERIFIKASI |
| Benchmark + laporan | ADA-TERVERIFIKASI | dijalankan: 57/57, fiktif lolos 0 (korpus sendiri) |
| DoD: asal dan waktu pemeriksaan | ADA-TERVERIFIKASI | `verification.provider`, `checkedAt` |
| DoD: sitasi tanpa record verified tidak lolos sebagai sah | ADA-TERVERIFIKASI dengan celah | F-02 (bentuk naratif/bernomor-spasi), F-01 (jalur laporan) |
| DoD: hasil menampilkan keterbatasan cakupan/provider | ADA-TERVERIFIKASI | e2e references |

### Tahap 5 (MTS 40): venue, cek deterministik, kesiapan

| Deliverable / DoD | Status | Bukti |
|---|---|---|
| Skema venue + seed | ADA-TERVERIFIKASI | venues 7 tes; e2e: indeks unik `{slug,version}` |
| 3-5 profil venue TERVERIFIKASI | **BELUM-ADA** | 4 profil, semua `needs_review` (F-B2) |
| Paket cek deterministik | ADA-TERVERIFIKASI | checks 60 tes; e2e reproduksibilitas |
| Evaluator rubrik + bukti kutipan | ADA-TERVERIFIKASI (juri palsu) | e2e: tiap skor berbukti kutipan atau `not_assessed` |
| UI/API laporan | ADA-TERVERIFIKASI (API) | e2e report 41/41 |
| Dataset evaluasi ilmiah + laporan kalibrasi | ADA-TIDAK-TERVERIFIKASI | `docs/eval/rubric-calibration.md` ada, tanpa data nyata |
| DoD: aturan venue bersumber dan bertanggal | **BELUM-ADA** | `checkedAt: null` |
| DoD: deterministik dapat direproduksi | ADA-TERVERIFIKASI | e2e |
| DoD: skor AI dengan rationale dan lokasi benar | ADA-TERVERIFIKASI (juri palsu); rationale tidak disanitasi sitasi (F-01) | |
| DoD: tanpa skor untuk kriteria tanpa bukti | ADA-TERVERIFIKASI | `assess.js:92-111` |
| DoD: formula/threshold/blocker disetujui | **BELUM-ADA** | PROVISIONAL |
| DoD: dapat ditelusuri ke model/prompt/venue/rubrik/versi | ADA-TERVERIFIKASI | e2e keterlacakan |

### Tahap 6 (MTS 41): edit, ekspor, Overleaf

| Deliverable / DoD | Status | Bukti |
|---|---|---|
| Usulan edit API/UI, diff, accept/reject | ADA-TERVERIFIKASI (API) | e2e edits 57/57 |
| DoD: edit tidak diterapkan tanpa persetujuan | ADA-TERVERIFIKASI | `propose` tidak menyentuh naskah (tes) |
| DoD: terima membuat versi baru, konflik aman | ADA-TERVERIFIKASI | e2e, `service.js` CAS |
| BibTeX tanpa tebakan | ADA-TERVERIFIKASI | F-12 |
| Renderer LaTeX per template venue | **BELUM-ADA** (kelas `article` generik, D6-02) | |
| ZIP | ADA-TERVERIFIKASI (struktur) | e2e edits |
| DoD: paket diuji pada >= 1 template venue target (kompilasi) | **BELUM-ADA / TIDAK DIVERIFIKASI** | tanpa TeX dan template resmi |
| Overleaf PoC | ADA-TIDAK-TERVERIFIKASI | hanya unggah manual dijelaskan (D6-03) |
| DoD: unduhan hanya pengguna berhak | ADA-TERVERIFIKASI | e2e IDOR export 404 |

### Tahap 7 (MTS 42): hardening dan produksi

| Item | Status | Bukti |
|---|---|---|
| Hardening (Origin, body, kuota, sesi, forgot-password, hapus akun, retensi, NoSQLi, bundle) | ADA-TERVERIFIKASI | e2e hardening 36/36 |
| Fail-fast env | ADA-TERVERIFIKASI | dijalankan |
| Redis limiter | ADA-TIDAK-TERVERIFIKASI | tanpa Redis |
| Security review menyeluruh | ADA-TERVERIFIKASI (parsial, laporan ini) | F-01..F-06 |
| Backup/restore diuji; rollback diuji; alerting aktif | **BELUM-ADA** | RUNBOOK |
| Privacy/ToS ditinjau; provider contract; kontak insiden | **BELUM-ADA** | draf |
| Kuota/paket dihitung dari biaya | **BELUM-ADA** | COST "BELUM DIUKUR" |
| Beta tertutup | **BELUM-ADA** | |
| DoD: tanpa kebocoran antar-pengguna | ADA-TERVERIFIKASI | F-12 |
| DoD: tanpa sitasi tak terverifikasi lolos pada benchmark rilis | ADA-TERVERIFIKASI (benchmark sintetis) dengan celah F-02 | |
| DoD: acceptance test P0 lulus; Product Owner menandatangani | ADA-TERVERIFIKASI (sebagian) / **BELUM-ADA** (tanda tangan) | |

### Tahap 8 (MTS 43): pasca-MVP

| Item | Status | Bukti |
|---|---|---|
| W2 indikator kemiripan literal + statistik gaya (terbatas) | ADA-TERVERIFIKASI | e2e indicators 20/20; tanpa vonis; tidak disimpan; tidak masuk skor/ekspor |
| Prasyarat "metrik MVP tersedia" | **BELUM-ADA** (dilanggar urutan, F-11) | |
| W1, W3-W10 | BELUM-ADA (sengaja, D8-01) | |

---

## 6. TIDAK DIVERIFIKASI (butuh: ...)

| Butir | Butuh |
|---|---|
| Chat/laporan dengan Claude nyata (stream, tool-use, usage, penagihan) | `ANTHROPIC_API_KEY`, `AI_MODEL_*`, kenaikan SDK dari ^0.27.0 |
| OpenAlex/Crossref/Semantic Scholar nyata (kecocokan metadata, retraction, laju) | akses jaringan, email kontak, kunci opsional |
| Kualitas juri LLM (klaim, rubrik) dan kalibrasi rubrik | dataset berlabel nyata + reviewer akademik |
| Pengiriman email (Gmail OAuth2), login Google | kredensial dan akun uji |
| Midtrans (Snap, webhook sah dari Midtrans, idempotensi di bawah beban) | kunci sandbox |
| HTTPS: cookie `Secure`/`__Secure-`, HSTS efektif | staging dengan TLS (QA-28) |
| Redis limiter, multi-instance, serverless | Redis dan >= 2 instance |
| `TRUST_PROXY=false` e2e | server kedua (tidak dijalankan: aturan satu server di 3100) |
| `npm audit` terkini (F-03) | akses registry npm |
| Cold-start DB mati lalu hidup (QA-04/15 dinamis) | menjalankan DB terpisah |
| Backup/restore, rollback, alerting | `mongodump/mongorestore`, staging, alerting |
| Template venue resmi, kompilasi LaTeX, impor Overleaf | TeX, template berlisensi, akun Overleaf |
| UI di browser (puppeteer 20/20, 17/17, 11/11, kontras QA-21, aksesibilitas) | menjalankan browser/axe |
| Beban/p95, ratusan pengguna | alat uji beban terhadap staging |
| Build bersih dari nol (`npm ci` + `npm run build`) | tidak dijalankan (aturan audit: tanpa build produksi) |
| Akurasi parser pada naskah nyata beragam | 5-10 naskah nyata (MTS 15.2) |
| Kebenaran isi aturan venue terhadap sumber resmi | pemeriksaan manusia atas situs penerbit |
| Penyimpanan Cloudinary lama, kalkulator KUM (fungsi) | akun Cloudinary; data KUM |
| Tinjauan hukum privasi/ToS, perjanjian penyedia AI | penasihat hukum |

---

## 7. Keputusan PROVISIONAL, urut dampak

1. **D5-04 rumus kesiapan** (pita 80/65/45, penalti 5 per fail maks 30, cakupan minimum 50%) dan **D5-03 rubrik/bobot** (7 kriteria, 2/1,5/2/2/1,5/1/1): menentukan label yang dilihat pengguna; belum disetujui PO/reviewer (Gate 5).
2. **D5-01 profil venue** (4 profil, semua `needs_review`, batas usia 180 hari): menahan label "siap".
3. **D4-02/D4-09 ambang verifikasi** (Dice 0,92/0,75, irisan penulis 0,75, tahun +/-1): menentukan apa yang dianggap `verified`; hanya dikalibrasi pada fixture.
4. **D4-08/D4-10 kebijakan deteksi sitasi** (deteksi luas, false positive diterima, batasan naratif): menentukan kebocoran sitasi (F-02).
5. **D0-07 kuota/harga** (`QUOTA_*` default dan harga di kode 99.000/990.000/2.500.000) dan **D3-03 aturan penagihan** (cache read 10%, pembatalan ditagih) dan **D3-08** (retry setelah putus dapat ditagih dua kali): dampak finansial langsung.
6. **D3-02 batas agen** (8 iterasi, 12 tool, 90 dtk, 4096/60000 token) dan **D5-05 token pra-kuota 30.000**.
7. **D0-08/D7-01 retensi** (opt-in per proyek, tenggang 7 hari; `UsageLedger` dan `Payment` dipertahankan): dampak privasi.
8. **D6-01/D6-02 batas edit** (20 pending, 30.000 karakter) dan ekspor tanpa template venue.
9. **D8-01 indikator kemiripan** (shingle 6 kata, passage 10 kata) dan **D4-05** evaluator klaim berbasis abstrak.
10. **D0-01..D0-06, D0-09** asumsi awal (persona, Markdown/LaTeX saja, tanpa object storage, verifikasi email default false di dev).

---

## 8. Lima temuan terburuk dan lima klaim PASS terpenting (resep reproduksi)

Awalan umum: `cd "C:/Users/maski/Documents/CODING/Publication Prepare"`. Di PowerShell/Bash Windows, hindari menulis `\\` di dalam argumen `-e`; skrip di bawah memakai `String.fromCharCode(92)` untuk garis miring terbalik.

### 5 temuan terburuk

**1. F-01, rationale/suggestions laporan tidak disanitasi sitasi.**
```
node -e "
const R='packages/';const BS=String.fromCharCode(92);
const {assessCriterion}=require('./'+R+'checks/src/assess.js');
const {parseManuscript}=require('./'+R+'manuscript');
const src='# T\n\n## Methodology\n'+'Metode eksperimen kami menggunakan dataset lengkap dan prosedur validasi silang sepuluh lipatan. Praproses mencakup normalisasi, penghapusan duplikat, dan pembagian data acak berstrata dengan benih tetap. '.repeat(3)+'\n';
const parse=parseManuscript(src,'markdown');
const c={id:'methodology',label:'Metodologi',source:'model',weight:2,sections:['methodology']};
const judge=async()=>({score:3,rationale:'Metode jelas; lihat juga Zhang et al. (2022) dan doi:10.1234/fake.99 untuk validasi silang.',evidence:[{quote:'Metode eksperimen kami menggunakan dataset lengkap'}],suggestions:['Bandingkan dengan (Fiction, 2020).']});
assessCriterion({c,source:src,parse,judge}).then(r=>console.log(r.status,r.rationale,r.suggestions))"
```
Hasil yang saya lihat: `assessed`, rationale dan saran memuat sitasi karangan tanpa penanda. (Skrip lengkap: `SP/rep.js`.)

**2. F-02, bentuk sitasi yang lolos validator (chat dan gerbang edit).**
```
node -e "
const {sanitizeCitations}=require('./packages/literature');
const refs=[{citeKey:'vaswani2017attention',title:'Attention Is All You Need Revisited Thoroughly',year:2017,authors:[{family:'Vaswani'},{family:'Shazeer'}],doi:'10.99999/abc.1',verification:{status:'verified'}}];
for (const t of ['Per Ghost 2021, x','as in [ 7 ] and [7a]','Ghost [2021]','Menurut Ghost dan Fiction pada 2021 hasilnya baik','(Fabricated, 2021)'])console.log(JSON.stringify(t),'->',JSON.stringify(sanitizeCitations(t,refs).text))"
```
Empat pertama tidak berubah (lolos), yang terakhir diganti `[referensi belum terverifikasi]`. Gerbang edit: `node "C:/Users/maski/AppData/Local/Temp/claude/c--Users-maski-Documents-CODING-Publication-Prepare/677d69ad-38b3-4841-a16d-911098d09216/scratchpad/qa-final/edit_adv.js"` (baris `narrative no paren` dan `spaced numeric` = ACCEPTED(pending)).

**3. F-B1/F-B2, Gate 7 dan venue belum memenuhi syarat.**
```
grep -n "BELUM DIUJI" docs/ops/RUNBOOK.md
grep -n "ISI" docs/ops/RUNBOOK.md apps/web/app/privacy/page.jsx
grep -c "needs_review" packages/venues/data/*.json
grep -niE "setuju|persetujuan|privacy|terms" apps/web/components/auth/RegisterForm.jsx   # kosong
```

**4. F-04, parser menahan CPU 4,7-6 detik pada masukan sah.**
```
node -e "const {parseManuscript}=require('./packages/manuscript');for(const n of [100000,200000,250000]){const s='# x\n'.repeat(n);const t=Date.now();parseManuscript(s,'markdown');console.log(n,s.length+'B',Date.now()-t,'ms')}"
```

**5. F-05, rute analisis lama melewati kendali integritas.**
```
sed -n 18,75p apps/web/app/api/analyses/route.js     # Object.assign(analysis, result); details: err.message
sed -n 14,44p packages/ai/index.js                    # model keras, tanpa guard/sanitizer
grep -n "LEGACY_ROUTES_ENABLED" apps/web/app/api/manuscripts/route.js
```

### 5 klaim PASS terpenting

**1. Tes: 368 lulus, 0 gagal.**
```
npm test            # dari root; lalu untuk workspace yang keluarannya terpotong:
for w in ai checks core; do (cd packages/$w && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail|skipped)"); done
```
Harapan: ai 63, checks 60, core 42, db 4, edits 21, export 17, indicators 11, literature 99, mailer 1, manuscript 43, venues 7. Tes tidak dilemahkan: `git diff -U0 5130dc6 HEAD -- 'packages/*/test/*.js' | grep -E "^-[^-]"` hanya menampilkan refactor `makeEnv` dan satu baris e-mail uji.

**2. Isolasi antar-pengguna.** Mulai server (Bash):
```
cd apps/web && SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") \
MONGODB_URI=mongodb://127.0.0.1:27017/qa_repro NEXTAUTH_SECRET=$SECRET NEXTAUTH_URL=http://localhost:3100 BASE_URL=http://localhost:3100 \
AI_PROVIDER=fake AI_ALLOW_FAKE=true AI_MODEL_CHAT=demo-model AI_MODEL_REPORT=demo-model LITERATURE_PROVIDERS=fixture LITERATURE_ALLOW_FIXTURE=true TRUST_PROXY=true \
npx next start -p 3100 &
cd .. && BASE_URL=http://localhost:3100 MONGODB_URI=mongodb://127.0.0.1:27017/qa_repro node "C:/Users/maski/AppData/Local/Temp/claude/c--Users-maski-Documents-CODING-Publication-Prepare/677d69ad-38b3-4841-a16d-911098d09216/scratchpad/qa-final/idor.js"
```
Harapan: semua baris B-terhadap-A 404 (satu 400 pada chat karena skrip memakai badan lama; `idor2.js` memakai `content` dan menghasilkan 404). Alternatif repo: `scripts/e2e/edits.js`, `chat.js`, `references.js`, `report.js`. Penting: **restart server di antara skrip e2e** (F-14).

**3. Webhook menolak signature palsu.** Dengan server di atas ditambah `MIDTRANS_SERVER_KEY=dummy-audit-key`:
`BASE_URL=http://localhost:3100 MONGODB_URI=... E2E_MIDTRANS_KEY=dummy-audit-key node scripts/e2e/webhook.js` -> `TOTAL 9/9 PASS`. (Tanpa `E2E_MIDTRANS_KEY` yang cocok, 4 pemeriksaan gagal karena kunci uji berbeda; itu salah konfigurasi uji, bukan cacat.)

**4. Fail-fast env.**
```
cd apps/web && MONGODB_URI=mongodb://127.0.0.1:27017/x NEXTAUTH_SECRET= NEXTAUTH_URL=http://localhost:3100 TRUST_PROXY=true AI_PROVIDER=fake npx next start -p 3100
```
Harapan: `[config] NEXTAUTH_SECRET belum diisi`, `[config] AI_PROVIDER=fake di produksi membutuhkan AI_ALLOW_FAKE=true`, proses keluar 1.

**5. BibTeX dan gerbang edit hanya menerima referensi terverifikasi.** `node "C:/Users/maski/AppData/Local/Temp/claude/c--Users-maski-Documents-CODING-Publication-Prepare/677d69ad-38b3-4841-a16d-911098d09216/scratchpad/qa-final/adv.js"` (bagian "BibTeX adversarial": `included [ 'ok1', 'vv' ]`, `unverified`/`partial`/tanpa-status/kunci berisi koma dikecualikan, `validate []`) dan `node .../edit_adv.js` (sitasi karangan `REJECTED CITATION_NOT_VERIFIED`).

Tambahan yang juga PASS: log bersih (`cat server*.log | grep -c "Passw0rd\|@e2e.test\|Isi abstrak"` = 0), bundle klien tanpa rahasia (`grep -rlE "NEXTAUTH_SECRET|MONGODB_URI|ANTHROPIC_API_KEY|MIDTRANS_SERVER_KEY" apps/web/.next/static` kosong), e2e hardening 36/36 setelah restart server.

---

## 9. Ringkasan jujur

**Yang benar-benar berfungsi (dibuktikan dengan eksekusi):** fondasi akun dan proyek; isolasi data antar-pengguna di semua rute proyek; penguncian webhook, cek Origin, batas body byte, pencabutan sesi, hapus akun, retensi, fail-fast env; pipeline chat/literatur/laporan/edit/ekspor/indikator terhadap server nyata dan MongoDB nyata; ekspor BibTeX hanya dari referensi terverifikasi tanpa injeksi; gerbang edit dan sanitizer chat menolak mayoritas bentuk sitasi karangan; 368 tes unit lulus tanpa pelemahan tes; log dan bundle klien bersih.

**Yang hanya lulus dengan provider palsu/fixture:** seluruh perilaku AI (agen, juri klaim, penilai rubrik) dan seluruh verifikasi literatur. Angka "57/57, fiktif lolos 0", "e2e 44/44", "70/70" mengukur logika server terhadap data sintetis yang ditulis tim yang sama; itu bukti kuat bahwa pagar server bekerja, bukan bukti bahwa Claude, OpenAlex, atau Crossref berperilaku sesuai asumsi.

**Yang berisiko:** (1) integritas sitasi bersifat pola dan memiliki celah yang terbukti (F-02) serta satu jalur keluaran model yang tidak dijaga (F-01); (2) venue dan rumus kesiapan belum diverifikasi manusia, jadi hasil laporan harus selalu dibaca sebagai bantuan PROVISIONAL; (3) kesiapan operasional dan hukum untuk rilis tidak ada (restore, alert, kontak insiden, tinjauan hukum, consent, biaya terukur, beta); (4) dependensi dengan kerentanan yang diketahui (next 14.2.35) tidak berubah; (5) parser dapat menahan satu proses beberapa detik; (6) rute lama masih membawa risiko yang tidak sejalan dengan arsitektur baru; (7) bukti e2e tidak otomatis dan mudah dibaca keliru bila dijalankan beruntun. Rekomendasi: P1 boleh dilanjutkan sebagai lingkungan pengembangan/staging dengan label yang ada; P2 ditunda sampai F-B1..F-B3, F-01, F-02, F-03 selesai dan audit diulang terhadap provider nyata.

## 10. QC silang (auditor kedua) dan tindak lanjut

Auditor kedua (agen terpisah, hanya baca) menjalankan ulang 10 resep bagian 8 pada port dan database sendiri:

| Butir | Hasil QC silang |
|---|---|
| F-01 rationale/suggestions tidak disanitasi | REPRODUCED |
| F-02 bentuk sitasi lolos penyaring (`Per Ghost 2021`, `[ 7 ]`, `[7a]`, `Ghost [2021]`) dan gerbang edit menerima `Zhang 2022`, `[ 3 ]` | REPRODUCED |
| F-B1/B2 syarat Gate 7 dan profil venue belum terpenuhi | REPRODUCED |
| F-04 CPU parser | PARTIAL: perilaku terkonfirmasi, angka lebih kecil (100k baris 1,7 dtk; 200k 3,5 dtk; 250k/1 MB 4,0 dtk) dibanding klaim 4,7-6 dtk (bergantung mesin) |
| F-05 rute analisis lama | REPRODUCED dengan nuansa: rute `analyses` TIDAK dijaga flag lama; hanya terjangkau lewat naskah lama yang sudah ada |
| PASS: isolasi pengguna, webhook 9/9, fail-fast env (exit 1), BibTeX dan gerbang edit | REPRODUCED |
| PASS: "368 tes lulus, 0 gagal" | NOT REPRODUCED sepenuhnya: jumlah 368 benar, tetapi satu uji waktu (T8-01) gagal 3 dari 3 pada mesin auditor (307-450 ms) |
| Tidak ada asersi tes yang dihapus (tahap 3-8) | CONFIRMED (hanya refactor `makeEnv` dan satu baris pembuatan email di e2e/lib.js; perintah yang dikutip laporan harus per-commit, bukan `git diff` tunggal) |

Dampak pada verdict: **P1 SIAP DENGAN SYARAT dan P2 BELUM SIAP dinyatakan didukung** oleh auditor kedua.

Tindak lanjut yang dikerjakan setelah QC silang (test-first, lihat commit berikutnya):
- **F-01 DIPERBAIKI**: `rationale` dan `suggestions` penilai AI melewati `sanitizeCitations` terhadap referensi proyek (fail-closed; penanda + `citationFlags`); tes `qc5.test.js` F-01/F-01b.
- **F-05 DIPERBAIKI**: `POST /api/analyses` dikembalikan 410 kecuali `LEGACY_ROUTES_ENABLED=true`; e2e `hardening.js`.
- **Uji T8-01 diperkuat terhadap beban CPU**: batas 300 ms ditegakkan pada waktu terbaik dari 3 percobaan (implementasi kuadratik tetap gagal).
- **Koreksi angka laporan**: F-04 ~3,5-4 dtk pada mesin auditor kedua (bukan 4,7-6 dtk); klaim "368 lulus, 0 gagal" berlaku setelah perbaikan uji waktu di atas.
- **MASIH TERBUKA** (tidak diperbaiki): F-02 (penyaring sitasi berbasis pola; bentuk di atas tetap lolos, diakui D4-10), F-03 (`npm audit`/versi Next), CPU parser, QA-19, dan seluruh syarat Gate 7 non-kode (restore/rollback/alert, tinjauan hukum, biaya terukur, beta, persetujuan Product Owner/reviewer akademik atas profil venue dan rumus).
