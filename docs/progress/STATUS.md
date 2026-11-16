# STATUS pelaksanaan MTS v3.0

> Dokumen hidup. Sesi baru melanjutkan dari sini dan dari `git log`. Jangan mengulang tahap yang sudah LULUS.
> Acuan: `docs/spec/MTS_v3.0.md` (identik dengan blueprint di root), `docs/decisions/decision-log.md`, `CLAUDE.md`.

## Posisi saat ini
- Tahap berjalan: **Final QA** (Tahap 0-8 diimplementasikan dan ter-commit; Tahap 7 dan 8 dalam satu commit karena berkas bersama). Sisa: QA bersih (`npm ci`, test, build), audit read-only docs/qa/QA-QC-Report.md (P1/P2) + QC silang, ringkasan akhir.
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
| 3 | Agen chat + SSE + usage | LULUS | ai 54 tes, core 30, db 4, manuscript 36; build OK; e2e chat 44/44 (scripts/e2e/chat.js); UI chat 20/20 (puppeteer); QC subagent: 7 temuan, 5 ditangani, D3-08 untuk keputusan produk |
| 4 | Literatur + integritas sitasi | LULUS | literature 98 tes; benchmark 57 kasus nol kebocoran; e2e references 70/70, chat 44/44; UI refs 18/18; QC 2 putaran, semua temuan ditangani test-first |
| 5 | Venue + cek deterministik + kesiapan | LULUS (formula PROVISIONAL) | venues 7, checks 60 tes; e2e report 41/41; UI 20/20; QC independen ditangani (D5-06); butuh persetujuan PO + reviewer akademik |
| 6 | Edit, ekspor, Overleaf | LULUS (dengan batasan TIDAK DIVERIFIKASI) | edits 21, export 17 tes; e2e edits 57/57; UI 17/17; QC independen ditangani (D6-04); template venue + kompilasi LaTeX + Overleaf nyata TIDAK DIVERIFIKASI |
| 7 | Hardening, retensi, produksi | LULUS gate otomatis+fungsional; GATE 7 (rilis) BELUM terpenuhi | core 42, manuscript 43, db 4 tes; e2e hardening 36/36, proxy 1/1+2/2; UI regresi hijau; QC independen 2 putaran ditangani (D7-01/02); backup/restore, alerting, hukum, beta, Redis nyata, uji beban TIDAK DIVERIFIKASI |
| 8 | Pasca-MVP (indikator kemiripan/gaya saja) | LULUS sebagian (W2 terbatas) | indicators 11 tes; e2e 20/20; UI 11/11; W1,W3-W10 TIDAK dikerjakan (D8-01) |

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

## Tahap 3 - ringkasan bukti dan sisa
- Provider nyata Anthropic: TIDAK DIVERIFIKASI (butuh ANTHROPIC_API_KEY, AI_MODEL_CHAT, dan menaikkan @anthropic-ai/sdk dari ^0.27.0). Hanya dipetakan lewat klien palsu.
- Semua uji HTTP/UI memakai provider demo (AI_PROVIDER=fake, AI_ALLOW_FAKE=true). Balasan ditandai "PROVIDER PALSU".
- Temuan QC yang diperbaiki (tes gagal dulu): stream tanpa message_end/teks kosong tidak lagi completed; kegagalan persistensi tetap menutup stream; retry paralel lewat compare-and-set; heading/judul naskah dinetralkan di system prompt; teks parsial dipertahankan saat batal/timeout (ditemukan e2e); coba-lagi UI setelah galat pra-pemeriksaan.
- Keputusan terbuka untuk pemilik produk: D3-02, D3-03, D3-06, D3-08.

## Tahap 4-5 - catatan
- Penyedia literatur nyata (OpenAlex/Crossref/Semantic Scholar): adapter ada, TIDAK DIVERIFIKASI terhadap API langsung. Uji memakai provider fixture (DOI 10.99999/...).
- Semua 4 profil venue berstatus needs_review/unverified (checkedAt null): label "siap" tidak pernah diberikan; perlu verifikasi manusia atas sumber resmi.
- Formula kesiapan `formula-provisional-0.1` dan rubrik (7 kriteria) BELUM dikalibrasi/disetujui (docs/eval/rubric-calibration.md).
- Keputusan terbuka PO: D4-02, D5-01..05.
- Commit Tahap 4 hanya memuat berkas khusus Tahap 4; berkas bersama (Workspace, db/index, next.config, package*.json, chatService, projectCascade, decision-log) masuk commit Tahap 5, sehingga commit Tahap 4 sendiri tidak dijamin dapat di-build.

## Tahap 7 - rencana dan kriteria sukses (langkah -> verifikasi)
1. Batas laju: store dapat diganti (memory + Redis opsional via REDIS_URL), `TRUST_PROXY` mengatur kepercayaan X-Forwarded-For (QA-05) -> verifikasi: tes core (klien Redis palsu), e2e: 8 register dengan XFF berputar tidak lolos bila TRUST_PROXY tidak true.
2. Fail-fast env saat boot (`instrumentation.js` + `bootProblems`, QA-16/29) -> verifikasi: tes core; `NODE_ENV=production next start` tanpa env wajib gagal start dengan nama variabel.
3. Retensi terjadwal + hapus akun (QA-09, D0-08): `scripts/retention.js` (dry-run default), `DELETE /api/account` -> verifikasi: tes retensi, e2e hapus akun (cascade, IDOR, password salah).
4. Hardening: cek Origin (QA-18), batas body streaming (QA-11), kuota proyek tahan balapan (QA-10), waktu `forgot-password` (QA-13), pencabutan sesi setelah reset password (QA-14), rute lama unggah Cloudinary dinonaktifkan (QA-07), HSTS produksi (QA-24) -> verifikasi: tes regresi/e2e per butir.
5. Keamanan: sapuan NoSQL injection semua rute, pemindaian bundle klien untuk rahasia, webhook replay -> verifikasi: `scripts/e2e/security.js`.
6. Dokumen: SETUP.md, runbook backup/restore (TIDAK DIUJI tanpa mongodump/infrastruktur), draf kebijakan privasi/ToS (BELUM ditinjau hukum), biaya per alur (ESTIMASI, butuh harga model nyata).
7. QC independen -> perbaiki -> gate build/e2e/UI -> commit.

## Temuan terbuka (dicatat, belum diperbaiki)
Catatan pemetaan: penomoran T6-05, T7-05, T7-06 berasal dari pesan pengguna; pemetaannya ke daftar QC di bawah adalah penafsiran saya (tolong koreksi bila berbeda).
- **T6-05 (Tahap 6)**: gerbang sitasi usulan edit memakai penyaring Tahap 4 sehingga atribusi naratif tanpa kurung ("Smith 2020 melaporkan") tidak terdeteksi; batas 20 usulan pending tidak atomik antar-giliran chat bersamaan; usulan lama (rejected/stale/accepted) tidak dibersihkan otomatis; unduhan `<a download>` tidak menampilkan galat server dengan rapi; ukuran/jenis berkas/struktur ZIP terhadap Overleaf nyata tidak diverifikasi.
- **T7-05 (Tahap 7)**: Redis limiter dan impor dinamis `ioredis` TIDAK DIVERIFIKASI pada Redis nyata; jatuh ke memory per instance saat Redis gagal (batas efektif N x); kunci email login/forgot/resend dapat dihabiskan pihak lain untuk mengunci korban sementara (ditahan batas IP).
- **T7-06 (Tahap 7)**: hapus akun Google-only tanpa re-autentikasi segar; pekerjaan latar (chat SSE/laporan) yang masih menulis setelah sapuan kedua dapat meninggalkan data yatim; bug rute lama di luar cakupan (kuota analisis tidak atomik dan membocorkan `err.message`, webhook Midtrans dapat memperpanjang langganan dua kali pada notifikasi bersamaan, `journals` tanpa batas `limit`, CastError 500 pada id tidak valid di `analyses/[id]` dan `manuscripts/[id]`).
- Lain-lain terbuka dari QA awal: QA-06 (npm audit), QA-08 (staging/alerting/uji restore nyata), QA-19 (parser BAB/`\and`), QA-20 (lint), QA-21 (kontras), QA-22 (tautan Navbar mati), QA-23 (halaman 404/error), QA-25 (enumerasi email register), CSP belum aktif, kebijakan privasi/ToS hanya draf, kontak insiden, beta tertutup, uji beban/p95.
