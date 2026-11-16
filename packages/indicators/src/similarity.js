'use strict'

// Indikator kemiripan teks (MTS 43 W2, P4). HANYA kecocokan literal (shingling kata) terhadap korpus TERBATAS yang diberikan pemanggil
// (di produk ini: judul dan abstrak referensi proyek). Bukan pemeriksaan plagiarisme: korpus kecil, tanpa parafrase, tanpa web.
// Hasil menyebut cakupan korpus dan keterbatasannya; tidak pernah menyimpulkan niat atau pelanggaran.
const SHINGLE = 6 // panjang n-gram kata (PROVISIONAL)
const MIN_PASSAGE_WORDS = 10 // bagian cocok berurutan minimal ini dilaporkan (PROVISIONAL)
const MAX_PASSAGES = 20
const MAX_WORDS = 60000

const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu
const norm = (w) => w.toLowerCase().normalize('NFKC')

// Rentang dikecualikan diurutkan dan digabung; tokenisasi memakai satu penunjuk maju sehingga linear (O(kata + rentang)).
function mergeRanges(ranges) {
  const sorted = ranges.filter((r) => r[1] > r[0]).sort((x, y) => x[0] - y[0])
  const out = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else out.push([r[0], r[1]])
  }
  return out
}

// Token teks bersama posisi karakter asli; bagian yang dikecualikan (kutipan langsung, kode, daftar pustaka) ditandai `skip`.
function tokenize(text, excluded) {
  const ranges = mergeRanges(excluded)
  let ri = 0
  const out = []
  for (const m of text.matchAll(WORD)) {
    const at = m.index
    while (ri < ranges.length && ranges[ri][1] <= at) ri++
    out.push({ w: norm(m[0]), at, end: at + m[0].length, skip: ri < ranges.length && at >= ranges[ri][0] && at < ranges[ri][1] })
    if (out.length > MAX_WORDS) break
  }
  return out
}

// Rentang yang dikecualikan: kutipan langsung ("..."), blockquote (>), blok kode berpagar, dan bagian daftar pustaka.
function excludedRanges(text, referencesStart) {
  const ranges = []
  for (const m of text.matchAll(/["“][^"”\n]{12,600}["”]/g)) ranges.push([m.index, m.index + m[0].length])
  for (const m of text.matchAll(/^>.*$/gm)) ranges.push([m.index, m.index + m[0].length])
  for (const m of text.matchAll(/^```[\s\S]*?^```/gm)) ranges.push([m.index, m.index + m[0].length])
  if (Number.isFinite(referencesStart)) ranges.push([referencesStart, text.length])
  return ranges
}

const lineOf = (text, at) => text.slice(0, at).split('\n').length

// corpus: [{id, label, text}]. Hasil deterministik.
function similarityIndicator({ text, corpus, referencesStart }) {
  const limitations = [
    'Hanya kecocokan literal kata-per-kata terhadap korpus terbatas (judul dan abstrak referensi proyek).',
    'Tidak mendeteksi parafrase, terjemahan, atau kemiripan terhadap sumber di luar korpus (web, makalah berbayar, repositori kampus).',
    'Kemiripan tidak berarti pelanggaran; kutipan yang sah, istilah baku, dan frasa umum juga cocok. Tinjau manual.',
    'Ketiadaan temuan TIDAK berarti naskah bebas dari kemiripan dengan sumber lain.'
  ]
  const summary = (text) => ({ summaryText: text })
  const scope = { corpus: 'judul dan abstrak referensi proyek', documents: corpus.length, shingleWords: SHINGLE, minPassageWords: MIN_PASSAGE_WORDS, provisional: true }
  const toks = tokenize(text, excludedRanges(text, referencesStart))
  const checked = toks.filter((t) => !t.skip)
  if (!corpus.length) return { indicator: 'similarity', status: 'no_corpus', ...summary('Belum ada abstrak referensi untuk dibandingkan.'), scope, coveragePercent: null, passages: [], limitations: [...limitations, 'Belum ada referensi dengan abstrak: tidak ada korpus yang dapat dibandingkan.'] }
  if (checked.length < 50) return { indicator: 'similarity', status: 'text_too_short', ...summary('Teks terlalu pendek untuk diperiksa.'), scope, coveragePercent: null, passages: [], limitations }

  // indeks shingle korpus -> {docIndex}
  const index = new Map()
  corpus.forEach((d, di) => {
    const ws = tokenize(`${d.title || ''}. ${d.text || ''}`, []).map((t) => t.w)
    for (let i = 0; i + SHINGLE <= ws.length; i++) {
      const k = ws.slice(i, i + SHINGLE).join(' ')
      if (!index.has(k)) index.set(k, di)
    }
  })

  // tandai token yang tercakup shingle cocok (hanya pada rentang tak dikecualikan, berurutan)
  const covered = new Array(toks.length).fill(-1)
  // Jumlah token terkecualikan di jendela dijaga dengan penjumlahan awalan (tanpa alokasi per jendela): linear.
  const skipPrefix = new Int32Array(toks.length + 1)
  for (let i = 0; i < toks.length; i++) skipPrefix[i + 1] = skipPrefix[i] + (toks[i].skip ? 1 : 0)
  for (let i = 0; i + SHINGLE <= toks.length; i++) {
    if (skipPrefix[i + SHINGLE] - skipPrefix[i] > 0) continue
    let key = toks[i].w
    for (let j = i + 1; j < i + SHINGLE; j++) key += ` ${toks[j].w}`
    const di = index.get(key)
    if (di !== undefined) for (let j = i; j < i + SHINGLE; j++) covered[j] = di
  }
  const passages = []
  for (let i = 0; i < toks.length; ) {
    if (covered[i] < 0) { i++; continue }
    let j = i
    while (j + 1 < toks.length && covered[j + 1] === covered[i]) j++
    const words = j - i + 1
    if (words >= MIN_PASSAGE_WORDS) {
      const a = toks[i].at
      const b = toks[j].end
      passages.push({ line: lineOf(text, a), words, snippet: text.slice(a, Math.min(b, a + 240)).replace(/\s+/g, ' ').trim(), matchedWith: { id: corpus[covered[i]].id, label: corpus[covered[i]].label } })
    }
    i = j + 1
  }
  const matchedWords = passages.reduce((s, p) => s + p.words, 0)
  return {
    indicator: 'similarity',
    status: 'ok',
    summaryText: passages.length ? `Ditemukan ${passages.length} bagian (${matchedWords} kata) yang cocok literal dengan abstrak referensi, dari ${checked.length} kata yang diperiksa.` : `Tidak ada kecocokan literal terhadap ${corpus.length} abstrak referensi.`,
    scope,
    checkedWords: checked.length,
    excludedWords: toks.length - checked.length,
    coveragePercent: Number(((matchedWords / checked.length) * 100).toFixed(1)),
    passages: passages.slice(0, MAX_PASSAGES),
    truncated: passages.length > MAX_PASSAGES,
    limitations
  }
}

module.exports = { similarityIndicator, SIM_CONSTANTS: { SHINGLE, MIN_PASSAGE_WORDS } }
