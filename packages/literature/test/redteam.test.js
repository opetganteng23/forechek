'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { sanitizeCitations, MARK_UNVERIFIED: MU, safePrefixLength } = require('../index')

const ref = (citeKey, family, year, status = 'verified', extra = {}) => ({ citeKey, authors: [{ family }], year, title: `Judul ${citeKey}`, doi: `10.99999/${citeKey}`, verification: { status }, ...extra })
const NONE = []

// RED-TEAM (QC Tahap 4): bentuk-bentuk sitasi karangan yang sebelumnya LOLOS. Semuanya HARUS ditolak dan diganti penanda.
const BYPASSES = [
  // LaTeX
  '\\cite {fake}', '\\cite\n{fake}', '\\citep [p.1] {fake}', '\\cite[see [a]]{fake}', '\\nocite{fake}', '\\Cite{fake}', '\\Parencite{fake}',
  '\\fullcite{fake}', '\\citealt{fake}', '\\citeyearpar{fake}', '\\supercite{fake}', '\\citetitle{fake}', '\\smartcite{fake}', '\\cites{fake}{fake2}',
  '\\textcites{fake}{fake2}', '\\ci\u200bte{fake}', '\\cite\u200b{fake}', '\\parencite[see][p.~3]{fake}',
  // pandoc
  '[see @fake, p. 3]', '[ @fake ]', '[cf. -@fake]', 'As @fake2020 shows', '[@fake; @fake2]',
  // penulis-tahun
  '(Fake, 2020, p. 4)', '(Fake, 2020: 5)', '(Fake & Doe, 2020, pp. 5-7)', '(Fake, 2020, hlm. 5)', 'Fake (2020, p. 3)', '(e.g., Fake, 2020)', '(lihat Fake, 2020)',
  '(see Fake, 2020)', '(van Fake, 2020)', '(de la Fake, 2020)', '(fake, 2020)', '(Fake, forthcoming)', '(Fake, n.d.)', 'Fake (in press)', '(Fake, 2020; also Fake, 2021)',
  '(Fake, 2020, 2021)', '(Fake, 2020a, b)', '(Fake,2020)', '(Fake et al.,2020)', '\uff08\uff26ake, 2020\uff09', '(Fake,\u00a02020)', '[Fake, 2020]', '[Fake 2020]', '[Fake et al., 2020]',
  'Fake et al., 2020', 'Fake and Doe, 2020', 'Fake dan Doe (2020)', 'Fake & Doe, 2020',
  // DOI dan tautan
  'doi:10.1234/fake', 'https://doi.org/10.1234/fake', '[makalah](https://doi.org/10.1234/fake)', '10.1234/fake.5678', 'https://dx.doi.org/10.1234/fake',
  // numerik
  'shown[1]', 'word[12]', '[1;2]', '[1\u20133]', '[7]'
]

test('RED-TEAM: semua bentuk sitasi karangan ditolak dan diganti penanda', () => {
  const leaks = []
  for (const b of BYPASSES) {
    const r = sanitizeCitations(`Klaim ${b} berikutnya.`, NONE)
    const left = r.text.replace(/\[referensi belum terverifikasi\]/g, '')
    if (!r.text.includes(MU) || /fake/i.test(left)) leaks.push([b, r.text])
  }
  assert.deepEqual(leaks, [], `lolos: ${JSON.stringify(leaks)}`)
})

test('RED-TEAM: referensi terverifikasi tidak memvalidasi penulis pendamping karangan, tahun salah, atau penulis pertama salah', () => {
  const refs = [ref('smith2020a', 'Smith', 2020, 'verified', { authors: [{ family: 'Smith' }, { family: 'Jones' }, { family: 'Lee' }] })]
  const passes = ['(Smith and Jones, 2020)', '(Smith & Jones, 2020)', '(Smith et al., 2020)', '(Smith, 2020)', 'Smith (2020)', '(Smith and Jones, 2020, p. 5)', '\\cite{smith2020a}', '[@smith2020a, p. 3]']
  const fails = ['(Smith and Nobody, 2020)', '(Smith, 2021)', '(Jones, 2020)', '(Smith, 2019)', '(Nobody and Smith, 2020)', '(Smith, forthcoming)', '[@smith2020a; @fake]']
  for (const p of passes) assert.equal(sanitizeCitations(`x ${p} y`, refs).changed, false, `harus lolos: ${p}`)
  for (const f of fails) assert.equal(sanitizeCitations(`x ${f} y`, refs).changed, true, `harus ditolak: ${f}`)
})

test('RED-TEAM: DOI referensi terverifikasi sah; DOI lain ditolak; tautan DOI markdown diperlakukan sebagai sitasi', () => {
  const refs = [ref('wulandari2021adaptive', 'Wulandari', 2021, 'verified', { doi: '10.99999/a' })]
  assert.equal(sanitizeCitations('Lihat https://doi.org/10.99999/A untuk detail.', refs).changed, false)
  assert.equal(sanitizeCitations('Lihat doi:10.99999/a.', refs).changed, false)
  assert.equal(sanitizeCitations('Lihat doi:10.99999/lain.', refs).changed, true)
  const link = sanitizeCitations('Baca [makalah](https://doi.org/10.1234/karangan) ini.', refs)
  assert.equal(link.text, `Baca ${MU} ini.`)
})

test('RED-TEAM: blok/inline kode tidak dipindai; normalisasi tipografi (NFKC, lebar-nol) berlaku pada keluaran', () => {
  assert.equal(sanitizeCitations('Gunakan `\\cite{fake}` dan ```\n(Fake, 2020)\n``` di kode.', NONE).changed, false)
  const r = sanitizeCitations('Teks\u200b biasa \uff08Fake, 2020\uff09.', NONE)
  assert.ok(!r.text.includes('\u200b'))
  assert.ok(r.text.includes(MU))
})

test('false positive terkendali: bulan, tabel, versi tidak dianggap sitasi', () => {
  for (const t of ['Pada (Mei 2020) kami mulai.', 'Hasil (Tabel 2020) menunjukkan.', 'Sejak Windows 2000 kami memakai.', 'Di (COVID 2020) kasus naik.']) assert.equal(sanitizeCitations(t, NONE).changed, false, t)
})

test('idempoten dan stabil pada keluaran yang sudah disanitasi', () => {
  const once = sanitizeCitations(BYPASSES.join(' | '), NONE).text
  assert.equal(sanitizeCitations(once, NONE).text, once)
})

test('safePrefixLength: hanya bagian seimbang yang berakhir di batas token', () => {
  assert.equal(safePrefixLength('Halo dunia'), 5)
  assert.equal(safePrefixLength('Lihat \\cite{ab'), 6)
  assert.equal(safePrefixLength('Lihat (Smith, 20'), 6)
  assert.equal(safePrefixLength('Lihat (Smith, 2020) lagi'), 'Lihat (Smith, 2020) '.length)
  assert.equal(safePrefixLength('kode `a b'), 'kode '.length)
})
