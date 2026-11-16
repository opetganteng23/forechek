# Estimasi biaya per alur utama (MTS 42.5)

STATUS: **ESTIMASI KASAR dari batas kode, BUKAN pengukuran**. Tidak ada panggilan model nyata yang dijalankan; harga model dan
trafik nyata belum diketahui. Isi kolom harga setelah kunci Anthropic dan harga model diverifikasi, lalu ukur dari koleksi `usageledgers`.

Batas dalam kode (semua dapat diubah lewat env, nilai awal PROVISIONAL):

| Alur | Batas token per kejadian (dari kode) | Catatan |
|---|---|---|
| Satu giliran chat | `AI_MAX_TOTAL_TOKENS_PER_TURN` = 60.000 (masuk+keluar, seluruh iterasi agen), `AI_MAX_ITERATIONS` = 8, `AI_MAX_TOOL_CALLS` = 12, `AI_MAX_OUTPUT_TOKENS` = 4.096 | Batas atas; giliran tipikal jauh lebih kecil (konteks `AI_CONTEXT_BUDGET_TOKENS` = 24.000) |
| Laporan kesiapan | ~6 panggilan penilai x (maks 6.000 karakter bagian + prompt) + keluaran 700 token; praanggapan kuota 30.000 token | Tanpa AI terkonfigurasi: 0 token (hanya pemeriksaan deterministik) |
| Verifikasi referensi / pencarian literatur | 0 token model (API publik OpenAlex/Crossref/Semantic Scholar) | Klaim-dukung (check_claim_support) memakai penilai model per panggilan |
| Usulan edit, ekspor | Usulan: bagian dari giliran chat; ekspor: 0 token | - |

Perhitungan biaya = token masuk x harga masuk + token keluar x harga keluar (+ cache bila `AI_PROMPT_CACHE`). Kuota per paket (`QUOTA_*`) harus
ditetapkan dari: (rata-rata token per pengguna aktif per bulan terukur) x (harga) x (margin) dan dibatasi anggaran bulanan.

| Alur | Token terukur (rata-rata/p95) | Biaya per kejadian | Sumber |
|---|---|---|---|
| Giliran chat | BELUM DIUKUR | - | usageledgers |
| Laporan kesiapan | BELUM DIUKUR | - | usageledgers (task=report) |
