'use strict'
const { similarityIndicator } = require('./similarity')
const { styleIndicator } = require('./style')

// Pembungkus: naskah + daftar referensi proyek -> kedua indikator. Teks daftar pustaka dikecualikan dari pemeriksaan.
// Kata yang DILARANG muncul pada keluaran (P4, tidak ada vonis): lihat FORBIDDEN (diuji).
const FORBIDDEN = /plagiat|plagiarism|pasti|ditulis (oleh )?(AI|ai|mesin)|bukti (plagi|penjiplakan)|terbukti|bebas plagi/i

function buildIndicators({ source, parse, references = [], now = new Date() }) {
  const refsSection = ((parse && parse.sections) || []).find((s) => s.key === 'references')
  const corpus = references.filter((r) => r.abstract && String(r.abstract).length >= 40).map((r) => ({ id: r.citeKey, label: `${r.citeKey}${r.year ? ` (${r.year})` : ''}`, title: r.title, text: r.abstract }))
  const body = refsSection ? source.slice(0, refsSection.start) : source
  const out = {
    similarity: similarityIndicator({ text: body, corpus }),
    style: styleIndicator({ text: body }),
    notice: 'Indikator bantuan, bukan penilaian. Tidak ada vonis tentang orisinalitas atau penulis naskah. Ambang provisional dan belum divalidasi.',
    generatedAt: now.toISOString()
  }
  return out
}

module.exports = { buildIndicators, FORBIDDEN }
