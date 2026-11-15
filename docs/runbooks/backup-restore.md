# Runbook: Backup dan Restore MongoDB

> **Status: BELUM DIUJI.** Prosedur ini belum pernah dijalankan terhadap database nyata. Sesuai MTS Bagian 28.3, backup tidak dianggap berhasil sebelum restore diuji. Gate 1 menuntut uji ini dilakukan oleh pemilik infrastruktur.

## Prasyarat
- MongoDB Database Tools (`mongodump`, `mongorestore`) terpasang.
- `MONGODB_URI` produksi di environment (jangan ditulis ke riwayat shell).

## Backup
```
mongodump --uri="$MONGODB_URI" --archive=backup-$(date +%F).gz --gzip
```
Simpan di lokasi terenkripsi, terpisah dari database. Jika memakai MongoDB Atlas, aktifkan Cloud Backup dan catat kebijakan retensinya.

## Uji restore (WAJIB, ke database staging, bukan produksi)
```
mongorestore --uri="$STAGING_MONGODB_URI" --archive=backup-YYYY-MM-DD.gz --gzip --drop
```
Verifikasi: jumlah dokumen per koleksi cocok; login pengguna uji berhasil; satu proyek dapat dibuka.

## Yang harus ditetapkan pemilik produk
- RPO (kehilangan data maksimum) dan RTO (waktu pemulihan target).
- Frekuensi backup, lokasi, retensi, siapa yang berwenang me-restore.
- Cakupan penghapusan data pengguna terhadap backup (backup punya siklus kedaluwarsa sendiri).
