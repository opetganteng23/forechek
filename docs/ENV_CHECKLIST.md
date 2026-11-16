# ENV_CHECKLIST - variabel lingkungan Forechek

Berkas sebenarnya: `shared/.env.local` di server (`chmod 600`, tidak pernah di-commit), ditautkan oleh `deploy.sh` ke `apps/web/.env.local` pada tiap rilis.
Contoh bertanda placeholder: [`.env.example`](../.env.example). Periksa sebelum start: `npm run preflight` (hanya NAMA variabel yang dicetak, tidak pernah nilainya).
Nilai placeholder yang mengandung `GANTI`, `your-`, `<...>`, atau `xxxxx` dianggap **belum diisi**.

**W** = wajib (produksi menolak start bila kosong). **F** = wajib untuk fitur tertentu (kosong = fitur mati dengan pesan jelas). **O** = opsional. **U** = uji saja.

| Variabel | Tipe | Cara membuat/mendapatkan nilai | Akibat bila kosong/salah |
|---|---|---|---|
| `NODE_ENV` | W | `production` (diatur pm2/`next start`) | selain `production`: pemeriksaan boot hanya memperingatkan |
| `BASE_URL` | W (prod) | URL publik `https://forechek.ailo.ai.id` | prod: **menolak start**; tautan email rusak |
| `NEXTAUTH_URL` | W | sama dengan URL publik | **menolak start**; login/callback gagal; prod non-https = peringatan |
| `NEXTAUTH_SECRET` | W | `openssl rand -base64 32` (min. 32 karakter) | **menolak start** (kosong, placeholder, atau < 32 karakter) |
| `MONGODB_URI` | W | Atlas: Connect > Drivers; lokal: `mongodb://127.0.0.1:27017/forechek` (tambahkan user/password bila auth aktif) | **menolak start** |
| `TRUST_PROXY` | W (prod) | `true` di belakang nginx yang menambah `X-Forwarded-For`; `false` bila langsung ke internet | prod: **menolak start** bila kosong/bukan `true`/`false`. `false` = semua klien berbagi satu bucket batas laju |
| `TRUST_PROXY_HOPS` | O | jumlah proxy tepercaya (default `1`) | bilangan bulat 1-99; selain itu menolak start |
| `ALLOWED_ORIGINS` | O (disarankan) | `https://forechek.ailo.ai.id` (pisahkan koma bila ada alias) | peringatan di prod; hanya Origin = host sendiri yang lolos pemeriksaan CSRF |
| `ANTHROPIC_API_KEY` | F (AI) | console.anthropic.com > API Keys | chat/laporan AI menjawab `PROVIDER_NOT_CONFIGURED`; kriteria berbasis model `not_assessed` |
| `AI_MODEL_CHAT` | F (AI) | ID model dari dokumentasi Anthropic (saran: `claude-sonnet-5-5`) | chat tidak jalan |
| `AI_MODEL_REPORT` | O | idem (saran: `claude-sonnet-5-5`); kosong = pakai `AI_MODEL_CHAT` | - |
| `AI_MODEL_LIGHT` | O | idem (saran: `claude-haiku-5-5`) | tugas ringan memakai default kode |
| `AI_PROVIDER`, `AI_ALLOW_FAKE` | U | `fake` + `true` hanya untuk uji | prod: `fake` tanpa `AI_ALLOW_FAKE=true` **menolak start**; `anthropic` tanpa kunci menolak start |
| `AI_MAX_ITERATIONS`, `AI_MAX_TOOL_CALLS`, `AI_TURN_TIMEOUT_MS`, `AI_MAX_OUTPUT_TOKENS`, `AI_MAX_TOTAL_TOKENS_PER_TURN`, `AI_CONTEXT_BUDGET_TOKENS` | O | bilangan bulat; kosong = default (8, 12, -, 4096, 60000, 24000) | default PROVISIONAL |
| `AI_PROMPT_CACHE` | O | `true` hanya setelah biaya/kompatibilitas diverifikasi | caching mati |
| `LITERATURE_PROVIDERS` | F (referensi) | `openalex,crossref` (+ `semanticscholar`) | pencarian/verifikasi literatur ditolak (`PROVIDER_NOT_CONFIGURED`) |
| `LITERATURE_CONTACT_EMAIL` | O (disarankan) | email kontak Anda | "polite pool" OpenAlex/Crossref tidak aktif (batas laju lebih ketat) |
| `SEMANTIC_SCHOLAR_API_KEY` | O | semanticscholar.org/product/api | batas laju sangat ketat tanpa kunci |
| `LITERATURE_TIMEOUT_MS`, `LITERATURE_CACHE_TTL_SEC` | O | default 8000 / 600 | - |
| `LITERATURE_ALLOW_FIXTURE` | U | `true` hanya uji | `fixture` di prod ditolak tanpa ini |
| `GMAIL_USER`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` | F (email) | Google Cloud: aktifkan Gmail API, buat OAuth client, ambil refresh token (OAuth Playground) | email verifikasi/reset tidak terkirim (register tetap berhasil, galat dicatat); `REQUIRE_EMAIL_VERIFICATION=true` tanpa ini **menolak start** |
| `GMAIL_ACCESS_TOKEN` | O | otomatis diperbarui dari refresh token | - |
| `REQUIRE_EMAIL_VERIFICATION` | O | `true` setelah email terbukti jalan | `false` = login langsung tanpa verifikasi |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | F (login Google) | Google Cloud > OAuth client; redirect `https://forechek.ailo.ai.id/api/auth/callback/google` | tombol Google tidak berfungsi |
| `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY` | F (bayar) | dashboard Midtrans (SANDBOX dulu) | webhook menjawab 503; pembayaran tidak aktif |
| `MIDTRANS_IS_PRODUCTION` | O | `false` (sandbox) / `true` (nyata) | default sandbox |
| `QUOTA_FREE_TOKENS`, `QUOTA_FREE_MESSAGES`, `QUOTA_PRO_*`, `QUOTA_INST_*` | O | bilangan bulat >= 0; tetapkan dari biaya terukur | default SEMENTARA (D0-07) |
| `REDIS_URL` | O (cluster: W) | `redis://:password@host:6379` | batas laju per proses saja; **diisi tanpa paket `ioredis` = menolak start** (`ioredis` terpasang sebagai dependensi opsional) |
| `RETENTION_ENABLED` | O | `true` agar `npm run retention` benar-benar menghapus | default dry-run (hanya melaporkan) |
| `RETENTION_GRACE_DAYS` | O | hari masa tenggang (default 7) | - |
| `LEGACY_ROUTES_ENABLED` | O | `true` mengaktifkan kembali rute lama (unggah/analisis Cloudinary) | default mati (410) - disarankan tetap mati |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | O (legacy) | cloudinary.com | hanya rute lama; hapus akun tidak dapat menghapus berkas lama di Cloudinary bila kosong (dilaporkan `legacyFilesFailed`) |

## Cara membuat nilai cepat

```
openssl rand -base64 32          # NEXTAUTH_SECRET
openssl rand -hex 16             # kata sandi acak lain
```

## Pesan galat boot (produksi)

Bila konfigurasi tidak valid, proses berhenti dengan keluar kode 1 dan mencetak baris `[config] <NAMA_VARIABEL> ...` (tanpa nilai), mis.:
`[config] NEXTAUTH_SECRET belum diisi`, `[config] TRUST_PROXY belum diisi (wajib eksplisit true atau false di produksi)`,
`[config] REDIS_URL diisi tetapi paket ioredis tidak terpasang`, `[config] REQUIRE_EMAIL_VERIFICATION=true membutuhkan pengirim email`.
Lihat lengkapnya dengan `npm run preflight -- --no-network` (tanpa koneksi) atau `npm run preflight` (dengan koneksi nyata).
