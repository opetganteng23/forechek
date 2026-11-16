# DEPLOY - Forechek di server Linux (Biznet Gio) dengan pm2 + nginx

Target: `https://forechek.ailo.ai.id` (DNS sudah ada, A/AAAA ke IP server). Ubuntu 22.04/24.04. Satu instance aplikasi (pm2 fork) di belakang nginx.
Skrip: [`deploy/scripts/`](../deploy/scripts), nginx: [`deploy/nginx/forechek.conf`](../deploy/nginx/forechek.conf), pm2: [`ecosystem.config.js`](../ecosystem.config.js).

> **Status verifikasi:** sintaks skrip (`bash -n`), `ecosystem.config.js`, dan alur deploy sampai langkah build (dengan `npm`/`pm2` tiruan) sudah diuji; **symlink atomik, pm2, nginx, certbot, mongodump, dan restore BELUM diuji di server nyata** (mesin pengembangan Windows tanpa Linux). Jalankan checklist "Uji pasca-deploy" dan "Uji restore" di bawah dan catat hasilnya di `docs/ops/RUNBOOK.md`.

## 0. Hasil pemindaian rahasia (BLOK 0)

Riwayat git (semua revisi) dan working tree dipindai untuk kunci API (`sk-ant-...`), `mongodb+srv://user:pass@`, `NEXTAUTH_SECRET=<panjang>`, server key Midtrans, token Google/Gmail, dan kunci privat. **Tidak ada rahasia nyata**: semua temuan adalah placeholder (`xxxxxxxxxx`, `your-super-secret-key...`) atau nilai tes (`sk-ant-api03-dummyKeyForTests123`). Satu-satunya berkas env terlacak: `.env.example`. `.env.local` tidak pernah ter-commit.
Bila kelak ada kebocoran: (1) putar kunci yang bersangkutan (Anthropic, Midtrans, SMTP, Google OAuth, password MongoDB, `NEXTAUTH_SECRET` — memutar yang terakhir mencabut semua sesi), (2) hapus dari riwayat dengan `git filter-repo` + force-push (butuh koordinasi), (3) catat tanggal di `docs/ops/RUNBOOK.md`.

## 1. Persiapan server (sekali)

```bash
# sebagai root / sudo
adduser --disabled-password --gecos "" forechek
apt update && apt install -y git curl ufw nginx certbot python3-certbot-nginx logrotate

# Node 20 LTS (atau 22)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs
npm i -g pm2

# firewall: hanya SSH, HTTP, HTTPS (aplikasi mendengar di 127.0.0.1:3000, tidak terbuka)
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable

# direktori
mkdir -p /var/www/forechek/{releases,shared} /var/log/forechek /var/backups/forechek /var/www/certbot
chown -R forechek:forechek /var/www/forechek /var/log/forechek /var/backups/forechek
chmod 700 /var/backups/forechek
```

### MongoDB
- **Atlas (disarankan):** buat cluster, user database khusus aplikasi (hak `readWrite` pada database `forechek`), allowlist IP server, salin connection string ke `MONGODB_URI`. Aktifkan Cloud Backup.
- **Lokal:** pasang MongoDB 7, aktifkan autentikasi, bind ke 127.0.0.1, buat user; `MONGODB_URI=mongodb://USER:PASS@127.0.0.1:27017/forechek?authSource=admin`. Pasang `mongodb-database-tools` untuk backup.

### Redis (opsional)
Hanya perlu bila pm2 mode cluster. `apt install redis-server`, bind 127.0.0.1, set `requirepass`, lalu `REDIS_URL=redis://:PASS@127.0.0.1:6379`. (`ioredis` sudah terpasang sebagai dependensi opsional.) **Integrasi Redis nyata belum diuji.**

## 2. Kode dan env

```bash
sudo -iu forechek
git clone <REPO_URL> /var/www/forechek/source          # repo privat: gunakan deploy key atau token
cp /var/www/forechek/source/.env.example /var/www/forechek/shared/.env.local
chmod 600 /var/www/forechek/shared/.env.local
nano /var/www/forechek/shared/.env.local               # isi sesuai docs/ENV_CHECKLIST.md
```

Periksa env **sebelum** deploy (dari klon sumber, dengan Node terpasang):

```bash
cd /var/www/forechek/source && npm ci && cp ../shared/.env.local apps/web/.env.local && npm run preflight
```
Semua butir wajib harus `LULUS`; butir fitur yang belum Anda konfigurasi boleh `DILEWATI`. (Hapus `apps/web/.env.local` salinan itu setelahnya; `deploy.sh` membuat tautan sendiri.)

## 3. nginx + TLS

Server kosong belum punya sertifikat, sehingga `forechek.conf` (blok 443) belum dapat dimuat. Urutan bootstrap:

```bash
sudo cp /var/www/forechek/source/deploy/nginx/forechek-http-only.conf /etc/nginx/sites-available/forechek.conf
sudo ln -sf /etc/nginx/sites-available/forechek.conf /etc/nginx/sites-enabled/forechek.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx                         # hanya port 80 + /.well-known/acme-challenge
sudo certbot certonly --webroot -w /var/www/certbot -d forechek.ailo.ai.id -m EMAIL_ANDA --agree-tos
sudo cp /var/www/forechek/source/deploy/nginx/forechek.conf /etc/nginx/sites-available/forechek.conf   # ganti ke konfigurasi penuh
sudo nginx -t && sudo systemctl reload nginx
sudo systemctl status certbot.timer                                   # pembaruan otomatis
```

HSTS dipasang di server blok dan diulang di `location /_next/static/` dan location SSE chat (`add_header` di dalam location menimpa yang di server). **`nginx -t` TIDAK DIVERIFIKASI** (nginx tidak terpasang di mesin pengembangan Windows); jalankan di server sebelum reload.

Certbot hanya menerbitkan sertifikat (`certonly`); **tidak mengubah konfigurasi nginx**. Jalur sertifikat sudah tertulis di `forechek.conf` (`/etc/letsencrypt/live/forechek.ailo.ai.id/`). Setelah pembaruan otomatis, nginx perlu reload (tambahkan `--deploy-hook "systemctl reload nginx"` pada pembaruan pertama atau buat berkas di `/etc/letsencrypt/renewal-hooks/deploy/`).

Konfigurasi memasang: redirect HTTP->HTTPS, HSTS, `client_max_body_size 3m`, header `X-Forwarded-*`, rute SSE chat tanpa buffering (`proxy_read_timeout 360s`), dan batas laju nginx sebagai lapisan tambahan.
`TRUST_PROXY=true` + `TRUST_PROXY_HOPS=1` cocok dengan konfigurasi ini (nginx menambahkan IP klien di kanan `X-Forwarded-For`).

## 4. Deploy pertama

```bash
sudo -iu forechek
cd /var/www/forechek/source && RUN_TESTS=1 ./deploy/scripts/deploy.sh main
pm2 startup systemd -u forechek --hp /home/forechek     # jalankan perintah yang dicetak sebagai root
pm2 save
```
`deploy.sh`: mengambil commit, membuat rilis baru di `releases/<waktu>`, `npm ci`, `preflight`, (opsional) `npm test`, `npm run build`, mengganti symlink `current` secara atomik, `pm2 startOrReload`, healthcheck (10x), dan **rollback otomatis** bila healthcheck gagal. Menyimpan 5 rilis terakhir.

## 5. Cron, retensi, log

```bash
sudo crontab -u forechek -e
# backup harian 02:15 (rotasi 14 hari)
15 2 * * *  FORECHEK_ROOT=/var/www/forechek /var/www/forechek/current/deploy/scripts/backup-mongo.sh >> /var/log/forechek/backup.log 2>&1
# retensi (dry-run sampai RETENTION_ENABLED=true) harian 03:00
0 3 * * *   cd /var/www/forechek/current && npm run retention --silent >> /var/log/forechek/retention.log 2>&1
# healthcheck tiap menit (kirim alert dari layanan pemantau eksternal; ini hanya log)
* * * * *   /var/www/forechek/current/deploy/scripts/healthcheck.sh >> /var/log/forechek/health.log 2>&1 || true

sudo cp /var/www/forechek/source/deploy/logrotate/forechek /etc/logrotate.d/forechek     # rotasi log 14 hari
```
Retensi hanya menghapus proyek yang **pengguna** beri masa simpan (`retentionDays`) setelah lewat + masa tenggang; tanpa masa simpan tidak ada yang dihapus otomatis. Aktifkan penghapusan nyata (`RETENTION_ENABLED=true`) hanya setelah memeriksa keluaran dry-run beberapa hari dan setelah kebijakan privasi final.

## 6. Urutan go-live

1. Server siap (bagian 1), env terisi dan `npm run preflight` LULUS (bagian 2).
2. nginx + TLS berfungsi (bagian 3); `curl -I https://forechek.ailo.ai.id/api/health` -> 200.
3. Deploy pertama berhasil (bagian 4), `pm2 status` menampilkan `forechek` online.
4. **Uji pasca-deploy** (di bawah) lulus.
5. **Uji restore** (di bawah) lulus dan dicatat.
6. Aktifkan cron (bagian 5) dan pantau 24 jam. Pasang layanan uptime/alert pada `/api/health` (belum ada di repo).
7. Uji integrasi nyata satu per satu di staging/produksi (lihat [HANDOVER](HANDOVER.md) bagian 2): Anthropic, literatur, SMTP (email), Google login (opsional), Midtrans sandbox. Aktifkan `REQUIRE_EMAIL_VERIFICATION=true` setelah email terbukti.
8. Buka pendaftaran. Draf kebijakan privasi/ToS harus ditinjau hukum **sebelum** pengguna nyata (HANDOVER).

## 7. Uji pasca-deploy (dari mesin lain)

```bash
curl -sI https://forechek.ailo.ai.id/            # 200, header Content-Security-Policy dan Strict-Transport-Security
curl -s  https://forechek.ailo.ai.id/api/health  # {"success":true,"data":{"status":"ok",...}}
curl -sI http://forechek.ailo.ai.id/             # 301 ke https
curl -s -o /dev/null -w "%{http_code}\n" https://forechek.ailo.ai.id/api/projects      # 401 (tanpa sesi)
curl -s -o /dev/null -w "%{http_code}\n" https://forechek.ailo.ai.id/dashboard         # 307/302 ke /login
```
Lalu di browser: daftar -> (verifikasi email bila aktif) -> login -> buat proyek -> simpan naskah -> tab Versi -> tab Ekspor (unduh ZIP). Periksa cookie sesi bertanda `Secure` + `HttpOnly` (belum pernah diverifikasi di HTTPS nyata).

## 8. Rollback

```bash
sudo -iu forechek
/var/www/forechek/source/deploy/scripts/rollback.sh                 # ke rilis sebelumnya
/var/www/forechek/source/deploy/scripts/rollback.sh 20261116-101500   # ke rilis tertentu (ls /var/www/forechek/releases)
```
Rollback hanya mengganti **kode** (symlink + reload). Skema database bersifat aditif (bidang/indeks baru); kode lama mengabaikan bidang baru. Indeks unik baru yang gagal terbentuk (data lama duplikat) terlihat sebagai galat saat boot: perbaiki datanya, jangan menghapus indeks keamanan. Untuk memulihkan **data**, gunakan restore backup (bagian 9).

## 9. Backup dan uji restore

Backup: `backup-mongo.sh` (mongodump `--gzip --archive`, rotasi 14 hari, izin 700). Backup memuat naskah pengguna: simpan terenkripsi, batasi akses; data yang dihapus pengguna tetap ada di backup sampai kedaluwarsa (kebijakan privasi harus menyatakannya).

**Uji restore (wajib sebelum rilis):**
```bash
mongorestore --uri="mongodb://127.0.0.1:27017" --archive=/var/backups/forechek/forechek-XXXX.archive.gz --gzip --nsFrom='forechek.*' --nsTo='forechek_restoretest.*'
mongosh "mongodb://127.0.0.1:27017/forechek_restoretest" --eval 'db.getCollectionNames().forEach(c => print(c, db[c].countDocuments()))'
# bandingkan jumlah dokumen users/projects/manuscriptversions dengan database sumber; catat durasi (RTO) dan usia data (RPO)
mongosh "mongodb://127.0.0.1:27017/forechek_restoretest" --eval 'db.dropDatabase()'
```
Catat tanggal/hasil di `docs/ops/RUNBOOK.md` (tabel hasil uji). Setelah restore ke produksi, ulangi permintaan penghapusan data yang masuk sejak backup.

## 10. Operasional harian

- Log: `pm2 logs forechek`, `/var/log/forechek/*.log` (tanpa isi naskah/prompt/rahasia).
- Memantau: `pm2 status`, `/api/health`, penggunaan token (koleksi `usageledgers`).
- Memutar rahasia: ubah nilai di `shared/.env.local`, lalu `pm2 reload forechek --update-env`. Memutar `NEXTAUTH_SECRET` mencabut semua sesi.
- Pembaruan dependensi: `npm audit` (lihat bagian 11), uji di staging, deploy.

## 11. Kerentanan dependensi yang diketahui (diterima dengan mitigasi)

`npm audit` setelah `npm audit fix`: 0 pada nodemailer dan lainnya; **tersisa Next.js 14.2.35** (versi 14.2.x terbaru) dan `postcss` bawaan Next. Perbaikan resmi hanya di Next >= 15.5.x/16 (perubahan besar). Mitigasi yang sudah ada dan alasannya:
- Pengoptimal gambar dinonaktifkan (`images.unoptimized`): menutup advisori DoS/RCE `next/image` (aplikasi tidak memakai `next/image`).
- Aplikasi tidak memakai Server Actions, rewrites, i18n Pages Router, atau WebSocket upgrade: advisori terkait tidak terjangkau.
- Server Linux (advisori RCE khusus Windows tidak berlaku) di belakang nginx dengan batas ukuran body dan batas laju.
- **Risiko tersisa:** advisori DoS pada React Server Components/App Router pada 14.x. **Rekomendasi:** rencanakan upgrade ke Next 15.5.x atau 16 (butuh React 19 dan uji ulang penuh) sebelum rilis publik luas. Dicatat sebagai temuan terbuka O-01.
