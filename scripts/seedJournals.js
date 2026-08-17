require('dotenv').config()
const { dbConnect, Journal } = require('../packages/db')

const sampleJournals = [
  {
    name: 'Jurnal Ilmu Komputer dan Informasi',
    publisher: 'Universitas Indonesia',
    country: 'Indonesia',
    language: ['indonesia'],
    ranking: { sinta: { level: 2, year: 2024 } },
    subjects: ['Computer Science', 'Information Systems'],
    keywords: ['komputer', 'informatika', 'sistem informasi'],
    submissionInfo: { url: 'https://jiki.cs.ui.ac.id', processingTime: '3-6 months', openAccess: true },
    isActive: true,
    lastUpdated: new Date()
  },
  {
    name: 'International Journal of Advanced Computer Science and Applications',
    publisher: 'The Science and Information Organization',
    country: 'United Kingdom',
    language: ['english'],
    ranking: { scopus: { quartile: 'Q3', year: 2024 } },
    subjects: ['Computer Science'],
    keywords: ['artificial intelligence', 'machine learning'],
    submissionInfo: { url: 'https://thesai.org/Publications/IJACSA', processingTime: '1-2 months', openAccess: true },
    isActive: true,
    lastUpdated: new Date()
  }
]

async function main() {
  await dbConnect()
  await Journal.deleteMany({})
  await Journal.insertMany(sampleJournals)
  console.log(`Seeded ${sampleJournals.length} journals`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
