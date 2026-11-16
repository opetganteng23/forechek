// Audit integritas ilmiah (offline, tanpa server/DB/jaringan). Memeriksa ulang tiga janji produk pada kode saat ini:
//  (1) tidak ada jalur yang menampilkan/menyimpan sitasi tanpa referensi terverifikasi (chat, penilai laporan, usulan edit, BibTeX);
//  (2) indikator tidak memakai bahasa vonis dan tidak menghasilkan skor gabungan;
//  (3) edit AI tidak pernah mengubah naskah tanpa penerimaan eksplisit (jalur penulisan versi dihitung secara statis).
// Jalankan: npm run audit:integrity   (kode keluar 1 bila ada yang gagal)
const fs = require('node:fs')
const path = require('node:path')
const { sanitizeCitations, createStreamSanitizer, MARK_UNVERIFIED } = require('../packages/literature')
const { buildBibtex } = require('../packages/export')
const { assessCriterion } = require('../packages/checks')
const { createEditService } = require('../packages/edits')
const { buildIndicators, FORBIDDEN } = require('../packages/indicators')
const { parseManuscript } = require('../packages/manuscript')

let failed = 0
const check = (name, ok, info = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' ' + info : ''}`) }

const REFS = [{ citeKey: 'wulandari2021adaptive', title: 'Adaptive Sparse Attention', year: 2021, authors: [{ family: 'Wulandari' }, { family: 'Mei' }], doi: '10.99999/a', abstract: 'We introduce an adaptive sparse attention mechanism for language modeling in low-resource settings and evaluate it.', verification: { status: 'verified' } }]

// (1a) sitasi karangan dalam berbagai bentuk -> selalu ditandai
const FAKE = [
  'Smith (2020) melaporkan hasil baik.', 'Menurut Smith dkk. 2020, metode efektif.', 'Smith et al. 2020 reported gains.', 'Per Ghost 2021, ok.', 'Ghost [2021] showed.',
  'Zhang 2022 melaporkan peningkatan.', 'Menurut Fiction, hasilnya baik.', 'According to Fiction, robust.', 'Seperti pada [ 7 ] dan [7a].', 'Lihat (Smith, 2020; Jones & Lee, 2019).',
  'Lihat \\cite{palsu2024}.', 'Lihat [@palsu2024].', 'doi:10.1234/fake.99 mendukung ini.', 'https://doi.org/10.1234/fake.99', 'Smith dan Jones (2020) menunjukkan.',
  'As Smith, Jones, and Lee (2020) show.', 'Sebagaimana dilaporkan oleh Smith et al., 2020.', 'Dilaporkan oleh Fiction dkk. pada eksperimen lain.', '\\footnote{Ghost 2021, hlm. 5.}', 'Ghost, J. 2020 menemukan pola.'
]
const leaked = FAKE.filter((t) => { const r = sanitizeCitations(t, REFS); return !(r.changed && r.text.includes(MARK_UNVERIFIED) && !/Smith|Ghost|Fiction|Zhang|palsu2024|fake\.99/.test(r.text)) })
check(`(1) ${FAKE.length} bentuk sitasi karangan: semuanya ditandai dan nama karangan tidak tampil`, leaked.length === 0, leaked.length ? JSON.stringify(leaked) : '')
const VALID = ['Wulandari dan Mei (2021) melaporkan.', 'Menurut Wulandari dkk. 2021, efektif.', '(Wulandari & Mei, 2021)', 'Lihat \\cite{wulandari2021adaptive}.']
check('(1) sitasi ke referensi terverifikasi proyek tidak diubah', VALID.every((t) => sanitizeCitations(t, REFS).text === t))

// (1b) stream: tidak ada potongan yang menampilkan nama karangan untuk berbagai ukuran potongan
const text = 'Awal. Menurut Fiction, baik. Smith et al. 2020 reported gains. Per Ghost 2021, ok. Zhang 2022 melaporkan. Ghost [2021] juga. Akhir.'
const streamLeak = [1, 2, 3, 5, 8, 13, 50].filter((n) => { const g = createStreamSanitizer(REFS); let shown = ''; for (let i = 0; i < text.length; i += n) shown += g.push(text.slice(i, i + n)); return /Fiction|Smith|Ghost|Zhang/.test(shown) })
check('(1) stream chat: tidak ada nama karangan tampil pada ukuran potongan 1..50', streamLeak.length === 0, JSON.stringify(streamLeak))

// (1c) BibTeX hanya referensi terverifikasi tanpa bidang tebakan
const bib = buildBibtex([...REFS, { citeKey: 'p1', title: 'Parsial', verification: { status: 'partial' } }, { citeKey: 'u1', title: 'Belum', verification: { status: 'unverified' } }, { citeKey: 'r1', title: 'Ditarik', verification: { status: 'retracted' } }, { citeKey: 'noverif', title: 'Tanpa status' }])
check('(1) BibTeX: hanya `verified` diekspor (partial/unverified/retracted/tanpa-status dikecualikan)', JSON.stringify(bib.included) === JSON.stringify(['wulandari2021adaptive']) && bib.excluded.length === 4)

// (1d) penilai laporan: rationale/saran disanitasi
const SRC = '# T\n\n## Introduction\n' + 'Network anomalies threaten constrained IoT deployments and prior detectors require heavy hardware. '.repeat(4) + '\n'
const crit = { id: 'novelty', label: 'K', source: 'llm', weight: 1, sections: ['introduction'], definition: 'x', anchors: { 0: 'a', 4: 'b' } }
const judge = async () => ({ score: 3, rationale: 'Metode jelas; lihat Zhang et al. (2022) dan doi:10.1234/fake.99 untuk validasi.', evidence: [{ quote: 'Network anomalies threaten constrained IoT deployments' }], suggestions: ['Bandingkan dengan (Fiction, 2020).'] })

// (3) usulan edit: tidak pernah menyimpan versi tanpa accept; sitasi karangan ditolak
async function editAudit() {
  const man = '# T\n\n## Abstract\nAbstrak lama yang cukup.\n\n## Introduction\nPendahuluan lama.\n\n## References\n[1] A.\n'
  let saves = 0
  const rows = []
  const cur = () => ({ project: { revision: 1 }, version: { id: 'v1', number: 1, format: 'markdown', source: man, parse: parseManuscript(man, 'markdown') } })
  const svc = createEditService({
    current: { async getCurrent() { return cur() } },
    store: { async insert(d) { const r = { ...d, id: `e${rows.length + 1}`, createdAt: new Date() }; rows.push(r); return { ...r } }, async findById(u, p, id) { return rows.find((r) => r.id === id) || null }, async list() { return rows }, async countPending() { return 0 }, async staleOthers() { return 0 }, async transition(id, from, patch) { const r = rows.find((x) => x.id === id && x.status === from); if (!r) return null; Object.assign(r, patch); return { ...r } } },
    versions: { async save() { saves++; return { version: { number: 2 }, project: { revision: 2 } } } },
    refs: { listForContext: async () => REFS }
  })
  const P = { userId: 'u', projectId: 'p' }
  const code = async (fn) => { try { await fn(); return 'ok' } catch (e) { return (e.details && e.details.code) || e.code } }
  const bad = []
  for (const t of ['Zhang 2022 melaporkan peningkatan.', 'Menurut Fiction, baik.', 'Seperti pada [ 3 ] dan lainnya.', 'Smith et al. 2020 reported.']) if ((await code(() => svc.propose({ ...P, section: 'introduction', newText: t, reason: 'alasan' }))) !== 'CITATION_NOT_VERIFIED') bad.push(t)
  check('(1) gerbang usulan edit menolak 4 bentuk atribusi karangan', bad.length === 0, JSON.stringify(bad))
  const e = await svc.propose({ ...P, section: 'abstract', newText: 'Abstrak baru yang jelas.', reason: 'perjelas' })
  check('(3) propose TIDAK menyimpan versi (naskah tidak berubah tanpa penerimaan)', saves === 0 && e.status === 'pending')
  await svc.reject({ ...P, editId: e.id })
  check('(3) reject TIDAK menyimpan versi', saves === 0)
  const e2 = await svc.propose({ ...P, section: 'abstract', newText: 'Abstrak alternatif lagi.', reason: 'perjelas' })
  await svc.accept({ ...P, editId: e2.id, baseRevision: 1 })
  check('(3) hanya accept eksplisit yang menyimpan versi (tepat satu)', saves === 1)
}

// (2) indikator tanpa vonis dan tanpa skor
function indicatorAudit() {
  const own = 'Pengujian dilakukan pada tiga dataset berbeda dengan validasi silang lima lipatan yang dijelaskan secara rinci pada bagian metode. '.repeat(9)
  const outs = [
    buildIndicators({ source: own, parse: { sections: [] }, references: REFS }),
    buildIndicators({ source: `${own} ${REFS[0].abstract} ${own}`, parse: { sections: [] }, references: REFS }),
    buildIndicators({ source: 'pendek', parse: { sections: [] }, references: [] })
  ]
  const json = JSON.stringify(outs)
  check('(2) indikator: tidak ada kata vonis (plagiat/pasti/ditulis AI/terbukti/bebas plagiat)', !FORBIDDEN.test(json), json.match(FORBIDDEN) ? String(json.match(FORBIDDEN)[0]) : '')
  check('(2) indikator: tanpa skor/band/overall dan tanpa label tingkat pada gaya', outs.every((o) => !('score' in o) && !('band' in o) && !('overall' in o)) && !/"(rendah|sedang|tinggi)"/.test(JSON.stringify(outs.map((o) => o.style))))
  check('(2) indikator: tidak masuk modul skor kesiapan maupun ekspor (tidak ada impor)', ['packages/checks/src', 'packages/export/src'].every((d) => fs.readdirSync(path.join(__dirname, '..', d)).filter((f) => f.endsWith('.js')).every((f) => !/indicators/.test(fs.readFileSync(path.join(__dirname, '..', d, f), 'utf8')))))
}

// (3) statis: jalur penulisan versi naskah (hanya simpan oleh pengguna, pulihkan, dan terima usulan)
function staticAudit() {
  const root = path.join(__dirname, '..')
  const hits = []
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (['node_modules', '.next', 'test', '.git'].includes(e.name)) continue
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(js|jsx)$/.test(e.name) && /ManuscriptVersion\.create\(|\.saveVersion\(|versions\.save\(/.test(fs.readFileSync(p, 'utf8'))) hits.push(path.relative(root, p).replace(/\\/g, '/'))
    }
  }
  walk(path.join(root, 'apps/web/app')); walk(path.join(root, 'apps/web/lib')); walk(path.join(root, 'packages'))
  const expected = ['apps/web/app/api/projects/[id]/versions/route.js', 'apps/web/lib/editService.js', 'packages/edits/src/service.js', 'packages/manuscript/src/service.js']
  check('(3) jalur penulisan versi naskah hanya: simpan pengguna, terima usulan, layanan inti', JSON.stringify(hits.sort()) === JSON.stringify(expected.sort()), JSON.stringify(hits))
  const tools = fs.readFileSync(path.join(root, 'packages/edits/src/tools.js'), 'utf8')
  check('(3) tool agen propose_edit hanya memanggil edits.propose (tidak ada accept/save)', /edits\.propose\(/.test(tools) && !/accept|\.save\(|saveVersion/.test(tools))
}

;(async () => {
  const r = await assessCriterion({ c: crit, source: SRC, parse: parseManuscript(SRC, 'markdown'), judge, references: REFS })
  const all = `${r.rationale} ${r.suggestions.join(' ')}`
  check('(1) penilai laporan: rationale/saran memuat penanda dan tanpa nama/DOI karangan', r.status === 'assessed' && !/Zhang|fake\.99|Fiction/.test(all) && all.includes(MARK_UNVERIFIED))
  await editAudit()
  indicatorAudit()
  staticAudit()
  console.log(failed ? `\n${failed} pemeriksaan GAGAL` : '\nSemua pemeriksaan integritas LULUS')
  process.exit(failed ? 1 : 0)
})().catch((e) => { console.error('audit error:', e); process.exit(2) })
