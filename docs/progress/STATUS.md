# STATUS pelaksanaan MTS v3.0

> Dokumen hidup. Sesi baru melanjutkan dari sini dan dari `git log`. Jangan mengulang tahap yang sudah LULUS.
> Acuan: `docs/spec/MTS_v3.0.md` (identik dengan blueprint di root), `docs/decisions/decision-log.md`, `CLAUDE.md`.

## Posisi saat ini
- Tahap berjalan: **Tahap 3** (perbaikan gate 1-2: QA-01, QA-04, QA-12, QA-15 SELESAI, commit `fix: gate Tahap 1-2`).
- Langkah berikut: lihat "Rencana tahap berjalan" di bawah.

## Cara memulai ulang (lingkungan lokal)
```
npm ci
npm test                       # semua workspace (tanpa DB; memakai penyimpanan palsu)
npm run build
# Uji HTTP butuh MongoDB uji. Di mesin ini dipakai mongodb-memory-server di folder scratchpad
# (di luar repo). Server uji: `npm run start` (build produksi) atau `npm run dev`.
# Skrip uji HTTP berada di scripts/e2e/ dan membaca BASE_URL + MONGODB_URI dari env.
```

## Stage-gate: ringkasan
| Tahap | Isi | Status | Bukti |
|---|---|---|---|
| 0 | Audit & keputusan | LULUS (dokumen) | docs/audit, docs/decisions |
| 1 | Fondasi + auth | LULUS | docs/qa/QA-QC-Report.md (QC independen + QC silang subagent) |
| 2 | Proyek, versi, parser, UI | LULUS dengan perbaikan | docs/qa/QA-QC-Report.md |
| 3 | Agen chat + SSE + usage | BELUM | - |
| 4 | Literatur + integritas sitasi | BELUM | - |
| 5 | Venue + cek deterministik + kesiapan | BELUM | - |
| 6 | Edit, ekspor, Overleaf | BELUM | - |
| 7 | Hardening, retensi, produksi | BELUM | - |
| 8 | Pasca-MVP (indikator kemiripan/pola) | BELUM | - |

## Keputusan sementara (provisional) yang perlu disetujui pemilik produk
Lihat `docs/decisions/decision-log.md` (ID D3-xx dst.). Daftar ringkas diurutkan dampak ditulis di akhir.

## TIDAK DIVERIFIKASI (butuh kredensial/akun nyata)
- Pengiriman email nyata (Gmail OAuth2), login Google, Midtrans sandbox, Anthropic API nyata, penyedia literatur nyata, Overleaf, Redis, HTTPS/cookie Secure.

## Blocker
- (kosong)

## Rencana tahap berjalan
1. Commit baseline kode Tahap 0-2 (belum pernah ter-commit) -> verifikasi: `git log`.
2. Perbaikan terbukti dari QA (tes gagal dulu): QA-01 webhook, QA-04/15 koneksi DB, QA-12 parser -> verifikasi: `npm test` hijau, uji HTTP.

## Log perbaikan gate Tahap 1-2 (dari audit QA)
| ID | Perbaikan | Bukti |
|---|---|---|
| QA-01 | `verifyMidtransSignature` (core) menolak kunci kosong, timingSafeEqual; webhook 503 bila kunci kosong, 400 JSON rusak | core payments.test.js (5 tes, gagal dulu); scripts/e2e/webhook.js 9/9 (dengan kunci dummy) dan 2/2 (tanpa kunci) |
| QA-04 | dbConnect tidak men-cache promise yang ditolak | db connection.test.js; HTTP: health 503 lalu 200 tanpa restart |
| QA-15 | serverSelectionTimeoutMS 5000 | db connection.test.js |
| QA-12 | parser: `Math.min(...levels)` diganti reduce | manuscript parser.test.js (200.000 heading) |
Sisa temuan QA (QA-05..QA-11, 13, 14, 16-30) dijadwalkan di Tahap 7 (hardening) kecuali bila Tahap 3-6 menyentuhnya.
