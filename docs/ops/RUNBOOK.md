# RUNBOOK operasional

STATUS PENGUJIAN: **BELUM DIUJI** pada infrastruktur nyata (tidak ada staging, MongoDB terkelola, atau alerting di lingkungan pengembangan ini).
Setiap prosedur di bawah adalah rencana yang harus dijalankan dan dicatat hasilnya sebelum Gate 7 (MTS 42.4). Catat tanggal dan hasil di tabel akhir.

## 1. Backup dan restore database

- **Backup**: MongoDB Atlas -> Cloud Backup (snapshot terjadwal, retensi sesuai kebijakan) ATAU `mongodump --uri "$MONGODB_URI" --gzip --archive=backup-YYYYMMDD.gz` dari penjadwal. Simpan di penyimpanan terenkripsi terpisah dari server aplikasi. Backup berisi naskah pengguna: perlakukan sebagai data sensitif dan terapkan retensi yang sama dengan kebijakan privasi.
- **Uji restore (wajib sebelum rilis)**:
  1. Restore ke database KOSONG terpisah (`mongorestore --uri "$RESTORE_URI" --gzip --archive=backup.gz --nsInclude 'publikasi_db.*'`).
  2. Bandingkan jumlah dokumen per koleksi dengan sumber: `users`, `projects`, `manuscriptversions`, `references`, `readinessreports`, `editproposals`, `usageledgers`.
  3. Jalankan aplikasi terhadap hasil restore dan masuk dengan akun uji; buka satu proyek dan versi naskah; jalankan `GET /api/health`.
  4. Catat selisih dan durasi (RTO) serta usia data (RPO) di tabel hasil.
- **Penghapusan pengguna vs backup**: data yang dihapus pengguna tetap ada di backup sampai backup itu kedaluwarsa; kebijakan privasi wajib menyatakannya. Setelah restore, jalankan ulang daftar permintaan penghapusan yang tercatat.

## 2. Rollback

- Rilis diberi tag git (`vX.Y.Z`). Rollback = deploy ulang tag sebelumnya. Perubahan skema bersifat aditif (bidang/indeks baru); sebelum menurunkan versi, pastikan kode lama mengabaikan bidang baru (Mongoose mode strict).
- Indeks unik baru yang gagal terbentuk (data lama duplikat) muncul sebagai galat saat boot; perbaiki data, jangan menghapus indeks keamanan.
- Uji rollback pada staging sebelum rilis: deploy tag N, deploy tag N-1, jalankan `scripts/e2e/*.js`.

## 3. Pemantauan dan alert

- Health: `GET /api/health` (200 `ok` / 503 `degraded`). Pantau dari layanan eksternal tiap 1 menit; alert bila 3 kali berturut-turut gagal.
- Log berstruktur JSON per permintaan (`requestId`, status, ms). Log TIDAK memuat isi naskah, prompt, atau rahasia. Alihkan stdout ke agregator; alert pada `level:"error"` dan lonjakan status 5xx.
- Pantau pemakaian token (`usageledgers`) terhadap anggaran bulanan; alert pada 80% anggaran.
- Pekerja retensi: `npm run retention` dijadwalkan harian; alert bila kode keluar bukan 0 (gagal hapus).

## 4. Insiden

- Kontak insiden dan dukungan: **[ISI - belum ditetapkan]**. Penanggung jawab keamanan: **[ISI]**.
- Kebocoran data: nonaktifkan akses (`NEXTAUTH_SECRET` diputar membatalkan semua sesi), bekukan deploy, kumpulkan `requestId`, ikuti kewajiban pemberitahuan pelanggaran data yang berlaku (perlu penasihat hukum).
- Rahasia terbuka: putar kunci terkait (Anthropic, Midtrans, Gmail, Google, MongoDB) lalu deploy ulang.
- Penyedia AI/literatur gagal: aplikasi mengembalikan `PROVIDER_*` terstruktur dan tetap melayani fitur lain; tidak ada tindakan data.

## 5. Permintaan penghapusan data

Pengguna dapat menghapus akun sendiri (`DELETE /api/account`). Untuk permintaan lewat kanal dukungan: verifikasi identitas, lalu hapus lewat `deleteAccountCompletely(userId)` (packages/db/cascade.js) dan catat tanggal. `usageledgers` dan `payments` dipertahankan (catatan teknis/keuangan tanpa isi naskah).

## 6. Hasil uji (isi saat dijalankan)

| Prosedur | Tanggal | Hasil | Catatan |
|---|---|---|---|
| Restore dari backup | - | BELUM DIUJI | - |
| Rollback tag N-1 | - | BELUM DIUJI | - |
| Alert health/5xx | - | BELUM DIUJI | - |
