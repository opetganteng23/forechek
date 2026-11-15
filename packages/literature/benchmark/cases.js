'use strict'

// Dataset evaluasi berlabel (MTS 39.3). Korpus yang dirujuk adalah fixture SINTETIS (src/fixtures/corpus.js): benchmark ini
// mengukur LOGIKA verifikasi/pagar sitasi, BUKAN akurasi terhadap penyedia nyata (belum diuji: butuh jaringan + akun).
const A1 = { doi: '10.99999/fx.2021.001', title: 'Adaptive Sparse Attention for Low-Resource Language Modeling', authors: ['Ratna Wulandari', 'Chen Mei'], year: 2021 }
const B2 = { doi: '10.99999/fx.2019.014', title: 'A Survey of Synthetic Data Augmentation for Text Classification', authors: ['Dewi Kartika', 'Samuel Okoro'], year: 2019 }
const C3 = { doi: '10.99999/fx.2018.077', title: 'Retracted: Fast Training of Giant Models Without Gradients', authors: ['Pavel Novak'], year: 2018 }
const D4 = { doi: '10.99999/fx.2020.031', title: 'Graph Neural Networks for Traffic Forecasting in Dense Cities', authors: ['Budi Santoso', 'Laura Fernandez'], year: 2020 }
const D4X = { doi: '10.99999/fx.2022.045', title: 'Graph Neural Networks for Traffic Forecasting in Dense Cities: An Extended Study', authors: ['Budi Santoso'], year: 2022 }
const E5 = { doi: '10.99999/fx.2023.102', title: 'Pengaruh Metode Pembelajaran Daring terhadap Prestasi Mahasiswa', authors: ['Siti Rahmawati'], year: 2023 }
const F6 = { title: 'Notes on Reproducibility in Synthetic Machine Learning Pipelines', authors: ['Ines Moreau'], year: 2020 }

// Kategori verifikasi. `fictitious: true` = referensi yang SEBENARNYA tidak ada/salah: TIDAK BOLEH pernah verified.
const verification = [
  { id: 'v01', category: 'doi_valid_cocok', input: A1, expected: 'verified' },
  { id: 'v02', category: 'doi_valid_cocok', input: B2, expected: 'verified' },
  { id: 'v03', category: 'doi_valid_cocok', input: E5, expected: 'verified' },
  { id: 'v04', category: 'doi_valid_cocok', input: { ...D4, doi: 'https://doi.org/10.99999/FX.2020.031' }, expected: 'verified' },
  { id: 'v05', category: 'doi_valid_cocok', input: { ...A1, title: 'Adaptive sparse attention for low resource language modelling', year: 2022 }, expected: 'verified' },
  { id: 'v10', category: 'doi_valid_metadata_salah', input: { ...A1, title: 'Resep Memasak Kuantum untuk Dapur Terdistribusi' }, expected: 'unverified', fictitious: true },
  { id: 'v11', category: 'doi_valid_metadata_salah', input: { ...A1, authors: ['Orang Lain', 'Chen Mei'] }, expected: 'partial', fictitious: true },
  { id: 'v12', category: 'doi_valid_metadata_salah', input: { ...A1, year: 2012 }, expected: 'partial', fictitious: true },
  { id: 'v13', category: 'doi_valid_metadata_salah', input: { ...B2, title: 'Pengaruh Metode Pembelajaran Daring terhadap Prestasi Mahasiswa' }, expected: 'unverified', fictitious: true },
  { id: 'v20', category: 'doi_palsu', input: { doi: '10.99999/fx.9999.999', title: 'Karangan Model Bahasa Besar', authors: ['Fiktif Nama'], year: 2023 }, expected: 'unverified', fictitious: true },
  { id: 'v21', category: 'doi_palsu', input: { doi: '10.99999/fx.2021.002', title: A1.title, authors: A1.authors, year: 2021 }, expected: 'unverified', fictitious: true },
  { id: 'v22', category: 'doi_palsu', input: { doi: '10.99999/zzz.0000.0', title: 'Another Invented Paper', authors: ['Nama Karangan'], year: 2020 }, expected: 'unverified', fictitious: true },
  { id: 'v30', category: 'retracted', input: C3, expected: 'retracted' },
  { id: 'v31', category: 'retracted', input: { doi: C3.doi, title: C3.title, authors: C3.authors, year: 2019 }, expected: 'retracted' },
  { id: 'v40', category: 'metadata_tidak_lengkap', input: { doi: A1.doi }, expected: 'partial' },
  { id: 'v41', category: 'metadata_tidak_lengkap', input: { doi: A1.doi, title: A1.title }, expected: 'partial' },
  { id: 'v42', category: 'metadata_tidak_lengkap', input: { doi: B2.doi, authors: B2.authors, year: 2019 }, expected: 'partial' },
  { id: 'v50', category: 'judul_mirip', input: D4X, expected: 'verified' },
  { id: 'v51', category: 'judul_mirip', input: { ...D4X, doi: D4.doi }, expected: 'partial', fictitious: true },
  { id: 'v52', category: 'judul_mirip', input: { ...D4, doi: D4X.doi }, expected: 'partial', fictitious: true },
  { id: 'v60', category: 'tanpa_doi', input: F6, expected: 'partial' },
  { id: 'v61', category: 'tanpa_doi', input: { title: 'Efficient Kernel Methods for Large Synthetic Graphs', authors: ['Tomasz Wisniewski'], year: 2017 }, expected: 'partial' },
  { id: 'v62', category: 'tanpa_doi', input: { title: 'Makalah yang Tidak Pernah Diterbitkan Siapa Pun', authors: ['Nama Karangan'], year: 2021 }, expected: 'unverified', fictitious: true }
]

const LONG = 'We introduce an adaptive sparse attention mechanism for language modeling in low-resource settings. Experiments on three synthetic benchmarks show that the proposed method reduces memory use by 38 percent while keeping perplexity within 2 percent of dense attention. We also analyze failure cases for very short sequences.'
const verifiedRef = { citeKey: 'wulandari2021adaptive', abstract: LONG, verification: { status: 'verified' } }
// Skenario keluaran juri (LLM disimulasikan): yang diukur adalah pagar deterministik di sekitarnya.
const claims = [
  { id: 'c01', category: 'didukung', claim: 'Metode mengurangi pemakaian memori sekitar 38 persen.', ref: verifiedRef, judge: { verdict: 'supports', quote: 'reduces memory use by 38 percent' }, expected: 'supports' },
  { id: 'c02', category: 'didukung_sebagian', claim: 'The method keeps perplexity within a small margin of dense attention on all sequence lengths.', ref: verifiedRef, judge: { verdict: 'partial', quote: 'keeping perplexity within 2 percent of dense attention' }, expected: 'partial' },
  { id: 'c03', category: 'tidak_didukung', claim: 'Metode meningkatkan akurasi klasifikasi gambar medis.', ref: verifiedRef, judge: { verdict: 'unsupported', quote: '' }, expected: 'unsupported' },
  { id: 'c04', category: 'bukti_tidak_cukup', claim: 'Metode bekerja pada bahasa Indonesia.', ref: verifiedRef, judge: { verdict: 'unknown', quote: '' }, expected: 'unknown' },
  { id: 'c05', category: 'bukti_tidak_cukup', claim: 'Metode mengurangi memori sebesar 38 persen.', ref: { ...verifiedRef, abstract: null }, judge: { verdict: 'supports', quote: 'reduces memory use by 38 percent' }, expected: 'unknown' },
  { id: 'c06', category: 'bukti_tidak_cukup', claim: 'Metode mengurangi memori sebesar 38 persen.', ref: { ...verifiedRef, abstract: 'Terlalu pendek.' }, judge: { verdict: 'supports', quote: 'Terlalu pendek.' }, expected: 'unknown' },
  { id: 'c07', category: 'juri_berhalusinasi', claim: 'Metode mengurangi memori sebesar 90 persen.', ref: verifiedRef, judge: { verdict: 'supports', quote: 'reduces memory use by 90 percent' }, expected: 'unknown', fictitious: true },
  { id: 'c08', category: 'juri_berhalusinasi', claim: 'Metode dipakai oleh industri besar.', ref: verifiedRef, judge: { verdict: 'supports', quote: '' }, expected: 'unknown', fictitious: true },
  { id: 'c09', category: 'juri_berhalusinasi', claim: 'Metode cepat.', ref: verifiedRef, judge: { verdict: 'supports' }, expected: 'unknown', fictitious: true },
  { id: 'c10', category: 'referensi_tak_andal', claim: 'Metode mengurangi memori sebesar 38 persen.', ref: { ...verifiedRef, verification: { status: 'retracted' } }, judge: { verdict: 'supports', quote: 'reduces memory use by 38 percent' }, expected: 'unknown', fictitious: true },
  { id: 'c11', category: 'referensi_tak_andal', claim: 'Metode mengurangi memori sebesar 38 persen.', ref: { ...verifiedRef, verification: { status: 'unverified' } }, judge: { verdict: 'supports', quote: 'reduces memory use by 38 percent' }, expected: 'unknown', fictitious: true },
  { id: 'c13', category: 'kutipan_tidak_relevan', claim: 'Quantum cats cure cancer in humans.', ref: verifiedRef, judge: { verdict: 'supports', quote: 'We introduce an adaptive sparse attention' }, expected: 'unknown', fictitious: true },
  { id: 'c14', category: 'kutipan_tidak_relevan', claim: 'Industri besar memakai metode ini secara luas.', ref: verifiedRef, judge: { verdict: 'supports', quote: 'Experiments on three synthetic benchmarks' }, expected: 'unknown', fictitious: true },
  { id: 'c12', category: 'keluaran_juri_rusak', claim: 'Metode mengurangi memori sebesar 38 persen.', ref: verifiedRef, judge: { verdict: 'pasti benar' }, expected: 'unknown' }
]

// Sitasi dalam keluaran model. refs: daftar referensi proyek; expectPass: sitasi dipertahankan; fictitious: tidak boleh lolos.
const REFS = [
  { citeKey: 'wulandari2021adaptive', authors: [{ family: 'Wulandari' }], year: 2021, title: 'A', doi: '10.99999/a', verification: { status: 'verified' } },
  { citeKey: 'santoso2020graph', authors: [{ family: 'Santoso' }], year: 2020, title: 'G', doi: '10.99999/g', verification: { status: 'verified' } },
  { citeKey: 'novak2018fast', authors: [{ family: 'Novak' }], year: 2018, title: 'N', doi: '10.99999/n', verification: { status: 'retracted' } },
  { citeKey: 'moreau2020notes', authors: [{ family: 'Moreau' }], year: 2020, title: 'M', doi: null, verification: { status: 'partial' } }
]
const citations = [
  { id: 's01', category: 'sitasi_sah', text: 'Hasil baik \\cite{wulandari2021adaptive}.', expectPass: true },
  { id: 's02', category: 'sitasi_sah', text: 'Lihat [@santoso2020graph; @wulandari2021adaptive].', expectPass: true },
  { id: 's03', category: 'sitasi_sah', text: 'Seperti (Santoso, 2020) dan Wulandari (2021).', expectPass: true },
  { id: 's10', category: 'sitasi_karangan', text: 'Studi \\cite{halusinasi2024ai} menunjukkan.', expectPass: false, fictitious: true },
  { id: 's11', category: 'sitasi_karangan', text: 'Menurut (Fiktif et al., 2023) hasilnya.', expectPass: false, fictitious: true },
  { id: 's12', category: 'sitasi_karangan', text: 'Terbukti [12].', expectPass: false, fictitious: true },
  { id: 's13', category: 'sitasi_karangan', text: 'Lihat [@tidakada].', expectPass: false, fictitious: true },
  { id: 's14', category: 'sitasi_karangan', text: 'Penulis Karangan (2024) menyatakan.', expectPass: false, fictitious: true },
  { id: 's15', category: 'sitasi_karangan', text: 'Dua kunci \\cite{wulandari2021adaptive,karangan2099x} sekaligus.', expectPass: false, fictitious: true },
  { id: 's16', category: 'sitasi_karangan_bentuk_lain', text: 'Studi \\cite {halusinasi2024ai} menunjukkan.', expectPass: false, fictitious: true },
  { id: 's17', category: 'sitasi_karangan_bentuk_lain', text: 'Studi \\nocite{halusinasi2024ai} dan \\Parencite{x}.', expectPass: false, fictitious: true },
  { id: 's18', category: 'sitasi_karangan_bentuk_lain', text: 'Menurut (Fiktif, 2023, p. 4) dan (e.g., Fiktif, 2023).', expectPass: false, fictitious: true },
  { id: 's19', category: 'sitasi_karangan_bentuk_lain', text: 'Lihat doi:10.1234/karangan dan https://doi.org/10.1234/karangan.', expectPass: false, fictitious: true },
  { id: 's23', category: 'sitasi_karangan_bentuk_lain', text: 'Seperti [see @halusinasi2024ai, p. 3] dan @karangan2025.', expectPass: false, fictitious: true },
  { id: 's24', category: 'penulis_benar_tahun_salah', text: 'Hasil (Santoso, 2019) dan (Santoso, 2021).', expectPass: false, fictitious: true },
  { id: 's25', category: 'penulis_benar_tahun_salah', text: 'Hasil (Wulandari and Karangan, 2021).', expectPass: false, fictitious: true },
  { id: 's26', category: 'prosa_bukan_sitasi', text: 'Pada (Mei 2020) kami mulai; lihat Tabel 3 dan `arr[1]` serta n=5.', expectPass: true },
  { id: 's20', category: 'status_tak_andal', text: 'Klaim \\cite{novak2018fast}.', expectPass: false, fictitious: true },
  { id: 's21', category: 'status_tak_andal', text: 'Klaim \\cite{moreau2020notes}.', expectPass: false, fictitious: true },
  { id: 's22', category: 'status_tak_andal', text: 'Klaim (Novak, 2018).', expectPass: false, fictitious: true }
]

module.exports = { verification, claims, citations, REFS }
