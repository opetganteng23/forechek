# STATUS pelaksanaan MTS v3.0 / Forechek

> Dokumen hidup. Sesi baru melanjutkan dari sini dan dari `git log`. Acuan: `docs/spec/MTS_v3.0.md`, `docs/decisions/decision-log.md`, `CLAUDE.md`.
> Serah terima: [docs/HANDOVER.md](../HANDOVER.md). Bukti QA terbaru: [docs/qa/QA-QC-Report.md](../qa/QA-QC-Report.md) bagian 11.

## Posisi saat ini
**Kode dan paket deploy SIAP; menunggu Anda mengisi env dan menjalankan deploy.** Tahap 0-8 diimplementasikan (Tahap 8 hanya W2 terbatas). Semua perbaikan temuan reviewer ditutup dengan tes (peta: [REGRESSION-MAP](../qa/REGRESSION-MAP.md)). Yang belum teruji terhadap layanan nyata ditandai TIDAK DIVERIFIKASI (bagian bawah).

## Cara memulai ulang (lingkungan lokal)
```
npm ci && npm run lint && npm test && npm run build
npm run preflight -- --no-network     # periksa env tanpa koneksi
npm run audit:integrity               # audit integritas ilmiah offline
# Uji HTTP: butuh server produksi + MongoDB uji (scripts/e2e/*.js, lihat docs/SETUP.md). Restart server di antara skrip.
```

## Stage-gate: ringkasan
| Tahap | Isi | Status | Bukti utama |
|---|---|---|---|
| 0 | Audit & keputusan | LULUS (dokumen) | docs/audit, docs/decisions |
| 1-2 | Fondasi, auth, proyek, versi, parser, UI | LULUS dengan perbaikan | docs/qa/QA-QC-Report-baseline.md |
| 3 | Agen chat + SSE + usage | LULUS | e2e chat 45/45, UI chat 20/20 |
| 4 | Literatur + integritas sitasi | LULUS (penyaring berbasis pola, lihat O-02) | literature 137 tes (21 bentuk atribusi palsu); benchmark 57 kasus nol kebocoran; e2e references 70/70 |
| 5 | Venue + cek deterministik + kesiapan | LULUS (formula PROVISIONAL) | checks 62, venues 7 tes; e2e report 41/41; UI 20/20 |
| 6 | Edit, ekspor, Overleaf | LULUS (batasan TIDAK DIVERIFIKASI) | edits 22, export 18; e2e edits 57/57; UI 17/17 |
| 7 | Hardening, retensi, produksi | LULUS gate otomatis + fungsional; Gate 7 (rilis) BELUM terpenuhi | core 58, manuscript 49; e2e hardening 42/42, proxy 1/1 + 2/2, webhook 14/14 + 2/2 |
| 8 | Indikator kemiripan/gaya (W2 terbatas) | LULUS sebagian | indicators 11 tes; e2e 20/20; UI 11/11 |
| Final | Paket deploy, preflight, rebrand, QA akhir | LULUS dengan batasan | UI utama 25/25; lint 0 error; test 443/0 gagal; build bersih |
| Tambahan | Email SMTP biasa (D11-01), trial 1 paper per akun (D11-02), rapikan `.env` produksi | LULUS (uji SMTP nyata TIDAK DIVERIFIKASI) | trial e2e 16/16; mailer 4 tes; preflight `--no-network` 4 LULUS / 0 GAGAL |

Angka tes unit terakhir (`npm test`, 11 workspace): ai 65, checks 62, core 58, db 4, edits 22, export 18, indicators 11, literature 137, mailer 4, manuscript 55, venues 7 = **443, 0 gagal**.

## Keputusan sementara (provisional) yang perlu disetujui pemilik produk
Lihat [decision-log](../decisions/decision-log.md) dan HANDOVER bagian 2: D3-02, D3-03, D3-06, D3-08, D4-02, D5-01..05, harga/kuota (D0-07), retensi (D0-08). Rumus kesiapan `formula-provisional-0.1`, ambang literatur, kuota, dan batas agen semuanya PROVISIONAL.

## TIDAK DIVERIFIKASI (butuh layanan/akun/infrastruktur nyata)
Anthropic (API nyata dan ID model), penyedia literatur nyata (OpenAlex/Crossref/Semantic Scholar), pengiriman email lewat SMTP (host/port/user/password; untuk Gmail: App Password 16 karakter tanpa spasi), login Google opsional (termasuk re-autentikasi hapus akun), Midtrans sandbox, Redis nyata, cookie `Secure` di HTTPS, nginx/pm2/certbot/mongodump/symlink atomik di Linux, backup-restore, alerting, uji beban, beta, kompilasi LaTeX/template venue/Overleaf, tinjauan hukum.

## Temuan terbuka (penomoran O-xx; ID T6-05, T7-05, T7-06, T7-01.. kembali ke arti aslinya dari reviewer dan semuanya DITUTUP dengan tes)
| ID | Temuan terbuka | Catatan |
|---|---|---|
| O-01 | Next.js 14.2.35 (14.2.x terbaru) memiliki advisori; perbaikan resmi hanya di Next >= 15.5.x/16 | Mitigasi: `images.unoptimized`, tanpa Server Actions/rewrites, Linux di belakang nginx (DEPLOY.md bagian 11). Rencanakan upgrade sebelum rilis publik luas |
| O-02 | Penyaring sitasi tetap berbasis pola | 21+ bentuk atribusi diuji dan diblokir, tetapi bentuk baru yang tidak tercakup masih mungkin; jaminan berlaku sebatas benchmark dan bentuk yang diketahui |
| O-03 | 4 profil venue `needs_review` | Butuh verifikasi manusia (HANDOVER) |
| O-04 | Rumus kesiapan dan rubrik belum disetujui PO + reviewer akademik | PROVISIONAL |
| O-05 | Kebijakan privasi/ToS hanya draf; persetujuan di form daftar belum ada | Butuh tinjauan hukum |
| O-06 | Backup-restore, alerting, uji beban, beta belum dilakukan | Runbook ada, status BELUM DIUJI |
| O-07 | Semua integrasi nyata belum diuji | Lihat daftar TIDAK DIVERIFIKASI |
| O-08 | Skrip deploy (symlink atomik, pm2, nginx, certbot) hanya diuji dengan stub; tidak ada Linux di mesin pengembangan | Jalankan DEPLOY.md bagian 7 di server |
| O-09 | Rute lama tersisa (analyses/[id], manuscripts/[id]: id tidak valid -> 500; journals tanpa batas `limit`; payments/create tanpa envelope) | Unggah/analisis lama sudah 410; sisanya tidak dirutekan dari UI baru |
| O-10 | CSP masih mengizinkan `style-src 'unsafe-inline'` | Risiko XSS utama (script) tertutup nonce + strict-dynamic |
| O-11 | Kunci email login/forgot/resend dapat dihabiskan pihak lain (kunci korban terkunci sementara) | Ditahan batas IP; butuh keputusan produk |
| O-12 | Hapus akun: pekerjaan latar yang masih menulis sesudah sapuan kedua dapat meninggalkan data yatim; backup memuat data terhapus sampai kedaluwarsa | Dinyatakan di kebijakan privasi draf |
| O-13 | ESLint 8 (EOL) dan 9 peringatan lint | `eslint-config-next@14` mensyaratkan ESLint 8 |
| O-14 | Usulan edit lama (rejected/stale/accepted) tidak dibersihkan otomatis; batas 20 pending tidak atomik antar-giliran | Dampak kecil |
| O-15 | Streaming chat per KALIMAT lengkap (konsekuensi perbaikan F-02): jawaban satu kalimat muncul sekaligus di akhir | Perilaku disengaja (D10-01) |
| O-16 | Kontras warna `ink-faint` (QA-21) | Belum diperbaiki |

## Log perbaikan blok final (git log menyimpan rinciannya)
BLOK 0 `.gitignore`, pemindaian rahasia (bersih); BLOK 1 A-K (F-02, parser, webhook, T6-05, T7-05, T7-06, CSP, audit, SDK, item kecil, lint); BLOK 2 rebrand Forechek; BLOK 3 paket deploy + preflight + ENV_CHECKLIST + DEPLOY; BLOK 4 QA akhir; BLOK 5 HANDOVER. Keputusan: D10-01..D10-08 di decision-log.
