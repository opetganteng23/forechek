'use strict'

// Diff berbasis baris (LCS) untuk tampilan before/after. Hanya untuk ditampilkan: penerapan edit memakai rentang offset
// dan teks `before` yang tersimpan, bukan diff. Di atas batas ukuran, diff dasar: seluruh teks diganti.
const MAX_CELLS = 1_000_000

function lines(s) {
  return s === '' ? [] : s.split('\n')
}

// Hasil: [{op: 'eq'|'del'|'add', text}] per baris.
function diffLines(before, after) {
  const a = lines(before)
  const b = lines(after)
  if ((a.length + 1) * (b.length + 1) > MAX_CELLS) return [...a.map((text) => ({ op: 'del', text })), ...b.map((text) => ({ op: 'add', text }))]
  const w = b.length + 1
  const t = new Uint32Array((a.length + 1) * w)
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) t[i * w + j] = a[i] === b[j] ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1])
  const out = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { out.push({ op: 'eq', text: a[i] }); i++; j++ }
    else if (t[(i + 1) * w + j] >= t[i * w + j + 1]) out.push({ op: 'del', text: a[i++] })
    else out.push({ op: 'add', text: b[j++] })
  }
  while (i < a.length) out.push({ op: 'del', text: a[i++] })
  while (j < b.length) out.push({ op: 'add', text: b[j++] })
  return out
}

module.exports = { diffLines }
