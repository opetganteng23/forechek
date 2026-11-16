'use strict'

// Indikator gaya teks (MTS 4.2, 43). DESKRIPTIF: statistik keseragaman penulisan. BUKAN detektor penulis AI dan tidak menghasilkan vonis.
// Penelitian publik menunjukkan pendeteksi gaya semacam ini memiliki galat besar, terutama pada tulisan akademik formal dan penulis
// non-native. Karena itu keluaran HANYA angka deskriptif: tanpa ambang, tanpa label tingkat/lencana, tanpa skor gabungan, dan tidak masuk skor
// kesiapan maupun ekspor. Hasil hanya boleh dipakai penulis untuk melihat variasi gaya mereka sendiri.
const MIN_WORDS = 300

const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu

function sentences(text) {
  return text.split(/(?<=[.!?])\s+(?=[\p{Lu}\p{N}"“(])/u).map((s) => s.trim()).filter((s) => (s.match(WORD) || []).length >= 3)
}

function mean(a) { return a.reduce((s, x) => s + x, 0) / a.length }
function stdev(a) { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))) }

function styleIndicator({ text }) {
  const limitations = [
    'Statistik ini hanya menggambarkan keseragaman gaya penulisan; BUKAN penentu siapa/apa yang menulis dan tidak menghasilkan vonis.',
    'Tulisan akademik formal, penulis non-native, template, dan naskah yang diedit alat bantu bahasa dapat tampak seragam tanpa alasan apa pun yang bermasalah.',
    'Angka ini tidak punya ambang yang divalidasi pada korpus naskah Indonesia/Inggris. Jangan gunakan sebagai bukti.'
  ]
  const words = (text.match(WORD) || []).map((w) => w.toLowerCase())
  if (words.length < MIN_WORDS) return { indicator: 'style', status: 'text_too_short', minWords: MIN_WORDS, words: words.length, signals: null, limitations }
  const sents = sentences(text)
  const lens = sents.map((s) => (s.match(WORD) || []).length)
  const cv = lens.length >= 5 ? stdev(lens) / mean(lens) : null // variasi panjang kalimat (burstiness)
  const ttr = new Set(words).size / words.length
  const grams = new Map()
  for (let i = 0; i + 4 <= words.length; i++) { const k = words.slice(i, i + 4).join(' '); grams.set(k, (grams.get(k) || 0) + 1) }
  let rep = 0
  for (const n of grams.values()) if (n > 1) rep += n - 1
  const repeatedRatio = rep / Math.max(1, words.length - 3)
  return {
    indicator: 'style',
    status: 'ok',
    words: words.length,
    sentences: sents.length,
    signals: {
      sentenceLengthMean: Number(mean(lens).toFixed(1)),
      sentenceLengthCv: cv === null ? null : Number(cv.toFixed(2)),
      typeTokenRatio: Number(ttr.toFixed(3)),
      repeatedFourGramRatio: Number(repeatedRatio.toFixed(3))
    },
    interpretation: 'Deskriptif: keseragaman panjang kalimat dan pengulangan frasa. Tidak ada kesimpulan tentang penulis.',
    limitations
  }
}

module.exports = { styleIndicator, STYLE_MIN_WORDS: MIN_WORDS }
