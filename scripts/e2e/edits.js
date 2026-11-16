// Uji HTTP Tahap 6 (usulan edit, accept/reject, konflik versi, ekspor paket). Server harus dijalankan dengan:
//   AI_PROVIDER=fake AI_ALLOW_FAKE=true AI_MODEL_CHAT=demo-model LITERATURE_PROVIDERS=fixture LITERATURE_ALLOW_FIXTURE=true
// Usulan dibuat lewat jalur NYATA agen (tool propose_edit dipicu direktif provider demo PALSU). Tidak memanggil layanan eksternal.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { connectDb, makeUser, check, finish, ObjectId, Client } = require('./lib')
const { readZip } = require('../../packages/export')

let crid = 0
const newCrid = () => `ed-${Date.now()}-${++crid}`
const parseSse = (text) => text.split('\n\n').filter(Boolean).map((b) => ({ type: (/^event: (.*)$/m.exec(b) || [])[1], ...JSON.parse((/^data: (.*)$/m.exec(b) || [])[1] || '{}') }))
async function chat(U, pid, content) {
  const res = await U.C.f(`/api/projects/${pid}/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientRequestId: newCrid(), content }) })
  const raw = await res.text()
  return (res.headers.get('content-type') || '').includes('event-stream') ? { status: res.status, events: parseSse(raw) } : { status: res.status, body: JSON.parse(raw) }
}
const propose = (U, pid, section, newText, reason = 'Perbaikan kejelasan') => chat(U, pid, `[[tool:propose_edit ${JSON.stringify({ section, new_text: newText, reason })}]] perbaiki`)
const toolResult = (r) => (r.events || []).find((e) => e.type === 'tool_result')

const MD = `# Naskah Uji Edit

**Keywords:** uji, edit

## Abstract
Abstrak asli yang akan diperbaiki oleh usulan AI pada pengujian ini.

## Introduction
Pendahuluan asli yang tidak berubah oleh usulan abstrak.

## Conclusion
Kesimpulan asli.

## References
[1] A. Author, "Title," IEEE Access, 2020.
`

;(async () => {
  const { mc, db } = await connectDb()
  const A = await makeUser(db, 'eda')
  const B = await makeUser(db, 'edb')
  const anon = new Client()
  const pid = (await A.C.json('POST', '/api/projects', { title: 'Proyek Edit A' })).body.data.project._id
  const pidB = (await B.C.json('POST', '/api/projects', { title: 'Proyek Edit B' })).body.data.project._id
  const base = `/api/projects/${pid}`
  const FAKE = '00000000000000000000aaaa'

  // ---- 401
  for (const [m, u] of [['GET', '/edits'], ['GET', `/edits/${FAKE}`], ['POST', `/edits/${FAKE}/accept`], ['POST', `/edits/${FAKE}/reject`], ['GET', '/export'], ['GET', '/export?format=json']]) {
    check(`401 tanpa login ${m} ${u}`, (await anon.json(m, base + u, m === 'POST' ? {} : undefined)).status === 401)
  }

  // ---- siapkan naskah, referensi terverifikasi
  const v1 = await A.C.json('POST', `${base}/versions`, { baseRevision: 0, source: MD })
  check('naskah awal tersimpan (versi 1)', v1.status === 201)
  const A1 = { doi: '10.99999/fx.2021.001', title: 'Adaptive Sparse Attention for Low-Resource Language Modeling', authors: ['Ratna Wulandari', 'Chen Mei'], year: 2021 }
  const addRef = await A.C.json('POST', `${base}/references/verify`, { ...A1, add: true })
  const citeKey = addRef.body?.data?.added?.citeKey
  const unv = await A.C.json('POST', `${base}/references/verify`, { doi: '10.99999/fx.9999.999', title: 'Makalah Karangan Pengguna', authors: ['Fiktif Nama'], year: 2022, add: true })
  const unvKey = unv.body?.data?.added?.citeKey
  check('referensi terverifikasi ditambahkan (untuk uji sitasi dan ekspor)', addRef.status === 201 && !!citeKey && addRef.body.data.added.verification.status === 'verified', addRef.body?.error)

  // ---- usulan lewat agen
  const NEW_ABS = 'Abstrak baru yang lebih jelas dan ringkas hasil usulan AI.'
  const p1 = await propose(A, pid, 'abstract', NEW_ABS)
  const tr1 = toolResult(p1)
  check('agen: propose_edit berhasil (tool_result ok) dan melaporkan status pending', tr1?.ok === true && (await A.C.json('GET', `${base}/edits`)).body.data.edits.length === 1, tr1)
  const cur0 = (await A.C.json('GET', base)).body.data
  check('usulan TIDAK mengubah naskah (isi sama, versi tetap 1, revisi tidak naik)', cur0.currentVersion.source === MD && cur0.project.versionCount === 1 && cur0.project.revision === v1.body.data.project.revision)
  const list1 = (await A.C.json('GET', `${base}/edits`)).body.data.edits
  check('daftar usulan memuat 1 pending tanpa isi penuh', list1.length === 1 && list1[0].status === 'pending' && list1[0].before === undefined, list1)
  const e1 = list1[0]
  const g1 = (await A.C.json('GET', `${base}/edits/${e1.id}`)).body.data.edit
  check('detail usulan: before persis teks asli, after berisi teks baru, diff memuat del dan add, ada alasan dan versi dasar', g1.before.includes('Abstrak asli') && g1.after.includes(NEW_ABS) && g1.diff.some((d) => d.op === 'del') && g1.diff.some((d) => d.op === 'add') && g1.reason && g1.baseVersionNumber === 1, g1.diff)
  check('respons tidak membocorkan userId/projectId/offset internal', !('userId' in g1) && !('projectId' in g1) && !('start' in g1))

  // ---- integritas sitasi pada usulan
  const bad = await propose(A, pid, 'introduction', 'Pendahuluan baru dengan klaim (Karangan, 2024) dan \\cite{palsu2024}.')
  const trBad = toolResult(bad)
  check('usulan dengan sitasi karangan ditolak (CITATION_NOT_VERIFIED), tidak ada usulan baru', trBad?.ok === false && (await A.C.json('GET', `${base}/edits`)).body.data.edits.length === 1, trBad)
  const good = await propose(A, pid, 'introduction', `Pendahuluan baru dengan klaim yang didukung \\cite{${citeKey}}.`)
  check('usulan dengan sitasi ke referensi terverifikasi diterima sebagai pending', toolResult(good)?.ok === true, toolResult(good))
  const prot = await propose(A, pid, 'references', 'Daftar pustaka karangan.')
  check('bagian references dilindungi dari usulan AI', toolResult(prot)?.ok === false)
  const noSec = await propose(A, pid, 'tidak-ada', 'Teks baru yang cukup panjang.')
  check('bagian tidak ada ditolak', toolResult(noSec)?.ok === false)
  const crossRaw = await chat(A, pid, `[[tool:propose_edit ${JSON.stringify({ section: 'abstract', new_text: 'x teks baru lintas', reason: 'alasan lintas', projectId: pidB })}]] lintas proyek`)
  check('parameter asing (projectId) ditolak skema tool', toolResult(crossRaw)?.ok === false)

  // ---- IDOR
  const eidB = (await A.C.json('GET', `${base}/edits`)).body.data.edits[0].id
  for (const [m, u] of [['GET', `/api/projects/${pid}/edits`], ['GET', `/api/projects/${pid}/edits/${eidB}`], ['POST', `/api/projects/${pid}/edits/${eidB}/accept`], ['POST', `/api/projects/${pid}/edits/${eidB}/reject`], ['GET', `/api/projects/${pid}/export`], ['GET', `/api/projects/${pid}/export?format=json`]]) {
    check(`IDOR: B -> ${m} ${u.replace(pid, '<A>')} = 404`, (await B.C.json(m, u, m === 'POST' ? { baseRevision: 1 } : undefined)).status === 404)
  }
  for (const [m, u] of [['GET', `/api/projects/${pidB}/edits/${eidB}`], ['POST', `/api/projects/${pidB}/edits/${eidB}/accept`], ['POST', `/api/projects/${pidB}/edits/${eidB}/reject`]]) {
    check(`IDOR: id usulan A lewat proyek B = 404 (${m} ${u.split('/').slice(-1)[0]})`, (await B.C.json(m, u, m === 'POST' ? { baseRevision: 0 } : undefined)).status === 404)
  }
  check('IDOR: id tidak valid = 404', (await A.C.json('GET', `${base}/edits/bukan-id`)).status === 404)
  check('id proyek tidak valid = 404 (bukan 500) untuk detail, accept, reject', (await A.C.json('GET', `/api/projects/abc/edits/${eidB}`)).status === 404 && (await A.C.json('POST', `/api/projects/abc/edits/${eidB}/accept`, { baseRevision: 1 })).status === 404 && (await A.C.json('POST', `/api/projects/abc/edits/${eidB}/reject`, {})).status === 404)
  const struct = await propose(A, pid, 'introduction', 'Pendahuluan baru.\n\n## Bagian Baru\n\nIsi bagian sisipan.')
  check('usulan yang menambah heading (mengubah struktur) ditolak', toolResult(struct)?.ok === false && (await A.C.json('GET', `${base}/edits`)).body.data.edits.length === 2)
  check('IDOR: tidak ada perubahan pada data A setelah percobaan B', (await db.collection('editproposals').countDocuments({ projectId: new ObjectId(pid), status: 'pending' })) === 2)

  // ---- validasi accept
  const e1id = list1[0].id
  const rev = (await A.C.json('GET', base)).body.data.project.revision
  check('accept tanpa baseRevision -> 400', (await A.C.json('POST', `${base}/edits/${e1id}/accept`, {})).status === 400)
  const big = await A.C.json('POST', `${base}/edits/${e1id}/accept`, { baseRevision: rev, x: 'a'.repeat(5000) })
  check('accept dengan body besar -> 413', big.status === 413, big.status)
  const wrongRev = await A.C.json('POST', `${base}/edits/${e1id}/accept`, { baseRevision: rev + 5 })
  check('accept dengan revisi salah -> 409 VERSION_CONFLICT dan usulan tetap pending, naskah tidak berubah', wrongRev.status === 409 && wrongRev.body.error.code === 'VERSION_CONFLICT' && (await A.C.json('GET', `${base}/edits/${e1id}`)).body.data.edit.status === 'pending' && (await A.C.json('GET', base)).body.data.currentVersion.source === MD, wrongRev.body)

  // ---- accept sukses
  const acc = await A.C.json('POST', `${base}/edits/${e1id}/accept`, { baseRevision: rev })
  check('accept -> 200, usulan accepted, versi baru 2', acc.status === 200 && acc.body.data.edit.status === 'accepted' && acc.body.data.version.number === 2, acc.body)
  const cur1 = (await A.C.json('GET', base)).body.data
  const expected = MD.replace('Abstrak asli yang akan diperbaiki oleh usulan AI pada pengujian ini.', NEW_ABS)
  check('naskah aktif = naskah lama dengan HANYA bagian abstrak diganti (bagian lain utuh)', cur1.currentVersion.source === expected && cur1.currentVersion.number === 2, cur1.currentVersion.source)
  const vdoc = await db.collection('manuscriptversions').findOne({ projectId: new ObjectId(pid), number: 2 })
  check('versi baru bertanda origin ai_edit_accepted; versi 1 tetap utuh (append-only)', vdoc?.origin === 'ai_edit_accepted' && (await db.collection('manuscriptversions').findOne({ projectId: new ObjectId(pid), number: 1 })).source === MD)
  const kinds = (await db.collection('aiusagelogs').find({ projectId: new ObjectId(pid) }).toArray()).map((l) => l.kind)
  check('jejak AI mencatat edit_suggested dan edit_accepted (tanpa isi naskah)', kinds.includes('edit_suggested') && kinds.includes('edit_accepted') && !JSON.stringify(await db.collection('aiusagelogs').find({ projectId: new ObjectId(pid) }).toArray()).includes(NEW_ABS))
  const again = await A.C.json('POST', `${base}/edits/${e1id}/accept`, { baseRevision: acc.body.data.revision })
  check('accept dua kali -> 409 EDIT_DECIDED, tidak ada versi tambahan', again.status === 409 && again.body.error.details?.code === 'EDIT_DECIDED' && (await db.collection('manuscriptversions').countDocuments({ projectId: new ObjectId(pid) })) === 2, again.body)

  // ---- usulan lain pada versi lama menjadi stale (versi dasar berubah karena accept)
  const staleId = eidB === e1id ? (await A.C.json('GET', `${base}/edits`)).body.data.edits.find((e) => e.id !== e1id).id : eidB
  const st = await A.C.json('POST', `${base}/edits/${staleId}/accept`, { baseRevision: acc.body.data.revision })
  check('usulan dari versi 1 setelah versi 2 dibuat -> 409 EDIT_STALE (penerapan otomatis ditolak)', st.status === 409 && st.body.error.details?.code === 'EDIT_STALE', st.body)
  check('usulan stale ditandai stale dan naskah tetap', (await A.C.json('GET', `${base}/edits/${staleId}`)).body.data.edit.status === 'stale' && (await A.C.json('GET', base)).body.data.currentVersion.source === expected)

  // ---- accept bersamaan: tepat satu menang
  const p3 = toolResult(await propose(A, pid, 'conclusion', 'Kesimpulan baru yang lebih tajam dan jelas.'))
  const revNow = (await A.C.json('GET', base)).body.data.project.revision
  const pend = (await A.C.json('GET', `${base}/edits`)).body.data.edits.find((e) => e.status === 'pending')
  const race = await Promise.all([A.C.json('POST', `${base}/edits/${pend.id}/accept`, { baseRevision: revNow }), A.C.json('POST', `${base}/edits/${pend.id}/accept`, { baseRevision: revNow })])
  check('accept bersamaan: tepat satu 200, satu 409', p3?.ok === true && race.map((r) => r.status).sort().join() === '200,409', race.map((r) => r.status))
  check('accept bersamaan: hanya satu versi baru (versi 3)', (await db.collection('manuscriptversions').countDocuments({ projectId: new ObjectId(pid) })) === 3)

  // ---- reject
  await propose(A, pid, 'introduction', 'Pendahuluan alternatif yang berbeda total.')
  const rj = (await A.C.json('GET', `${base}/edits`)).body.data.edits.find((e) => e.status === 'pending')
  const src3 = (await A.C.json('GET', base)).body.data.currentVersion.source
  const rr = await A.C.json('POST', `${base}/edits/${rj.id}/reject`, {})
  check('reject -> 200 rejected, naskah tidak berubah', rr.status === 200 && rr.body.data.edit.status === 'rejected' && (await A.C.json('GET', base)).body.data.currentVersion.source === src3)
  check('setelah reject: accept dan reject ulang -> 409', (await A.C.json('POST', `${base}/edits/${rj.id}/accept`, { baseRevision: 3 })).status === 409 && (await A.C.json('POST', `${base}/edits/${rj.id}/reject`, {})).status === 409)
  check('jejak AI mencatat edit_rejected', (await db.collection('aiusagelogs').countDocuments({ projectId: new ObjectId(pid), kind: 'edit_rejected' })) === 1)

  // ---- stale karena pengguna menyimpan versi sendiri
  await propose(A, pid, 'introduction', 'Pendahuluan versi yang akan kedaluwarsa karena edit pengguna.')
  const pu = (await A.C.json('GET', `${base}/edits`)).body.data.edits.find((e) => e.status === 'pending')
  const rv = (await A.C.json('GET', base)).body.data.project.revision
  await A.C.json('POST', `${base}/versions`, { baseRevision: rv, source: src3.replace('## References', 'Catatan pengguna.\n\n## References') })
  const su = await A.C.json('POST', `${base}/edits/${pu.id}/accept`, { baseRevision: rv + 1 })
  check('pengguna menyimpan versi sendiri -> usulan lama stale (409 EDIT_STALE)', su.status === 409 && su.body.error.details?.code === 'EDIT_STALE', su.body)

  // ---- ekspor
  const pj = await A.C.json('GET', `${base}/export?format=json`)
  check('ekspor pratinjau: 200 dengan manifest, peringatan, dan panduan Overleaf manual (tanpa klaim satu klik)', pj.status === 200 && pj.body.data.warnings.length > 0 && pj.body.data.overleaf.oneClick === false && pj.body.data.manifest.manuscriptVersion.number === 4, pj.body.data)
  const res = await A.C.f(`${base}/export`)
  const zipBuf = Buffer.from(await res.arrayBuffer())
  check('unduhan ZIP: 200, application/zip, attachment, no-store', res.status === 200 && res.headers.get('content-type') === 'application/zip' && /attachment; filename="naskah-v4\.zip"/.test(res.headers.get('content-disposition')) && res.headers.get('cache-control') === 'no-store')
  const files = readZip(zipBuf)
  const byName = Object.fromEntries(files.map((f) => [f.name, f.data.toString('utf8')]))
  check('ZIP berisi main.tex, references.bib, README.txt, manifest.json', ['main.tex', 'references.bib', 'README.txt', 'manifest.json'].every((n) => n in byName), Object.keys(byName))
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-zip-'))
  const zp = path.join(tmp, 'p.zip')
  fs.writeFileSync(zp, zipBuf)
  const tarBin = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\Windows', 'System32', 'tar.exe') : 'tar' // bsdtar membaca ZIP
  const tar = spawnSync(tarBin, ['-tf', 'p.zip'], { encoding: 'utf8', cwd: tmp })
  check('ZIP dibuka oleh alat eksternal (tar/bsdtar) dan daftar berkas cocok', tar.status === 0 && ['main.tex', 'references.bib', 'README.txt', 'manifest.json'].every((n) => tar.stdout.includes(n)), tar.stderr || tar.stdout)
  fs.rmSync(tmp, { recursive: true, force: true })
  check('references.bib memuat HANYA referensi terverifikasi proyek (kunci + DOI) tanpa kunci karangan', byName['references.bib'].includes(`{${citeKey},`) && byName['references.bib'].includes('10.99999/fx.2021.001') && !/palsu2024/i.test(byName['references.bib']) && !byName['references.bib'].includes(unvKey) && !byName['references.bib'].includes('10.99999/fx.9999.999'))
  check('main.tex memuat teks versi aktif dan \\bibliography{references}', byName['main.tex'].includes('Catatan pengguna.') && byName['main.tex'].includes('\\bibliography{references}'))
  check('manifest: versi 4, tanpa rahasia/log internal', JSON.parse(byName['manifest.json']).manuscriptVersion.number === 4 && !/mongodb|password|secret|NEXTAUTH/i.test(Object.values(byName).join('\n')))
  const noMs = (await A.C.json('POST', '/api/projects', { title: 'Kosong' })).body.data.project._id
  const ne = await A.C.json('GET', `/api/projects/${noMs}/export`)
  check('ekspor proyek tanpa naskah -> 409 NO_MANUSCRIPT', ne.status === 409 && ne.body.error.details?.code === 'NO_MANUSCRIPT', ne.body)
  const burst = []
  for (let i = 0; i < 12; i++) burst.push((await A.C.f(`${base}/export`)).status)
  check("unduhan ekspor dibatasi laju (429 setelah 10/menit) dan pratinjau tidak ikut menghabiskan kuota", burst.includes(429) && (await A.C.json("GET", `${base}/export?format=json`)).status === 200, burst)

  // ---- hapus proyek: cascade
  const del = await A.C.json('DELETE', base)
  check('hapus proyek -> 200 dan semua usulan edit ikut terhapus', del.status === 200 && (await db.collection('editproposals').countDocuments({ projectId: new ObjectId(pid) })) === 0, del.body)
  await mc.close()
  finish()
})().catch((e) => { console.error('FATAL', e); process.exit(1) })
