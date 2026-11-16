# Peta tes regresi temuan reviewer

Setiap temuan lama memiliki tes yang GAGAL bila perbaikannya dibuang. Perintah dijalankan dari root repo. Tes unit: `npm test` (semua workspace) atau `npm test -w <paket>`.
Tes HTTP (`scripts/e2e/*.js`) butuh server produksi + MongoDB uji: lihat [docs/SETUP.md](../SETUP.md). Restart server di antara skrip (batas laju login).

| ID | Temuan | Tes | Perintah |
|---|---|---|---|
| T7-01 | bucket `unknown` global mengunci semua pengguna | `packages/core/test/hardening.test.js` ("T7-01"); e2e `proxy.js` (15 pengguna berbeda login pada server `TRUST_PROXY=false`) | `npm test -w @publication-prepare/core`; `BASE_URL=http://localhost:3001 EXPECT_TRUST=false node scripts/e2e/proxy.js` |
| T7-02 | retensi menghapus tanpa cek ulang | `packages/manuscript/test/retention.test.js` ("TOCTOU"); e2e `hardening.js` (DB nyata: versi disimpan di antara `findExpired` dan `deleteProject` -> tidak terhapus; status `deletion_pending`) | `npm test -w @publication-prepare/manuscript`; `node scripts/e2e/hardening.js` |
| T7-03 | banjir kunci menghapus penghitung korban | `packages/core/test/hardening.test.js` ("T7-03") | `npm test -w @publication-prepare/core` |
| T7-04 | boot check: `REQUIRE_EMAIL_VERIFICATION` tanpa GMAIL, `REDIS_URL` tanpa ioredis, AI kosong | `hardening.test.js` ("T7-04", "H1", "placeholder"); `scripts/preflight.js` | idem; `npm run preflight` |
| T7-05 | cek Origin di belakang proxy | `packages/core/test/origin.test.js` | `npm test -w @publication-prepare/core` |
| T7-06 | sesi dicabut / hapus akun Google-only | `origin.test.js` (re-autentikasi segar); e2e `hardening.js` (REAUTH_REQUIRED, rute lama 401 setelah reset password); UI `ui_main.js` (redirect bersih) | idem |
| T7-07 | indeks parsial `retentionExpiresAt` | `packages/db/models/Project.js` (partialFilterExpression); dipakai oleh `retentionStore.findExpired` (e2e hardening) | `node scripts/e2e/hardening.js` |
| T8-01 | tokenisasi indikator kuadratik | `packages/indicators/test/indicators.test.js` ("T8-01", < 200 ms, waktu terbaik dari 3) | `npm test -w @publication-prepare/indicators` |
| F-02 | gerbang sitasi berbasis pola; atribusi naratif lolos | `packages/literature/test/attribution.test.js` (21 bentuk palsu, 9 sah, 7 kalimat biasa, stream); `packages/edits/test/qc6.test.js` (gerbang edit); `packages/checks` (F-01) | `npm test -w @publication-prepare/literature` dst. |
| F-01 | rationale/saran penilai tidak disanitasi | `packages/checks/test/qc5.test.js` | `npm test -w @publication-prepare/checks` |
| F-04 | CPU parser / dokumen parse > 16 MB | `packages/manuscript/test/parser.test.js` ("CPU/ukuran parser") | `npm test -w @publication-prepare/manuscript` |
| F-05 | rute analisis lama tanpa kendali | e2e `hardening.js` (410) | `node scripts/e2e/hardening.js` |
| Midtrans | notifikasi bersamaan memperpanjang dua kali; jumlah tak dicek | `packages/core/test/paymentWebhook.test.js` (10 paralel -> sekali); e2e `webhook.js` (12 paralel pada DB nyata: tepat +30 hari; jumlah salah -> 409) | `npm test -w @publication-prepare/core`; `MIDTRANS_SERVER_KEY=dummy-e2e-key` pada server, `node scripts/e2e/webhook.js` |
| T6-01..03 | `accepting` macet; LaTeX berbahaya; subbagian hilang | `packages/edits/test/qc6.test.js`; e2e `edits.js` | `npm test -w @publication-prepare/edits`; `node scripts/e2e/edits.js` |
| T6-04 | DOI/URL BibTeX di-escape | `packages/export/test/qc6.test.js` | `npm test -w @publication-prepare/export` |
| T6-05 | heading pertama menjadi `\title` | `packages/export/test/qc6.test.js` ("T6-05") | idem |
| QA-19 | BAB I-V, YAML flow list, `\and` | `packages/manuscript/test/qa19.test.js` | `npm test -w @publication-prepare/manuscript` |
| QA-25 | register membocorkan email terdaftar | e2e `hardening.js` (respons identik) | `node scripts/e2e/hardening.js` |
