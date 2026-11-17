'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { scan, problems } = require('../../../scripts/scanVisibleText')

// Aturan produk: tidak ada em dash dan tanda panah apa pun pada teks yang terlihat pengguna (UI, email, legal, pesan galat, data venue).
test('pemindai mengenali em dash, panah, entitas, dan "->" / "=>"', () => {
  assert.ok(problems('a \u2014 b').length)
  assert.ok(problems('Berikutnya \u2192').length)
  assert.ok(problems('kembali \u2190').length)
  assert.ok(problems('x &rarr; y').length)
  assert.ok(problems('a -> b').length)
  assert.ok(problems('a => b').length)
  assert.ok(problems('\u25B6 buka').length)
  assert.equal(problems('Koma, titik. Tanda hubung - biasa: aman').length, 0)
})

test('tidak ada em dash atau tanda panah di string yang tampil (apps/web, packages/mailer, packages lain, data venue)', () => {
  const { findings, files } = scan()
  assert.ok(files > 100, `jumlah berkas dipindai terlalu sedikit: ${files}`)
  assert.deepEqual(findings.map((f) => `${f.file}:${f.line} ${f.issue} | ${f.text}`), [])
})
