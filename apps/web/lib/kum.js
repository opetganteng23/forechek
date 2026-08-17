// Nilai dasar KUM per jenis publikasi (acuan umum Permendikbud, sesuaikan dengan pedoman institusi).
export const KUM_BASE_VALUES = {
  jurnal_internasional_bereputasi: 40,
  jurnal_internasional: 30,
  jurnal_nasional_terakreditasi: 25,
  jurnal_nasional_sinta3_4: 15,
  jurnal_nasional_sinta5_6: 10,
  prosiding_internasional: 15,
  prosiding_nasional: 10,
  buku_referensi: 20,
  book_chapter: 15
}

// Pembagian KUM lazim: penulis pertama 60%, sisanya 40% dibagi rata ke penulis
// kedua dan seterusnya. Penulis korespondensi tidak menambah alokasi terpisah -
// perannya melekat pada salah satu posisi penulis (biasanya penulis pertama atau
// penulis lain), jadi tidak dijumlahkan di luar 100% total.
export function getAuthorMultiplier(authorPosition, totalAuthors) {
  if (totalAuthors <= 1) return 1
  if (authorPosition === 'pertama') return 0.6

  const remainingAuthors = totalAuthors - 1
  return 0.4 / remainingAuthors
}

export function calculateKum({ publicationType, authorPosition, totalAuthors }) {
  const base = KUM_BASE_VALUES[publicationType]
  if (base === undefined) {
    throw new Error(`Jenis publikasi tidak dikenali: ${publicationType}`)
  }

  const multiplier = getAuthorMultiplier(authorPosition, totalAuthors)
  const final = Math.round(base * multiplier * 100) / 100

  return { base, multiplier, final }
}
