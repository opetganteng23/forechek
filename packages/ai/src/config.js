'use strict'
const { AppError } = require('@publication-prepare/core')

// Konfigurasi AI. Nama model HANYA dari env (MTS P7, 7.2). Semua batas bernilai PROVISIONAL (keputusan D3-02).
const PROMPT_VERSION = 'chat-2026-11-v1'

function intFrom(env, name, fallback, { min = 1 } = {}) {
  const raw = env[name]
  if (raw === undefined || raw === '') return fallback
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < min) throw new Error(`${name} harus bilangan bulat >= ${min}`)
  return n
}

function loadAiConfig(env = process.env) {
  return Object.freeze({
    provisional: true,
    promptVersion: PROMPT_VERSION,
    provider: env.AI_PROVIDER || '',
    models: Object.freeze({
      chat: env.AI_MODEL_CHAT || '',
      report: env.AI_MODEL_REPORT || '',
      light: env.AI_MODEL_LIGHT || ''
    }),
    limits: Object.freeze({
      maxIterations: intFrom(env, 'AI_MAX_ITERATIONS', 8),
      maxToolCalls: intFrom(env, 'AI_MAX_TOOL_CALLS', 12),
      timeoutMs: intFrom(env, 'AI_TURN_TIMEOUT_MS', 90000, { min: 1000 }),
      maxOutputTokens: intFrom(env, 'AI_MAX_OUTPUT_TOKENS', 4096, { min: 64 }),
      maxTotalTokens: intFrom(env, 'AI_MAX_TOTAL_TOKENS_PER_TURN', 60000, { min: 1000 }),
      contextBudgetTokens: intFrom(env, 'AI_CONTEXT_BUDGET_TOKENS', 24000, { min: 1000 })
    })
  })
}

// Mengembalikan nama model untuk tugas tertentu atau melempar galat jelas (tidak pernah menebak nama model).
function modelFor(aiConfig, task) {
  const name = aiConfig.models[task]
  if (!name) throw new AppError('PROVIDER_NOT_CONFIGURED', `Model AI belum dikonfigurasi (AI_MODEL_${task.toUpperCase()})`)
  return name
}

module.exports = { loadAiConfig, modelFor, PROMPT_VERSION }
