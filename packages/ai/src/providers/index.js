'use strict'
const { AppError } = require('@publication-prepare/core')
const { createAnthropicProvider } = require('./anthropic')
const { createDemoProvider } = require('./demo')

const looksPlaceholder = (v) => !v || /^your-|<[^>]+>|x{5,}/i.test(String(v))

// Memilih provider dari env. Provider palsu (demo) TIDAK PERNAH aktif diam-diam: harus AI_PROVIDER=fake,
// dan di produksi ditolak kecuali AI_ALLOW_FAKE=true (uji staging).
function createProviderFromEnv(env = process.env) {
  if (env.AI_PROVIDER === 'fake') {
    if (env.NODE_ENV === 'production' && env.AI_ALLOW_FAKE !== 'true') {
      throw new AppError('PROVIDER_NOT_CONFIGURED', 'Provider AI palsu tidak diizinkan di produksi')
    }
    return createDemoProvider()
  }
  if (looksPlaceholder(env.ANTHROPIC_API_KEY)) {
    throw new AppError('PROVIDER_NOT_CONFIGURED', 'Layanan AI belum dikonfigurasi (ANTHROPIC_API_KEY)')
  }
  return createAnthropicProvider({ apiKey: env.ANTHROPIC_API_KEY, promptCache: env.AI_PROMPT_CACHE === 'true' })
}

module.exports = { createProviderFromEnv }
