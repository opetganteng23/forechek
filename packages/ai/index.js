const Anthropic = require('@anthropic-ai/sdk')
const { buildAnalysisPrompt } = require('./prompts/analysisPrompt')

let client

function getClient() {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return client
}

async function analyzeManuscript(manuscript) {
  const prompt = buildAnalysisPrompt({
    sections: manuscript.extractedText?.sections || {},
    fieldOfStudy: manuscript.fieldOfStudy,
    targetJournalType: manuscript.targetJournalType,
    language: manuscript.language
  })

  const start = Date.now()

  const response = await getClient().messages.create({
    model: process.env.AI_MODEL_REPORT || process.env.AI_MODEL_CHAT, // dari env (MTS P7), tidak di-hardcode
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }]
  })

  const processingTimeMs = Date.now() - start
  const text = response.content?.[0]?.text || '{}'

  let result
  try {
    result = JSON.parse(text)
  } catch (err) {
    throw new Error(`Gagal parse respons AI sebagai JSON: ${err.message}`)
  }

  return {
    ...result,
    aiModel: 'claude-sonnet-4-6',
    processingTimeMs,
    tokensUsed: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)
  }
}

module.exports = {
  analyzeManuscript, // legacy (alur analisis lama); dipensiunkan bertahap sesuai MTS 19
  buildAnalysisPrompt,
  ...require('./src/agent'),
  ...require('./src/tools'),
  ...require('./src/validate'),
  ...require('./src/config'),
  ...require('./src/context'),
  ...require('./src/usage'),
  ...require('./src/chat'),
  ...require('./src/providers'),
  ...require('./src/providers/fake'),
  ...require('./src/providers/anthropic'),
  ...require('./src/tools/readSection')
}
