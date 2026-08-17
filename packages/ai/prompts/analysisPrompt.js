function buildAnalysisPrompt({ sections, fieldOfStudy, targetJournalType, language }) {
  return `Anda adalah editor jurnal ilmiah senior yang berpengalaman mereview naskah untuk publikasi.

Analisis naskah berikut dan berikan hasil dalam format JSON yang valid, TANPA teks tambahan di luar JSON.

Bidang ilmu: ${fieldOfStudy || 'tidak disebutkan'}
Target jurnal: ${targetJournalType || 'any'}
Bahasa naskah: ${language || 'indonesia'}

=== ISI NASKAH PER BAGIAN ===
Title: ${sections.title || '-'}
Abstract: ${sections.abstract || '-'}
Introduction: ${sections.introduction || '-'}
Methodology: ${sections.methodology || '-'}
Results: ${sections.results || '-'}
Discussion: ${sections.discussion || '-'}
Conclusion: ${sections.conclusion || '-'}
References: ${sections.references || '-'}

Kembalikan JSON dengan struktur persis seperti ini:
{
  "overallScore": number (0-100),
  "grade": "A" | "B" | "C" | "D" | "F",
  "readinessLevel": "siap_submit" | "perlu_revisi_minor" | "perlu_revisi_major" | "tidak_siap",
  "similarityIndex": {
    "estimatedPercentage": number,
    "riskLevel": "low" | "medium" | "high",
    "notes": string
  },
  "sectionScores": {
    "title": { "score": number, "maxScore": number, "feedback": string, "suggestions": string[], "issues": string[] },
    "abstract": { ... same shape ... },
    "introduction": { ... },
    "methodology": { ... },
    "results": { ... },
    "discussion": { ... },
    "conclusion": { ... },
    "references": { "score": number, "maxScore": number, "feedback": string, "suggestions": string[], "issues": string[], "totalRefs": number, "recentRefsPercentage": number }
  },
  "priorityImprovements": [
    { "priority": number, "section": string, "issue": string, "suggestion": string, "impact": "high" | "medium" | "low" }
  ],
  "journalRecommendations": [
    { "journalName": string, "publisher": string, "ranking": string, "matchScore": number, "reason": string }
  ]
}`
}

module.exports = { buildAnalysisPrompt }
