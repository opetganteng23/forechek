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

## Keputusan Tahap 4 (literatur dan integritas sitasi). Semua PROVISIONAL.

### D4-01 - Provider literatur dan cakupan
- Adapter: OpenAlex, Crossref, Semantic Scholar (nyata, TIDAK DIVERIFIKASI terhadap API langsung; pemetaan diuji dengan fixture berbentuk dokumentasi dan klien HTTP palsu) + `fixture` (korpus sintetis, DOI fiktif `10.99999/...`, dilabeli data uji di UI dan respons).
- Garuda/Neliti TIDAK diintegrasikan: MTS mensyaratkan akses/API/ketentuan diverifikasi dulu (butuh pemeriksaan manusia). UI/respons menyebut keterbatasan ini.
- Tidak ada provider default: tanpa `LITERATURE_PROVIDERS` pencarian ditolak. Provider fixture dilarang di produksi tanpa `LITERATURE_ALLOW_FIXTURE=true`.
- Rate limit sopan per adapter (jarak minimum antar permintaan), timeout 8 dtk, 1 retry, cache TTL 10 menit, email kontak untuk polite pool.

### D4-02 - Aturan verifikasi (ambang provisional)
- Kemiripan judul = koefisien Dice atas trigram karakter judul ternormalisasi. `>= 0,92` cocok; `0,75-0,92` mirip (hanya partial); `< 0,75` karya berbeda. Toleransi tahun +/- 1. Penulis pertama harus cocok bila kedua sisi punya penulis. Ambang diubah hanya di `packages/literature/src/compare.js` dan harus ditinjau lewat benchmark.
- Status: `verified` hanya bila DOI resolve di provider DAN judul cocok DAN ada pembanding lain (penulis/tahun) cocok tanpa ketidakcocokan. Hanya DOI atau hanya judul -> `partial`. DOI tak ditemukan -> `unverified`. Judul menunjuk karya lain -> `unverified`. Flag retraction pada provider mana pun -> `retracted` (selama judul mirip). Semua provider gagal -> `unverified (PROVIDER_UNAVAILABLE)`, tidak pernah verified.
- Tanpa DOI: paling tinggi `partial` (DOI saran dilaporkan). Alasan konservatif: metadata tanpa DOI tidak unik.
- Deteksi retraction: OpenAlex `is_retracted`, Crossref `updated-by/update-to` bertipe retraction/withdrawal (best-effort; Retraction Watch langsung belum dipakai).
- Alternatif ditolak: memercayai metadata satu provider tanpa mencocokkan (rawan DOI mengarah ke karya lain).

### D4-03 - Alur penambahan referensi
- Lewat kandidat: kandidat diverifikasi ULANG di server saat ditambahkan; hanya `verified` diterima (retracted hanya bila diminta eksplisit oleh jalur non-model). Tool `add_reference` milik model hanya menerima `verified`.
- Jalur manual: hasil verifikasi disimpan apa adanya, termasuk `unverified`, dengan sumber `user_provided`, ditandai jelas dan tidak pernah dianggap sah oleh validator.
- Edit metadata manual menurunkan status ke `unverified`, mengosongkan abstrak (tidak dipercaya lagi), mencatat riwayat; `reverify` memulihkan hanya bila cocok.
- `citeKey` = penulis pertama + tahun + kata judul bermakna, unik per proyek (sufiks a, b, c). Duplikat (DOI atau judul+tahun) ditolak. Batas 300 referensi/proyek (provisional).
- Kandidat disimpan 24 jam (TTL), terikat userId+projectId.

### D4-04 - Validator sitasi pada keluaran chat
- Semua jawaban akhir agen disanitasi (`finalize`): sitasi LaTeX, pandoc (`[@key]`), numerik `[n]`, dan penulis-tahun yang tidak menunjuk ke referensi proyek berstatus `verified` diganti `[referensi belum terverifikasi]` (retracted: `[referensi ditarik (retracted), jangan disitasi]`). Daftar kunci campuran dipertahankan hanya untuk kunci sah.
- MTS 8 menyebut "model diminta memperbaiki (satu kali ulang) ATAU kalimat ditandai". Dipilih penandaan langsung (tanpa panggilan model kedua) demi biaya dan determinisme.
- Batasan diketahui: pengurai berbasis pola. `[n]` numerik di chat selalu dianggap tidak sah (tanpa penomoran); angka dalam kurung siku yang bukan sitasi bisa terganti (false positive, konservatif). Narasi tanpa tahun tidak terdeteksi. Parser dokumen penuh dan render IEEE/APA/Vancouver/export BibTeX berada di Tahap 5-6.
- Hasil (flags) disimpan di pesan dan dikirim di `message_complete`.

### D4-05 - Evaluator klaim
- Hanya berbasis abstrak (label eksplisit). `supports`/`partial` hanya bila juri (model ringan) memberi kutipan yang ADA verbatim di abstrak; tanpa kutipan/kutipan tidak ada -> `unknown`. Kesamaan kata kunci saja tidak pernah cukup. Tanpa juri AI terkonfigurasi hasilnya selalu `unknown`.
- Kualitas penilaian juri LLM TIDAK DIVERIFIKASI (butuh kunci AI + dataset berlabel nyata).

### D4-06 - Benchmark
- Dataset 47 kasus (verifikasi, klaim, sitasi) pada korpus fixture; metrik kritis "fiktif yang lolos" = 0 dikunci di tes. Evaluasi pada provider nyata dan naskah nyata: TIDAK DIVERIFIKASI. Target akurasi numerik pada provider nyata ditetapkan pemilik produk setelah baseline nyata ada.

### D4-07 - Hapus proyek
- Penghapusan proyek kini menghapus pesan chat, referensi, kandidat, dan jejak AI (cascade di lapisan web). `UsageLedger` dipertahankan (hanya angka teknis, tanpa isi). Cascade tidak transaksional: chat/referensi yang dibuat tepat saat penghapusan dapat tersisa sebagai data yatim tak terjangkau (dicatat untuk job pembersihan Tahap 7).

### D4-08 - Kebijakan sitasi yang diperketat (hasil QC + red-team Tahap 4)
- Temuan QC: sanitizer awal meloloskan banyak bentuk sitasi karangan (LaTeX dengan spasi/varian perintah/lebar-nol, pandoc `[see @k]` dan `@k`, penulis-tahun dengan nomor halaman/lead-in/huruf kecil/tanpa tahun, DOI dan tautan DOI, `shown[1]`), dan hanya dijalankan pada jawaban yang selesai (teks parsial hasil batal/gagal/batas agen tersimpan mentah; delta stream menampilkan teks mentah).
- Keputusan: (1) deteksi LUAS (lebih baik salah-tandai prosa daripada meloloskan sitasi karangan): semua perintah berawalan/berisi `cite`, pandoc dalam kurung siku dan `@kunci` telanjang, penulis-tahun dalam kurung dan siku dan naratif (termasuk lokator halaman dan lead-in), DOI/tautan DOI sebagai sitasi yang harus cocok dengan DOI referensi terverifikasi, `[n]` di mana pun di luar blok kode; (2) teks dinormalkan NFKC dan tanpa karakter lebar-nol sebelum dipindai, keluaran adalah teks ternormalisasi; (3) penulis-tahun cocok hanya bila penulis pertama, penulis kedua (bila disebut), jumlah penulis untuk "et al.", dan tahun cocok; (4) sanitasi pada SEMUA jalur keluar (selesai, dibatalkan, gagal, batas agen) dan pada stream (delta hanya bagian seimbang yang sudah disanitasi); bila validator/guard gagal, sistem GAGAL TERTUTUP (tidak ada teks mentah yang ditampilkan atau disimpan).
- False positive yang diterima: prosa seperti "Indonesia (2020)" atau "[1]" yang bukan sitasi bisa terganti penanda; bulan/Tabel/Windows/COVID dikecualikan lewat daftar kecil. Kode (backtick) tidak dipindai.
- Batasan yang tetap ada: pengurai berbasis pola; narasi tanpa kurung dan tanpa tahun ("Fake menyatakan pada tahun 2020"), footnote `[^1]`, dan URL non-DOI (arXiv, IEEE Xplore) tidak dianggap sitasi. Streaming dapat sesaat menampilkan nama penulis sebelum tahun (kemudian diganti saat teks final).

### D4-09 - Perketat verifikasi (hasil QC)
- Metadata kanonis: rekaman `verified/retracted` yang disimpan lewat jalur manual memakai metadata dari SUMBER (penulis/tahun/judul), bukan input pengguna.
- Gangguan provider: jika provider pendeteksi-retraction (OpenAlex, Crossref) gagal menjawab saat akan `verified`, hasilnya `partial` (PARTIAL_PROVIDER_OUTAGE); jika tidak ada provider pendeteksi-retraction yang menjawab, `partial` (RETRACTION_CHECK_UNAVAILABLE). Konsekuensi: verifikasi bergantung pada ketersediaan provider tersebut. `reverify` saat provider tidak tersedia tidak mengubah status yang ada.
- Daftar penulis: bila kedua sisi punya >= 2 penulis, irisan nama keluarga >= 0,6 (penulis pendamping karangan -> mismatch `authors`). Nama non-Latin tidak lagi dinormalkan menjadi kosong. Judul ternormalisasi < 15 karakter tidak dapat `verified`.
- Duplikat ditolak atomik lewat indeks unik `{projectId, dedupKey}`. Klaim: kutipan bukti harus berbagi istilah/angka dengan klaim (QUOTE_NOT_RELEVANT); bukti pada verdict `unsupported/unknown` hanya dikembalikan bila verbatim.
- Batasan yang diketahui dan tidak diubah: judul saudara yang hanya beda satu token dapat melewati ambang kemiripan (0,92); venue tidak dibandingkan; juri LLM tetap penghalang utama relevansi. Dicatat untuk kalibrasi dengan provider nyata.
## Keputusan Tahap 5 (venue, pemeriksaan deterministik, kesiapan). Semua PROVISIONAL; Gate 5 membutuhkan persetujuan manusia.

### D5-01 - Profil venue sebagai data, semuanya belum diverifikasi
- Empat profil bawaan sebagai DATA JSON bervalidasi (packages/venues/data): IEEE Conference generik, IEEE Journal generik, Scopus generik, SINTA generik. Disimpan di DB per (slug, versi), tidak diubah di tempat; perubahan aturan = versi baru. Seed idempoten (lazy saat pertama dipakai dan `scripts/seedVenues.js`).
- Karena pembuatan tanpa internet, SEMUA profil berstatus `needs_review`, `verification: unverified`, `checkedAt: null`, dengan `provenance` yang menyatakan nilai awal berasal dari praktik umum, BUKAN pembacaan sumber resmi, dan wajib diverifikasi manusia. URL sumber resmi dicantumkan tetapi `verifiedAt: null`.
- Aturan yang bergantung pada venue spesifik (batas halaman, kebijakan blind) sengaja dibiarkan kosong (`null`/`unknown`) agar diperiksa manual, bukan ditebak. Profil `active` wajib punya `checkedAt` (validator menolak sebaliknya).
- Profil usang atau belum diverifikasi: terlihat jelas di UI/laporan (freshness) dan MENAHAN label "siap" (lihat D5-04). Batas usia 180 hari (provisional).
- Pemetaan template resmi dan sumber Indonesia (Garuda/Neliti) ditunda (Tahap 6 / belum diverifikasi).

### D5-02 - Pemeriksaan deterministik
- Fungsi murni `runChecks` (hasil identik untuk masukan sama; `now` diinjeksi): struktur, abstrak/kata kunci, jumlah kata, konsistensi sitasi (yatim/tidak terverifikasi/retracted/ambigu/numerik/tak terpakai), gaya sitasi, cakupan DOI, status verifikasi, keterbaruan, self-citation (not_applicable: penulis naskah tidak tersedia), double-blind (sinyal email/ORCID/blok penulis/rujukan diri), estimasi halaman (hanya label estimasi), deklarasi wajib venue. Status: pass | warn | fail | not_applicable | manual_review, dengan evidence berlokasi (baris, kutipan).
- Ambang (cakupan DOI < 70%, keterbaruan < 50% dalam N tahun, 500 kata/halaman) provisional di `THRESHOLDS` dan versinya dicatat di laporan. "Critical" ditandai pada: bagian wajib hilang (dengan venue), sitasi yatim, sitasi ke referensi retracted, deklarasi wajib hilang, nomor sitasi numerik di luar daftar pustaka.
- Batasan: berbasis pola; berkas `\input` dan bib eksternal tidak dibaca; gaya sitasi hanya numerik vs penulis-tahun; pencarian deklarasi berbasis kata kunci (isi tidak dinilai).

### D5-03 - Rubrik dan penilai AI
- Tujuh kriteria (kebaruan, pemosisian literatur, metodologi, analisis hasil, argumentasi, penulisan, kualitas referensi), skala 0-4 dengan anchor, bobot awal (2/1,5/2/2/1,5/1/1) provisional dan dapat ditimpa per venue. Kualitas referensi dihitung KODE dari data proyek (bukan model).
- Pagar server: bagian terkait harus ada dan cukup panjang, keluaran harus JSON valid dengan skor bulat 0-4 dan rationale, dan SETIAP skor wajib disertai kutipan yang ADA verbatim di bagian yang diberikan (lokasi dihitung server); tanpa itu `not_assessed` dengan alasan. Naskah diperlakukan sebagai DATA; teks yang menyerupai instruksi ke penilai ditandai di laporan.
- Tanpa layanan AI: kriteria berbasis model `not_assessed (AI_NOT_CONFIGURED)`; laporan tetap deterministik. Kualitas penilaian LLM TIDAK DIVERIFIKASI (butuh kunci AI + dataset berlabel + reviewer akademik): lihat docs/eval/rubric-calibration.md.

### D5-04 - Rumus kesiapan (provisional; belum disetujui)
- Skor = rata-rata berbobot kriteria yang DINILAI (not_assessed dikeluarkan dari pembagi), dikurangi penalti 5 poin per pemeriksaan `fail` (maks 30). Cakupan bobot minimum 50%; di bawah itu TIDAK ada skor/label (`insufficient_evidence`).
- Label dari skor: >= 80 siap, >= 65 revisi_minor, >= 45 revisi_major, selain itu belum_siap. Angka ini diambil dari contoh ilustratif MTS yang melarang memakainya sebagai aturan produksi; di sini dipakai hanya sebagai nilai awal berlabel PROVISIONAL (`FORMULA`), dan UI/laporan menyatakan itu serta "belum disetujui Product Owner dan academic reviewer".
- Critical blocker membatasi label maksimal `revisi_major`. Venue tidak dipilih atau aturan venue belum dapat dipercaya membatasi label maksimal `revisi_minor` ("siap" tidak diberikan). Dengan profil bawaan (semua needs_review), label "siap" praktis tidak dapat dicapai sampai profil diverifikasi manusia: ini disengaja.
- Seluruh langkah dicatat di `breakdown`; laporan menyimpan versi rubrik, prompt, pemeriksaan, formula.

### D5-05 - Laporan sebagai job
- POST /report membuat laporan `queued` lalu menjalankannya di latar belakang proses yang sama; klien memantau GET /reports/:id. Satu laporan aktif per proyek; job `queued/running` lebih dari 10 menit ditandai `failed (STALE)` saat dibaca. Pada hosting serverless, proses latar belakang dapat dihentikan; job usang akan ditandai gagal (antrean tahan lama ditunda ke Tahap 7).
- Pemakaian token penilai AI dicatat di UsageLedger (task `report`) dengan aturan D3-03 dan dicek kuota di muka bila AI terkonfigurasi. Laporan dihapus saat proyek dihapus.

### D4-10 - Putaran QC kedua: pengurai sitasi v3, ketahanan ReDoS, penyaring stream
- Temuan QC putaran 2 (red-team): sitasi dengan nama depan/inisial, nama bercetak tebal/miring, `Nama, tahun` tanpa kurung, daftar pustaka karangan tanpa penanda di teks (APA/Vancouver/IEEE/BibTeX/`\bibitem`), sitasi sah yang mencuci sitasi karangan di kurung yang sama, teks tautan DOI berisi detail palsu, pengenal non-DOI (arXiv/ISBN/PMID/URL jurnal), sitasi terpotong di akhir teks; serta ReDoS (input adversarial 20 KB memblokir event loop hingga 10 detik; guard stream memperburuknya menjadi kubik); `reverify`/`addCandidate` tidak memakai metadata kanonis.
- Keputusan: (1) pengurai v3: semua regex berbatas, lookback nama dari tahun, penanda penekanan diabaikan, daftar dan segmen kurung diurai per pasangan penulis-tahun, blok bibliografi dinilai per entri (sah hanya bila memuat DOI/judul referensi terverifikasi proyek), pengenal non-DOI dianggap sitasi tanpa rekaman, sitasi terpotong ditolak; (2) input sanitizer dibatasi 80.000 karakter (melebihi: melempar, pemanggil gagal tertutup), uji batas waktu 2 detik pada input adversarial 20 KB; (3) penyaring stream menyanitasi tiap potongan seimbang SENDIRI dan menahan deretan token-nama di ujung potongan (linear, tidak macet; potongan terbuka >600 karakter dipaksa keluar tersanitasi); batas potongan hanya di spasi agar DOI/URL tidak terbelah; (4) `reverify`/`addCandidate` menyimpan metadata KANONIS saat verified/retracted; perbandingan penulis memakai nama UNIK dan ambang 0,75.
- Batasan yang diterima dan tetap ada (tidak diklaim tertutup): "Nama 2020" tanpa tanda baca, "dikutip Nama pada 2020", dan narasi tanpa kurung dan tanpa koma tidak dideteksi (menghindari menandai prosa seperti "Piala Dunia 2022"); footnote `[^1]` tanpa isi sitasi; baris tabel markdown berisi referensi; entitas HTML hanya didekode untuk entri numerik/dasar. Teks tersimpan lama TIDAK disanitasi ulang saat referensi berubah (pesan lama tidak dinilai ulang).

### D5-06 - QC independen Tahap 5: perbaikan dan batasan yang diterima
- Diperbaiki (tes gagal dulu, `packages/checks/test/qc5.test.js`, `packages/venues/test`): naskah di atas 80.000 karakter tidak lagi menggagalkan seluruh laporan (sitasi menjadi `manual_review`); pola deklarasi berbasis frasa dan hanya memindai isi naskah di luar daftar pustaka; "Discussion and Conclusion" dan abstrak sebaris dikenali; indeks larik/URL (`a[1]`) bukan sitasi numerik; regex email berbatas (sebelumnya kuadratik, 16 dtk pada 50 KB); detail pemeriksaan tidak bergantung urutan referensi; CRLF/BOM dinormalkan; tahun referensi masa depan tidak dihitung terbaru; kutipan bukti penilai AI kini peka huruf besar/kecil, hanya dari teks yang dilihat penilai, disimpan dari SUMBER (bukan klaim penilai), minimal 5 kata, ditolak bila berasal dari teks injeksi; pemotongan bagian diungkap; penilai punya timeout; skor/bobot di luar rentang diperlakukan tidak dinilai; label dihitung dari skor tak dibulatkan; satu laporan aktif per proyek ditegakkan indeks unik parsial; kegagalan penagihan tidak menimpa laporan `completed` (ditandai `billingFailed`); token yang sudah terpakai tetap dicatat bila laporan gagal; estimasi token pra-kuota 30.000 (provisional); `checkedAt` wajib ISO dan tidak di masa depan, `provenance` wajib, bobot/rentang divalidasi; seed venue toleran E11000; UI memantau job dengan aman (berhenti saat dilepas, melanjutkan job aktif).
- Batasan yang diterima (tidak diklaim tertutup): klasifikasi bagian oleh parser Tahap 2 ("Experimental Setup" dihitung `results`); deteksi self-reference `kami telah` dapat menghasilkan peringatan pada prosa biasa (hanya untuk venue double-blind, bersifat peringatan); seed venue tidak mendeteksi perubahan JSON pada versi yang sama (perubahan aturan WAJIB menaikkan `version`); hapus proyek tidak transaksional (sisa dapat menjadi yatim bila gagal di tengah); `INJECTION_RE` heuristik dan tidak lengkap, tetapi skor tidak pernah diterima tanpa kutipan dari teks non-injeksi; job latar belakang berjalan di proses yang sama (antrean tahan lama ditunda ke Tahap 7).

### D6-01 - Usulan edit: AI hanya mengusulkan, pengguna memutuskan
- Usulan dibuat HANYA lewat tool agen `propose_edit` (membuat dokumen `EditProposal` berstatus pending; tidak menyentuh naskah). Satu usulan = penggantian isi satu bagian (tanpa heading); bagian `references` dilindungi. Usulan menyimpan `baseVersionId`, rentang offset, teks `before` dan `after`, alasan; diff dihitung saat dibaca (LCS baris, hanya tampilan).
- Accept membutuhkan `baseRevision` klien (compare-and-swap yang sama dengan penyimpanan versi), memastikan versi aktif == versi dasar DAN teks pada rentang == `before`; jika tidak, usulan ditandai `stale` dan penerapan otomatis ditolak (409 EDIT_STALE). Klaim `pending -> accepting` bersifat atomik sehingga accept bersamaan hanya menghasilkan satu versi; kegagalan menyimpan versi mengembalikan ke `pending`. Versi baru berasal `ai_edit_accepted`. Setiap usulan/terima/tolak dicatat di AiUsageLog (tanpa isi naskah).
- Integritas sitasi: usulan yang MENAMBAH sitasi tanpa referensi terverifikasi ditolak (fail-closed), diperiksa saat dibuat dan lagi saat accept (referensi dapat berubah). Sitasi bermasalah yang sudah ada pada teks asli tidak menghalangi edit.
- Batas: 20 usulan pending per proyek; teks usulan maks 30.000 karakter. PROVISIONAL.

### D6-02 - Ekspor paket: privat, on-demand, jujur
- Paket (ZIP store-only tanpa dependensi) berisi `main.tex`, `references.bib`, `README.txt`, `manifest.json`; dibangun saat diminta dan TIDAK disimpan, sehingga tidak ada artefak/tautan berumur pendek untuk dilindungi atau dibersihkan; unduhan hanya lewat sesi pemilik (404 untuk selain pemilik), `no-store`, dibatasi laju.
- BibTeX hanya dari referensi `verified`; bidang tak tersedia tidak diisi; escape karakter khusus; kunci sitasi divalidasi dan unik; hasil divalidasi ulang (kurung seimbang, daftar kunci). Referensi partial/unverified/retracted dikecualikan dan dilaporkan.
- LaTeX: naskah LaTeX diteruskan APA ADANYA (CRLF/BOM dinormalkan), hanya diperiksa (bibliografi, gambar, placeholder). Naskah Markdown dikonversi dengan subset yang dapat dipetakan pasti (heading, paragraf, tebal/miring/kode, daftar, abstrak, `\cite`); tabel, gambar, persamaan, tautan TIDAK ditebak: ditandai komentar `TODO-PUBPREP` dan peringatan. Sitasi gaya penulis-tahun tidak diubah menjadi `\cite`. Placeholder `[ISI ...]`/`TODO-PUBPREP` yang belum terisi dilaporkan.
- Template venue: TIDAK disertakan. Tidak ada template resmi yang diverifikasi (semua profil venue needs_review) dan lisensi distribusi template belum diperiksa; kelas generik `article` dipakai dan peringatan menyatakannya. DoD "paket diuji pada minimal satu template venue target" TIDAK TERPENUHI (butuh template resmi + kompilasi LaTeX nyata): TIDAK DIVERIFIKASI.
- Gambar yang dirujuk tidak disertakan (belum ada penyimpanan berkas); dilaporkan sebagai peringatan. Kompilasi LaTeX tidak dijalankan di CI (tidak ada TeX); validitas `.tex` hanya diperiksa struktur (begin/end seimbang), bukan dikompilasi: TIDAK DIVERIFIKASI.

### D6-03 - Overleaf: unggah manual saja
- Satu-satunya alur yang diklaim: unduh ZIP lalu Overleaf > New Project > Upload Project. Impor satu klik membutuhkan URL ZIP publik, bertentangan dengan unduhan privat (MTS 41.2 F), dan belum diuji pada akun Overleaf nyata; tidak dijanjikan. Antarmuka tipis (`manual` nyata, `fake` untuk uji) disiapkan agar integrasi resmi dapat ditambahkan tanpa mengubah pemanggil. Status: TIDAK DIVERIFIKASI (butuh akun Overleaf dan batas impor resmi).
- Route/model lama (api/manuscripts, analyses, journals, kum, payments, plans) TIDAK dihapus pada Tahap 6: tidak ada perintah MTS yang mengharuskannya dan penggantinya belum seluruhnya lulus gate produksi.

### D6-04 - QC independen Tahap 6: perbaikan, koreksi pernyataan, dan batasan yang diterima
- Koreksi D6-02: pemeriksaan struktur `.tex` (begin/end seimbang per lingkungan dan tepat satu `\end{document}`) kini BENAR-BENAR berjalan saat ekspor (`validateTexStructure`) dan hasilnya masuk peringatan; sebelumnya hanya ada di tes. Ini pemeriksaan struktur, BUKAN kompilasi.
- Diperbaiki test-first (`packages/edits/test/qc6.test.js`, `packages/export/test/qc6.test.js`): (T6-01) klaim `accepting` yang macet dipulihkan setelah 60 dtk (versi sudah tersimpan -> accepted; belum -> pending), kegagalan log jejak AI tidak lagi membuat accept gagal; (T6-02) usulan LaTeX dengan `\write18`/`\input`/`\include`/`\openin` dst. ditolak, dan ekspor naskah LaTeX memperingatkan perintah berbahaya, berkas yang dirujuk, kelas/paket non-standar; Markdown->LaTeX tidak lagi meneruskan TeX mentah (kode berpagar di-escape per baris, `\cite` hanya `\cite{kunci}` tanpa argumen opsional); (T6-03) usulan yang mengubah daftar heading (heading/subbagian bertambah atau hilang, pagar kode tak tertutup, `\end{document}` sisipan) ditolak; (T6-04) DOI/URL BibTeX tidak di-escape (hanya bentuk valid ditulis, selain itu dihilangkan), nama keluarga berisi "and" dibungkus, kunci sitasi tak peka huruf besar-kecil, penulis tanpa nama keluarga dilaporkan; BibTeX kini memakai metadata lengkap (`listForExport`: tipe/venue/url) alih-alih `listForContext`; usulan stale tidak mengisi batas pending; id proyek tidak valid -> 404; batas laju pratinjau dan unduhan ekspor dipisah; peringatan konversi Markdown (heading level 1 tambahan, pemetaan level, daftar bersarang, blok kode, daftar pustaka naskah tidak disalin, sitasi penulis-tahun).
- Batasan yang diterima: gerbang sitasi memakai penyaring Tahap 4 sehingga atribusi naratif tanpa tanda kurung ("Smith 2020 melaporkan") tidak terdeteksi (batasan D4-10); batas pending tidak atomik antar-giliran chat bersamaan; usulan lama (rejected/stale/accepted) tidak dibersihkan otomatis kecuali proyek dihapus; unduhan memakai tautan `<a download>` sehingga galat server (429/409) tidak ditampilkan rapi; ukuran/jenis berkas/struktur ZIP terhadap Overleaf nyata tidak diverifikasi.
