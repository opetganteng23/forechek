# Forechek

Asisten persiapan naskah ilmiah: referensi yang diverifikasi, asisten chat per proyek (AI hanya mengusulkan, pengguna menerima), pemeriksaan kesiapan terhadap profil venue, versi naskah, dan ekspor paket LaTeX/BibTeX.
Domain produksi rencana: `forechek.ailo.ai.id`. Spesifikasi: [`docs/spec/MTS_v3.0.md`](docs/spec/MTS_v3.0.md) (nama internal paket tetap `@publication-prepare/*`).

> **Status:** akses awal (beta). Aturan venue (4 profil, semuanya `needs_review`), rumus skor kesiapan, dan kuota bersifat **sementara/provisional**.
> Penyedia nyata (Anthropic, literatur, Gmail, Google, Midtrans, Redis) belum diuji; lihat [`docs/HANDOVER.md`](docs/HANDOVER.md).

## Struktur

```
apps/web/            Next.js 14 (App Router): UI + API (route handlers), NextAuth (JWT)
packages/
  core/              envelope API, galat, validator, rate limit, config/boot check, webhook Midtrans
  db/                model Mongoose + cascade hapus + penyimpanan retensi
  manuscript/        parser Markdown/LaTeX, layanan proyek/versi, retensi
  ai/                runtime agen, provider (anthropic | demo | fake), tool registry, ledger pemakaian
  literature/        pencarian/verifikasi referensi, validator sitasi (fail-closed), benchmark
  venues/            profil venue sebagai DATA (JSON) + skema + kesegaran
  checks/            pemeriksaan deterministik, penilai AI berbukti, rumus kesiapan, laporan job
  edits/             usulan edit (diff, terima/tolak, versi dasar, gerbang sitasi)
  export/            BibTeX, Markdown->LaTeX, ZIP, panduan Overleaf (unggah manual)
  indicators/        indikator kemiripan literal dan statistik gaya (deskriptif, tanpa vonis)
  mailer/            email (Gmail OAuth2)
scripts/             seed, retensi, preflight, uji HTTP end-to-end (scripts/e2e)
deploy/              nginx, skrip deploy/rollback/backup/healthcheck
docs/                SETUP, DEPLOY, HANDOVER, ENV_CHECKLIST, keputusan, QA, runbook
```

## Menjalankan lokal

```
npm ci
cp .env.example apps/web/.env.local     # isi nilai (lihat docs/ENV_CHECKLIST.md); JANGAN commit
npm run lint && npm test                # tanpa DB/jaringan
npm run build && npm run start          # atau: npm run dev
npm run preflight                       # periksa env + koneksi sebelum start
```

Butuh MongoDB (`MONGODB_URI`). Untuk mencoba tanpa penyedia nyata: `AI_PROVIDER=fake AI_ALLOW_FAKE=true AI_MODEL_CHAT=demo-model LITERATURE_PROVIDERS=fixture LITERATURE_ALLOW_FIXTURE=true`
(provider PALSU dan korpus SINTETIS; bukan Claude dan bukan sumber literatur nyata).

## Skrip

| Perintah | Fungsi |
|---|---|
| `npm run lint` | ESLint (web + packages + scripts) |
| `npm test` | tes unit semua workspace |
| `npm run build` / `start` / `dev` | Next.js |
| `npm run preflight` | pemeriksaan env, Mongo, (opsional) Redis, SMTP |
| `npm run retention` | pekerja retensi (dry-run kecuali `RETENTION_ENABLED=true`) |
| `npm run seed:venues` | seed profil venue |
| `node scripts/e2e/<berkas>.js` | uji HTTP (butuh server + MongoDB uji; lihat docs/SETUP.md) |

## Dokumen

[SETUP](docs/SETUP.md) · [DEPLOY](docs/DEPLOY.md) · [ENV_CHECKLIST](docs/ENV_CHECKLIST.md) · [HANDOVER](docs/HANDOVER.md) · [Keputusan](docs/decisions/decision-log.md) · [Laporan QA](docs/qa/QA-QC-Report.md) · [Status](docs/progress/STATUS.md)

## Prinsip

Model tidak pernah menghasilkan sitasi yang diterima tanpa rekaman referensi terverifikasi; tidak ada skor tanpa bukti berlokasi; indikator kemiripan/gaya hanya angka deskriptif tanpa vonis; data pengguna difilter per pemilik di setiap rute.
