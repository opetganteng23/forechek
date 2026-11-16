'use strict'

// Rubrik penilaian (MTS 40.2 C). Skala 0-4 bilangan bulat dengan anchor. Bobot awal PROVISIONAL (keputusan D5-03) dan dapat
// ditimpa per venue lewat profile.rubric.weights. Kriteria `source: 'llm'` dinilai model HANYA bila bagian terkait tersedia;
// `source: 'deterministic'` dihitung kode dari data proyek. Tidak ada skor tanpa bukti: lihat assess.js.
const RUBRIC_VERSION = 'rubric-provisional-0.1'
const PROMPT_VERSION = 'rubric-prompt-2026-11-v1'
const SCALE = { min: 0, max: 4 }

const CRITERIA = [
  {
    id: 'novelty',
    label: 'Kebaruan dan kontribusi',
    source: 'llm',
    weight: 2,
    sections: ['abstract', 'introduction', 'conclusion'],
    definition: 'Seberapa jelas naskah menyatakan kontribusi, apa yang baru dibanding pekerjaan sebelumnya, dan apakah klaim kebaruan didukung isi naskah.',
    anchors: { 0: 'Kontribusi tidak dinyatakan.', 2: 'Kontribusi dinyatakan tetapi kebaruan terhadap pekerjaan terkait tidak jelas.', 4: 'Kontribusi spesifik, kebaruan dijelaskan terhadap pekerjaan terkait, dan didukung bukti dalam naskah.' }
  },
  {
    id: 'positioning',
    label: 'Pemosisian terhadap literatur',
    source: 'llm',
    weight: 1.5,
    sections: ['introduction', 'related_work'],
    definition: 'Apakah naskah menempatkan masalah dalam literatur yang relevan dan menjelaskan celah penelitian.',
    anchors: { 0: 'Tidak ada pembahasan literatur.', 2: 'Literatur disebut tetapi celah penelitian tidak jelas.', 4: 'Literatur relevan dibahas secara sintesis dan celah penelitian dinyatakan jelas.' }
  },
  {
    id: 'methodology',
    label: 'Metodologi dan reproducibility',
    source: 'llm',
    weight: 2,
    sections: ['methodology'],
    definition: 'Apakah metode, data, dan prosedur dijelaskan cukup rinci untuk dipahami dan direproduksi.',
    anchors: { 0: 'Metode tidak dijelaskan.', 2: 'Metode dijelaskan garis besar; detail penting hilang.', 4: 'Metode, data, parameter, dan evaluasi dijelaskan rinci sehingga dapat direproduksi.' }
  },
  {
    id: 'results',
    label: 'Kualitas analisis hasil',
    source: 'llm',
    weight: 2,
    sections: ['results', 'results_discussion'],
    definition: 'Apakah hasil dilaporkan dengan ukuran yang tepat, dibandingkan dengan pembanding, dan dianalisis (bukan hanya disajikan).',
    anchors: { 0: 'Hasil tidak disajikan.', 2: 'Hasil disajikan tanpa pembanding atau analisis memadai.', 4: 'Hasil disajikan dengan pembanding, ukuran yang sesuai, dan analisis yang jujur terhadap keterbatasan.' }
  },
  {
    id: 'argument',
    label: 'Argumentasi dan diskusi',
    source: 'llm',
    weight: 1.5,
    sections: ['discussion', 'results_discussion', 'conclusion'],
    definition: 'Apakah kesimpulan mengikuti dari hasil dan keterbatasan diakui.',
    anchors: { 0: 'Kesimpulan tidak terkait hasil.', 2: 'Kesimpulan sebagian didukung hasil; keterbatasan minim.', 4: 'Kesimpulan didukung hasil, keterbatasan dan implikasi dibahas.' }
  },
  {
    id: 'writing',
    label: 'Penulisan dan struktur',
    source: 'llm',
    weight: 1,
    sections: ['abstract', 'introduction'],
    definition: 'Kejelasan bahasa, alur, dan struktur penulisan pada bagian yang tersedia.',
    anchors: { 0: 'Sulit dipahami.', 2: 'Dapat dipahami tetapi alur dan bahasa banyak kendala.', 4: 'Jelas, ringkas, dan terstruktur baik.' }
  },
  {
    id: 'reference_quality',
    label: 'Kualitas referensi',
    source: 'deterministic',
    weight: 1,
    sections: [],
    definition: 'Dihitung kode dari daftar referensi proyek: proporsi terverifikasi, bebas retraction, berDOI, dan terbaru. Bukan penilaian model.',
    anchors: { 0: 'Tidak ada referensi terverifikasi / ada yang ditarik.', 2: 'Sebagian terverifikasi.', 4: 'Hampir semua terverifikasi, berDOI, dan terbaru.' }
  }
]

function criteriaFor(venue) {
  const overrides = (venue && venue.rubric && venue.rubric.weights) || {}
  return CRITERIA.map((c) => ({ ...c, weight: Number.isFinite(overrides[c.id]) && overrides[c.id] > 0 ? overrides[c.id] : c.weight }))
}

module.exports = { CRITERIA, RUBRIC_VERSION, PROMPT_VERSION, SCALE, criteriaFor }
