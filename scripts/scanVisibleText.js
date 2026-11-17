// Pemindai teks yang terlihat pengguna: UI, email, halaman legal, pesan galat, data venue.
// DILARANG: em dash (U+2014) dan tanda panah apa pun (karakter panah, entitas HTML, "->", "=>").
// Memakai AST (espree) sehingga hanya string/literal template/teks JSX yang diperiksa; komentar dan sintaks fungsi panah TIDAK ditandai.
//   node scripts/scanVisibleText.js         (keluar 1 bila ada temuan)
const fs = require('node:fs')
const path = require('node:path')
const espree = require('espree')

const ROOT = path.join(__dirname, '..')
const TARGETS = ['apps/web/app', 'apps/web/components', 'apps/web/lib', 'packages']
const SKIP_DIR = new Set(['node_modules', '.next', 'test', 'tests', '.git'])

const CHAR_RE = /[—←-⇿⟰-⟿⤀-⥿⬀-⯿➔-➾▲-◅]/u
const ENTITY_RE = /&(?:mdash|rarr|larr|uarr|darr|harr|rArr|lArr|hArr|#8212|#x2014|#8592|#8593|#8594|#8595|#x2190|#x2192);/i
const SEQ_RE = /->|=>/

function problems(text) {
  const out = []
  const m = text.match(CHAR_RE)
  if (m) out.push(m[0] === '—' ? 'em dash (U+2014)' : `tanda panah (${m[0]})`)
  if (ENTITY_RE.test(text)) out.push('entitas em dash/panah')
  if (SEQ_RE.test(text)) out.push('urutan "->" atau "=>"')
  return out
}

function walkAst(node, visit, parent) {
  if (!node || typeof node.type !== 'string') return
  visit(node, parent)
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'range' || k === 'parent') continue
    const v = node[k]
    if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === 'string' && walkAst(c, visit, node))
    else if (v && typeof v.type === 'string') walkAst(v, visit, node)
  }
}

function parseJs(src) {
  const opts = { ecmaVersion: 'latest', ecmaFeatures: { jsx: true }, loc: true, comment: false }
  try {
    return espree.parse(src, { ...opts, sourceType: 'module' })
  } catch {
    return espree.parse(src, { ...opts, sourceType: 'script', ecmaFeatures: { jsx: true, globalReturn: true } })
  }
}

function scanJs(file, src) {
  const found = []
  let ast
  try {
    ast = parseJs(src)
  } catch (e) {
    return [{ file, line: 0, issue: `tidak dapat di-parse: ${e.message}`, text: '' }]
  }
  const add = (node, text, issues) => issues.forEach((issue) => found.push({ file, line: node.loc.start.line, issue, text: text.replace(/\s+/g, ' ').slice(0, 90) }))
  walkAst(ast, (n, parent) => {
    if (n.type === 'Literal' && typeof n.value === 'string') {
      if (parent && (parent.type === 'ImportDeclaration' || parent.type === 'ExportAllDeclaration' || parent.type === 'ExportNamedDeclaration')) return
      add(n, n.value, problems(n.value))
    } else if (n.type === 'TemplateElement') {
      add(n, n.value.cooked || '', problems(n.value.cooked || ''))
    } else if (n.type === 'JSXText') {
      add(n, n.value, [...new Set([...problems(n.value), ...problems(n.raw || '')])])
    }
  })
  return found
}

function scanJson(file, src) {
  const found = []
  let data
  try {
    data = JSON.parse(src)
  } catch {
    return found
  }
  const rec = (v, p) => {
    if (typeof v === 'string') problems(v).forEach((issue) => found.push({ file, line: 0, issue, text: `${p}: ${v.slice(0, 70)}` }))
    else if (Array.isArray(v)) v.forEach((x, i) => rec(x, `${p}[${i}]`))
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) rec(x, `${p}.${k}`)
  }
  rec(data, '$')
  return found
}

function listFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR.has(e.name)) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) listFiles(p, acc)
    else if (/\.(js|jsx|mjs|cjs)$/.test(e.name) || (/\.json$/.test(e.name) && /venues[\\/]data/.test(p))) acc.push(p)
  }
  return acc
}

function scan(targets = TARGETS) {
  const findings = []
  let files = 0
  for (const t of targets) {
    for (const f of listFiles(path.join(ROOT, t))) {
      files++
      const src = fs.readFileSync(f, 'utf8')
      const rel = path.relative(ROOT, f).replace(/\\/g, '/')
      findings.push(...(f.endsWith('.json') ? scanJson(rel, src) : scanJs(rel, src)))
    }
  }
  return { findings, files }
}

module.exports = { scan, problems }

if (require.main === module) {
  const { findings, files } = scan()
  for (const f of findings) console.log(`${f.file}:${f.line}  ${f.issue}  | ${f.text}`)
  console.log(`${files} berkas dipindai, ${findings.length} temuan`)
  process.exit(findings.length ? 1 : 0)
}
