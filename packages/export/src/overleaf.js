'use strict'

// Overleaf (MTS 41.2 E). Antarmuka tipis dengan implementasi nyata dan palsu (aturan mandat integrasi eksternal).
// Hasil PoC yang dapat dipertanggungjawabkan tanpa akun/jaringan: satu-satunya alur yang diklaim adalah UNGGAH MANUAL
// berkas ZIP (Menu > New Project > Upload Project). Impor satu klik lewat URL ZIP publik membutuhkan artefak yang dapat
// diakses publik; itu bertentangan dengan unduhan privat (MTS 41.2 F) dan BELUM diuji, sehingga tidak dijanjikan.
const MANUAL_STEPS = [
  'Unduh paket ZIP dari tombol Ekspor.',
  'Di Overleaf: New Project > Upload Project, lalu pilih berkas ZIP tersebut.',
  'Atur kompilator ke pdfLaTeX dan buka main.tex; periksa peringatan pada README.txt.'
]

const manualOverleafProvider = Object.freeze({
  name: 'manual',
  verified: false,
  describe: () => ({ mode: 'manual_upload', oneClick: false, steps: MANUAL_STEPS, note: 'Alur unggah manual; belum diuji pada akun Overleaf nyata (TIDAK DIVERIFIKASI).' })
})

// Palsu untuk uji: mensimulasikan penyedia impor satu klik tanpa jaringan.
function createFakeOverleafProvider() {
  const calls = []
  return { name: 'fake', verified: false, calls, describe: () => ({ mode: 'fake_one_click', oneClick: true, steps: ['(simulasi uji)'], note: 'PROVIDER PALSU' }), async importZip(zip) { calls.push(zip.length); return { projectUrl: 'https://example.invalid/overleaf-fake' } } }
}

function getOverleafProvider() {
  return manualOverleafProvider
}

module.exports = { manualOverleafProvider, createFakeOverleafProvider, getOverleafProvider, MANUAL_STEPS }
