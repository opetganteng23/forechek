// Logger terstruktur dengan redaksi otomatis (MTS Bagian 14/25: log tidak boleh memuat
// secret maupun isi naskah).
const SENSITIVE_KEY_RE =
  /pass(word)?|token|secret|authorization|api[-_]?key|cookie|credential|source|content|manuscript|abstract|prompt|fulltext|body/i

const MAX_STRING = 300
const MAX_DEPTH = 6

function redact(value, depth = 0) {
  if (value === null || value === undefined) return value
  if (depth > MAX_DEPTH) return '[MAX_DEPTH]'
  if (typeof value === 'string') {
    return value.length > MAX_STRING ? `[TRUNCATED len=${value.length}]` : value
  }
  if (typeof value !== 'object') return value
  if (value instanceof Error) {
    return { name: value.name, message: redact(value.message, depth + 1), code: value.code }
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1))

  const out = {}
  for (const [k, v] of Object.entries(value)) {
    out[k] = SENSITIVE_KEY_RE.test(k) ? '[REDACTED]' : redact(v, depth + 1)
  }
  return out
}

function createLogger({ sink = (line) => process.stdout.write(line + '\n'), base = {}, now = () => new Date() } = {}) {
  function emit(level, msg, fields) {
    const entry = { ts: now().toISOString(), level, msg, ...redact(base), ...redact(fields || {}) }
    sink(JSON.stringify(entry))
  }
  return {
    info: (msg, fields) => emit('info', msg, fields),
    warn: (msg, fields) => emit('warn', msg, fields),
    error: (msg, fields) => emit('error', msg, fields),
    child: (extra) => createLogger({ sink, base: { ...base, ...extra }, now })
  }
}

module.exports = { createLogger, redact }
