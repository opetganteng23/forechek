# Laporan QA/QC Independen: Publication Prepare (Tahap 1-2)

- Tanggal audit: 2026-11-16
- Lingkup: kode Tahap 1 (fondasi + auth) dan Tahap 2 (proyek, versi naskah, parser, UI workspace), plus rute/model lama yang masih ada.
- Acuan: `Master Technical Specification.md`, `MTS Publication Prepare v3.0 - Complete Phased Blueprint.md` (backlog P0/P1/P2 di Bagian 31, gate di Bagian 42), `docs/`.
- Sifat: audit saja. Tidak ada kode aplikasi yang diubah. Berkas yang dibuat: laporan ini. Skrip uji sementara ada di folder scratchpad di luar repo.
- Lingkungan uji: Windows 11, Node 24.18, npm 11.16, MongoDB in-memory (mongodb-memory-server 8.2.6, standalone), Next.js 14.2.35 mode `next start` (produksi) kecuali disebut lain, Chrome terpasang dikendalikan puppeteer-core. Tidak ada kredensial produksi yang dipakai. `.env.local` hanya diperiksa nama variabelnya.

---

## 1. Verdict

### P1 "Siap dijalankan": **SIAP DENGAN SYARAT**

Dari folder bersih, `npm ci`, `npm test` (core 25, manuscript 35, mailer 1: semua lulus), dan `npm run build` (28 halaman, tanpa error atau peringatan) berhasil. Server produksi berjalan, dan alur auth, proyek, versi, parser, dan UI (37 dari 38 butir browser) bekerja. Konkurensi simpan versi terbukti benar (50 dari 50 ronde tepat satu pemenang). Syaratnya: (1) MongoDB harus sudah hidup saat server pertama kali menerima permintaan DB, karena kegagalan koneksi pertama bersifat permanen sampai proses di-restart (QA-04); (2) variabel wajib harus diisi karena tidak ada validasi saat boot (QA-16); (3) jangan menyalakan rute pembayaran lama tanpa `MIDTRANS_SERVER_KEY` (QA-01); (4) tidak ada gerbang lint (QA-20); (5) pengiriman email nyata dan login Google belum teruji (lihat bagian 6).

### P2 "Siap dirilis ke pengguna": **BELUM SIAP**

Enam fitur P0 inti MTS belum ada: chat agen streaming, tool literatur dan validator sitasi, profil venue, laporan kesiapan, ekspor LaTeX/BibTeX/Overleaf, dan jejak penggunaan AI (bagian 5). Itu saja sudah cukup untuk memutus rilis. Tambahan yang menghalangi rilis publik: webhook pembayaran dapat dipalsukan bila kunci Midtrans kosong (QA-01), tidak ada kebijakan privasi, persetujuan, atau penghapusan akun (QA-03, QA-09), serta tidak ada staging, error tracking, alerting, dan restore belum pernah diuji (QA-08). Tahap 1-2 sendiri bagus sebagai fondasi: isolasi antar-pengguna, CAS versi, hash token, dan redaksi log terbukti. Gate 1 dan 2 secara teknis layak, tetapi bukan produk yang boleh dirilis.

---

## 2. Daftar isi env

Sumber: `grep process.env` di `apps/`, `packages/`, `scripts/` (tanpa `node_modules`/`.next`), dibandingkan dengan `.env.example`. "Wajib" berarti tanpa itu fitur Tahap 1-2 yang sudah ada tidak berfungsi. Nilai rahasia tidak pernah ditampilkan.

| Variabel | Status | Fungsi | Dipakai di | Cara membuat |
|---|---|---|---|---|
| `MONGODB_URI` | WAJIB | Koneksi database | `packages/db/connection.js:3` | Atlas atau MongoDB lokal. Pakai database terpisah per lingkungan. |
| `NEXTAUTH_SECRET` | WAJIB | Penanda tangan JWT sesi | `apps/web/lib/auth.js:~110` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `NEXTAUTH_URL` | WAJIB (produksi) | URL dasar callback next-auth | next-auth | URL publik aplikasi, mis. `https://domain.com` |
| `BASE_URL` | WAJIB bila email dipakai | Tautan di email verifikasi/reset | `packages/mailer/index.js:24,43` | URL publik. Bila kosong, tautan menjadi `undefined/verify-email?...` (QA-29). |
| `REQUIRE_EMAIL_VERIFICATION` | OPSIONAL, default `false` | Menolak login sebelum email terverifikasi | `packages/core/src/config.js` | `true` di staging/produksi setelah mailer terbukti jalan |
| `GMAIL_USER`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` | WAJIB bila verifikasi email/reset aktif | Kirim email lewat Gmail OAuth2 | `packages/mailer/index.js` | Google Cloud Console (OAuth client) lalu refresh token lewat OAuth Playground |
| `GMAIL_ACCESS_TOKEN` | OPSIONAL | Access token awal (kadaluarsa cepat; refresh token cukup) | `packages/mailer/index.js` | Tidak perlu diisi manual |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | OPSIONAL (hanya login Google) | Provider Google | `apps/web/lib/auth.js` | Google Cloud Console; redirect URI `<BASE_URL>/api/auth/callback/google` |
| `ANTHROPIC_API_KEY` | Tahap 3 / rute lama `analyses` | Panggilan Claude | `packages/ai/index.js` | console.anthropic.com |
| `AI_MODEL_CHAT`, `AI_MODEL_REPORT`, `AI_MODEL_LIGHT` | Tahap 3 | Nama model dari config (MTS P7) | belum dipakai kode | Isi nama model dari dokumentasi Anthropic |
| `QUOTA_*` (6 variabel) | OPSIONAL, ada default sementara | Batas token/pesan per paket | `core/src/config.js` (`loadConfig`); belum dipakai alur kuota | Tetapkan setelah biaya per sesi terukur (MTS 13) |
| `CLOUDINARY_CLOUD_NAME`, `_API_KEY`, `_API_SECRET` | Rute lama `manuscripts` saja | Unggah PDF/DOCX lama | `apps/web/app/api/manuscripts/**` | Dashboard Cloudinary |
| `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY` | WAJIB bila `payments` aktif; tanpa fail-fast | Pembayaran dan verifikasi signature webhook | `apps/web/app/api/payments/*` | Dashboard Midtrans (sandbox dulu). Bila kosong: webhook bisa dipalsukan (QA-01). |
| `MIDTRANS_IS_PRODUCTION` | OPSIONAL, default aman (`false`) | Sandbox vs produksi | `payments/create` | `true` hanya di produksi |
| `NODE_ENV` | Diset Next | Mode | `core/src/config.js` | Otomatis |

Dipakai di kode tetapi tidak ada di `.env.example`: `AUTH_SECRET` dan `NEXTAUTH_URL_INTERNAL` (dibaca next-auth, aliasnya), `VERCEL`/`VERCEL_URL` (platform), `DEBUG`, serta variabel internal Next/Cloudinary/Ethereal. Tidak ada yang berbahaya. Ada di `.env.example` tetapi belum dipakai kode: `AI_MODEL_*`, `QUOTA_*` (selain `loadConfig`).

Default berbahaya: `REQUIRE_EMAIL_VERIFICATION=false` (aman untuk dev, tidak untuk produksi); `MIDTRANS_SERVER_KEY` kosong membuat signature dihitung dengan string `"undefined"` (QA-01).

Perilaku saat hilang (diuji, mode produksi, `NEXTAUTH_SECRET`, `MONGODB_URI`, `NEXTAUTH_URL` dikosongkan): server tetap menyala. `/api/health` 503, `/api/auth/me` 500, `/login` 500, `/dashboard` 500. Log menyebut `NO_SECRET`. Jadi **tidak fail-fast** (QA-16). Fungsi `assertEnv`/`missingVars` di `packages/core/src/config.js` ada dan teruji tetapi tidak dipanggil aplikasi.

Git: `.env.local` tercakup `.gitignore` (`apps/*/.env.local`, `.env`, `.env.local`); `git ls-files | grep env` hanya `.env.example`; pemindaian pola kunci di seluruh riwayat git dan working tree hanya menemukan placeholder (`GOCSPX-xxxxxxxxxx`, `sk-ant-xxxxxxxxxxxxxxxxxx`) dan fixture tes. Tidak ada rahasia ter-commit.

---

## 3. Tabel 13 area

Format temuan: B=BLOCKER, T=TINGGI, S=SEDANG, R=RENDAH.

| # | Area | Status | Ringkasan | B/T/S/R |
|---|---|---|---|---|
| 1 | Build & tes | LULUS, lint GAGAL | `npm ci` bersih, tes 25+35+1 lulus, build 28/28 tanpa peringatan, halaman utama 96,2 kB first load, bundle klien tanpa `crypto`/`Buffer.from`/`createHash`. `npm run lint` gagal karena tidak ada konfigurasi ESLint. | 0/0/1/0 |
| 2 | Konfigurasi & env | LULUS bersyarat | Tidak ada rahasia ter-commit. Variabel hilang tidak fail-fast. `BASE_URL` kosong merusak tautan email. | 0/0/1/1 |
| 3 | Keamanan aplikasi | GAGAL (bersyarat) | Isolasi, NoSQL injection, XSS, hash token, batas password 72 byte, header dasar lulus. Webhook bisa dipalsukan bila kunci kosong, rate limit bisa dilewati lewat `X-Forwarded-For`, 9 kerentanan dependensi, tanpa pemeriksaan Origin, sesi tidak dicabut. | 1/3/4/3 |
| 4 | Integritas data & konkurensi | LULUS dengan temuan | 50 dari 50 ronde paralel benar, indeks unik terbentuk, hapus proyek menghapus versi, 0 yatim dari 24 balapan hapus-vs-simpan. Kuota 50 proyek bisa dilampaui secara paralel. Kegagalan di tengah simpan hanya teruji lewat tes unit. | 0/0/1/0 |
| 5 | Fungsional API | LULUS dengan temuan | Semua rute auth dan projects benar, envelope dan `x-request-id` konsisten. Rute lama mengembalikan 500 tanpa envelope. | 0/0/1/1 |
| 6 | Fungsional UI | LULUS (37/38) | Alur penuh, konflik dua tab, `beforeunload`, mobile 375px tanpa overflow, XSS aman. Satu butir TIDAK DIVERIFIKASI (clipboard). Dua tautan Navbar 404, kontras kurang. | 0/0/0/4 |
| 7 | Parser & logika inti | Performa LULUS, akurasi sebagian | 1 MB diparse maksimum 88 ms, tanpa ReDoS. Naskah valid 1 MB dengan ratusan ribu heading menghasilkan 500. Beberapa false negative/positive pada format Indonesia dan Springer. | 0/0/2/0 |
| 8 | Performa & skalabilitas | LULUS | p50 15 ms, p95 27 ms untuk `/api/auth/me`; simpan 1 MB 44 ms; indeks dipakai (IXSCAN). Rate limit in-memory tidak berlaku lintas instance (dicatat di QA-05). | 0/0/0/0 |
| 9 | Operasional & deploy | GAGAL sebagian | Log terstruktur dan redaksi baik, `/api/health` ada. Koneksi DB tidak pulih setelah gagal pertama, request menggantung 30 detik saat DB mati, tidak ada staging, error tracking, alerting; restore belum teruji. | 0/2/1/0 |
| 10 | Privasi & kepatuhan | GAGAL | Log bersih dari isi naskah. Tidak ada kebijakan privasi, persetujuan, penghapusan akun, atau retensi otomatis. | 1/1/0/0 |
| 11 | Kesesuaian MTS (P2) | GAGAL | Fitur P0 inti belum ada (bagian 5). | 1/0/0/0 |
| 12 | Dokumentasi | LULUS bersyarat | Langkah README bisa diikuti di folder bersih. README usang. | 0/0/0/1 |
| 13 | Keputusan terbuka | MEMBLOKIR rilis | Retensi (D0-08), biaya dan harga (D0-07), rumus kesiapan, daftar venue (D0-05). | (daftar di bagian 7) |

Total: BLOCKER 3, TINGGI 6, SEDANG 11, RENDAH 10, INFO 6.

---

## 4. Daftar temuan

Perintah uji sementara ada di scratchpad (`sec.js`, `integ.js`, `dbdown.js`, `big.js`, `parser_audit.js`, `forge.js`, `pp/ui.js`, `pp/ui2.js`). Keluaran yang dikutip adalah keluaran nyata.

### BLOCKER

**QA-01 | B | Area 3 | Webhook Midtrans dapat dipalsukan bila `MIDTRANS_SERVER_KEY` tidak diisi, sehingga akun gratis menjadi Pro**
- Bukti: [webhook/route.js:6-7](apps/web/app/api/payments/webhook/route.js#L6-L7) menghitung signature dari `${order_id}${status_code}${gross_amount}${process.env.MIDTRANS_SERVER_KEY}` tanpa memeriksa variabel ada. [payments/create/route.js:24-40](apps/web/app/api/payments/create/route.js#L24-L40) menyimpan `Payment` pending (dengan `gatewayOrderId = PUB-<userId>-<ts>`) sebelum memanggil Midtrans, jadi pemilik akun mengetahui `order_id`-nya. Uji lokal (`forge.js`, kunci kosong): `plan before: {"plan":"free",...}` lalu `forged webhook -> 200 {"received":true}` lalu `plan after: {"plan":"pro","isActive":true,...,"endDate":"2027-11-15..."}`, `payment status: paid`. Signature dengan nilai salah ditolak 401. Catatan: Payment pending disisipkan langsung ke DB (setara efek `create` sebelum panggilan eksternal) agar tidak memanggil layanan Midtrans.
- Dampak: bila deploy lupa mengisi kunci, siapa pun yang login bisa mengaktifkan paket berbayar setahun secara gratis. Tidak ada fail-fast (QA-16). Dengan kunci terisi, signature sah dan serangan ini tidak berlaku (tidak diuji: tidak ada kunci sandbox).
- Saran terkecil: tolak webhook dengan 500/503 bila `MIDTRANS_SERVER_KEY` kosong, dan bandingkan signature dengan `crypto.timingSafeEqual`. Pertimbangkan juga mencocokkan `gross_amount` dengan `payment.amount`.

**QA-02 | B (P2) | Area 11 | Fitur P0 inti MTS belum ada**
- Bukti: `ls packages` = `ai config core db mailer manuscript`. Tidak ada `literature`, `venues`, `checks`, `export`. Tidak ada rute chat/referensi/venue/laporan/ekspor/ai-usage di `apps/web/app/api` (lihat bagian 5).
- Dampak: produk belum memenuhi tujuan MTS (referensi tidak dihalusinasi, aturan venue, laporan kesiapan, ekspor). Tidak boleh dinyatakan siap rilis.
- Saran terkecil: kerjakan Tahap 3 sampai 6 sesuai urutan blueprint. Tidak ada jalan pintas.

**QA-03 | B (P2) | Area 10 | Tidak ada kebijakan privasi, ToS, persetujuan, atau penghapusan akun**
- Bukti: `grep -rniE "privasi|privacy|syarat|terms|hapus akun|delete account|consent|persetujuan" apps/web/app apps/web/components` tidak menghasilkan berkas. Tidak ada rute hapus akun. Gate 7 (Blueprint 42.4) mensyaratkan "Privacy Policy dan Terms of Service ditinjau".
- Dampak: menyimpan naskah pengguna (data sensitif, MTS P5) tanpa dasar persetujuan dan jalur hapus data.
- Saran terkecil: tulis kebijakan privasi dan ToS (butuh keputusan legal/produk), halaman statis dengan tautan di footer dan form daftar, dan endpoint hapus akun yang menghapus proyek dan versi.

### TINGGI

**QA-04 | T | Area 9 | Koneksi DB tidak pulih bila percobaan pertama gagal (promise ter-cache tertolak)**
- Bukti: [connection.js:18-24](packages/db/connection.js#L18-L24): `cached.promise` diisi sekali dan tidak pernah direset saat `mongoose.connect` ditolak. Uji (`dbdown.js`): server dinyalakan saat DB mati, DB lalu dinyalakan; tiga pengecekan berturut-turut tetap `health 503 degraded` dan `register 500` dengan `ms: 9`, `10`, `10` (gagal instan), log `MongooseServerSelectionError ... ECONNREFUSED`. Kontras: server yang sudah pernah terhubung pulih normal setelah DB kembali (`DB-BACK health 200`, register 201).
- Dampak: satu kedipan DB saat cold start (serverless/Vercel) membuat instance itu rusak permanen sampai diganti.
- Saran terkecil: reset `cached.promise = null` pada `.catch` sebelum melempar ulang.

**QA-05 | T | Area 3 | Rate limit register/login dapat dilewati dengan `X-Forwarded-For` palsu; limiter hanya per proses**
- Bukti: [api.js:22-23](apps/web/lib/api.js#L22-L23) dan [auth.js:25](apps/web/lib/auth.js#L25) memercayai header pertama. Uji: 8 register dengan `X-Forwarded-For` berbeda semuanya `201` (batas 5/jam/IP); 7 register dengan header sama: `201 ×5, 429 ×2`. Tanpa header, semua pengguna berbagi bucket `unknown`. Limiter in-memory ([rateLimit.js](packages/core/src/rateLimit.js)) tidak dibagi antar instance.
- Dampak: pendaftaran massal dan brute-force login lebih mudah bila tidak di belakang proxy yang menimpa header; di multi-instance batas efektif dikalikan jumlah instance. Login juga dibatasi per email, sehingga brute-force satu akun tetap tertahan.
- Saran terkecil: dokumentasikan keharusan proxy yang menimpa header (komentar sudah ada di kode); untuk produksi multi-instance ganti store dengan Redis/Upstash.

**QA-06 | T | Area 3 | `npm audit`: 9 kerentanan (1 critical, 7 high, 1 moderate)**
- Bukti: `npm audit --json`: `{'moderate': 1, 'high': 7, 'critical': 1, 'total': 9}`. Langsung: `next` 14.2.35 (critical; advisory DoS Image Optimizer dan deserialisasi RSC; `fixAvailable` hanya `16.4.6`, major), `mongoose` 8.24.3 (high; `fixAvailable: True`), `nodemailer` 9.0.5 (high; `fixAvailable: True`). Transitif: `axios`, `follow-redirects`, `postcss`, `@xmldom/xmldom`, `source-map-js`. `grep next/image|images:` tidak menemukan pemakaian Image Optimizer.
- Dampak: keterpaparan nyata TIDAK DIVERIFIKASI (saya tidak mengeksploitasi). `fix` tidak dijalankan sesuai aturan.
- Saran terkecil: naikkan `mongoose` dan `nodemailer` (non-major), rencanakan migrasi Next ke versi yang diperbaiki, dan tambahkan `npm audit --audit-level=high` ke CI sebagai pemberitahuan.

**QA-07 | T | Area 3 | Rute lama unggah naskah: Cloudinary publik, tanpa batas ukuran, `err.message` bocor**
- Bukti: [manuscripts/route.js:61](apps/web/app/api/manuscripts/route.js#L61) `upload_stream({ resource_type: 'raw', folder: 'manuscripts' })` tanpa `type: 'private'/'authenticated'`; `secure_url` disimpan dan dikembalikan (baris 74). `request.formData()` tanpa batas ukuran. Baris 52 dan 67 mengembalikan `details: err.message`. Bertentangan dengan MTS 14 ("hanya pemilik proyek yang dapat mengakses") dan MTS P5.
- Dampak: berkas naskah di Cloudinary dapat diakses siapa pun yang memegang URL; memori server dapat dihabiskan dengan unggahan besar. Tidak diuji dinamis (tidak ada akun Cloudinary): TIDAK DIVERIFIKASI untuk perilaku akses.
- Saran terkecil: nonaktifkan rute ini sampai dipensiunkan (MTS 19), atau tambahkan batas ukuran dan unggah dengan `type: 'authenticated'`.

**QA-08 | T | Area 9 | Tidak ada staging, error tracking, alerting, rollback; restore belum teruji**
- Bukti: `docs/runbooks/backup-restore.md` baris 3: "Status: BELUM DIUJI". `which mongodump mongorestore` tidak ditemukan di mesin ini sehingga uji restore tidak bisa saya lakukan. Tidak ada konfigurasi Sentry/APM/alert di repo. CI ([ci.yml](.github/workflows/ci.yml)) hanya `npm ci`, test, build (tanpa lint, tanpa audit). Blueprint 31 P1 dan 42.4 mensyaratkan semuanya.
- Dampak: kegagalan produksi tidak terdeteksi dan data tidak terbukti dapat dipulihkan.
- Saran terkecil: siapkan staging Atlas, jalankan `mongodump`/`mongorestore` sekali sesuai runbook dan catat hasilnya, pasang error tracker.

**QA-09 | T | Area 10 | Retensi otomatis dan penghapusan akun belum ada**
- Bukti: [Project.js:17-18](packages/db/models/Project.js#L17-L18) punya `retentionDays` dan `retentionExpiresAt`, tetapi tidak ada pekerja yang memakainya; `docs/decisions/decision-log.md` D0-10 menunda ke Tahap 7. Hanya hapus proyek yang diuji dan berfungsi (versi ikut terhapus, `versions left: 0`).
- Dampak: naskah tersimpan tanpa batas waktu; MTS 14 mensyaratkan penghapusan otomatis dan P1 "retensi dan penghapusan end-to-end".
- Saran terkecil: tetapkan default retensi (D0-08), lalu buat pekerja terjadwal sederhana.

### SEDANG

**QA-10 | S | Area 4 | Batas 50 proyek aktif dapat dilampaui lewat permintaan paralel**
- Bukti: [service.js:57-58,92-93](packages/manuscript/src/service.js#L57-L58) hitung lalu simpan tanpa atomisitas. Uji (`integ.js`): 49 proyek + 5 POST paralel menghasilkan `["201","201","201","201","201"]` dan `active count after race 54`. Permintaan berurutan di atas batas: `403 QUOTA_EXCEEDED`.
- Dampak: bypass kuota ringan (dibatasi rate limit 20/menit); bukan kebocoran data.
- Saran terkecil: terima dan catat sebagai batas lunak, atau gunakan penghitung atomik di `users`.

**QA-11 | S | Area 3 | Batas ukuran JSON hanya lewat header `Content-Length`**
- Bukti: [api.js:41](apps/web/lib/api.js#L41). Uji: body 8 MB dikirim chunked tanpa `Content-Length` menghasilkan `S1 8MB chunked body ... {"status":201,"created":true}` (batas 1 MB, 2,5 MB untuk versi).
- Dampak: batas ukuran dapat dilewati untuk rute JSON; Next/hosting mungkin punya batas sendiri (TIDAK DIVERIFIKASI).
- Saran terkecil: baca `request.text()` dan periksa panjangnya sebelum `JSON.parse`.

**QA-12 | S | Area 7 | Naskah valid (1 MB) dengan ratusan ribu heading menghasilkan 500**
- Bukti: [parser.js:340](packages/manuscript/src/parser.js#L340) `Math.min(...levels)`. Uji (`big.js`): 100 ribu heading (500.000 B) `201`; 200 ribu heading (1.000.000 B) dan 250 ribu `# x` keduanya `500 INTERNAL_ERROR`; log `RangeError: Maximum call stack size exceeded`. Revisi proyek tidak berubah (`revisionBefore 2, revisionAfter 2`).
- Dampak: 500 untuk masukan yang lolos validasi ukuran; tidak merusak data. Di browser parse klien tertangkap `try/catch` sehingga panel struktur kosong.
- Saran terkecil: ganti dengan `levels.reduce`/loop untuk minimum.

**QA-13 | S | Area 3 | Enumerasi akun lewat waktu respons `forgot-password`**
- Bukti: pesan sama, tetapi waktu berbeda: email terdaftar `1429 ms` (dua kali), tidak terdaftar `6 ms` dan `13 ms`. Penyebab: [forgot-password/route.js:~24](apps/web/app/api/auth/forgot-password/route.js) menunggu `sendPasswordResetEmail` hanya bila user ada. Dengan SMTP mati perbedaannya lebih besar (batas 10-15 detik).
- Dampak: penyerang dapat memeriksa apakah email terdaftar.
- Saran terkecil: kirim email tanpa `await` (fire-and-forget dengan `.catch(log)`) atau samakan waktu.

**QA-14 | S | Area 3 | Sesi JWT tidak dicabut setelah reset password atau penonaktifan akun**
- Bukti: [auth.js:71](apps/web/lib/auth.js#L71) JWT 7 hari tanpa cek ke DB di callback sesi. Uji: setelah `reset-password` sukses, `/api/auth/me` pada sesi lama tetap `200`; pengguna `isActive:false` dengan sesi lama tetap `200` di `GET /api/projects`.
- Dampak: sesi yang dicuri tetap hidup setelah korban mengganti password; akun yang diblokir tetap bisa memakai API sampai token habis.
- Saran terkecil: simpan `tokenVersion` atau `passwordChangedAt` pada user dan periksa di callback `jwt`, atau persingkat `maxAge`.

**QA-15 | S | Area 9 | DB mati membuat request menggantung 30 detik**
- Bukti: `dbdown.js`: `DB-DOWN register ... {"s":500,"ms":30122,...}`. `mongoose.connect` tanpa `serverSelectionTimeoutMS` ([connection.js:20](packages/db/connection.js#L20)).
- Dampak: kegagalan lambat menumpuk koneksi dan melewati batas durasi serverless. Respons tidak membocorkan detail (`INTERNAL_ERROR`, bagus). `/api/health` mengembalikan 503 dalam ~0,8 detik.
- Saran terkecil: set `serverSelectionTimeoutMS` (mis. 5000).

**QA-16 | S | Area 2 | Variabel wajib tidak divalidasi saat boot**
- Bukti: `assertEnv`/`missingVars` ([config.js](packages/core/src/config.js)) tidak dipanggil di aplikasi (`grep` di luar tes dan definisi: kosong). Uji dengan `NEXTAUTH_SECRET`, `MONGODB_URI`, `NEXTAUTH_URL` kosong di mode produksi: server hidup, `/api/health` 503, `/api/auth/me` 500, `/login` 500, `/dashboard` 500.
- Dampak: salah konfigurasi baru terlihat di runtime; memperparah QA-01.
- Saran terkecil: panggil `assertEnv` di `instrumentation.js` atau pada impor modul server untuk grup `app` dan `db`.

**QA-17 | S | Area 5 | Rute lama mengembalikan 500 tanpa envelope untuk masukan buruk**
- Bukti: `GET /api/manuscripts/not-an-id` dan `GET /api/analyses/not-an-id` menghasilkan `500` dengan body kosong; `POST /api/payments/webhook` dengan JSON rusak `500` kosong; `POST /api/manuscripts` tanpa body `500` kosong. `GET /api/journals/not-an-id` 404 berbentuk `{"error":...}` (bukan envelope). Rute Tahap 1-2 semuanya benar (400/404 dengan envelope).
- Dampak: klien tidak dapat membedakan kesalahan; kebocoran isi tidak ditemukan.
- Saran terkecil: dibiarkan sampai rute lama dipensiunkan, atau bungkus dengan `withApi` bila dipertahankan.

**QA-18 | S | Area 3 | Tidak ada pemeriksaan Origin; perlindungan CSRF hanya `SameSite=Lax`**
- Bukti: cookie sesi: `next-auth.session-token=<v>; Path=/; Expires=...; HttpOnly; SameSite=Lax` (tanpa `Secure` karena `NEXTAUTH_URL` http). Rute mutasi menerima `Content-Type: text/plain` (`201`) dan header `Origin: http://evil.example` (`201`).
- Dampak: bergantung pada `SameSite=Lax` browser (POST lintas situs tidak membawa cookie). Header `Secure`/`__Secure-` di HTTPS TIDAK DIVERIFIKASI (tidak ada TLS di lingkungan uji).
- Saran terkecil: tolak mutasi bila `Origin` ada dan tidak sama dengan `BASE_URL`, dan wajibkan `application/json`.

**QA-19 | S | Area 7 | Kesalahan deteksi struktur pada format yang relevan dengan persona Indonesia**
- Bukti (`parser_audit.js`):
  - MD-2 Laporan Indonesia: `BAB I PENDAHULUAN`, `BAB II ...`, `BAB V ...` semuanya tidak dikenali (5 `UNRECOGNIZED_HEADING`, `confidence=medium`), padahal tanpa awalan "BAB" semua dikenali (ID-1 `confidence=high`).
  - TEX-2 Springer: `\keywords{crop yield \and deep learning \and CNN}` menjadi satu kata kunci `"crop yield deep learning CNN"`.
  - MD-1: YAML `keywords: [anomaly detection, autoencoder, IoT]` menjadi `["[anomaly detection","autoencoder","IoT]"]`.
  - MD-3: judul dan bagian setext (`====`/`----`) tidak dikenali (`NO_TITLE`, `NO_ABSTRACT`).
  - TEX-3: makro `\newcommand{\bab}[1]{\section{#1}}` menghasilkan bagian palsu bernama `#1`; `\input{bab2}` diabaikan tanpa peringatan.
  - Yang benar: IEEEtran, `thebibliography`, `\begin{abstract}`, `IEEEkeywords`, `\sep`, `\section*`, komentar, `verbatim`, blok kode Markdown.
- Dampak: laporan kesiapan Tahap 5 akan mengandalkan struktur ini; false negative dapat menghasilkan peringatan palsu. Hanya 6 naskah buatan saya; belum diuji pada naskah nyata beragam.
- Saran terkecil: tambah pola "BAB <romawi>" dan pisahkan `\and`; tambah fixture tes untuk tiap kasus.

**QA-20 | S | Area 1 | Tidak ada gerbang lint**
- Bukti: `npm run lint` keluar dengan error (`next lint` meminta konfigurasi interaktif, tidak ada `.eslintrc*`); `eslint` bukan dependensi. `next build` menampilkan "Linting and checking validity" tetapi tidak ada aturan yang dijalankan. CI tidak memanggil lint.
- Dampak: kesalahan gaya/hook tidak tertangkap otomatis.
- Saran terkecil: tambah `eslint` dan `eslint-config-next`, buat `.eslintrc.json` dengan `next/core-web-vitals`, tambahkan `npm run lint` ke CI.

### RENDAH

- **QA-21 | R | Area 6 | Kontras teks sekunder di bawah WCAG AA.** Warna `ink-faint` `rgb(131,128,122)` pada latar `rgb(251,250,248)` bernilai 3,77:1, dan pada `rgb(247,246,243)` 3,64:1 (di bawah 4,5:1 untuk teks 12-14 px), dipakai pada subjudul, tanggal, footer, tautan "← Proyek Saya". Pasangan rasio 1 yang tampil di keluaran adalah false positive detektor saya (tangkapan layar menunjukkan teks terbaca).
- **QA-22 | R | Area 6 | Tautan mati di Navbar.** `/dashboard/journals -> 404`, `/dashboard/kum -> 404` ([Navbar.jsx:10-11](apps/web/components/layout/Navbar.jsx#L10-L11)).
- **QA-23 | R | Area 6 | Tidak ada `error.jsx`/`not-found.jsx`/`loading.jsx`.** Halaman 404 bawaan berbahasa Inggris ("404: This page could not be found."), tanpa landmark `main`. Layar "Memuat proyek..." dan error di workspace bekerja (`Data tidak ditemukan` + tautan kembali).
- **QA-24 | R | Area 3 | Tidak ada CSP dan HSTS.** `csp: null`, `hsts: null` pada `/`, `/login`, `/api/health`, `/dashboard`. `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` ada; `x-powered-by` dinonaktifkan. CSP sudah dijadwalkan di Tahap 7 ([next.config.js](apps/web/next.config.js) komentar).
- **QA-25 | R | Area 3 | Register membuka enumerasi email.** Email terdaftar mendapat `409 CONFLICT "Email sudah terdaftar"`. Perilaku umum, perlu keputusan produk.
- **QA-26 | R | Area 5 | Konsistensi kecil rute versi.** `POST .../restore` selalu `201` ([restore/route.js:8](apps/web/app/api/projects/[id]/versions/[number]/restore/route.js#L8)) walau hasilnya `unchanged`; `DELETE /api/projects/[id]` tanpa rate limit. Temuan subagent QC internal; tidak diuji ulang.
- **QA-27 | R | Area 12 | README usang.** Merujuk `Publication Prepare.md` v1, menyebut "analisis kesiapan naskah", tidak menyebut `npm test`, `REQUIRE_EMAIL_VERIFICATION`, kebutuhan MongoDB yang berjalan, atau Node >= 18.18. Langkah yang ada tetap bisa diikuti (lihat bagian 3 area 12).
- **QA-28 | R | Area 3 | Cookie sesi tanpa `Secure` di http.** Wajar untuk dev; perilaku di HTTPS (`__Secure-` dan `Secure`) TIDAK DIVERIFIKASI.
- **QA-29 | R | Area 2 | `BASE_URL` kosong menghasilkan tautan email `undefined/verify-email?token=...`.** [mailer/index.js:24,43](packages/mailer/index.js#L24).
- **QA-30 | R | Area 6 | `/favicon.ico` 404.**

### INFO (hal yang diperiksa dan baik)

- **I-1** Isolasi data: 7 operasi lintas pengguna semua `404` (GET, PATCH, DELETE, daftar versi, versi tunggal, simpan, restore); tanpa login `401` untuk semua rute terproteksi (14 rute lama dan baru).
- **I-2** NoSQL injection: `email` objek `{$ne:""}` pada register `400`; login dengan objek operator `401`; `?status=$ne` `400`; id `{"$ne":null}` `404`; `title`/`baseRevision` objek `400`. Mass assignment: `POST /api/projects` dengan `userId`, `revision:77`, `status:'archived'` menghasilkan `userId` benar, `revision 0`, `status active`.
- **I-3** Token: verifikasi/reset tersimpan sebagai hash hex 64 karakter, reset berlaku 60 menit, pemakaian ulang `400`. Password: 7 karakter `400`, 73 byte `400 "maksimal 72 byte"`. Anti pre-hijacking Google diuji lewat tes unit `googleLinkUpdate` saja (akun Google nyata TIDAK DIVERIFIKASI).
- **I-4** Konkurensi: 50 ronde (5 pengguna x 10 ronde x 4 paralel) semuanya persis `201,409,409,409`; tiap proyek `versions=10, revision=10, versionCount=10`, nomor unik, `currentVersionId` ada. Indeks `projectId_1_number_1` unik terbentuk; `explain`: `FETCH>IXSCAN` untuk daftar proyek, daftar versi, dan versi per nomor, `EXPRESS_IXSCAN` untuk email.
- **I-5** Performa (`next start`, lokal): health 13 ms; simpan 1 MB (parse+simpan) 44 ms; GET proyek dengan sumber ~1 MB 36 ms (payload 987 kB); daftar 50 proyek 20 ms (17,5 kB); `/api/auth/me` p50 15 ms dan p95 27 ms; 30 GET paralel selesai 78 ms semua `200`. Parser 1 MB maksimum 88 ms, tanpa ReDoS pada 12 masukan jahat.
- **I-6** Log: pemindaian log server produksi tidak menemukan email uji, password, isi naskah, atau token sesi. Log berbentuk JSON dengan `requestId`; redaksi kunci sensitif ada di [logger.js:4](packages/core/src/logger.js#L4). Respons error tidak menampilkan stack. `X-Request-Id` ada di setiap respons. Rute baru memakai envelope konsisten.

### Terkait di luar daftar

Orphan akibat hapus-vs-simpan paralel (dugaan subagent internal, SEDANG, PLAUSIBLE) **tidak terbukti**: 24 balapan (3 pengguna x 8) menghasilkan `{"200/409":23,"200/404":1}` dan `orphan versions after races 0`. Tetap tercatat sebagai kemungkinan teoretis; bukan temuan.

---

## 5. Matriks MTS

Sumber butir: MTS 4.1 (tabel MVP), Bagian 12 (API), Bagian 14 (keamanan/privasi), Blueprint 31 (prioritas P0/P1), gate 42. MTS tidak memberi label P0/P1 per fitur; Blueprint 31 memberi P0 untuk keputusan desain dan P1 untuk pengendalian pra-beta. Prioritas fitur di bawah saya turunkan dari 4.1 (MVP = P0 inti) dan Blueprint 31 (P1).

| Fitur | Prioritas | Status | Catatan/bukti |
|---|---|---|---|
| Registrasi | P0 | ADA-TERVERIFIKASI | 201, hash bcrypt, token hash |
| Login credentials | P0 | ADA-TERVERIFIKASI | login via UI dan API; rate limit login terbukti |
| Verifikasi email | P0 | ADA-TERVERIFIKASI | alur token; **pengiriman email nyata TIDAK DIVERIFIKASI** (Gmail 530) |
| Reset password | P0 | ADA-TERVERIFIKASI | hash, 60 menit, sekali pakai; email nyata TIDAK DIVERIFIKASI |
| Google OAuth | P0 | ADA-TIDAK-TERVERIFIKASI | tanpa akun Google; hanya tes unit aturan penautan |
| CRUD proyek (POST/GET/PATCH/DELETE `/projects`) | P0 | ADA-TERVERIFIKASI | 5 rute uji; hapus ikut menghapus versi |
| Tempel/unggah naskah membuat versi | P0 | ADA-TERVERIFIKASI | `POST /projects/:id/versions` (di MTS `POST /projects/:id/manuscript`; nama berbeda, INFO) |
| Daftar/isi/restore versi | P0 | ADA-TERVERIFIKASI | `isCurrent` benar |
| Parser struktur Markdown/LaTeX | P0 | ADA-TERVERIFIKASI | dengan cacat (QA-12, QA-19) |
| Panel naskah di UI | P0 | ADA-TERVERIFIKASI | 37/38 butir browser |
| Chat streaming SSE `POST /projects/:id/chat` | P0 | **BELUM-ADA** | tidak ada rute |
| Riwayat `GET /projects/:id/messages` | P0 | BELUM-ADA | |
| Loop agen, konteks naskah, pencatatan token | P0 | BELUM-ADA | `packages/ai` masih panggilan tunggal lama |
| `search_literature`, `verify_reference`, validator sitasi, daftar referensi | P0 | BELUM-ADA | tidak ada `packages/literature` |
| Profil venue 3-5 dan `GET /venues` | P0 | BELUM-ADA | hanya koleksi `Journal` lama |
| Laporan kesiapan + cek deterministik (`packages/checks`) | P0 | BELUM-ADA | rumus skor belum ditetapkan |
| `propose_edit` dan accept/reject edit | P0 | BELUM-ADA | |
| Ekspor `.bib`, LaTeX per template, zip, Overleaf | P0 | BELUM-ADA | tidak ada `packages/export` |
| Jejak penggunaan AI `GET /projects/:id/ai-usage` | P0 | BELUM-ADA | |
| Kuota token/pesan `GET /usage` | P0 | BELUM-ADA | hanya `loadConfig`; belum dipakai |
| `GET /plans` | P0 | ADA-TERVERIFIKASI | 200 publik; harga di kode (99.000/990.000/2.500.000) belum diputuskan produk |
| Pembayaran Midtrans (create/webhook/history) | P0 | ADA-TIDAK-TERVERIFIKASI | tanpa kunci sandbox; webhook punya cacat (QA-01) |
| Kalkulator KUM | P1 (dipertahankan, MTS 19) | ADA-TIDAK-TERVERIFIKASI | hanya 401 tanpa login yang diuji |
| `POST /analyses` lama (deprecated) | - | ADA-TIDAK-TERVERIFIKASI | terautentikasi dan memfilter pemilik (baca kode); fungsi AI tidak diuji |
| Isolasi data antar-pengguna (P1 #1, MTS 14) | P1 | ADA-TERVERIFIKASI | I-1, I-2 |
| Retensi dan penghapusan end-to-end (P1 #2) | P1 | ADA-TIDAK-TERVERIFIKASI | hapus proyek ada; retensi otomatis dan hapus akun BELUM-ADA (QA-09) |
| Evaluasi AI dengan dataset berlabel (P1 #3) | P1 | BELUM-ADA | |
| Uji ekspor LaTeX/BibTeX/Overleaf pada venue nyata (P1 #4) | P1 | BELUM-ADA | |
| Observabilitas biaya, token, latency, kegagalan provider (P1 #5) | P1 | BELUM-ADA | log terstruktur ada, metrik biaya belum |
| Backup, restore, staging, rollback (P1 #6) | P1 | BELUM-ADA / UNTESTED | runbook ada tetapi belum diuji (QA-08) |
| Webhook: verifikasi signature, idempoten (MTS 14) | P1 | ADA-TIDAK-TERVERIFIKASI | ada, tetapi cacat bila kunci kosong (QA-01) |
| Log tanpa isi naskah (MTS 14) | P1 | ADA-TERVERIFIKASI | I-6 |
| Batas laju per pengguna (MTS 14) | P1 | ADA-TERVERIFIKASI | in-memory per proses (QA-05) |
| Perlindungan prompt injection (MTS 14) | P1 | BELUM-ADA | berlaku mulai Tahap 3; parser tidak mengeksekusi apa pun (H11) |
| Kebijakan privasi, persetujuan, ToS (MTS 14, gate 42.4) | P1 | BELUM-ADA | QA-03 |

Celah terbesar terhadap tujuan produk: pembeda utama MTS (referensi nyata, aturan venue, laporan kesiapan, ekspor, jejak AI) belum ada sama sekali; yang ada baru fondasi akun dan penyimpanan naskah.

---

## 6. Daftar TIDAK DIVERIFIKASI

| Butir | Alasan | Yang dibutuhkan |
|---|---|---|
| Pengiriman email nyata (verifikasi, reset, pembayaran) | Gmail OAuth2 tidak dikonfigurasi; percobaan kirim gagal `530 5.7.0 Authentication Required` | Kredensial Gmail OAuth2 staging dan kotak surat uji |
| Login Google dan penautan akun | Tidak ada akun/kredensial Google | OAuth client Google dengan redirect URI uji dan dua akun uji |
| Pembayaran Midtrans penuh (Snap, webhook sah, idempotensi sungguhan) | Tidak ada kunci sandbox | Kunci server/klien sandbox Midtrans |
| Perilaku cookie di HTTPS (`Secure`, `__Secure-`), HSTS | Lingkungan uji hanya http | Staging dengan TLS |
| Unggahan Cloudinary (akses publik URL, batas ukuran) | Tidak ada akun Cloudinary | Akun uji Cloudinary |
| Salin draf ke clipboard (jalur sukses) | Chrome headless menolak `clipboard.writeText`; jalur fallback ("Gagal menyalin") terbukti, `salin draf (jalur sukses)` FAIL | Uji manual di Chrome biasa |
| Kegagalan nyata di tengah simpan versi (setelah klaim revisi, sebelum versi dibuat) | Tidak bisa disuntik tanpa mengubah kode; kompensasi hanya teruji lewat tes unit (`kompensasi: gagal membuat versi ...`) | Harness injeksi kegagalan atau staging dengan fault injection |
| Restore backup | `mongodump`/`mongorestore` tidak terpasang; runbook UNTESTED | MongoDB Database Tools dan staging |
| Multi-instance / serverless (rate limit lintas instance, koneksi Mongo per fungsi) | Hanya satu proses diuji | Deploy ke Vercel preview atau 2 instance |
| Keterpaparan eksploitasi kerentanan dependensi (QA-06) | Tidak dieksploitasi | Penilaian terhadap advisory per paket |
| Akurasi parser pada naskah nyata beragam | Hanya 6 naskah buatan saya + 12 masukan jahat | 5-10 naskah nyata (MTS 15.2) |
| Aksesibilitas penuh (pembaca layar, urutan fokus seluruh halaman) | Hanya label, role alert, gaya fokus, kontras diuji otomatis | Audit manual atau axe/Lighthouse |
| Beban/skala (ratusan pengguna bersamaan) | Hanya 30 permintaan paralel | Uji beban terhadap staging |
| `npm audit` di CI | CI tidak dijalankan | Menjalankan workflow di GitHub |

---

## 7. Rencana tindak lanjut (urutan: BLOCKER dulu)

Setiap butir punya kriteria selesai yang dapat diverifikasi ulang dengan skrip yang sama.

1. **QA-01 (webhook)**: validasi `MIDTRANS_SERVER_KEY` dan `timingSafeEqual`. Selesai bila: `forge.js` menghasilkan 5xx (bukan 404/200), plan pengguna tetap `free`, dan signature sah dari kunci uji tetap diterima.
2. **QA-16 (fail-fast env)**: panggil `assertEnv` saat boot. Selesai bila: server dengan `NEXTAUTH_SECRET`/`MONGODB_URI` kosong gagal start dengan pesan nama variabel yang hilang.
3. **QA-04 dan QA-15 (koneksi DB)**: reset promise saat gagal dan set `serverSelectionTimeoutMS`. Selesai bila: skenario cold-start-DB-mati lalu DB-hidup memulihkan `health 200` tanpa restart, dan DB mati menjawab 5xx kurang dari 10 detik.
4. **QA-03 dan QA-09 (privasi)**: keputusan retensi (D0-08), kebijakan privasi dan ToS, persetujuan di form daftar, endpoint hapus akun, pekerja retensi. Selesai bila: ada halaman kebijakan, daftar mensyaratkan persetujuan, hapus akun menghapus proyek, versi, dan dokumen user (diverifikasi di DB), dan naskah kedaluwarsa terhapus pada uji terjadwal.
5. **QA-07 (rute lama Cloudinary)**: nonaktifkan atau amankan. Selesai bila: rute mengembalikan 404/410, atau unggahan memakai `type: 'authenticated'` dan batas ukuran, dan URL tanpa tanda tangan tidak bisa dibuka.
6. **QA-06 (dependensi)**: naikkan `mongoose`/`nodemailer`, rencanakan Next. Selesai bila: `npm audit --audit-level=high` bersih atau tiap sisa diterima secara tertulis dengan alasan.
7. **QA-08 (operasional)**: staging, error tracking, alerting, uji restore. Selesai bila: runbook berstatus "DIUJI" dengan tanggal dan hasil jumlah dokumen cocok, dan ada alert yang terbukti terkirim.
8. **QA-05 (rate limit)**: Redis/Upstash atau dokumentasi proxy. Selesai bila: 8 register dengan `X-Forwarded-For` berbeda tidak lolos lewat batas pada deploy yang dimaksud.
9. **QA-13, QA-14, QA-18, QA-11, QA-10 (hardening auth/validasi)**: masing-masing diperbaiki dengan tes regresi. Selesai bila: waktu `forgot-password` terdaftar vs tidak berselisih kurang dari 50 ms; sesi lama ditolak setelah reset; POST dengan `Origin` asing ditolak; body chunked 8 MB mendapat 413; 5 create paralel di atas 49 hanya meloloskan satu.
10. **QA-12 dan QA-19 (parser)**: perbaiki `Math.min(...)`, pola "BAB", `\and`, YAML flow list; tambah fixture. Selesai bila: tes manuscript menambah kasus-kasus ini dan lulus, dan `big.js` mengembalikan 201 untuk 1 MB heading.
11. **QA-20 (lint)** lalu **QA-21 s/d QA-30 (RENDAH)**: ESLint di CI; tautan Navbar; halaman error/404; kontras. Selesai bila: `npm run lint` hijau di CI dan `LINKS dead` kosong.
12. **QA-02 (Tahap 3-6)**: bangun fitur P0 sesuai blueprint beserta gate masing-masing. Selesai bila: seluruh matriks bagian 5 tidak menyisakan BELUM-ADA pada baris P0 dan kriteria lulus MVP (MTS 15.3) terpenuhi.
13. **Keputusan produk yang memblokir rilis**:
    - D0-08 retensi default
    - D0-07 biaya dan harga paket (angka di `plans` dan `payments/create` masih hardcode)
    - rumus skor kesiapan dan ambang
    - D0-05 daftar pasti 3-5 venue dan sumber resminya
    - kebijakan privasi dan perjanjian penyedia AI (Tahap 3)
    - D0-01, D0-06, D0-09 saat ini asumsi dan tidak memblokir pengembangan, tetapi perlu konfirmasi pemilik produk.

---

## 8. Keluaran akhir `git status`

Lihat bagian 10.

---

## 9. QC silang (subagent terpisah)

Subagent yang belum melihat proses audit ini mereproduksi 5 temuan terparah dan 5 klaim LULUS dengan skrip sendiri. Hasilnya dicantumkan apa adanya; isi bagian 1-7 tidak diubah agar cocok.

| ID | Klaim | Hasil subagent | Bukti ringkas dari subagent |
|---|---|---|---|
| A1 | QA-01 webhook dapat dipalsukan saat kunci kosong | SEPAKAT | Signature `deadbeef` `401`; signature dengan `"undefined"` `200`; langganan `free` menjadi `pro` (+30 hari), status payment `paid` |
| A2 | QA-04 koneksi DB tidak pulih | SEPAKAT | Server start saat Mongo mati: health 503 sebelum dan sesudah Mongo hidup, register 500 (tanpa pulih). Server yang sudah terhubung dahulu: 200, 503, lalu pulih 200 |
| A3 | QA-05 bypass rate limit via `X-Forwarded-For` | SEPAKAT | Header sama: `201 x5, 429 x3`; header berputar: 8 kali `201` |
| A4 | QA-10 kuota 50 proyek bocor | SEPAKAT | 49 seed + 5 paralel: semua `201`, aktif menjadi 54 |
| A5 | QA-12 parser 500 untuk naskah valid besar | SEPAKAT dengan koreksi | 100.000 baris `201`; 150.000 baris (750 KB) dan 200.000 baris (1.000.000 B) `500`; `parseManuscript` langsung melempar `RangeError`. **Koreksi:** kegagalan sudah mulai di bawah 1 MB (antara 100 ribu dan 150 ribu baris), tidak hanya pada 1 MB seperti tertulis di QA-12. Ambang tepatnya belum dipersempit. |
| B1 | `npm ci`, tes, build bersih | SEPAKAT | Di salinan bersih: `npm ci` exit 0; tes core 25, mailer 1, manuscript 35, 0 gagal; build dengan 4 variabel env: `Compiled successfully`, `Generating static pages (28/28)`, tanpa peringatan |
| B2 | Isolasi antar-pengguna | SEPAKAT | 7 rute: pengguna B `404`, tanpa login `401`, pemilik tetap `200` |
| B3 | Simpan paralel tepat satu pemenang | SEPAKAT | 25 ronde x 4 paralel: semuanya `1x201 + 3x409 VERSION_CONFLICT`; per proyek `revision == versionCount == jumlah versi`, nomor unik berurutan, `currentVersionId` ada |
| B4 | Indeks unik `{projectId, number}` | SEPAKAT | Indeks ada dengan `unique:true` |
| B5 | Password 72 byte dan token hash sekali pakai | SEPAKAT | 73 byte `400`, 7 karakter `400`, 72 byte `201`; token tersimpan hex 64 karakter; token salah `400`; token benar `200` sekali, pemakaian kedua `400` |

Pengamatan tambahan subagent:
- Login credentials dibatasi 10 per 15 menit per IP dengan kunci `X-Forwarded-For` pertama (sama seperti register), sehingga kemungkinan dapat dilewati dengan cara yang sama untuk bagian per-IP. Subagent tidak mengujinya. Pembatasan per-email tetap berlaku (lihat QA-05).
- Tidak ada ketidaksepakatan. Satu-satunya koreksi adalah ambang A5 di atas.

---

## 10. Keluaran akhir `git status` (akhir sesi audit)

Perubahan yang berasal dari audit ini: **hanya `docs/qa/QA-QC-Report.md`** (berada di dalam `docs/`, yang seluruhnya belum terlacak). Kode aplikasi tidak diubah. Berkas `.eslintrc*` tidak dibuat (`npm run lint` dibatalkan sebelum menulis berkas).

Working tree **tidak bersih**, karena kode Tahap 1-2 memang belum pernah di-commit (kondisi sebelum audit). Keluaran:

```
 M .env.example
 M apps/web/app/api/auth/forgot-password/route.js
 M apps/web/app/api/auth/me/route.js
 M apps/web/app/api/auth/register/route.js
 M apps/web/app/api/auth/reset-password/route.js
 M apps/web/app/api/auth/verify-email/route.js
 M apps/web/app/dashboard/page.jsx
 M apps/web/app/layout.jsx
 M apps/web/components/layout/Navbar.jsx
 M apps/web/lib/auth.js
 M apps/web/next.config.js
 M apps/web/package.json
 M package-lock.json
 M package.json
 M packages/db/index.js
 M packages/db/models/User.js
?? CLAUDE.md
?? "MTS Publication Prepare v3.0 - Complete Phased Blueprint.md"
?? "Master Technical Specification.md"
?? apps/web/app/api/auth/resend-verification/
?? apps/web/app/api/health/
?? apps/web/app/api/projects/
?? apps/web/app/dashboard/projects/
?? apps/web/app/forgot-password/
?? apps/web/app/login/
?? apps/web/app/register/
?? apps/web/app/reset-password/
?? apps/web/app/verify-email/
?? apps/web/components/auth/
?? apps/web/components/projects/
?? apps/web/components/providers/
?? apps/web/lib/api.js
?? apps/web/lib/clientApi.js
?? apps/web/lib/projectsService.js
?? apps/web/middleware.js
?? docs/
?? packages/core/
?? packages/db/models/ManuscriptVersion.js
?? packages/db/models/Project.js
?? packages/manuscript/
```

Tidak ada commit dan tidak ada push dari sesi audit ini. `.env.local` tidak dibaca nilainya.

