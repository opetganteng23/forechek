import pdfParse from 'pdf-parse'
import mammoth from 'mammoth'

const SECTION_KEYS = [
  'title',
  'abstract',
  'introduction',
  'methodology',
  'results',
  'discussion',
  'conclusion',
  'references'
]

// Heuristik sederhana: cari heading bagian dan potong teks di antaranya.
// Untuk hasil yang lebih akurat, pertimbangkan mengganti dengan parser NLP.
function splitIntoSections(fullText) {
  const sections = Object.fromEntries(SECTION_KEYS.map((k) => [k, '']))
  const headingRegex = new RegExp(`\\n\\s*(${SECTION_KEYS.join('|')})\\s*\\n`, 'gi')

  const matches = [...fullText.matchAll(headingRegex)]
  if (matches.length === 0) {
    sections.full = fullText
    return sections
  }

  matches.forEach((match, i) => {
    const key = match[1].toLowerCase()
    const start = match.index + match[0].length
    const end = i + 1 < matches.length ? matches[i + 1].index : fullText.length
    sections[key] = fullText.slice(start, end).trim()
  })

  return sections
}

async function extractTextFromPdf(buffer) {
  const data = await pdfParse(buffer)
  return data.text
}

async function extractTextFromDocx(buffer) {
  const { value } = await mammoth.extractRawText({ buffer })
  return value
}

export async function parseManuscriptFile(buffer, fileType) {
  const full = fileType === 'pdf' ? await extractTextFromPdf(buffer) : await extractTextFromDocx(buffer)
  const sections = splitIntoSections(full)
  return { full, sections }
}

export { splitIntoSections }
