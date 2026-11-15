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

## Keputusan Tahap 3 (agen chat, SSE, usage). Semua PROVISIONAL, menunggu persetujuan pemilik produk.

### D3-01 - Abstraksi provider AI dan provider palsu
- Keputusan: agen hanya bergantung pada antarmuka `provider.stream(request)` (event `text_delta`, `tool_use`, `message_end`). Implementasi: `anthropic` (nyata), `demo` (deterministik, untuk uji HTTP/UI), `fake` berskrip (untuk tes unit).
- Alasan: tahap harus bisa diverifikasi tanpa kredensial; satu-satunya pengecualian dari aturan "tanpa abstraksi" yang diwajibkan.
- Konsekuensi: provider palsu TIDAK PERNAH aktif diam-diam. Harus `AI_PROVIDER=fake`; di produksi ditolak kecuali `AI_ALLOW_FAKE=true` (diuji di HTTP: `next start` menolak tanpa flag). UI menandai balasan "Provider palsu (uji), bukan Claude".
- Status provider Anthropic nyata: TIDAK DIVERIFIKASI terhadap API sungguhan. Hanya dipetakan lewat klien palsu yang meniru bentuk stream SDK. Dependensi `@anthropic-ai/sdk` masih `^0.27.0` (versi lama); naikkan versi SDK dan jalankan uji kunci nyata sebelum rilis (lihat docs/SETUP.md bila sudah ada).

### D3-02 - Batas agen (provisional)
- Nilai awal via env, bukan hardcode tersebar: `AI_MAX_ITERATIONS=8`, `AI_MAX_TOOL_CALLS=12`, `AI_TURN_TIMEOUT_MS=90000`, `AI_MAX_OUTPUT_TOKENS=4096`, `AI_MAX_TOTAL_TOKENS_PER_TURN=60000`, `AI_CONTEXT_BUDGET_TOKENS=24000`. Angka diambil dari contoh MTS 7.1 ("mis. 8 iterasi"); belum diukur.
- Alternatif ditolak: tanpa batas (risiko biaya tak terkendali).

### D3-03 - Aturan penagihan kuota (provisional)
- Token tertagih = input + output + cacheWrite + ceil(cacheRead/10).
- Selesai: token penuh + 1 pesan. Dibatalkan pengguna: token yang dilaporkan, 1 pesan bila sudah ada teks. Gagal karena penyedia (error/timeout/rate limit/refusal): 0 token, 0 pesan. Gagal karena batas agen: token penuh + 1 pesan. Retry dicatat per (messageId, attempt); percobaan yang sama tidak pernah ditagih dua kali.
- Alasan: pengguna tidak membayar kegagalan penyedia; pemakaian nyata tetap tercatat di buku besar teknis (terpisah dari unit penagihan).
- Alternatif ditolak: tagih token cache read penuh (membebani pengguna untuk efisiensi yang dinikmati penyedia). Faktor 10% adalah tebakan konservatif; harus diganti setelah biaya per sesi terukur (D0-07).

### D3-04 - Penyimpanan chat
- Yang disimpan: teks pesan pengguna, teks akhir asisten, status, usage, metadata tool (nama, hash input, ok, latensi). Blok `tool_use`/`tool_result` perantara dan hasil tool TIDAK disimpan (MTS 38.2 B: tanpa payload sensitif berlebihan). Riwayat yang dikirim ke model hanya teks.
- Konsekuensi: model tidak "mengingat" isi hasil tool antar giliran; bila perlu, ia memanggil `read_section` lagi.

### D3-05 - Idempotensi chat
- `clientRequestId` (8-64 karakter) unik per (proyek, peran). Selesai -> replay; sedang diproses -> 409 `REQUEST_IN_PROGRESS` (usang setelah 2x timeout -> boleh diulang); gagal/dibatalkan -> retry memakai ulang dokumen dan teks pesan pengguna yang sudah tersimpan (isi baru diabaikan).

### D3-06 - Prompt caching dimatikan secara default
- MTS 38.2 E: caching hanya setelah kompatibilitas dan biaya diverifikasi. Provider menerima `promptCache`; `AI_PROMPT_CACHE=true` menyalakan `cache_control` pada blok system. Belum diverifikasi.

### D3-07 - Kode lama yang belum dipensiunkan
- `packages/ai/index.js#analyzeManuscript` (alur analisis lama) masih memuat nama model keras (`claude-sonnet-4-6`). Dibiarkan karena aturan "jangan menyentuh kode lama"; dipensiunkan saat penggantinya (Tahap 5/6) lulus. Tidak dipakai oleh agen chat.

### D3-08 - Keputusan terbuka dari QC Tahap 3 (butuh persetujuan pemilik produk)
- Retry setelah koneksi putus dapat ditagih dua kali: percobaan 1 berstatus `cancelled` (server mendeteksi client putus) ditagih sesuai D3-03, lalu "Coba lagi" menjalankan percobaan 2 dengan `clientRequestId` sama dan ditagih lagi. Pesan tidak pernah ganda; yang bisa ganda adalah tagihan token untuk percobaan yang terpotong. Opsi: (a) tidak menagih `cancelled` tanpa pembatalan eksplisit, (b) mengkredit percobaan sebelumnya saat retry berhasil, (c) biarkan (saat ini).
- Belum ada "reconnect" sejati yang menempel ke stream yang sedang berjalan: permintaan kedua saat yang pertama masih berjalan mendapat 409 `REQUEST_IN_PROGRESS`. MTS 38.2 D ("reconnect memakai request/message ID yang sama") terpenuhi sebagian: tidak ada pesan ganda, tetapi tanpa penyambungan ulang.
- Penagihan/pencatatan tidak atomik terhadap pembaruan pesan (tanpa transaksi): crash di antara `messages.update`, penulisan buku besar, dan `applyUsage` dapat menghasilkan kurang-tagih. Belum ada job rekonsiliasi (dijadwalkan di Tahap 7, bersama pemantauan biaya).
- Kuota diperiksa dengan pembacaan lalu ditambah di akhir: permintaan serentak dengan `clientRequestId` berbeda dapat melampaui batas sedikit; dibatasi rate limit 20 pesan/menit. Diterima untuk nilai kuota provisional.
- Penggunaan token pada stream yang gagal/dibatalkan di tengah jalan ditagih 0 oleh provider Anthropic (usage hanya dilaporkan di akhir); pemakaian riil penyedia dapat lebih besar dari yang tercatat.
