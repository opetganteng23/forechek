'use strict'
const { normalizeTitle, normalizeFamily } = require('./normalize')

// Perbandingan metadata dengan toleransi TERDOKUMENTASI (MTS 39.2 C). Ambang dapat diubah hanya lewat konstanta ini,
// dan ditinjau lewat benchmark (packages/literature/scripts/evaluate.js). Nilai awal PROVISIONAL (keputusan D4-02).
const THRESHOLDS = Object.freeze({
  titleMatch: 0.92, // Dice trigram >= ini: judul dianggap sama
  titleNear: 0.75, // antara near dan match: mirip tetapi tidak cukup untuk verified
  yearTolerance: 1, // selisih tahun terbit (online-first vs cetak) yang ditoleransi
  authorOverlap: 0.75, // irisan nama keluarga UNIK minimum bila kedua daftar memuat >= 2 penulis (D4-10)
  minTitleChars: 15 // judul ternormalisasi lebih pendek dari ini tidak dapat berstatus verified
})

function trigrams(s) {
  const padded = `  ${s} `
  const out = new Map()
  for (let i = 0; i < padded.length - 2; i++) {
    const g = padded.slice(i, i + 3)
    out.set(g, (out.get(g) || 0) + 1)
  }
  return out
}

// Koefisien Dice atas trigram karakter judul ternormalisasi: 1 = identik, 0 = tak ada kemiripan.
function titleSimilarity(a, b) {
  const x = normalizeTitle(a)
  const y = normalizeTitle(b)
  if (!x || !y) return 0
  if (x === y) return 1
  const gx = trigrams(x)
  const gy = trigrams(y)
  let inter = 0
  for (const [g, n] of gx) inter += Math.min(n, gy.get(g) || 0)
  const total = [...gx.values()].reduce((s, n) => s + n, 0) + [...gy.values()].reduce((s, n) => s + n, 0)
  return total ? (2 * inter) / total : 0
}

function familySet(authors) {
  return (authors || []).map((a) => normalizeFamily(a.family)).filter(Boolean)
}

// Penulis pertama harus cocok bila kedua sisi memilikinya; keterwakilan seluruh penulis = irisan / sisi terpendek.
function compareAuthors(inputAuthors, recordAuthors) {
  const a = familySet(inputAuthors)
  const b = familySet(recordAuthors)
  if (!a.length || !b.length) return { comparable: false, firstAuthorMatch: null, overlap: null, listConsistent: null }
  const firstAuthorMatch = a[0] === b[0]
  // Nama dihitung UNIK: mengulang nama asli tidak menaikkan irisan.
  const setA = new Set(a)
  const setB = new Set(b)
  const inter = [...setA].filter((f) => setB.has(f)).length
  const overlap = inter / Math.min(setA.size, setB.size)
  // Bila kedua daftar memuat >= 2 penulis, sebagian besar penulis harus bersesuaian (penulis pendamping karangan tidak lolos).
  const listConsistent = a.length >= 2 && b.length >= 2 ? overlap >= THRESHOLDS.authorOverlap : true
  return { comparable: true, firstAuthorMatch, overlap, listConsistent }
}

function compareYear(inputYear, recordYear) {
  if (!inputYear || !recordYear) return { comparable: false, match: null, diff: null }
  const diff = Math.abs(inputYear - recordYear)
  return { comparable: true, match: diff <= THRESHOLDS.yearTolerance, diff }
}

module.exports = { THRESHOLDS, titleSimilarity, compareAuthors, compareYear }
