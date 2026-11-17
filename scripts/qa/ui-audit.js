/* eslint-env node, browser */
// Audit UI end-to-end dengan browser nyata (puppeteer-core, TIDAK menjadi dependensi proyek: npm i --no-save puppeteer-core).
// Mengklik SETIAP tautan dan tombol di semua halaman (tombol berbahaya hanya sampai dialog konfirmasi, lalu Batal), mencatat:
//   tautan mati/404, tombol tanpa efek, galat konsol/halaman, respons >= 400 tak terduga, teks meluap, overflow horizontal, font Poppins.
// Menyimpan tangkapan layar PNG 1440x900 dan 390x844 ke docs/qa/screenshots/ beserta INDEX.md.
//   Butuh: server produksi uji berjalan di BASE_URL dan MongoDB uji di MONGODB_URI (env palsu; lihat scripts/dev-srv.sh).
//   CHROME=... BASE_URL=http://localhost:3000 MONGODB_URI=mongodb://localhost:27017/publikasi_db node scripts/qa/ui-audit.js
const path = require('node:path')
const fs = require('node:fs')
const { spawnSync } = require('node:child_process')
const root = path.join(__dirname, '..', '..')
const req = (m) => require(require.resolve(m, { paths: [root, path.join(root, 'apps', 'web'), process.cwd(), process.env.PUPPETEER_DIR || root] }))
const puppeteer = req('puppeteer-core')
const { MongoClient } = req('mongodb')

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const MONGO = process.env.MONGODB_URI || 'mongodb://localhost:27017/publikasi_db'
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = path.join(root, 'docs', 'qa', 'screenshots')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const D = { width: 1440, height: 900 }
const M = { width: 390, height: 844 }

const issues = []
const shots = []
const stats = { pages: 0, links: 0, linkClicks: 0, buttons: 0, buttonClicks: 0, noEffect: 0, dialogs: 0 }
let seq = 0
const issue = (where, kind, detail) => { issues.push({ where, kind, detail }); console.log(`MASALAH [${kind}] ${where}: ${detail}`) }

const MANUSCRIPT = `# Prediksi Keterlambatan Penerbangan dengan Pembelajaran Mesin

## Abstrak
Penelitian ini membandingkan beberapa model pembelajaran mesin untuk memprediksi keterlambatan penerbangan domestik. Data historis dibersihkan, fitur waktu dibangun, dan model dievaluasi dengan validasi silang berlapis.

Kata kunci: prediksi, penerbangan, pembelajaran mesin

## Pendahuluan
Keterlambatan penerbangan menimbulkan biaya bagi maskapai dan penumpang [Smith2020]. Studi sebelumnya fokus pada data cuaca [Lee2019].

## Metode
Kami memakai gradient boosting dan regresi logistik pada data tiga tahun.

## Hasil
Gradient boosting memberikan akurasi lebih tinggi pada seluruh lipatan.

## Kesimpulan
Model berbasis pohon cukup untuk kasus ini.

## Referensi
[Smith2020] Smith, J. (2020). Flight delays. Journal of Air Transport.
[Lee2019] Lee, K. (2019). Weather and delays. Transport Letters.
`

async function shot(P, name, opts = {}) {
  seq++
  const id = String(seq).padStart(2, '0')
  const vp = P.viewport()
  const files = []
  for (const [label, size] of [['1440x900', D], ['390x844', M]]) {
    await P.setViewport(size)
    await sleep(350)
    const f = `${id}-${name}-${label}.png`
    await P.screenshot({ path: path.join(OUT, f), fullPage: Boolean(opts.full) })
    files.push(f)
    await checkLayout(P, `${name} @${label}`)
  }
  await P.setViewport(vp || D)
  shots.push({ id, name, desc: opts.desc || name, files })
}

// Teks meluap dan overflow horizontal. Elemen di dalam kontainer yang memang dapat digulir (overflow-x) dikecualikan.
async function checkLayout(P, where) {
  const r = await P.evaluate(() => {
    const out = []
    const vw = document.documentElement.clientWidth
    if (document.documentElement.scrollWidth > vw + 1) out.push(`halaman meluap horizontal (${document.documentElement.scrollWidth} > ${vw})`)
    const scrollable = (el) => { for (let n = el; n && n !== document.body; n = n.parentElement) { const o = getComputedStyle(n).overflowX; if ((o === 'auto' || o === 'scroll') && n.scrollWidth > n.clientWidth) return true } return false }
    const skip = (el) => el.closest('[aria-hidden="true"], .sr-only, .paper-field, [hidden], pre, textarea')
    for (const el of document.querySelectorAll('body *')) {
      if (skip(el)) continue
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden') continue
      const b = el.getBoundingClientRect()
      if (b.width === 0 || b.height === 0) continue
      if ((b.right > vw + 1 || b.left < -1) && !scrollable(el) && cs.position !== 'fixed' && cs.position !== 'sticky') {
        if (el.children.length === 0 || el.textContent.trim()) { out.push(`elemen melewati tepi layar: <${el.tagName.toLowerCase()}> "${(el.textContent || '').trim().slice(0, 40)}"`); if (out.length > 4) break }
      }
      if ((cs.overflowX === 'hidden' || cs.overflow === 'hidden') && el.scrollWidth > el.clientWidth + 2 && cs.textOverflow !== 'ellipsis' && el.textContent.trim() && !el.closest('.paper-field')) {
        out.push(`teks terpotong: <${el.tagName.toLowerCase()}> "${el.textContent.trim().slice(0, 40)}"`)
        if (out.length > 4) break
      }
    }
    return [...new Set(out)]
  })
  for (const m of r) issue(where, 'layout', m)
}

function attach(P, label, allow = []) {
  P.on('pageerror', (e) => issue(label(), 'pageerror', String(e).slice(0, 160)))
  P.on('console', (m) => {
    if (m.type() === 'error') {
      const t = m.text()
      if (/Failed to load resource/.test(t)) return // dicatat lewat 'response'
      issue(label(), 'console', t.slice(0, 160))
    }
    if (/Content Security Policy|Refused to/i.test(m.text())) issue(label(), 'csp', m.text().slice(0, 160))
  })
  P.on('response', (r) => {
    const s = r.status()
    if (s >= 400 && s !== 304) {
      const u = r.url().replace(BASE, '')
      if (allow.some((re) => re.test(`${s} ${u}`))) return
      if (!u.startsWith('/')) return
      issue(label(), `http${s}`, u.slice(0, 100))
    }
  })
}

const body = (P) => P.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
const hasText = async (P, t, ms = 8000) => P.waitForFunction((t) => document.body.innerText.includes(t), { timeout: ms, polling: 150 }, t).then(() => true, () => false)
const settle = async (P) => { await P.waitForNetworkIdle({ idleTime: 400, timeout: 8000 }).catch(() => {}) }
const dialogOpen = (P) => P.$('[role=alertdialog]').then(Boolean)
async function closeDialog(P) {
  if (!(await dialogOpen(P))) return false
  const c = await P.$('[data-testid=confirm-cancel]')
  if (c) await c.click()
  await sleep(250)
  return true
}

// ---- audit tautan: klik tiap tautan internal, pastikan tidak 404, lalu kembali.
async function auditLinks(P, where, { loggedIn }) {
  stats.pages++
  const links = await P.evaluate(() => [...document.querySelectorAll('a[href]')].filter((a) => a.offsetParent !== null || getComputedStyle(a).position === 'fixed').map((a) => ({ href: a.getAttribute('href'), text: (a.innerText || a.getAttribute('aria-label') || '').trim().slice(0, 40) })))
  const seen = new Set()
  const startUrl = P.url()
  for (const l of links) {
    const key = l.href
    if (seen.has(key)) continue
    seen.add(key)
    stats.links++
    if (/^mailto:/.test(l.href)) continue
    if (/^https?:\/\//.test(l.href) && !l.href.startsWith(BASE)) { issue(where, 'link-eksternal', `${l.href} (tidak diuji, tidak ada tautan eksternal yang diharapkan)`); continue }
    if (l.href.startsWith('#')) {
      const ok = await P.evaluate((h) => !!document.querySelector(h), l.href)
      if (!ok) issue(where, 'link-mati', `anchor ${l.href} tidak ada`)
      continue
    }
    // klik nyata pada elemen pertama dengan href itu
    const handle = await P.evaluateHandle((h) => [...document.querySelectorAll('a[href]')].find((a) => a.getAttribute('href') === h && (a.offsetParent !== null || getComputedStyle(a).position === 'fixed')), l.href)
    const el = handle.asElement()
    if (!el) continue
    stats.linkClicks++
    const resp = await Promise.all([P.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 12000 }).catch(() => null), el.click().catch(() => null)])
    await sleep(500)
    const nav = resp[0]
    const cur = new URL(P.url())
    const target = new URL(l.href, BASE)
    const text = (await body(P)).slice(0, 300)
    const status = nav ? nav.status() : 200
    if (status >= 400 || /Halaman tidak ditemukan|Terjadi kesalahan/.test(text)) issue(where, 'link-mati', `${l.href} (${l.text}) -> status ${status} / ${text.slice(0, 50)}`)
    else if (cur.pathname !== target.pathname && !(loggedIn === false && /^\/dashboard/.test(target.pathname) && cur.pathname === '/login')) issue(where, 'link-salah-tujuan', `${l.href} berakhir di ${cur.pathname}${cur.search}`)
    if (P.url() !== startUrl) { await P.goto(startUrl, { waitUntil: 'networkidle2' }).catch(() => {}); await sleep(300) }
  }
}

// ---- audit tombol: klik tiap tombol (kunci unik per label). Tombol berbahaya berhenti di dialog (Batal).
async function auditButtons(P, where) {
  const keyOf = (b) => `${b.text}|${b.aria}|${b.id}`
  const tested = new Set()
  const startUrl = P.url()
  let guard = 0
  for (;;) {
    if (guard++ > 80) break
    const list = await P.evaluate(() => [...document.querySelectorAll('button, [role=button], summary')].map((b, i) => ({ i, text: (b.innerText || '').trim().slice(0, 40), aria: b.getAttribute('aria-label') || '', id: b.id || '', disabled: b.disabled || b.getAttribute('aria-disabled') === 'true' || b.getAttribute('aria-selected') === 'true' /* tab yang sudah terpilih memang tidak berubah */, vis: b.offsetParent !== null || getComputedStyle(b).position === 'fixed', type: b.getAttribute('type') || '' })))
    const next = list.find((b) => b.vis && !tested.has(keyOf(b)))
    if (!next) break
    tested.add(keyOf(next))
    stats.buttons++
    if (next.disabled) continue
    if (/Keluar/.test(next.text) && !next.aria) { /* logout: dialog lalu Batal, ditangani umum */ }
    const el = (await P.evaluateHandle((k) => [...document.querySelectorAll('button, [role=button], summary')].find((b) => `${(b.innerText || '').trim().slice(0, 40)}|${b.getAttribute('aria-label') || ''}|${b.id || ''}` === k && !b.disabled && (b.offsetParent !== null || getComputedStyle(b).position === 'fixed')), keyOf(next))).asElement()
    if (!el) continue
    stats.buttonClicks++
    await P.evaluate(() => { window.__mut = 0; window.__mo && window.__mo.disconnect(); window.__mo = new MutationObserver((m) => { window.__mut += m.length }); window.__mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true }) })
    let reqs = 0
    const onReq = () => { reqs++ }
    P.on('request', onReq)
    const before = P.url()
    const formInvalid = await el.evaluate((b) => { const f = b.closest('form'); return !!(f && b.type !== 'button' && !f.noValidate && !f.checkValidity()) })
    const fileInput = await el.evaluate((b) => /Muat berkas/.test(b.innerText) && !!document.querySelector('input[type=file]'))
    await el.click().catch(() => {})
    await sleep(600)
    P.off('request', onReq)
    const mut = await P.evaluate(() => window.__mut || 0)
    const dlg = await dialogOpen(P)
    const urlChanged = P.url() !== before
    const effect = mut > 0 || reqs > 0 || dlg || urlChanged || formInvalid || fileInput
    if (dlg) stats.dialogs++
    if (!effect) { stats.noEffect++; issue(where, 'tombol-tanpa-efek', `"${next.text || next.aria}"`) }
    if (dlg) await closeDialog(P)
    if (urlChanged) { await P.goto(startUrl, { waitUntil: 'networkidle2' }).catch(() => {}); await sleep(300); tested.clear(); /* DOM baru: lanjut dari awal, kunci sudah dihitung sekali */ break }
    if (await dialogOpen(P)) await closeDialog(P)
  }
}

async function fullAudit(P, where, name, opts = {}) {
  await settle(P)
  await shot(P, name, opts)
  await auditLinks(P, where, { loggedIn: opts.loggedIn })
  await auditButtons(P, where)
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  for (const f of fs.readdirSync(OUT)) if (/\.(png|md)$/.test(f)) fs.unlinkSync(path.join(OUT, f))
  const stamp = Date.now()
  const adminEmail = `qaadm${stamp}@ui.test`, adminPass = 'AdminQaUi#12345'
  const userEmail = `qausr${stamp}@ui.test`, userPass = 'Passw0rd!long1'
  const mc = await MongoClient.connect(MONGO)
  const db = mc.db()
  const seed = spawnSync(process.execPath, [path.join(root, 'scripts', 'seedAdmin.js')], { encoding: 'utf8', env: { ...process.env, MONGODB_URI: MONGO, ADMIN_EMAIL: adminEmail, ADMIN_PASSWORD: adminPass } })
  if (seed.status !== 0) throw new Error('seed admin gagal')
  await db.collection('users').updateMany({ role: 'admin', email: { $ne: adminEmail } }, { $set: { role: 'user' } }) // basis uji bersih
  const rr = await fetch(BASE + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.19.50.50' }, body: JSON.stringify({ name: 'Pengguna QA', email: userEmail, password: userPass }) })
  if (rr.status !== 201) throw new Error('register gagal ' + rr.status)
  await db.collection('users').updateOne({ email: userEmail }, { $set: { emailVerified: true } })

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] })
  let current = 'awal'
  const label = () => current

  // =============== ANONIM ===============
  {
    const ctx = await browser.createBrowserContext()
    const P = await ctx.newPage(); P.setDefaultTimeout(30000)
    await P.setViewport(D)
    await P.setExtraHTTPHeaders({ 'x-forwarded-for': '198.19.61.1' })
    attach(P, label, [/^401 \/api\/auth\/callback\/credentials/, /^404 \/halaman-tidak-ada/, /^40[019] \/api\/auth\/register/, /^40[0-9] \/api\/auth\/(forgot|reset)/, /^40[0-9] \/api\/auth\/verify-email/, /^404 \/_next/])

    current = '/ (landing)'
    await P.goto(BASE + '/', { waitUntil: 'networkidle2' })
    const font = await P.evaluate(async () => { await document.fonts.ready; return { loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family}:${f.weight}`), used: getComputedStyle(document.body).fontFamily, check: document.fonts.check('500 16px Poppins') || [...document.fonts].some((f) => /Poppins/.test(f.family) && f.status === 'loaded') } })
    console.log('FONT', JSON.stringify(font))
    if (!/poppins/i.test(font.used) || !font.loaded.some((f) => /Poppins/i.test(f))) issue(current, 'font', `Poppins tidak termuat: ${JSON.stringify(font)}`)
    const external = await P.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name).filter((n) => !n.startsWith(location.origin)))
    if (external.length) issue(current, 'permintaan-eksternal', external.slice(0, 3).join(', '))
    const forbidden = await P.evaluate(() => /\u2014|[\u2190-\u21FF]|->|=>/.test(document.body.innerText))
    if (forbidden) issue(current, 'teks-terlarang', 'em dash/panah terlihat di halaman')
    await shot(P, 'landing', { full: true, desc: 'Landing page (halaman penuh)' })
    await auditLinks(P, current, { loggedIn: false })
    await auditButtons(P, current)
    // animasi kertas
    const paper = await P.evaluate(() => ({ n: document.querySelectorAll('.paper-sheet').length, anim: getComputedStyle(document.querySelector('.paper-sheet')).animationName, props: [...document.querySelectorAll('.paper-sheet')].every((e) => /fc-paper/.test(getComputedStyle(e).animationName)) }))
    console.log('KERTAS', JSON.stringify(paper))
    if (!paper.n || !paper.props) issue(current, 'animasi-kertas', 'lembar kertas tidak beranimasi')
    // menu mobile
    await P.setViewport(M); await sleep(300)
    await P.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Menu')?.click()); await sleep(300)
    await P.screenshot({ path: path.join(OUT, `${String(++seq).padStart(2, '0')}-landing-menu-mobile-390x844.png`) })
    shots.push({ id: String(seq).padStart(2, '0'), name: 'landing-menu-mobile', desc: 'Landing, menu mobile terbuka', files: [`${String(seq).padStart(2, '0')}-landing-menu-mobile-390x844.png`] })
    await P.setViewport(D)

    for (const [url, name, desc] of [['/login', 'login', 'Halaman masuk (kosong)'], ['/register', 'register', 'Halaman daftar'], ['/forgot-password', 'lupa-password', 'Lupa password'], ['/reset-password', 'reset-password', 'Atur ulang password tanpa token'], ['/verify-email', 'verifikasi-email', 'Verifikasi email tanpa token'], ['/privacy', 'privasi', 'Kebijakan privasi'], ['/terms', 'syarat', 'Syarat layanan']]) {
      current = url
      await P.goto(BASE + url, { waitUntil: 'networkidle2' })
      await fullAudit(P, url, name, { desc, loggedIn: false })
    }
    // login gagal: state galat
    current = '/login (galat)'
    await P.goto(BASE + '/login', { waitUntil: 'networkidle2' }); await sleep(900)
    await P.type('input[type=email]', 'tidak-ada@ui.test'); await P.type('input[type=password]', 'salah-salah-1'); await P.keyboard.press('Enter')
    await hasText(P, 'Email atau password salah')
    await shot(P, 'login-galat', { desc: 'Masuk dengan kredensial salah (pesan galat)' })
    // 404 disengaja
    current = '/halaman-tidak-ada'
    await P.goto(BASE + '/halaman-tidak-ada', { waitUntil: 'networkidle2' })
    if (!(await hasText(P, 'Halaman tidak ditemukan', 3000))) issue(current, '404', 'halaman 404 kustom tidak tampil')
    await shot(P, '404', { desc: 'Halaman tidak ditemukan (disengaja)' })
    // dashboard tanpa login -> login
    await P.goto(BASE + '/dashboard', { waitUntil: 'networkidle2' })
    if (!P.url().includes('/login')) issue('/dashboard anonim', 'akses', 'tidak dialihkan ke /login')
    await ctx.close()
  }

  // =============== PENGGUNA BIASA ===============
  let projectId = ''
  {
    const ctx = await browser.createBrowserContext()
    const P = await ctx.newPage(); P.setDefaultTimeout(30000)
    await P.setViewport(D)
    await P.setExtraHTTPHeaders({ 'x-forwarded-for': '198.19.62.1' })
    attach(P, label, [/^404 \/_next/, /^402 /, /^403 \/api\/admin/, /^409 \/api\/projects\/[0-9a-f]+\/export/])
    current = 'login pengguna'
    await P.goto(BASE + '/login', { waitUntil: 'networkidle2' }); await sleep(900)
    await P.type('input[type=email]', userEmail); await P.type('input[type=password]', userPass); await P.keyboard.press('Enter')
    await P.waitForFunction(() => location.pathname.startsWith('/dashboard'), { timeout: 40000, polling: 150 })

    current = '/dashboard (kosong)'
    await P.goto(BASE + '/dashboard', { waitUntil: 'networkidle2' })
    await hasText(P, 'Belum ada paper')
    await fullAudit(P, current, 'beranda-kosong', { desc: 'Beranda pengguna baru (keadaan kosong)', loggedIn: true })

    current = '/dashboard/projects (kosong)'
    await P.goto(BASE + '/dashboard/projects', { waitUntil: 'networkidle2' })
    await fullAudit(P, current, 'paper-kosong', { desc: 'Daftar paper kosong', loggedIn: true })
    // formulir paper baru
    await P.evaluate(() => [...document.querySelectorAll('[role=tab]')].find((b) => b.innerText.trim() === 'Aktif')?.click()); await sleep(500)
    if (!(await P.$('#title'))) await P.evaluate(() => document.querySelector('[data-testid=toggle-new]')?.click())
    await P.waitForSelector('#title'); await sleep(300)
    await shot(P, 'paper-formulir', { desc: 'Formulir paper baru terbuka' })
    await P.type('#title', 'Prediksi Keterlambatan Penerbangan')
    await P.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Buat paper')?.click())
    if (!(await dialogOpen(P)) && !(await P.waitForSelector('[role=alertdialog]', { timeout: 3000 }).then(() => true, () => false))) issue(current, 'dialog', 'konfirmasi buat paper tidak muncul')
    await shot(P, 'dialog-buat-paper', { desc: 'Dialog konfirmasi buat paper' })
    await P.click('[data-testid=confirm-ok]')
    await P.waitForFunction(() => /\/dashboard\/projects\/[0-9a-f]{24}/.test(location.pathname), { timeout: 30000, polling: 150 })
    projectId = P.url().split('/').pop()

    // workspace: tab Naskah kosong lalu isi
    current = 'workspace naskah (kosong)'
    await settle(P)
    await fullAudit(P, current, 'workspace-naskah-kosong', { desc: 'Workspace, tab Naskah kosong', loggedIn: true })
    await P.goto(BASE + '/dashboard/projects/' + projectId, { waitUntil: 'networkidle2' }); await P.waitForSelector('textarea[aria-label="Editor naskah"]')
    await P.evaluate((t) => { const ta = document.querySelector('textarea[aria-label="Editor naskah"]'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(ta, t); ta.dispatchEvent(new Event('input', { bubbles: true })) }, MANUSCRIPT)
    await sleep(500)
    await P.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Simpan versi')?.click())
    await P.waitForSelector('[data-testid=confirm-ok]'); await shot(P, 'dialog-simpan-versi', { desc: 'Dialog konfirmasi simpan versi' })
    await P.click('[data-testid=confirm-ok]')
    await hasText(P, 'Tersimpan')
    await sleep(600)

    const tabs = [['Naskah', 'naskah', 'Tab Naskah (terisi, struktur terbaca)'], ['Versi', 'versi', 'Tab Versi'], ['Referensi', 'referensi', 'Tab Referensi'], ['Chat', 'chat', 'Tab Chat'], ['Kesiapan', 'kesiapan', 'Tab Kesiapan'], ['Edit', 'edit', 'Tab Edit (usulan)'], ['Ekspor', 'ekspor', 'Tab Ekspor'], ['Indikator', 'indikator', 'Tab Indikator'], ['Pengaturan', 'pengaturan', 'Tab Pengaturan']]
    for (const [label2, slug, desc] of tabs) {
      current = `workspace tab ${label2}`
      await P.evaluate((l) => [...document.querySelectorAll('[role=tab]')].find((b) => b.innerText.trim() === l)?.click(), label2)
      await sleep(900); await settle(P)
      await shot(P, `workspace-${slug}`, { desc })
      await auditButtons(P, current)
      await auditLinks(P, current, { loggedIn: true })
      await P.goto(BASE + `/dashboard/projects/${projectId}`, { waitUntil: 'networkidle2' }); await sleep(500)
    }

    current = '/dashboard (berisi)'
    await P.goto(BASE + '/dashboard', { waitUntil: 'networkidle2' }); await hasText(P, 'Paper terakhir diubah')
    await fullAudit(P, current, 'beranda-berisi', { desc: 'Beranda dengan paper', loggedIn: true })
    current = '/dashboard/projects (berisi)'
    await P.goto(BASE + '/dashboard/projects', { waitUntil: 'networkidle2' })
    await fullAudit(P, current, 'paper-berisi', { desc: 'Daftar paper berisi', loggedIn: true })
    current = '/dashboard/account'
    await P.goto(BASE + '/dashboard/account', { waitUntil: 'networkidle2' }); await hasText(P, 'Ganti password')
    await fullAudit(P, current, 'akun', { desc: 'Halaman Akun (profil, ganti password, hapus akun)', loggedIn: true })
    current = 'admin dari pengguna biasa'
    await P.goto(BASE + '/dashboard/admin/users', { waitUntil: 'networkidle2' })
    if (!(await hasText(P, 'khusus admin'))) issue(current, 'akses', 'pengguna biasa tidak ditolak')
    await shot(P, 'admin-ditolak', { desc: 'Halaman admin dibuka pengguna biasa (ditolak)' })
    if (await P.evaluate(() => document.body.innerText.includes('Kelola pengguna') && !!document.querySelector('a[href="/dashboard/admin/users"]'))) issue(current, 'akses', 'tautan Admin tampil untuk pengguna biasa')
    // logout: dialog lalu batal (tetap login); lalu setuju
    await P.goto(BASE + '/dashboard', { waitUntil: 'networkidle2' }); await sleep(600)
    await P.click('[data-testid=user-menu]'); await sleep(200)
    await shot(P, 'menu-pengguna', { desc: 'Menu pengguna terbuka' })
    await P.evaluate(() => [...document.querySelectorAll('[role=menuitem]')].find((b) => b.innerText.trim() === 'Keluar')?.click())
    await P.waitForSelector('[role=alertdialog]'); await shot(P, 'dialog-keluar', { desc: 'Dialog konfirmasi keluar' })
    await P.click('[data-testid=confirm-ok]')
    if (!(await P.waitForFunction(() => location.pathname === '/', { timeout: 20000, polling: 150 }).then(() => true, () => false))) issue('logout', 'alur', 'tidak kembali ke landing')
    await ctx.close()
  }

  // =============== ADMIN ===============
  {
    const ctx = await browser.createBrowserContext()
    const P = await ctx.newPage(); P.setDefaultTimeout(30000)
    await P.setViewport(D)
    await P.setExtraHTTPHeaders({ 'x-forwarded-for': '198.19.63.1' })
    attach(P, label, [/^404 \/_next/, /^409 \/api\/admin/, /^400 \/api\/admin/])
    current = 'login admin'
    await P.goto(BASE + '/login', { waitUntil: 'networkidle2' }); await sleep(900)
    await P.type('input[type=email]', adminEmail); await P.type('input[type=password]', adminPass); await P.keyboard.press('Enter')
    await P.waitForFunction(() => location.pathname.startsWith('/dashboard'), { timeout: 40000, polling: 150 })
    current = '/dashboard (admin)'
    await P.goto(BASE + '/dashboard', { waitUntil: 'networkidle2' }); await sleep(600)
    await fullAudit(P, current, 'beranda-admin', { desc: 'Beranda admin (sidebar memuat Admin)', loggedIn: true })
    current = '/dashboard/admin/users'
    await P.goto(BASE + '/dashboard/admin/users', { waitUntil: 'networkidle2' }); await hasText(P, userEmail)
    await shot(P, 'admin-pengguna', { desc: 'Kelola pengguna (baris akun sendiri bertanda "Ini akun Anda")' })
    const selfState = await P.evaluate((e) => { const row = document.querySelector(`[data-testid="user-row-${e}"]`); return { note: !!row.querySelector('[data-testid=self-note]'), disabled: [...row.querySelectorAll('button, select, input')].every((x) => x.disabled) } }, adminEmail)
    if (!selfState.note || !selfState.disabled) issue(current, 'pengaman-diri', `baris sendiri: ${JSON.stringify(selfState)}`)
    else console.log('PENGAMAN-DIRI UI ok: catatan tampil dan semua kontrol baris sendiri nonaktif')
    // dialog ubah peran: wajib ketik email; batal tidak mengubah
    const rowBtn = (email, text) => P.evaluate((email, text) => { const b = [...document.querySelector(`[data-testid="user-row-${email}"]`).querySelectorAll('button')].find((x) => x.innerText.trim() === text); if (b) b.click(); return !!b }, email, text)
    await rowBtn(userEmail, 'Jadikan admin'); await P.waitForSelector('[data-testid=confirm-input]')
    const okDisabled = await P.$eval('[data-testid=confirm-ok]', (b) => b.disabled)
    if (!okDisabled) issue(current, 'konfirmasi-email', 'tombol OK aktif sebelum email diketik')
    await shot(P, 'dialog-ubah-peran', { desc: 'Dialog ubah peran (wajib ketik email target)' })
    await P.type('[data-testid=confirm-input]', 'salah@ui.test')
    if (!(await P.$eval('[data-testid=confirm-ok]', (b) => b.disabled))) issue(current, 'konfirmasi-email', 'OK aktif dengan email salah')
    await P.click('[data-testid=confirm-cancel]'); await sleep(300)
    if ((await db.collection('users').findOne({ email: userEmail })).role !== 'user') issue(current, 'konfirmasi-email', 'peran berubah padahal dibatalkan')
    await rowBtn(userEmail, 'Hapus'); await P.waitForSelector('[data-testid=confirm-input]')
    await shot(P, 'dialog-hapus-pengguna', { desc: 'Dialog hapus pengguna (wajib ketik email target)' })
    await P.click('[data-testid=confirm-cancel]'); await sleep(300)
    if (!(await db.collection('users').findOne({ email: userEmail }))) issue(current, 'konfirmasi-email', 'pengguna terhapus padahal dibatalkan')
    await auditLinks(P, current, { loggedIn: true })
    await auditButtons(P, current)
    // ubah peran sungguhan dengan email benar (jalur sukses), lalu kembalikan lewat DB
    await P.goto(BASE + '/dashboard/admin/users', { waitUntil: 'networkidle2' }); await hasText(P, userEmail)
    await rowBtn(userEmail, 'Jadikan admin'); await P.waitForSelector('[data-testid=confirm-input]')
    await P.type('[data-testid=confirm-input]', userEmail); await sleep(150)
    await P.click('[data-testid=confirm-ok]'); await hasText(P, 'Peran diubah')
    if ((await db.collection('users').findOne({ email: userEmail })).role !== 'admin') issue(current, 'konfirmasi-email', 'peran tidak berubah setelah email benar diketik')
    await shot(P, 'admin-peran-diubah', { desc: 'Peran diubah setelah mengetik email target' })
    await db.collection('users').updateOne({ email: userEmail }, { $set: { role: 'user' } })
    await ctx.close()
  }

  await browser.close()
  await mc.close()

  // ---- INDEX.md
  const lines = ['# Tangkapan layar audit UI', '', `Dibuat oleh \`scripts/qa/ui-audit.js\` (${new Date().toISOString().slice(0, 10)}). Setiap keadaan diambil pada 1440x900 dan 390x844.`, '', '| No | Halaman / keadaan | 1440x900 | 390x844 |', '|---|---|---|---|']
  for (const s of shots) lines.push(`| ${s.id} | ${s.desc} | ${s.files[0] ? `[${s.files[0]}](${s.files[0]})` : '-'} | ${s.files[1] ? `[${s.files[1]}](${s.files[1]})` : '-'} |`)
  fs.writeFileSync(path.join(OUT, 'INDEX.md'), lines.join('\n') + '\n')

  console.log('\n===== RINGKASAN =====')
  console.log(JSON.stringify({ ...stats, tangkapanLayar: shots.length, berkasPNG: shots.reduce((a, s) => a + s.files.length, 0), masalah: issues.length }))
  const byKind = {}
  for (const i of issues) byKind[i.kind] = (byKind[i.kind] || 0) + 1
  console.log('Masalah per jenis:', JSON.stringify(byKind))
  fs.writeFileSync(path.join(__dirname, '..', '..', '.audit-result.json'), JSON.stringify({ stats, issues }, null, 1))
  process.exit(issues.length ? 1 : 0)
}

main().catch((e) => { console.error('FATAL', e); process.exit(2) })
