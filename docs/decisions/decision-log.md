# Decision Log

Keputusan Tahap 0. Karena pemilik produk meminta implementasi dimulai tanpa menjawab daftar pertanyaan terbuka, kolom "Status" memakai **asumsi kerja = rekomendasi MTS v3.0**. Semuanya dapat diubah; perubahan dicatat di sini.

| ID | Keputusan | Asumsi kerja | Status |
|---|---|---|---|
| D0-01 | Pengguna utama MVP | Peneliti teknik/informatika (template IEEE jadi prioritas), tanpa menutup pengguna lain | Asumsi, perlu konfirmasi |
| D0-02 | Input MVP | **Markdown dan LaTeX** (tempel atau unggah teks). PDF ditunda sampai PoC parser | Asumsi |
| D0-03 | DOCX | Pasca-MVP | Asumsi |
| D0-04 | Editor | Chat + panel naskah sederhana (baca, versi, diff). Tanpa editor kolaboratif | Asumsi |
| D0-05 | Venue awal | IEEE Conference, IEEE Journal, satu template Elsevier generik, dua profil SINTA. Daftar pasti dan sumber resminya dikurasi di Tahap 5 | Asumsi |
| D0-06 | Penyimpanan | **Tanpa object storage di MVP**: sumber naskah (teks) disimpan di MongoDB dengan batas ukuran; artefak ekspor dibuat saat diminta dan tidak disimpan. Ditinjau ulang bila PDF/gambar masuk | Asumsi |
| D0-07 | Kapasitas dan biaya | Belum ditetapkan; kuota default di `.env.example` bersifat sementara | Terbuka (butuh pengukuran) |
| D0-08 | Retensi | Belum ditetapkan; model akan memiliki `retentionExpiresAt` (Tahap 2) | Terbuka |
| D0-09 | Verifikasi email wajib | Flag `REQUIRE_EMAIL_VERIFICATION`, default `false` di development, `true` untuk staging/production | Asumsi |

## D0-10 - Hapus proyek: hard delete langsung (Tahap 2)
- Keputusan: DELETE proyek menghapus proyek dan seluruh versinya saat itu juga, dengan konfirmasi mengetik judul di UI.
- Alasan: tidak ada worker terjadwal sebelum Tahap 7, sehingga masa tenggang (tombstone) belum bisa dieksekusi.
- Konsekuensi: tidak bisa dibatalkan. Status `deletion_pending` ada di skema tetapi belum dipakai; masa tenggang dan penghapusan terjadwal ditunda ke Tahap 7.

## D2-01 - Konsistensi versi tanpa transaksi
- Penomoran/penyimpanan versi memakai compare-and-swap pada `Project.revision`, pembuatan versi sesudahnya, dan kompensasi bila gagal. Nomor versi boleh bolong, tidak pernah dipakai ulang. Pembaca punya fallback ke versi bernomor tertinggi.
