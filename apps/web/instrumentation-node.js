import { createRequire } from 'node:module'
import { bootProblems } from '@publication-prepare/core'

// Di produksi, konfigurasi tidak valid MENGHENTIKAN proses dengan pesan NAMA variabel (tanpa nilai) agar tidak melayani 500 diam-diam.
// Di non-produksi hanya peringatan.
const nodeRequire = createRequire(import.meta.url)
const hasModule = (name) => {
  try {
    nodeRequire.resolve(name)
    return true
  } catch {
    return false
  }
}
const { errors, warnings } = bootProblems(process.env, { hasModule })
for (const w of warnings) console.warn(`[config] ${w}`)
if (errors.length) {
  for (const e of errors) console.error(`[config] ${e}`)
  if (process.env.NODE_ENV === 'production') {
    console.error('[config] Konfigurasi tidak valid; server dihentikan.')
    process.exit(1)
  }
}
