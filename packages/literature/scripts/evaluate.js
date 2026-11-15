'use strict'
// Menjalankan benchmark dan menulis laporan ke docs/eval/literature-benchmark.md.
//   npm run eval --workspace=packages/literature
const fs = require('node:fs')
const path = require('node:path')
const { evaluate } = require('../benchmark/evaluate')

;(async () => {
  const r = await evaluate()
  const pct = (x) => `${(x * 100).toFixed(1)}%`
  const lines = [
    '# Benchmark integritas referensi (Tahap 4)',
    '',
    `Dihasilkan otomatis oleh \`npm run eval --workspace=packages/literature\` pada ${new Date().toISOString().slice(0, 10)}.`,
    '',
    '> **Cakupan dan batasan (jujur):** benchmark ini berjalan pada korpus **fixture sintetis** (DOI fiktif `10.99999/...`) dengan juri klaim yang **disimulasikan**. Ia mengukur logika verifikasi dan pagar sitasi di server, **bukan** akurasi terhadap OpenAlex/Crossref/Semantic Scholar sungguhan dan bukan kualitas penilaian LLM. Evaluasi pada provider nyata dan naskah nyata: TIDAK DIVERIFIKASI (butuh jaringan, kontak email polite pool, dan kunci AI).',
    '',
    `Ambang toleransi (provisional, D4-02): kemiripan judul cocok >= ${r.thresholds.titleMatch}, dekat >= ${r.thresholds.titleNear}, toleransi tahun +/- ${r.thresholds.yearTolerance}.`,
    '',
    '## Hasil ringkas',
    '',
    `- Total kasus: ${r.total}; benar: ${r.correct}; akurasi: ${pct(r.accuracy)}.`,
    `- **Kasus fiktif/salah yang lolos sebagai valid: ${r.fictitiousLeaks.length}** (target: 0).`,
    '',
    '## Per kategori',
    '',
    '| Kategori | Benar | Total | Akurasi |',
    '|---|---|---|---|',
    ...r.categories.map((c) => `| ${c.category} | ${c.ok} | ${c.total} | ${pct(c.ok / c.total)} |`),
    ''
  ]
  if (r.failures.length) {
    lines.push('## Kasus gagal', '', '| ID | Kategori | Diharapkan | Didapat |', '|---|---|---|---|', ...r.failures.map((f) => `| ${f.id} | ${f.kind}/${f.category} | ${f.expected} | ${f.got} |`), '')
  }
  lines.push('## Target dan baseline', '', 'Target rilis (MTS Gate 4): tidak ada sitasi fiktif yang lolos pada set uji rilis. Baseline di atas ditetapkan dari hasil pertama; target numerik akurasi per kategori pada provider nyata ditetapkan pemilik produk setelah baseline provider nyata tersedia.', '')
  const out = path.join(__dirname, '..', '..', '..', 'docs', 'eval', 'literature-benchmark.md')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, lines.join('\n'))
  console.log(lines.slice(6, 12).join('\n'))
  console.log(`\nLaporan: ${path.relative(process.cwd(), out)}`)
  process.exit(r.fictitiousLeaks.length ? 1 : 0)
})()
