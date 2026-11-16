'use strict'
const crypto = require('node:crypto')
const { buildBibtex, validateBibtex } = require('./bibtex')
const { convertMarkdown, findPlaceholders, citeKeysOf, inspectLatex, validateTexStructure, imagesOf } = require('./latex')
const { createZip } = require('./zip')

// Paket ekspor (MTS 41.2 D): main.tex, references.bib, README.txt, manifest.json. Dibangun on-demand dan tidak
// disimpan di server (tidak ada artefak yang perlu dilindungi/dibersihkan; unduhan hanya lewat sesi pemilik).
// Gambar yang dirujuk TIDAK disertakan (belum ada penyimpanan berkas); dilaporkan sebagai peringatan.
function buildExportPackage({ project, version, references, venue = null, freshness = null, now = new Date() }) {
  const warnings = []
  const bib = buildBibtex(references)
  const bibErrors = validateBibtex(bib.bib, bib.included)
  if (bibErrors.length) throw new Error(`references.bib tidak valid: ${bibErrors.join('; ')}`)
  for (const x of bib.excluded) warnings.push(`Referensi ${x.citeKey} tidak diekspor: ${x.reason}.`)
  warnings.push(...bib.warnings)

  let tex
  if (version.format === 'latex') {
    tex = version.source.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
    warnings.push('Naskah LaTeX diteruskan apa adanya sebagai main.tex (tidak diubah).')
    warnings.push(...inspectLatex(tex))
  } else {
    const c = convertMarkdown(version.source)
    tex = c.tex
    warnings.push('Naskah Markdown dikonversi ke LaTeX generik (kelas article); periksa hasilnya sebelum submit.')
    warnings.push(...c.warnings)
    if (/^#{1,6}[ \t]+(references?|daftar pustaka|referensi|bibliography|daftar acuan)[ \t]*$/im.test(version.source)) warnings.push('Daftar pustaka naskah tidak disalin ke main.tex; references.bib hanya memuat referensi terverifikasi proyek. Pastikan semua rujukan ada di tab Referensi.')
    if (/\([A-Z][^()\n]{1,80},? (19|20)\d{2}[a-z]?\)/.test(version.source)) warnings.push('Naskah memuat sitasi gaya penulis-tahun; tidak dipetakan ke \\cite (hanya \\cite{kunci} yang menjadi sitasi BibTeX).')
  }
  const texIssues = validateTexStructure(tex)
  if (texIssues.length) warnings.push(`Struktur main.tex tidak seimbang/valid: ${texIssues.join('; ')}. (Pemeriksaan struktur, bukan kompilasi.)`)
  const missingKeys = citeKeysOf(tex).filter((k) => !bib.included.includes(k))
  if (missingKeys.length) warnings.push(`Sitasi \\cite berikut tidak ada di references.bib terverifikasi: ${missingKeys.join(', ')}.`)
  const placeholders = findPlaceholders(tex)
  if (placeholders.length) warnings.push(`${placeholders.length} placeholder belum terisi (mis. baris ${placeholders[0].line}); isi sebelum submit.`)
  const images = imagesOf(version.source)
  if (images.length) warnings.push(`Gambar dirujuk tetapi TIDAK disertakan dalam paket: ${images.slice(0, 10).join(', ')}. Tambahkan manual.`)
  if (!venue) warnings.push('Venue belum dipilih: tidak ada pencocokan aturan venue; template yang dipakai generik.')
  else warnings.push(`Template venue tidak disertakan: tidak ada template resmi yang diverifikasi untuk ${venue.name}. Gunakan template resmi penerbit/konferensi lalu salin isi main.tex.`)
  if (venue && freshness && !freshness.trustworthy) warnings.push(`Aturan venue belum dapat dipercaya (${freshness.state}); jangan mengandalkan paket ini untuk kepatuhan format.`)

  const manifest = {
    generator: 'publication-prepare',
    generatedAt: now.toISOString(),
    project: { title: String(project.title || '').slice(0, 200) },
    manuscriptVersion: { number: version.number, format: version.format, checksum: version.checksum || crypto.createHash('sha256').update(version.source).digest('hex') },
    venue: venue ? { slug: venue.slug, version: venue.version, status: venue.status, verification: venue.verification } : null,
    references: { exported: bib.included.length, excluded: bib.excluded.length },
    placeholders: placeholders.length,
    warnings
  }
  const readme = [
    'PAKET EKSPOR PUBLICATION PREPARE',
    '',
    `Naskah: versi ${version.number} (${version.format}). Dihasilkan ${now.toISOString()}.`,
    '',
    'Isi paket:',
    '- main.tex          naskah dalam LaTeX',
    '- references.bib    HANYA referensi yang terverifikasi (tanpa bidang tebakan)',
    '- manifest.json     metadata versi, venue, dan peringatan',
    '',
    'Cara membuka/kompilasi:',
    '- Lokal: pdflatex main && bibtex main && pdflatex main && pdflatex main',
    '- Overleaf: Menu > New Project > Upload Project > pilih berkas ZIP ini. (Impor otomatis satu klik BELUM tersedia.)',
    '',
    'PERINGATAN (periksa sebelum submit):',
    ...warnings.map((w) => `- ${w}`),
    ''
  ].join('\n')

  const files = [
    { name: 'main.tex', data: tex },
    { name: 'references.bib', data: bib.bib },
    { name: 'README.txt', data: readme },
    { name: 'manifest.json', data: `${JSON.stringify(manifest, null, 2)}\n` }
  ]
  return { zip: createZip(files, now), files, manifest, warnings }
}

module.exports = { buildExportPackage }
