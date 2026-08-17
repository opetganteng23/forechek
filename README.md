# Platform Cek Kesiapan Publikasi Ilmiah

Monorepo Node.js (npm workspaces) untuk platform analisis kesiapan naskah ilmiah berbasis AI.
Spesifikasi lengkap ada di [`Publication Prepare.md`](./Publication%20Prepare.md).

## Struktur Monorepo

```
apps/
  web/                  # Next.js 14 (App Router) - frontend + API routes
packages/
  db/                   # Koneksi MongoDB (Mongoose) + semua model
  mailer/                # Nodemailer + Gmail OAuth2, template email
  ai/                    # Wrapper Anthropic Claude + prompt analisis naskah
scripts/
  seedJournals.js        # Seed data awal koleksi journals
```

## Setup

1. Install dependencies dari root (npm workspaces akan menautkan semua paket):
   ```
   npm install
   ```
2. Salin `.env.example` menjadi `.env.local` di dalam `apps/web/` (Next.js membaca env dari situ)
   dan isi seluruh kredensial (MongoDB, NextAuth, Google OAuth, Gmail OAuth2, Anthropic, Cloudinary, Midtrans).
   Untuk skrip di `scripts/` (dijalankan dari root), buat juga `.env` di root berisi `MONGODB_URI`.
3. Jalankan dev server:
   ```
   npm run dev
   ```
   Aplikasi akan berjalan di http://localhost:3000

## Perintah Penting

| Perintah | Deskripsi |
|---|---|
| `npm run dev` | Jalankan Next.js dev server (`apps/web`) |
| `npm run build` | Build production |
| `npm run start` | Jalankan production build |
| `npm run seed:journals` | Seed contoh data jurnal ke MongoDB |

## Menambah Paket Bersama Baru

Buat folder baru di `packages/<nama>` dengan `package.json` bernama `@publication-prepare/<nama>`,
lalu tambahkan sebagai dependency di `apps/web/package.json` dengan versi `"*"`, kemudian `npm install` ulang dari root.
