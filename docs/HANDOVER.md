# HANDOVER - Forechek

Dokumen serah terima. Bukti pengujian (perintah dan keluaran) ada di [docs/qa/QA-QC-Report.md](qa/QA-QC-Report.md) bagian 11. Tahap, keputusan, dan temuan terbuka: [docs/progress/STATUS.md](progress/STATUS.md), [docs/decisions/decision-log.md](decisions/decision-log.md).

**Ringkasan jujur.** Kode, tes, build, dan paket deploy siap. Yang **belum pernah dijalankan terhadap layanan nyata**: Anthropic, penyedia literatur, Gmail, Google login, Midtrans, Redis, HTTPS/cookie aman, nginx/pm2/certbot/mongodump di server. Itu semua ditandai TIDAK DIVERIFIKASI dan ada langkah ujinya di bagian 2. Profil venue tetap `needs_review`, rumus kesiapan tetap provisional, dokumen hukum tetap draf.

---

## 1. TINGGAL ANDA (urut, bisa disalin)

DNS `forechek.ailo.ai.id` sudah ada. Detail tiap langkah: [docs/DEPLOY.md](DEPLOY.md).

1. **Siapkan server** (Ubuntu, sebagai root) - DEPLOY.md bagian 1:
   ```bash
   adduser --disabled-password --gecos "" forechek
   apt update && apt install -y git curl ufw nginx certbot python3-certbot-nginx logrotate
   curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs && npm i -g pm2
   ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable
   mkdir -p /var/www/forechek/{releases,shared} /var/log/forechek /var/backups/forechek /var/www/certbot
   chown -R forechek:forechek /var/www/forechek /var/log/forechek /var/backups/forechek && chmod 700 /var/backups/forechek
   ```
2. **Database**: buat cluster MongoDB Atlas (atau MongoDB lokal), user `readWrite` untuk database `forechek`, allowlist IP server. Siapkan connection string.
3. **Ambil kode** (sebagai `forechek`): `git clone <REPO_URL> /var/www/forechek/source`
4. **Isi env** (`/var/www/forechek/shared/.env.local`, `chmod 600`): salin `.env.example`, lalu isi nilai berikut (cara membuat: [ENV_CHECKLIST.md](ENV_CHECKLIST.md)):
   - Wajib: `NEXTAUTH_SECRET` (`openssl rand -base64 32`), `MONGODB_URI`, `BASE_URL`, `NEXTAUTH_URL` (`https://forechek.ailo.ai.id`), `TRUST_PROXY=true`, `NODE_ENV=production`.
   - Disarankan: `ALLOWED_ORIGINS=https://forechek.ailo.ai.id`.
   - AI: `ANTHROPIC_API_KEY`, `AI_MODEL_CHAT` (+ `AI_MODEL_REPORT`, `AI_MODEL_LIGHT`; saran di `.env.example`, **cek ID model masih berlaku**).
   - Literatur: `LITERATURE_PROVIDERS=openalex,crossref`, `LITERATURE_CONTACT_EMAIL`.
   - Email: `GMAIL_USER`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`. Login Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (redirect `https://forechek.ailo.ai.id/api/auth/callback/google`).
   - Pembayaran (sandbox dulu): `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`; webhook Midtrans diarahkan ke `https://forechek.ailo.ai.id/api/payments/webhook`.
5. **Periksa env**: `cd /var/www/forechek/source && npm ci && cp ../shared/.env.local apps/web/.env.local && npm run preflight` (semua butir wajib `LULUS`), lalu `rm apps/web/.env.local`.
6. **nginx + TLS** (root; sertifikat belum ada, jadi bootstrap dulu): pasang `deploy/nginx/forechek-http-only.conf` sebagai `/etc/nginx/sites-available/forechek.conf` (symlink ke `sites-enabled`, hapus `default`), `nginx -t && systemctl reload nginx`; lalu `certbot certonly --webroot -w /var/www/certbot -d forechek.ailo.ai.id`; lalu ganti isi berkas itu dengan `deploy/nginx/forechek.conf`; lalu `nginx -t && systemctl reload nginx`. Rinci: DEPLOY.md bagian 3.
7. **Deploy**: `RUN_TESTS=1 /var/www/forechek/source/deploy/scripts/deploy.sh main`, lalu `pm2 startup systemd -u forechek --hp /home/forechek` (jalankan baris yang dicetak sebagai root) dan `pm2 save`.
8. **Cron** (DEPLOY.md bagian 5): backup harian, retensi (dry-run), healthcheck; `cp deploy/logrotate/forechek /etc/logrotate.d/forechek`.
9. **Uji pasca-deploy** (DEPLOY.md bagian 7) dan **uji restore** (bagian 9); catat hasilnya di `docs/ops/RUNBOOK.md`.
10. Pasang pemantau uptime/alert pada `https://forechek.ailo.ai.id/api/health` (belum ada di repo).
11. Setelah email terbukti jalan: set `REQUIRE_EMAIL_VERIFICATION=true`, `pm2 reload forechek --update-env`.

---

## 2. BELUM TERVERIFIKASI & BUTUH MANUSIA

Setiap butir: langkah uji konkret dan hasil yang diharapkan. Catat hasil di `docs/ops/RUNBOOK.md` atau `docs/qa/`.

### Persetujuan dan keputusan manusia
| Butir | Yang harus dilakukan | Hasil yang diharapkan |
|---|---|---|
| **Verifikasi 4 profil venue** (IEEE conference, IEEE journal, Scopus, SINTA generik) | Buka tiap `packages/venues/data/*.json`; bandingkan setiap aturan dengan URL di `sources`; perbaiki nilai; set `verification: "verified"`, `status: "active"`, `checkedAt` (tanggal hari ini); NAIKKAN `version`; `npm run seed:venues` | Di tab Kesiapan, venue tampil tanpa peringatan "belum dapat dipercaya"; label "siap" menjadi mungkin. Profil `scopus-generic` adalah indeks, bukan venue; pertimbangkan menggantinya dengan venue spesifik |
| **Persetujuan rumus dan rubrik** (Product Owner + reviewer akademik) | Tinjau `packages/checks/src/readiness.js` (`formula-provisional-0.1`) dan `docs/eval/rubric-calibration.md`; kalibrasi dengan sampel naskah bernilai manusia; ubah `FORMULA`/rubrik, naikkan versi | Dokumen keputusan menyatakan disetujui; label PROVISIONAL dicabut dari UI/laporan (ubah teks) |
| **Tinjauan hukum privasi/ToS** | Tinjau `apps/web/app/privacy/page.jsx` dan `terms/page.jsx` oleh penasihat hukum; hapus banner DRAF; **tambahkan persetujuan eksplisit di form daftar** (belum diimplementasikan); isi kontak dukungan | Halaman final; pengguna menyetujui sebelum daftar |
| **Keputusan produk terbuka** | D3-02 (batas agen), D3-03 (aturan penagihan), D3-06 (prompt caching), D3-08 (retry/tagihan, reconnect), D4-02 (ambang verifikasi referensi), D5-01..05 (venue, pemeriksaan, rubrik, rumus, job laporan), harga/kuota (D0-07): putuskan, ubah nilai di env/kode, catat di decision-log | Tiap D-ID bertanda "disetujui" dengan tanggal |
| **Upgrade Next.js** (O-01) | Rencanakan upgrade ke Next 15.5.x atau 16 + React 19 di staging; jalankan seluruh tes dan UI | `npm audit` tanpa temuan critical/high; semua tes hijau |

### Operasional (butuh server nyata)
| Butir | Langkah uji | Hasil yang diharapkan |
|---|---|---|
| **Backup-restore** | DEPLOY.md bagian 9 (mongodump -> mongorestore ke DB uji -> bandingkan jumlah dokumen) | Jumlah dokumen per koleksi sama; catat RTO/RPO |
| **Alerting** | Daftarkan `/api/health` di pemantau uptime; `pm2 stop forechek` | Alert terkirim dalam <= 3 menit; `pm2 start` memulihkan |
| **Rollback** | Deploy rilis kedua lalu `rollback.sh` | `current` kembali ke rilis lama; `/api/health` 200 |
| **Uji beban** | mis. `npx autocannon -c 20 -d 30 https://forechek.ailo.ai.id/api/health` dan skenario login/simpan versi; tetapkan target p95/p99 setelah kapasitas diketahui | Tidak ada galat 5xx; p95 sesuai target yang Anda tetapkan |
| **Beta tertutup** | Undang kelompok kecil dengan persetujuan; kanal laporan galat/penghapusan; pantau biaya | Tidak ada P0; biaya per alur terukur (isi `docs/ops/COST.md`) |

### Integrasi nyata (semua TIDAK DIVERIFIKASI)
| Integrasi | Langkah uji | Hasil yang diharapkan |
|---|---|---|
| **Anthropic** | Isi kunci + `AI_MODEL_*`; proyek > tab Chat > "baca abstrak saya" | Balasan tanpa label "PROVIDER PALSU"; baris `usageledgers` dengan token > 0; model/penggunaan sesuai. Coba paksa sitasi karangan: harus ditandai "[referensi belum terverifikasi]" |
| **Penyedia literatur** | `LITERATURE_PROVIDERS=openalex,crossref`; tab Referensi > cari "attention is all you need"; verifikasi DOI `10.48550/arXiv.1706.03762` | Kandidat nyata; status `verified` hanya bila DOI+judul+penulis/tahun cocok; DOI palsu -> `unverified` |
| **Gmail OAuth2** | Daftar akun dengan email Anda | Email verifikasi masuk < 1 menit; `npm run preflight` SMTP `LULUS` |
| **Google login** | Tombol "Masuk dengan Google"; lalu Akun > hapus akun dengan akun Google-only | Sesi aktif; hapus akun meminta "Verifikasi ulang dengan Google" lalu berhasil (<= 5 menit sejak masuk Google) |
| **Midtrans sandbox** | Buat pembayaran, selesaikan di simulator; ulangi notifikasi dari dashboard Midtrans | Plan menjadi Pro tepat sekali (+30 hari); notifikasi ulang tidak memperpanjang; jumlah tak cocok -> 409 |
| **Overleaf** | Tab Ekspor > unduh ZIP > Overleaf "New Project > Upload Project" | Terbuka dan terkompilasi (pdfLaTeX); peringatan README relevan. Impor satu klik belum ada |
| **Redis** (hanya bila cluster) | `REDIS_URL`; dua instance; 8 register berturut-turut | 429 lintas instance; preflight Redis `LULUS` |
| **HTTPS/cookie** | DevTools > Application > Cookies | `__Secure-next-auth.session-token` bertanda `Secure`, `HttpOnly`, `SameSite=Lax`; header `Strict-Transport-Security` dan `Content-Security-Policy` ada |
| **Kompilasi LaTeX nyata** | Kompilasi `main.tex` dari paket pada template venue sebenarnya | PDF terbentuk; definisi "paket diuji pada template venue target" (MTS 41.4) terpenuhi |

---

## 3. DITUNDA SESUAI MTS

Tahap 8 (MTS 43) selain W2 menunggu metrik MVP (penggunaan, kualitas, biaya, stabilitas): W1 DOCX, W3 Zotero/Mendeley, W4 ORCID, W5 Overleaf Git sync, W6 diagram, W7 workspace institusi, W8 rekomendasi venue, W9 analitik riset, W10 similarity berlisensi. W2 hanya diimplementasikan terbatas: indikator kemiripan literal terhadap abstrak referensi proyek dan statistik gaya, opsional per proyek, tanpa vonis (D8-01).
