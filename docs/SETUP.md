# SETUP - Publication Prepare

Panduan menjalankan aplikasi dan menguji integrasi nyata. Status integrasi nyata yang BELUM pernah diuji ada di
[docs/progress/STATUS.md](progress/STATUS.md) ("TIDAK DIVERIFIKASI"). Jangan commit berkas `.env*` selain `.env.example`.

## 1. Menjalankan lokal

```
npm ci
cp .env.example apps/web/.env.local      # lalu isi sesuai tabel di bawah (nilai nyata hanya di berkas ini)
npm test                                  # semua workspace, tanpa DB/jaringan
npm run build
npm run start                             # atau: npm run dev
npm run seed:venues                       # opsional; profil venue juga di-seed otomatis saat pertama dipakai
```

Butuh MongoDB. Untuk uji lokal tanpa Atlas: `mongodb-memory-server` atau MongoDB lokal pada `mongodb://127.0.0.1:27017/publikasi_db`.
Uji HTTP end-to-end (butuh server berjalan dan MongoDB UJI, bukan data nyata): `BASE_URL=... MONGODB_URI=... node scripts/e2e/<berkas>.js`
(`webhook`, `chat`, `references`, `report`, `edits`, `hardening`, `proxy`). Jalankan server uji dengan
`AI_PROVIDER=fake AI_ALLOW_FAKE=true AI_MODEL_CHAT=demo-model AI_MODEL_REPORT=demo-model LITERATURE_PROVIDERS=fixture LITERATURE_ALLOW_FIXTURE=true TRUST_PROXY=true`
(provider PALSU dan korpus SINTETIS; bukan Claude dan bukan sumber literatur nyata).

## 2. Tabel environment

W = WAJIB, O = OPSIONAL. Contoh hanya format; jangan menyalin nilai ke dokumen/commit.

| Variabel | W/O | Fungsi | Cara mendapatkan | Contoh format |
|---|---|---|---|---|
| `NODE_ENV` | W (prod) | `production` mengaktifkan fail-fast env, HSTS, cookie aman | diatur hosting/`next start` | `production` |
| `BASE_URL` | W (prod) | Dasar tautan di email verifikasi/reset | URL publik aplikasi | `https://app.contoh.id` |
| `NEXTAUTH_URL` | W | URL kanonik NextAuth | sama dengan URL publik | `https://app.contoh.id` |
| `NEXTAUTH_SECRET` | W | Penandatangan JWT sesi (min. 32 karakter; prod menolak yang lebih pendek) | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | 64 karakter hex |
| `MONGODB_URI` | W | Koneksi database | MongoDB Atlas / server sendiri | `mongodb+srv://user:pass@host/db` |
| `REQUIRE_EMAIL_VERIFICATION` | O | `true` = login ditolak sampai email terverifikasi | aktifkan setelah SMTP terbukti | `true` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | O | Login Google | Google Cloud Console > OAuth client (redirect `.../api/auth/callback/google`) | `xxx.apps.googleusercontent.com` |
| `GMAIL_USER`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` (`GMAIL_ACCESS_TOKEN`) | O* | Email verifikasi/reset (Gmail OAuth2). *Wajib bila verifikasi email dipakai | Google Cloud (Gmail API) + OAuth Playground | `1//0g...` |
| `ANTHROPIC_API_KEY` | W bila AI nyata | Kunci API Anthropic | console.anthropic.com | `sk-ant-...` |
| `AI_MODEL_CHAT` | W bila chat | ID model untuk chat (dibaca dari config, tidak di-hardcode) | dokumentasi model Anthropic | (ID model resmi) |
| `AI_MODEL_REPORT`, `AI_MODEL_LIGHT` | O | Model laporan kesiapan / tugas ringan | idem | (ID model resmi) |
| `AI_PROVIDER`, `AI_ALLOW_FAKE` | O | `fake` = provider PALSU uji; di produksi butuh `AI_ALLOW_FAKE=true` | - | `fake` |
| `AI_MAX_ITERATIONS`, `AI_MAX_TOOL_CALLS`, `AI_TURN_TIMEOUT_MS`, `AI_MAX_OUTPUT_TOKENS`, `AI_MAX_TOTAL_TOKENS_PER_TURN`, `AI_CONTEXT_BUDGET_TOKENS`, `AI_PROMPT_CACHE` | O | Batas agen (nilai awal PROVISIONAL, D3-02) | - | `8` |
| `LITERATURE_PROVIDERS` | W bila literatur | `openalex,crossref,semanticscholar` (`fixture` hanya uji) | - | `openalex,crossref` |
| `LITERATURE_CONTACT_EMAIL` | O (disarankan) | "polite pool" OpenAlex/Crossref | email kontak Anda | `kontak@contoh.id` |
| `SEMANTIC_SCHOLAR_API_KEY` | O | Menaikkan batas laju Semantic Scholar | semanticscholar.org/product/api | - |
| `LITERATURE_ALLOW_FIXTURE`, `LITERATURE_TIMEOUT_MS`, `LITERATURE_CACHE_TTL_SEC` | O | Uji / timeout / cache | - | `8000` |
| `QUOTA_FREE_TOKENS`, `QUOTA_FREE_MESSAGES`, `QUOTA_PRO_*`, `QUOTA_INST_*` | O | Kuota per paket (default SEMENTARA, D0-07) | tetapkan dari biaya terukur | `100000` |
| `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `MIDTRANS_IS_PRODUCTION` | O* | Pembayaran. *Wajib bila payments aktif; webhook menolak tanpa kunci | dashboard Midtrans (SANDBOX dulu) | `SB-Mid-server-...` |
| `TRUST_PROXY`, `TRUST_PROXY_HOPS` | W (prod: true ATAU false eksplisit) | Percayai `X-Forwarded-For` (entri ke-N dari kanan). Tanpa ini semua klien berbagi satu bucket batas laju | - | `true` |
| `REDIS_URL` | O | Batas laju lintas instance (butuh `npm i ioredis`; gagal -> memory) | Redis/Upstash | `redis://host:6379` |
| `ALLOWED_ORIGINS` | O | Origin tambahan untuk permintaan pengubah-status | - | `https://app.contoh.id` |
| `LEGACY_ROUTES_ENABLED` | O | Mengaktifkan kembali unggah lama (Cloudinary); default mati | - | `true` |
| `CLOUDINARY_*` | O (legacy) | Hanya untuk rute lama | cloudinary.com | - |
| `RETENTION_ENABLED`, `RETENTION_GRACE_DAYS` | O | Pekerja retensi: hapus nyata (default dry-run) dan masa tenggang | - | `true`, `7` |

Di produksi, konfigurasi yang tidak valid menghentikan boot dengan pesan NAMA variabel (tanpa nilai). Peringatan (bukan error) muncul bila
`TRUST_PROXY` atau `REDIS_URL` tidak diisi.

## 3. Uji cepat per integrasi (lakukan sendiri; tidak pernah dijalankan oleh agen)

1. **Anthropic**: isi `ANTHROPIC_API_KEY`, `AI_MODEL_CHAT`, kosongkan `AI_PROVIDER`. Buka proyek > tab Chat > kirim "baca abstrak saya". Harapan: balasan tanpa label "PROVIDER PALSU", dan baris pemakaian token muncul di koleksi `usageledgers`. SDK `@anthropic-ai/sdk` saat ini versi lama (^0.27); verifikasi kompatibilitas bentuk event streaming sebelum rilis (STATUS: TIDAK DIVERIFIKASI).
2. **Literatur**: `LITERATURE_PROVIDERS=openalex,crossref` + `LITERATURE_CONTACT_EMAIL`. Di tab Referensi cari "attention is all you need"; verifikasi DOI `10.48550/arXiv.1706.03762`. Harapan: kandidat nyata, status verifikasi sesuai. Cek manual: `curl "https://api.crossref.org/works/10.48550/arXiv.1706.03762"`.
3. **SMTP (Gmail OAuth2)**: daftar akun baru dengan email Anda. Harapan: email verifikasi masuk dalam < 1 menit; log aplikasi tidak memuat `verification_email_failed`.
4. **Google OAuth**: tombol "Masuk dengan Google"; callback `NEXTAUTH_URL/api/auth/callback/google` terdaftar. Harapan: sesi aktif, pengguna dibuat/dikaitkan hanya bila `email_verified`.
5. **Midtrans (SANDBOX)**: isi kunci sandbox, buat pembayaran, selesaikan di simulator; webhook publik harus menjangkau `/api/payments/webhook`. Uji penolakan: `node scripts/e2e/webhook.js` (payload tanpa signature sah harus ditolak).
6. **Overleaf**: tab Ekspor > unduh ZIP > Overleaf "New Project > Upload Project". Impor satu klik belum ada (D6-03). Periksa peringatan README.
7. **Redis** (bila dipakai): `redis-cli -u $REDIS_URL ping` -> `PONG`; jalankan dua instance aplikasi, kirim 8 register berturut-turut; harapan: 429 setelah batas, lintas instance.
8. **Retensi**: `npm run retention` (dry-run, melaporkan kandidat); setelah memeriksa, `RETENTION_ENABLED=true npm run retention`. Jadwalkan lewat cron/Task Scheduler.

## 4. Operasional

Runbook backup/restore, rollback, dan insiden: [docs/ops/RUNBOOK.md](ops/RUNBOOK.md). Estimasi biaya per alur: [docs/ops/COST.md](ops/COST.md).
