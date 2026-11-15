'use strict'
const { createFakeProvider } = require('./fake')

// Provider DEMO deterministik untuk uji HTTP/UI tanpa kunci API. BUKAN Claude: setiap balasan diberi label.
// Kata kunci dalam pesan pengguna mengendalikan perilaku uji:
//   [[tool:NAMA {json}]]  memanggil tool (termasuk tool yang tidak ada / input tidak sah, untuk menguji kontrol server)
//   [[say:TEKS]]          balasan persis TEKS (untuk menguji validator sitasi dengan sitasi karangan)
//   [[slow]]              balasan lambat (untuk uji pembatalan)
//   [[error:KODE]]        melempar ProviderError dengan kode tersebut
const LABEL = '[PROVIDER PALSU - mode uji, bukan Claude] '
const TOOL_RE = /\[\[tool:([A-Za-z0-9_]+)(?:\s+(\{.*?\}))?\]\]/s

function lastUserText(messages) {
  const last = messages[messages.length - 1]
  if (!last) return ''
  if (typeof last.content === 'string') return last.content
  return ''
}

function createDemoProvider() {
  return createFakeProvider({
    model: 'demo-fake-model',
    script: (request) => {
      const last = request.messages[request.messages.length - 1]
      // Setelah hasil tool: rangkum hasil apa adanya (termasuk galat).
      if (last && Array.isArray(last.content) && last.content[0] && last.content[0].type === 'tool_result') {
        const r = last.content.map((b) => b.content).join(' ').slice(0, 300)
        return { text: `${LABEL}Hasil tool diterima: ${r}` }
      }
      const text = lastUserText(request.messages)
      // Permintaan penilai rubrik (laporan kesiapan): balas JSON dengan kutipan NYATA dari bagian pertama yang diberikan.
      const sec = /<naskah_bagian name="([^"]+)">\n([\s\S]*?)\n<\/naskah_bagian>/.exec(text)
      if (sec) {
        const quote = sec[2].trim().slice(0, 60)
        return { text: JSON.stringify({ score: 3, rationale: `${LABEL}Penilaian uji deterministik, bukan penilaian Claude.`, evidence: [{ section: sec[1], quote }], suggestions: [] }) }
      }
      if (/<abstrak>/.test(text)) return { text: JSON.stringify({ verdict: 'unknown', quote: '' }) }
      const err =/\[\[error:([A-Z_]+)\]\]/.exec(text)
      if (err) return { error: { code: err[1], message: 'galat uji', retryable: false } }
      const tool = TOOL_RE.exec(text)
      if (tool) {
        let input = {}
        try {
          input = tool[2] ? JSON.parse(tool[2]) : {}
        } catch {
          input = {}
        }
        return { text: `${LABEL}Memanggil tool. `, toolUses: [{ name: tool[1], input }] }
      }
      const say = /\[\[say:(.*?)\]\]/s.exec(text)
      if (say) return { text: `${LABEL}${say[1]}` }
      if (/\[\[slow\]\]/.test(text)) return { text: `${LABEL}${'balasan lambat '.repeat(40)}`, chunkDelayMs: 120 }
      return { text: `${LABEL}Anda menulis: ${text.slice(0, 200)}` }
    }
  })
}

module.exports = { createDemoProvider, LABEL }
