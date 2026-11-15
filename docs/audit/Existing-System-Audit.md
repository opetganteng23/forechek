# Existing System Audit (Tahap 0)

Tanggal audit: 2026-11-14. Dasar: pembacaan kode di `Publication Prepare` (bukan eksekusi aplikasi; lihat "Batas audit").

## Ringkasan arsitektur As-Is

- Monorepo npm workspaces: `apps/web` (Next.js 14.2.35, App Router, JavaScript, Tailwind) + `packages/{db,ai,mailer}`.
- DB: MongoDB via Mongoose (`User, Manuscript, Analysis, Journal, Payment, KumCalculation`).
- Auth: NextAuth v4 (JWT), Credentials + Google.
- Alur lama: unggah PDF/DOCX → Cloudinary (raw) → parse teks → satu panggilan Claude → JSON → `analyses`.
- Billing: Midtrans Snap + webhook bertanda tangan. KUM calculator (fitur Pro).
- UI yang ada: landing (`/`), dashboard statis (`/dashboard`), Navbar, Footer. **Tidak ada halaman login/register/verify/reset.**

## Temuan

| ID | Temuan | Dampak | Status |
|---|---|---|---|
| A-01 | Halaman `/login`, `/register`, `/verify-email`, `/reset-password` tidak ada, padahal Navbar dan email menautkan ke sana | Pengguna tidak bisa masuk lewat UI; tautan email 404 | Diperbaiki Tahap 1 |
| A-02 | Login Google: `token.id` berisi ID provider, bukan `_id` Mongo; tidak ada pembuatan user di DB | `findById(session.user.id)` gagal (CastError); login Google praktis rusak | Diperbaiki Tahap 1 |
| A-03 | Penautan Google ke akun email/password yang belum terverifikasi tidak menghapus password lama | Risiko pre-hijacking akun | Diperbaiki Tahap 1 (`googleLinkUpdate`, teruji) |
| A-04 | Login tidak memeriksa `isActive` dan `emailVerified`; tidak ada rate limit | Brute force; akun nonaktif bisa masuk | Diperbaiki Tahap 1 (verifikasi email via flag `REQUIRE_EMAIL_VERIFICATION`) |
| A-05 | Token verifikasi/reset disimpan mentah di DB; token verifikasi tanpa masa berlaku (email menjanjikan 24 jam) | Kebocoran DB = takeover; janji tidak ditepati | Diperbaiki Tahap 1 (hash SHA-256 + expiry) |
| A-06 | Verifikasi email lewat GET dengan efek samping | Pemindai tautan email bisa menghabiskan token | Diperbaiki Tahap 1 (POST dari halaman) |
| A-07 | Reset password: cek-lalu-ubah tidak atomik | Token bisa dipakai dua kali pada permintaan bersamaan | Diperbaiki Tahap 1 (`findOneAndUpdate` atomik) |
| A-08 | `bcrypt` memotong password >72 byte secara diam-diam; tidak ada batas atas | Password panjang tampak diterima tapi hanya 72 byte yang dipakai | Diperbaiki Tahap 1 (validator) |
| A-09 | Respons API tidak standar (`{error}` ad hoc), tanpa `requestId`, error internal bisa bocor lewat `details: err.message` (mis. `/api/analyses`, `/api/manuscripts`) | Kontrak API tidak konsisten; kebocoran pesan internal | Auth/me/health sudah standar (Tahap 1); route lama tetap sampai di-deprecate (Tahap 3) |
| A-10 | Kuota `analysisUsed` tidak pernah di-reset; cek-lalu-naikkan tidak atomik | Kuota "per bulan" tidak berfungsi; race | Logika periode terselesaikan & teruji (`resolveUsage`); pembaruan atomik di Tahap 3 |
| A-11 | File naskah diunggah ke Cloudinary dengan `secure_url` yang publik; tanpa pemeriksaan magic bytes dan batas ukuran | Naskah rahasia dapat diakses siapa pun yang tahu URL; unggahan tak tervalidasi | Terbuka. Diselesaikan Tahap 2 (sumber naskah teks disimpan di DB, alur Cloudinary dipensiunkan) |
| A-12 | `fileParser` memakai heading Inggris saja, tidak mengenali "Pendahuluan/Metode/Hasil" | Naskah berbahasa Indonesia tidak terpecah per bagian | Terbuka (Tahap 2) |
| A-13 | `packages/ai` memakai SDK `^0.27.0`, nama model dikunci di kode, `JSON.parse` langsung atas teks model | Rapuh terhadap pembungkus markdown; sulit diaudit | Terbuka (Tahap 3) |
| A-14 | Webhook Midtrans: perbandingan signature tidak constant-time; update pembayaran+langganan tidak atomik | Risiko kecil timing; ganda-perpanjang pada webhook bersamaan | Terbuka (Tahap 7, tercatat) |
| A-15 | Dashboard memakai angka statis ("0", "2 / bulan") | Menyesatkan | Terbuka (Tahap 2 menggantinya dengan data nyata) |
| A-16 | Tidak ada test, CI, atau health check | Tidak ada bukti regresi | Diperbaiki Tahap 1 (unit test `core`, CI, `/api/health`) |
| A-17 | Sesi JWT tidak memeriksa ulang status akun setiap request | Akun yang dinonaktifkan tetap aktif sampai JWT habis (kini maksimal 7 hari) | Diterima sementara; ditinjau Tahap 7 |

## Modul: dipertahankan / diubah / dipensiunkan

- **Dipertahankan:** `db/connection`, model `Payment`, `KumCalculation`, `Journal`, route `payments/*`, `kum/*`, `journals/*`, `plans`, `mailer`.
- **Diubah (Tahap 1):** `lib/auth.js`, model `User`, route `auth/*`, `layout`, `Navbar`, `next.config.js`.
- **Dipensiunkan bertahap:** `manuscripts/*` + Cloudinary, `analyses/*`, `packages/ai/index.js` (diganti agent runtime di Tahap 3).

## Dependency eksternal (perlu PoC sebelum dijanjikan)

Anthropic API (fitur dan batas terbaru), OpenAlex, Crossref, Semantic Scholar, Overleaf, Garuda/Neliti (akses belum diverifikasi), Gmail OAuth2, Midtrans.

## Batas audit

Audit ini berdasarkan membaca kode. Aplikasi belum dijalankan, database belum diperiksa isinya, dan `.env.local` sengaja tidak dibuka. Hal berikut belum diaudit: data pengguna aktual di MongoDB, konfigurasi hosting, pipeline rilis, indeks yang benar-benar ada, dan perilaku runtime.
