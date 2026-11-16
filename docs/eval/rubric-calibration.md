# Kalibrasi rubrik kesiapan (Tahap 5)

**Status: BELUM DIKALIBRASI.** Dokumen ini sengaja jujur: tidak ada angka akurasi atau korelasi yang dapat dilaporkan.

## Yang tersedia
- Rubrik dan rumus provisional (`packages/checks`, versi `rubric-provisional-0.1`, `formula-provisional-0.1`).
- Uji unit yang membuktikan pagar server: tidak ada skor tanpa bukti kutipan nyata, tidak ada skor untuk bagian yang tidak ada, cakupan minimum, batasan label akibat blocker/venue belum terverifikasi, reproduksibilitas hasil deterministik.
- Uji ujung-ke-ujung dengan penilai PALSU (provider demo) yang selalu memberi skor 3 dengan kutipan dari teks. Ini hanya menguji alur dan pagar, bukan kualitas penilaian.

## Yang TIDAK tersedia (TIDAK DIVERIFIKASI) dan dibutuhkan
1. **Dataset penilaian ilmiah berlabel** (MTS 40.3): naskah nyata beragam bidang/bahasa/venue dengan skor per kriteria dari academic reviewer manusia. Dibutuhkan: minimal 20-30 naskah, dua reviewer per naskah, kesepakatan antar-reviewer.
2. **Kunci AI** (`ANTHROPIC_API_KEY`, `AI_MODEL_REPORT`) untuk menjalankan penilai sungguhan dan mengukur korelasi dengan skor reviewer, stabilitas antar-ulangan (MTS 15.3 butir 2), dan biaya per laporan.
3. **Persetujuan formula** oleh Product Owner dan academic reviewer: skala per kriteria, normalisasi bobot, perlakuan `not_assessed`, penalti, critical blocker, ambang band, aturan profil usang (MTS 40.2 D). Nilai awal saat ini adalah tebakan konservatif.
4. **Verifikasi manusia atas profil venue** terhadap sumber resmi (D5-01).

## Rencana kalibrasi (setelah 1-4 tersedia)
- Jalankan penilai pada dataset berlabel; hitung korelasi per kriteria, kesepakatan band, dan stabilitas (3 ulangan).
- Sesuaikan bobot/ambang hanya lewat `FORMULA` dan `rubric.js` dengan versi baru; setiap perubahan dicatat di decision log dan benchmark diulang.
- Tetapkan toleransi stabilitas numerik (MTS 15.3) dan masukkan ke acceptance criteria rilis.
