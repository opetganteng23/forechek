# Benchmark integritas referensi (Tahap 4)

Dihasilkan otomatis oleh `npm run eval --workspace=packages/literature` pada 2026-11-15.

> **Cakupan dan batasan (jujur):** benchmark ini berjalan pada korpus **fixture sintetis** (DOI fiktif `10.99999/...`) dengan juri klaim yang **disimulasikan**. Ia mengukur logika verifikasi dan pagar sitasi di server, **bukan** akurasi terhadap OpenAlex/Crossref/Semantic Scholar sungguhan dan bukan kualitas penilaian LLM. Evaluasi pada provider nyata dan naskah nyata: TIDAK DIVERIFIKASI (butuh jaringan, kontak email polite pool, dan kunci AI).

Ambang toleransi (provisional, D4-02): kemiripan judul cocok >= 0.92, dekat >= 0.75, toleransi tahun +/- 1.

## Hasil ringkas

- Total kasus: 57; benar: 57; akurasi: 100.0%.
- **Kasus fiktif/salah yang lolos sebagai valid: 0** (target: 0).

## Per kategori

| Kategori | Benar | Total | Akurasi |
|---|---|---|---|
| verifikasi/doi_valid_cocok | 5 | 5 | 100.0% |
| verifikasi/doi_valid_metadata_salah | 4 | 4 | 100.0% |
| verifikasi/doi_palsu | 3 | 3 | 100.0% |
| verifikasi/retracted | 2 | 2 | 100.0% |
| verifikasi/metadata_tidak_lengkap | 3 | 3 | 100.0% |
| verifikasi/judul_mirip | 3 | 3 | 100.0% |
| verifikasi/tanpa_doi | 3 | 3 | 100.0% |
| klaim/didukung | 1 | 1 | 100.0% |
| klaim/didukung_sebagian | 1 | 1 | 100.0% |
| klaim/tidak_didukung | 1 | 1 | 100.0% |
| klaim/bukti_tidak_cukup | 3 | 3 | 100.0% |
| klaim/juri_berhalusinasi | 3 | 3 | 100.0% |
| klaim/referensi_tak_andal | 2 | 2 | 100.0% |
| klaim/kutipan_tidak_relevan | 2 | 2 | 100.0% |
| klaim/keluaran_juri_rusak | 1 | 1 | 100.0% |
| sitasi/sitasi_sah | 3 | 3 | 100.0% |
| sitasi/sitasi_karangan | 6 | 6 | 100.0% |
| sitasi/sitasi_karangan_bentuk_lain | 5 | 5 | 100.0% |
| sitasi/penulis_benar_tahun_salah | 2 | 2 | 100.0% |
| sitasi/prosa_bukan_sitasi | 1 | 1 | 100.0% |
| sitasi/status_tak_andal | 3 | 3 | 100.0% |

## Target dan baseline

Target rilis (MTS Gate 4): tidak ada sitasi fiktif yang lolos pada set uji rilis. Baseline di atas ditetapkan dari hasil pertama; target numerik akurasi per kategori pada provider nyata ditetapkan pemilik produk setelah baseline provider nyata tersedia.
