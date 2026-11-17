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

### D7-01 - Hardening Tahap 7: keputusan dan batasan
- **Batas laju (QA-05)**: store dapat diganti (memory default; Redis opsional via `REDIS_URL` + paket `ioredis` yang TIDAK dibundel; Redis gagal -> memory + log). `X-Forwarded-For` HANYA dipercaya bila `TRUST_PROXY=true`, memakai entri ke-`TRUST_PROXY_HOPS` dari KANAN (ditambahkan proxy tepercaya), bukan entri kiri yang dapat dipalsukan klien. Tanpa `TRUST_PROXY` semua klien berbagi satu bucket (aman, kasar). Uji: `scripts/e2e/proxy.js` pada dua server. Redis nyata: TIDAK DIVERIFIKASI.
- **Fail-fast env (QA-16/29)**: `instrumentation-node.js` menghentikan proses di produksi bila `bootProblems` melaporkan error (nama variabel saja); non-produksi hanya peringatan. Peringatan (bukan error) bila `TRUST_PROXY`/`REDIS_URL` kosong di produksi.
- **CSRF/Origin (QA-18)**: permintaan pengubah-status dengan header `Origin` yang host-nya berbeda dari host permintaan (atau `x-forwarded-host` bila TRUST_PROXY) ditolak 403, kecuali ada di `ALLOWED_ORIGINS`. Permintaan TANPA Origin diizinkan (klien non-browser, webhook server-ke-server); cookie `SameSite=Lax` tetap lapisan pertama. Rute NextAuth tidak melewati pemeriksaan ini (perlindungan CSRF bawaan NextAuth).
- **Batas body (QA-11)**: ditegakkan pada byte yang dibaca (aliran dihentikan), bukan hanya Content-Length.
- **Kuota proyek (QA-10)**: pembuatan diserialkan per pengguna per proses + cek ulang setelah membuat (hanya 50 proyek pertama menurut _id dipertahankan). Celah yang diterima: lintas-instance bersamaan dapat melebihi batas sangat sedikit sampai cek ulang berikutnya; penghitung atomik di dokumen pengguna ditunda.
- **Pencabutan sesi (QA-14)**: `User.sessionsValidAfter` diisi saat reset password; callback JWT memeriksa (satu pembacaan DB per evaluasi sesi) dan mencabut sesi yang diterbitkan sebelumnya, akun nonaktif, atau akun terhapus. Perbandingan berdetik (iat) sehingga login dalam detik yang sama dengan reset tidak terkunci.
- **forgot-password (QA-13)**: email dikirim tanpa menunggu; selisih waktu respons terdaftar vs tidak diuji < 150 ms (median).
- **Hapus akun dan retensi (QA-09, D0-08)**: `DELETE /api/account` (email konfirmasi + password bila ada) menghapus semua proyek dan data turunan lewat `packages/db/cascade.js` (satu sumber daftar koleksi untuk hapus proyek/akun/retensi), data model lama, lalu akun. `UsageLedger` dan `Payment` DIPERTAHANKAN (catatan teknis/keuangan tanpa isi naskah) dan dinyatakan di draf kebijakan privasi. Retensi: hanya proyek yang pengguna beri `retentionDays`, lewat kedaluwarsa + `RETENTION_GRACE_DAYS` (default 7); `npm run retention` default dry-run, hapus nyata hanya `RETENTION_ENABLED=true`; dijadwalkan dari luar aplikasi. Backup tetap memuat data terhapus sampai kedaluwarsa (dicatat di runbook).
- **Rute lama (QA-07)**: `POST /api/manuscripts` (Cloudinary publik) mengembalikan 410 kecuali `LEGACY_ROUTES_ENABLED=true`. Rute/model lama lain tidak dihapus.
- **Header (QA-24)**: HSTS di produksi. CSP BELUM diaktifkan (risiko yang diterima sementara: perlu disusun bersama inline script Next dan Midtrans Snap lalu diuji); pelindung XSS saat ini: React escaping + tanpa `dangerouslySetInnerHTML` pada data pengguna.
- **Belum dikerjakan (tetap terbuka)**: staging/alerting nyata dan uji restore (runbook BELUM DIUJI), tinjauan hukum privasi/ToS (draf bertanda), kontak insiden, beta tertutup, uji beban/p95 dengan target kapasitas, `npm audit` major (Next/dependensi), QA-19 parser (BAB, `\and`), QA-20 lint, QA-21 kontras, QA-22 tautan Navbar mati, QA-23 halaman 404/error, QA-25 enumerasi email register (butuh keputusan produk).

### D7-02 - QC independen Tahap 7: perbaikan dan batasan
- Diperbaiki test-first: (T7-01) bucket 'unknown' (tanpa IP tepercaya) diskalakan x50 dan produksi mewajibkan `TRUST_PROXY` eksplisit true|false, sehingga 15 pengguna berbeda dapat login (e2e `proxy.js` pada server TRUST_PROXY=false); kunci email login hanya dihitung bila IP lolos; (T7-02) retensi mengklaim proyek secara atomik (`findOneAndUpdate` -> `deletion_pending` hanya bila MASIH kedaluwarsa) lalu cascade; proyek yang diperpanjang di antara pencarian dan penghapusan tidak terhapus (diuji pada DB nyata di e2e `hardening.js`), proyek `deletion_pending` tidak dapat ditulis dan ditemukan lagi untuk dicoba ulang; (T7-03) limiter memori tidak lagi membuang entri aktif saat penuh (kunci baru berbagi bucket luapan); (T7-04) `bootProblems` menolak `REQUIRE_EMAIL_VERIFICATION=true` tanpa GMAIL_*, `REDIS_URL` tanpa paket `ioredis`, dan memperingatkan AI belum dikonfigurasi di produksi; (T7-07) indeks parsial `retentionExpiresAt`; sesi yang dicabut kini dianggap TIDAK ADA oleh semua rute (rute lama yang hanya memeriksa `!session` ikut 401); Redis limiter memakai EVAL atomik; hapus akun menonaktifkan akun lebih dulu, menyapu semua koleksi per userId dua kali, menghapus berkas Cloudinary lama (best effort, kegagalan dilaporkan) dan butuh kata HAPUS; IPv6-mapped dinormalkan; BOM JSON dibuang.
- Batasan yang diterima/terbuka: Redis nyata dan impor `ioredis` TIDAK DIVERIFIKASI; penguncian email sasaran (kunci `em:` dapat dihabiskan siapa pun yang tahu email korban; ditahan oleh batas IP); akun Google-only dihapus tanpa re-autentikasi segar; pekerjaan latar yang masih menulis setelah sapuan kedua penghapusan akun dapat meninggalkan data yatim; bug rute lama di luar cakupan (kuota analisis tidak atomik, webhook dapat memperpanjang langganan dua kali pada notifikasi bersamaan, parameter `journals` tidak dibatasi, CastError 500 pada id tidak valid).

### D8-01 - Tahap 8: hanya indikator kemiripan teks dan gaya (W2 sebagian)
- Dikerjakan: `packages/indicators`: (a) kemiripan literal (shingle 6 kata, passage >= 10 kata) terhadap judul+abstrak referensi PROYEK saja; kutipan langsung, blockquote, kode, dan daftar pustaka dikecualikan; tokenisasi linear; (b) statistik gaya DESKRIPTIF (panjang kalimat, CV, rasio kata unik, pengulangan frasa) tanpa ambang, tanpa label tingkat, tanpa skor.
- Aturan P4 ditegakkan dan diuji: tidak ada vonis/kata terlarang, tanpa lencana berwarna, tanpa skor gabungan, tidak masuk skor kesiapan maupun ekspor, tidak disimpan, OPSIONAL per proyek (`indicatorsEnabled`, default mati). Tanpa kecocokan: "Tidak ada kecocokan literal terhadap N abstrak referensi" (bukan persen). Ambang shingle PROVISIONAL dan belum divalidasi; tidak mendeteksi parafrase/terjemahan/sumber di luar korpus.
- TIDAK dikerjakan (butuh prasyarat MTS 43): DOCX (W1), Zotero/Mendeley (W3), ORCID (W4), Overleaf Git sync (W5), diagram (W6), workspace institusi (W7), rekomendasi venue (W8), analitik riset (W9), similarity berlisensi (W10). Alasan: butuh akun/izin/lisensi eksternal, korpus berhak akses, atau keputusan produk yang belum ada.

### D9-01 - Audit akhir: perbaikan setelah QC silang
- Teks buatan model pada laporan kesiapan (rationale, saran) kini melewati validator sitasi yang sama dengan chat (fail-closed). Penyaring tetap berbasis pola dan TIDAK menjamin: bentuk sitasi naratif tanpa kurung, `[ 7 ]`, `[7a]`, `Ghost [2021]` lolos (F-02, terbuka); klaim integritas ilmiah berlaku sebagai "terverifikasi terhadap benchmark sintetis dan red-team yang diketahui", bukan jaminan mutlak.
- Rute analisis lama dinonaktifkan (410) bersama unggah lama.

### D10-01 - Gerbang sitasi: atribusi naratif dan stream per kalimat (F-02)
- Penyaring sitasi kini juga memetakan atribusi naratif ke referensi terverifikasi proyek: "Nama et al. 2020", "Nama dkk. 2020", "Per Nama 2021", "Nama [2021]", "Nama 2022 melaporkan" (kata kerja pelaporan), "\footnote{Nama 2021}", "[ 7 ]", "[7a]", dan atribusi TANPA tahun ("Menurut Nama", "According to Nama", "dilaporkan oleh Nama dkk."). Atribusi tanpa tahun cocok bila penulis pertama (dan kedua/jumlah penulis bila disebut) sama dengan SATU referensi terverifikasi; selain itu ditandai. Diuji dengan 21 bentuk palsu (ID dan EN), 9 bentuk sah, 7 kalimat biasa yang TIDAK boleh ditandai, dan stream pada berbagai ukuran potongan.
- Konsekuensi disengaja: stream chat hanya menampilkan KALIMAT LENGKAP (konteks pemicu/tahun tidak boleh terpisah antar potongan). Jawaban satu kalimat tampil sekaligus saat selesai. Teks final tetap dari sanitasi penuh.
- Kompromi false positive yang diterima: kata kapital setelah pemicu atribusi yang bukan penulis (mis. nama institusi baru) dapat ditandai "[referensi belum terverifikasi]"; daftar pengecualian umum (pemerintah, Anda, WHO, tabel, dst.) ada di `GENERIC_ATTRIBUTION`. Penyaring tetap berbasis pola dan TIDAK menjamin bentuk atribusi yang belum diketahui (O-02).

### D10-02 - Parser: batas bagian yang diindeks
- Naskah sah 1 MB dengan ratusan ribu heading membuat dokumen parse hingga 33 MB (melebihi batas dokumen MongoDB 16 MB; penyimpanan gagal), bukan hanya lambat. `MAX_SECTIONS=3000` dan `MAX_WARNINGS=200`; di atas itu bagian tidak diindeks dan ada peringatan `SECTIONS_TRUNCATED`. 200.000 heading: 375 ms, dokumen parse 356 KB (sebelumnya 33 MB).

### D10-03 - Webhook Midtrans idempoten
- Klaim `paid` atomik per order (`findOneAndUpdate` dengan syarat status bukan paid), `gross_amount` harus cocok dengan `Payment.amount` (409 bila tidak), perpanjangan langganan lewat satu pembaruan pipeline atomik, expire/deny/cancel hanya mengubah pembayaran `pending`. Diuji dengan 10 notifikasi paralel (unit) dan 12 paralel pada MongoDB nyata (e2e): tepat +30 hari.

### D10-04 - Next.js: tidak dinaikkan melewati 14.2.x
- 14.2.35 sudah patch 14.2.x terbaru; advisori tersisa hanya diperbaiki di Next >= 15.5.x/16 (butuh React 19 dan uji ulang). Keputusan paling aman dalam lingkup ini: pertahankan 14.2.35, tutup permukaan yang terjangkau (`images.unoptimized`, tanpa Server Actions/rewrites, server Linux di belakang nginx), dan catat sebagai O-01 (upgrade sebelum rilis publik luas). `npm audit fix` + nodemailer 10.6 menutup temuan lainnya.

### D10-05 - CSP berbasis nonce
- `middleware.js` membuat nonce per permintaan: `script-src 'self' 'nonce-X' 'strict-dynamic'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, `connect-src 'self'`, `upgrade-insecure-requests` (produksi). `style-src` tetap `'unsafe-inline'` (Tailwind/Next menyisipkan style; O-10). Seluruh aplikasi dirender dinamis (`dynamic = 'force-dynamic'` di layout akar) agar nonce berlaku. Uji produksi: landing, login, daftar, dashboard, proyek, ekspor, akun tanpa pelanggaran CSP maupun pageerror (UI 23/23).

### D10-06 - Anthropic SDK 1.8 dan nama model
- SDK dinaikkan dari ^0.27 ke ^1.8.0 dan diuji melawan server SSE lokal yang meniru Messages API (stream teks, tool_use, usage, galat 429/500/400). SDK baru memakai `Authorization: Bearer` dan header `anthropic-version`; kecocokan dengan API nyata TIDAK DIVERIFIKASI. Nama model tetap hanya dari env; `.env.example` menyarankan `claude-sonnet-5-5` (chat/laporan) dan `claude-haiku-5-5` (ringan): operator harus memastikan ID masih berlaku. Model hardcode pada analisis lama dihapus (dibaca dari env).

### D10-07 - Sesi dicabut dan re-autentikasi
- Middleware tidak dapat memeriksa DB (edge), sehingga sesi yang dicabut ditangani di klien: respons 401 pada `apiFetch` memanggil `signOut` dan mengalihkan ke `/login?reason=session` dengan pesan jelas. Hapus akun untuk akun tanpa password mewajibkan masuk Google ulang <= 5 menit (`authAt`/`authProvider` dicatat HANYA saat sign-in; `REAUTH_REQUIRED`); logika murni diuji, jalur Google nyata TIDAK DIVERIFIKASI.
- Klien tidak dapat membuat versi berasal `ai_edit_accepted`/`restore` (400): jejak asal hanya dari server.

### D10-08 - Pendaftaran, landing, akun
- Register menjawab sama untuk email baru dan terdaftar (201 + pesan generik; hash tetap dihitung; tidak ada email dikirim untuk duplikat). Halaman Akun (`/dashboard/account`) menyediakan hapus akun (email + kata HAPUS + password/reauth Google). Landing ditulis ulang agar hanya menyebut fitur yang ada, tanpa harga dan klaim skor/grade/rekomendasi jurnal/KUM yang tidak ada (kuota/harga belum ditetapkan, D0-07). Email Nodemailer: merek Forechek, nama pengguna di-escape HTML.

### D10-09 - Paket deploy
- Rilis berdampingan (`releases/<waktu>`) + symlink `current` atomik + `pm2 startOrReload` + healthcheck + rollback otomatis bila gagal; satu instance pm2 (fork) karena batas laju memory (cluster butuh Redis). nginx: HTTP->HTTPS, HSTS, `client_max_body_size 3m`, SSE tanpa buffering, header `X-Forwarded-*` (dengan `TRUST_PROXY=true`, `TRUST_PROXY_HOPS=1`). Skrip diuji sintaks dan alur sampai build dengan stub; symlink/pm2/nginx/certbot/mongodump TIDAK DIUJI (tidak ada Linux di mesin pengembangan).
- `npm run preflight` memeriksa env (nama saja), Mongo, Redis, SMTP dan melapor LULUS/GAGAL/PERINGATAN/DILEWATI; placeholder `GANTI...` dianggap belum diisi.

### D11-01 - Email lewat SMTP biasa (bukan Gmail OAuth2)
- Atas permintaan pemilik produk: pengiriman email memakai SMTP biasa (`SMTP_HOST`, `SMTP_PORT` default 587, `SMTP_USER`, `SMTP_PASS`, opsional `SMTP_FROM`, `SMTP_SECURE`). Port 465 = TLS langsung; selain itu STARTTLS WAJIB (`requireTLS`), kredensial tidak pernah dikirim tanpa TLS. Berlaku untuk penyedia SMTP apa pun, termasuk Gmail dengan App Password (`smtp.gmail.com:587`). Variabel `GMAIL_*` dihapus dari kode, preflight, dan dokumen.
- Tanpa SMTP: pengiriman gagal dengan galat `SMTP_NOT_CONFIGURED` (nama variabel saja); register tetap berhasil dan galat dicatat; `REQUIRE_EMAIL_VERIFICATION=true` tanpa SMTP menolak start. `npm run preflight` memverifikasi koneksi dan login SMTP tanpa mengirim email. Pengiriman email nyata TIDAK DIVERIFIKASI (butuh kredensial SMTP).
- Login Google dipertahankan sebagai OPSIONAL: tombol Google disembunyikan bila `GOOGLE_CLIENT_ID/SECRET` kosong, sehingga deploy tanpa OAuth tidak menampilkan tombol yang rusak. Login utama tetap email + password. (Asumsi: "login pakai SMTP" = verifikasi email dan reset password lewat SMTP; login Google tidak diwajibkan.)

### D11-02 - Trial: 1 paper per akun
- Akun tanpa langganan aktif (plan efektif `free`, termasuk langganan kedaluwarsa) dapat membuat `TRIAL_PAPER_LIMIT` paper (proyek), default 1, SEUMUR AKUN. Penghitung `User.trialPapersCreated` hanya naik: menghapus paper TIDAK mengembalikan jatah (mencegah hapus lalu buat lagi), dan arsip/pemulihan tidak menambah jatah. Alasan konservatif: trial yang dapat didaur ulang tidak membatasi apa pun.
- Jatah diklaim ATOMIK di MongoDB (`findOneAndUpdate` dengan `$expr` atas penghitung; field yang belum ada dianggap 0) sebelum proyek dibuat, dan dikembalikan bila pembuatan gagal (validasi dilakukan sebelum klaim). Pembuatan paralel (8 permintaan) hanya meloloskan satu. Akun berlangganan aktif tidak dibatasi trial (tetap batas 50 proyek aktif). Penolakan: 403 `QUOTA_EXCEEDED` dengan `details.code = TRIAL_LIMIT` dan pesan "Akun trial hanya dapat membuat 1 paper. Berlangganan untuk membuat paper lain."
- Status trial tampil di `/api/auth/me` (`trial: {plan, trial, limit, used, remaining}`) dan sebagai banner di daftar proyek; tombol Buat proyek nonaktif saat jatah habis (server tetap menegakkan batas).
- Yang TIDAK dibatasi oleh trial: kuota token/pesan AI bulanan tetap memakai kuota paket free (PROVISIONAL, D0-07), jadi satu paper trial tetap dibatasi oleh kuota itu. Cara berlangganan (pembayaran Midtrans) ada tetapi belum diuji nyata; harga belum ditetapkan, sehingga pesan penolakan tidak menyebut harga. Akun yang sudah ada sebelum fitur ini (belum punya penghitung) mendapat jatah 1 paper baru (dianggap 0 terpakai).

### D11-03 - Merapikan `.env` lokal untuk dibawa ke server
- Perubahan pada `.env` (berkas ter-ignore; hanya nama variabel dicatat): `NEXTAUTH_SECRET` placeholder diganti nilai acak 32 byte; `SMTP_PASS` dibersihkan dari spasi (App Password Google 16 karakter); kunci Midtrans PRODUKSI dipindah ke `.env.midtrans-prod` (ter-ignore), `MIDTRANS_SERVER_KEY`/`MIDTRANS_CLIENT_KEY` dikosongkan dan `MIDTRANS_IS_PRODUCTION=false`. Alasan: alur pembayaran belum pernah diuji dengan Midtrans nyata; kunci produksi aktif tanpa uji adalah risiko finansial. Webhook menjawab 503 tanpa kunci (perilaku yang diharapkan). Cadangan: `.env.backup` (ter-ignore).
- `MIDTRANS_MERCHANT_ID` ada di `.env` tetapi tidak dibaca kode (tidak dihapus). Di server berkasnya adalah `shared/.env.local`, bukan `.env` repo.

## D12 - Admin, landing, tema, konfirmasi aksi

### D12-01 - Admin dan Kelola pengguna
- Peran `admin` dibaca dari DATABASE pada setiap permintaan admin (`requireAdmin`), bukan dari klaim JWT, sehingga penurunan peran berlaku seketika; JWT `role` juga disegarkan dari DB pada callback `jwt`.
- Akun admin dibuat/diperbarui dengan `npm run seed:admin` (idempoten). Email dan password dibaca dari ENV (`ADMIN_EMAIL`, `ADMIN_PASSWORD`, opsional `ADMIN_NAME`) saat dijalankan: TIDAK disimpan di repo/dokumen/log dan tidak dicetak. Akun dibuat terverifikasi dan aktif; bila sudah ada, peran admin ditegakkan, password diatur ulang, sesi lama dicabut.
- API `/api/admin/users` (GET daftar+cari+halaman, POST buat) dan `/api/admin/users/:id` (PATCH ubah nama/aktif/peran/paket+hari/reset trial/password; DELETE hapus dengan `confirmEmail`). 401 tanpa login, 403 pengguna biasa. Pengaman: admin tidak dapat menonaktifkan/menurunkan/menghapus dirinya sendiri (409 SELF_ACTION); admin aktif terakhir tidak dapat dinonaktifkan (409 LAST_ADMIN; pelindung berlapis). Nonaktif/ganti password/ubah peran mencabut sesi lewat `sessionsValidAfter`. Respons tidak memuat hash password/token.
- Admin dibebaskan dari batas trial (status paket `admin`).
- PERINGATAN: password admin awal yang diminta pemilik (8 karakter angka) LEMAH. Wajib diganti setelah login pertama (Kelola pengguna > Ganti password, atau lupa password lewat SMTP).

### D12-02 - Konfirmasi sebelum aksi
- Semua aksi yang mengubah data meminta konfirmasi lewat dialog `alertdialog` (`ConfirmProvider`/`useConfirm`): buat/arsip/hapus paper, simpan versi, pulihkan versi, simpan pengaturan, tambah/hapus/verifikasi ulang referensi, ganti venue, jalankan laporan, terima/tolak edit, indikator, ekspor, hapus akun, semua aksi admin, dan KELUAR. Batal/Escape tidak melakukan apa pun. Aksi berbahaya bernada merah.
- PENGECUALIAN yang disengaja (menyimpang dari "setiap"): kirim pesan chat dan kirim formulir masuk/daftar TIDAK memakai popup, karena itu aksi percakapan/autentikasi yang tidak merusak data dan popup akan merusak alurnya. Mudah ditambahkan bila pemilik menginginkannya.
- Keluar: konfirmasi, `signOut` tanpa redirect, lalu `window.location.assign('/')` (reload penuh ke landing).

### D12-03 - Logo, favicon, landing, tema
- Logo dari "Logo AILO Squared.png" (sumber di luar repo): `public/logo.png`, `app/icon.png`, `app/apple-icon.png`, `app/favicon.ico`. Tema "cloud white" (palet `base`/`ink` di Tailwind), landing `/` beranimasi (awan melayang, logo mengambang, gradien, marquee, reveal saat scroll) dengan `prefers-reduced-motion` dihormati. Teks landing jujur, tanpa statistik palsu. Halaman masuk/daftar memiliki tombol "Kembali ke beranda".

### D12-04 - Deploy ke server bersama (Caddy), bukan nginx+certbot
- Server 103.93.132.251 (Ubuntu 22.04) memakai ~15 aplikasi lain; port 80/443 dipegang container **Caddy** (`ailabs-deploy-caddy-1`, HTTPS otomatis Let's Encrypt), bukan nginx host. Maka nginx+certbot (D10) TIDAK dipasang di 80/443 (akan bentrok). Forechek ditambahkan sebagai satu blok di `~/ailabs-deploy/Caddyfile` (`deploy/shared-host/Caddyfile.forechek`) yang di-proxy ke `172.19.0.1:5021`; sertifikat terbit otomatis (diverifikasi: penerbit Let's Encrypt, CN forechek.ailo.ai.id, berlaku sampai 14 Feb 2027). Berkas `deploy/nginx/*` tetap valid untuk VPS dedicated.
- Aplikasi dijalankan pm2 (`deploy/shared-host/ecosystem.config.js`) di `~/apps/forechek` (rilis di `releases/<ts>`, symlink `current`, env di `shared/.env.local` chmod 600), mendengar hanya di antarmuka docker `172.19.0.1:5021`, `max_memory_restart 600M` karena memori server ketat.
- Database: instance Mongo yang sudah ada (`ailabs-deploy-mongo-1`, jaringan docker, TANPA autentikasi) dengan database terpisah `forechek` (`mongodb://172.19.0.9:27017/forechek`). RISIKO: tanpa autentikasi, siapa pun di jaringan docker/host dapat membaca database ini; IP container dapat berubah bila container dibuat ulang (aplikasi lalu gagal terhubung sampai `MONGODB_URI` diperbarui). Disarankan memindah ke Atlas atau mengaktifkan autentikasi Mongo.
- Catatan operasional Caddyfile: berkas di-bind-mount read-only sebagai satu berkas. Mengedit dengan `sed -i`/editor yang mengganti berkas (inode baru) membuat container tetap melihat versi lama sampai container di-restart; sunting di tempat (`cat baru > Caddyfile`) lalu `caddy reload`. Saat deploy, `sed -i` sempat dipakai sekali sehingga container masih memuat blok dengan header HSTS ganda (tidak berbahaya). Restart Caddy untuk menyinkronkan TIDAK dijalankan (belum disetujui; memengaruhi semua situs).
- `MIDTRANS_IS_PRODUCTION=false` dan kunci Midtrans kosong (pembayaran belum aktif); login Google nonaktif (kunci kosong); SMTP memakai akun dari `.env` (pengiriman email nyata TIDAK DIVERIFIKASI).

## D13 - Desain ulang UI, pengaman admin, audit klik

### D13-01 - Arah visual
- Tema "cloud white" polos: latar `#F4F5F7`, kartu putih, garis `#E2E5EA`, teks hitam keabuan. Satu aksen gelap (slate `#2B364D`) untuk tombol utama dan fokus; palet `sky` dan `indigo` Tailwind dipetakan ke aksen tunggal itu sehingga seluruh komponen lama otomatis memakainya. Warna semantik (hijau/kuning/merah) tetap dipakai hanya untuk status dan peringatan. Tanpa gradien, ilustrasi awan, marquee, atau statistik karangan.
- Font Poppins (400/500/600) lewat `next/font/google` (diunduh saat build, disajikan dari origin sendiri; CSP `font-src 'self'` cukup). Bukti: `document.fonts` melaporkan `Poppins` 400/500/600 berstatus loaded di build produksi dan tidak ada permintaan ke luar origin. Konsekuensi: build butuh akses internet ke fonts.googleapis.com sekali.
- Latar kertas: 4-6 lembar tipis (CSS murni, hanya transform; opacity statis) di landing dan halaman masuk/daftar; statis bila `prefers-reduced-motion`. Tidak ada animasi latar di dashboard.
- Pelajaran teknis: nama warna `base` membuat `text-base` Tailwind ambigu (warna dan ukuran). Semua pemakaian diganti (`text-[1rem]`/`text-white`).
- Sistem komponen tunggal: kelas `btn-primary/secondary/danger/ghost`, `field`, `card`, `badge(-ok/-warn/-bad)`, `table-base`, `skeleton` di `globals.css`; komponen `components/ui` (PageHeader, Card, EmptyState, Skeleton/ListSkeleton, ErrorState dengan Coba lagi, Badge).

### D13-02 - Struktur halaman
- Route group `(site)` (landing, masuk, daftar, lupa/atur ulang password, verifikasi email, privasi, syarat) memakai navbar+footer; `/dashboard` memakai `AppShell` (sidebar kiri tetap: Beranda, Paper, Akun, Admin hanya admin; topbar dengan nama dan menu pengguna; mobile: tombol Menu). URL tidak berubah.
- Landing: navbar, hero, masalah, cara kerja 4 langkah, fitur, prinsip integritas, batasan, harga, FAQ 8 pertanyaan, CTA penutup, footer. Kuota di bagian Harga dibaca dari konfigurasi (`loadConfig`), diberi label sementara; TIDAK ada harga baru (harga berbayar belum ditetapkan, pembayaran belum aktif). Kontak footer membaca env `CONTACT_EMAIL`; belum diisi, jadi tampil "belum ditetapkan oleh pengelola" (tidak mengarang kontak).
- Istilah antarmuka "Proyek" menjadi "Paper"; tab "Usulan" menjadi "Edit"; urutan tab: Naskah, Versi, Referensi, Chat, Kesiapan, Edit, Ekspor, Indikator, Pengaturan.

### D13-03 - Larangan em dash dan tanda panah
- Tidak ada U+2014, karakter panah, entitas panah, "->" atau "=>" pada teks yang tampil. Ditegakkan oleh `scripts/scanVisibleText.js` (AST espree: hanya string, template, teks JSX, dan data venue; komentar dan sintaks fungsi panah tidak ditandai) dan tes `apps/web/test/visibleText.test.js` di `npm test` (memindai apps/web dan seluruh packages, termasuk packages/mailer). Temuan awal 8 (tanda panah di admin, beranda, workspace, string log edit) diperbaiki.

### D13-04 - Konfirmasi aksi (revisi D12-02)
- Tetap meminta konfirmasi: buat/arsip/hapus paper, simpan dan pulihkan versi, tambah/hapus/simpan referensi manual, jalankan laporan (memakai kuota), terima/tolak edit, ekspor, aktif/nonaktif indikator, hapus akun, ganti password, keluar, semua aksi admin.
- Konfirmasi DIHAPUS untuk aksi sepele yang dapat dibalik tanpa biaya: simpan pengaturan paper, ganti venue target, verifikasi ulang referensi, hitung indikator (tidak menyimpan hasil). Pengecualian lama tetap: kirim chat dan submit masuk/daftar.
- Dialog mendukung `expectText`: ubah peran dan hapus pengguna oleh admin wajib mengetik email target (juga ditegakkan server).

### D13-05 - Pengaman admin
- Admin TIDAK dapat melakukan aksi apa pun atas akunnya sendiri lewat admin UI/API (nonaktif, peran, paket, reset trial, password, nama, hapus): 409 `SELF_ACTION`; baris sendiri di UI menampilkan kontrol nonaktif dan keterangan "Ini akun Anda". Ganti password sendiri hanya lewat Akun dengan password lama (`PATCH /api/account/password`, mencabut semua sesi).
- Tidak boleh ada keadaan tanpa admin aktif: semua perubahan yang dapat mengurangi admin (ubah peran/status, hapus pengguna, hapus akun sendiri oleh admin) berjalan di dalam mutex MongoDB (`locks/_id=admin-guard`, insert unik, kunci basi 15 dtk diambil alih), dan pelaku diperiksa ulang dari database di dalam kunci. Dua admin yang saling menurunkan/menonaktifkan/menghapus serentak: tepat satu berhasil. Penghapusan akun sendiri oleh admin aktif terakhir ditolak (409 `LAST_ADMIN`).
- Ubah peran dan hapus pengguna wajib `confirmEmail` yang cocok (400 bila tidak).
- `seed:admin`: tidak mereset password akun yang sudah ada kecuali dengan `--reset-password`; menolak password < 12 karakter (untuk akun baru atau reset). Catatan: password admin produksi saat ini (8 karakter) dibuat sebelum aturan ini; ganti lewat halaman Akun.

### D13-06 - Audit klik
- `scripts/qa/ui-audit.js` (puppeteer-core, tidak menjadi dependensi proyek) mengklik setiap tautan dan tombol di semua halaman; tombol berbahaya berhenti di dialog (Batal). Mencatat tautan mati/404, tombol tanpa efek, galat konsol/halaman, respons >= 400 tak terduga, pelanggaran CSP, teks meluap/terpotong, overflow horizontal, font, dan permintaan ke luar origin. Tangkapan layar di `docs/qa/screenshots/` (lihat INDEX.md).
- Putaran awal menemukan: galat konsol "Failed to fetch RSC payload" saat pengunjung anonim mengklik tautan Dashboard di footer (middleware mengalihkan ke login; tautan dihapus dari footer) dan teks tombol sekunder landing nyaris tak terbaca (lihat `text-base` di D13-01).
- Lighthouse a11y TIDAK DIVERIFIKASI (alat tidak terpasang). Tindakan a11y yang diterapkan: label untuk semua input, tautan lewati ke konten, `aria-current`, `role=tab`/`aria-selected`, dialog `alertdialog` dengan jebakan fokus.

## D14 - Superadmin, harga paket dinamis, manajemen pengguna dan paper

### D14-01 - Peran dan hierarki
- Peran baru `superadmin` (selain `user` dan `admin`). Admin dan superadmin sama-sama memiliki akses admin (kelola pengguna biasa, pantau paper semua pengguna) dan dibebaskan dari batas trial. HANYA superadmin yang: mengatur harga/kuota/jatah trial, membuat atau mengelola akun admin/superadmin, dan menaikkan/menurunkan peran ke atau dari admin (403 `SUPERADMIN_REQUIRED` untuk admin biasa). Peran dibaca dari database pada setiap permintaan.
- Pengaman D13-05 tetap berlaku dan kini menghitung admin aktif = admin atau superadmin (mutex yang sama). Akun `rizkyfadhillahx@gmail.com` dijadikan superadmin lewat `seed:admin --superadmin` (password tidak diubah).
- Temuan dan perbaikan: pencabutan sesi dibandingkan dalam detik sehingga sesi yang diterbitkan pada detik yang sama dengan pencabutan tetap berlaku. Kini token membawa `authAtMs` dan dibandingkan dalam milidetik (token lama memakai fallback detik, lebih ketat).

### D14-02 - Harga paket dinamis
- `Setting` (_id `plans`) menyimpan nama, catatan, harga bulanan/tahunan (null = belum ditetapkan), kuota token/pesan, butir fitur per paket (free/pro/institutional) dan `trialPapers`. Default dari env (`loadConfig`), nilai tersimpan menimpa; data rusak jatuh ke default. Validasi di `packages/core/src/plans.js` (harga/kuota bilangan bulat, batas, tanpa em dash/panah, maks. 8 fitur, paket asing ditolak).
- Berlaku langsung (cache 10 dtk per proses, dihapus saat simpan) pada: landing page (bagian Harga), `GET /api/plans` (publik), kuota chat/laporan, jatah trial (`createTrialGate` menerima fungsi async), dan pembuatan pembayaran (harga null atau paket asing ditolak 400). Halaman `/dashboard/admin/plans` (superadmin) dengan konfirmasi sebelum simpan.
- Batasan: pembayaran nyata tetap bergantung pada kunci Midtrans (belum diisi); landing hanya menampilkan tombol berlangganan bila `MIDTRANS_SERVER_KEY` terisi dan harga ditetapkan.

### D14-03 - Manajemen pengguna (CRUD) dan pemantauan paper
- Tabel pengguna: pencarian + filter peran/status/paket, paginasi 15, kolom responsif; tambah (formulir), ubah (modal: nama, email, paket+hari, peran, password, reset trial), nonaktif/aktif, hapus (ketik email). Ubah email mencabut sesi pengguna dan menolak duplikat.
- `/dashboard/admin/papers` (admin/superadmin): tabel paper semua pengguna dengan pemilik, jenis, bahasa, venue, versi, status, waktu; pencarian (judul/nama/email pemilik) dan filter status/jenis/bahasa; hanya METADATA, isi naskah tidak ditampilkan admin (selaras kebijakan privasi draf).
- Pengguna biasa: daftar paper sendiri berupa tabel dengan pencarian dan filter jenis/bahasa/status, paginasi 10.

### D14-04 - Merek dan latar
- Logo di situs kini hanya simbol AILO (tanpa kata AILO), disandingkan teks "Forechek" berwarna dari logo (teal `#00809D`, oranye `#E8671B` yang sedikit digelapkan untuk kontras). Favicon (`icon.png`, `favicon.ico`) berlatar TRANSPARAN; `apple-icon.png` tetap berlatar putih karena iOS tidak mendukung transparansi.
- Footer menautkan situs AILO (https://ailo.telkomuniversity.ac.id/, `target=_blank` `rel="noopener noreferrer"`), satu-satunya tautan eksternal yang diizinkan audit klik.
- Latar kertas: lembar bergerak lebih jauh dan teksnya "diketik" baris demi baris dengan kursor berkedip (transform/opacity saja); statis bila `prefers-reduced-motion`.
