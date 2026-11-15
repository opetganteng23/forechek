'use strict'

// Korpus SINTETIS untuk tes, benchmark, dan demo. Semua judul, penulis, dan DOI FIKTIF (prefiks 10.99999):
// bukan fakta tentang literatur nyata dan tidak boleh disajikan kepada pengguna sebagai sumber.
const A = (given, family) => ({ given, family })

const CORPUS = [
  {
    doi: '10.99999/fx.2021.001',
    title: 'Adaptive Sparse Attention for Low-Resource Language Modeling',
    authors: [A('Ratna', 'Wulandari'), A('Chen', 'Mei'), A('Jonas', 'Berg')],
    year: 2021,
    venueName: 'Journal of Synthetic Computing',
    abstract:
      'We introduce an adaptive sparse attention mechanism for language modeling in low-resource settings. Experiments on three synthetic benchmarks show that the proposed method reduces memory use by 38 percent while keeping perplexity within 2 percent of dense attention. We also analyze failure cases for very short sequences.'
  },
  {
    doi: '10.99999/fx.2019.014',
    title: 'A Survey of Synthetic Data Augmentation for Text Classification',
    authors: [A('Dewi', 'Kartika'), A('Samuel', 'Okoro')],
    year: 2019,
    venueName: 'Proceedings of the Synthetic NLP Workshop',
    type: 'inproceedings',
    abstract:
      'This survey reviews synthetic data augmentation techniques for text classification, grouping them into rule-based, model-based, and hybrid approaches. We find that augmentation helps most when labeled data is scarce, and that gains vary widely across domains. We do not evaluate multilingual settings.'
  },
  {
    doi: '10.99999/fx.2018.077',
    title: 'Retracted: Fast Training of Giant Models Without Gradients',
    authors: [A('Pavel', 'Novak')],
    year: 2018,
    venueName: 'Journal of Synthetic Computing',
    retracted: true,
    abstract:
      'We claim that giant models can be trained without gradients using a novel closed form update. The paper was later withdrawn because the reported results could not be reproduced and contained errors in the evaluation protocol.'
  },
  {
    doi: '10.99999/fx.2020.031',
    title: 'Graph Neural Networks for Traffic Forecasting in Dense Cities',
    authors: [A('Budi', 'Santoso'), A('Laura', 'Fernandez')],
    year: 2020,
    venueName: 'Transactions on Synthetic Transportation',
    abstract:
      'We study graph neural networks for short-term traffic forecasting in dense urban networks. The model captures spatial dependencies between road segments and improves mean absolute error over recurrent baselines on two synthetic city datasets. The approach requires dense sensor coverage and degrades when sensors are missing.'
  },
  {
    doi: '10.99999/fx.2022.045',
    title: 'Graph Neural Networks for Traffic Forecasting in Dense Cities: An Extended Study',
    authors: [A('Budi', 'Santoso'), A('Laura', 'Fernandez'), A('Ahmad', 'Hakim')],
    year: 2022,
    venueName: 'Transactions on Synthetic Transportation',
    abstract:
      'This extended study revisits graph neural networks for traffic forecasting with additional datasets, ablations, and robustness tests against missing sensors. Results confirm the earlier findings and show that imputation reduces the degradation reported previously.'
  },
  {
    doi: '10.99999/fx.2023.102',
    title: 'Pengaruh Metode Pembelajaran Daring terhadap Prestasi Mahasiswa',
    authors: [A('Siti', 'Rahmawati')],
    year: 2023,
    venueName: 'Jurnal Pendidikan Sintetis',
    abstract:
      'Penelitian ini menguji pengaruh pembelajaran daring terhadap prestasi mahasiswa pada tiga program studi. Hasil menunjukkan perbedaan rerata nilai yang kecil antara kelas daring dan tatap muka, dengan variasi besar antar program studi. Studi ini tidak mengendalikan motivasi awal mahasiswa.'
  },
  {
    doi: null,
    title: 'Notes on Reproducibility in Synthetic Machine Learning Pipelines',
    authors: [A('Ines', 'Moreau')],
    year: 2020,
    venueName: 'Synthetic Technical Reports',
    type: 'report',
    abstract: null
  },
  {
    doi: '10.99999/fx.2017.009',
    title: 'Efficient Kernel Methods for Large Synthetic Graphs',
    authors: [A('Tomasz', 'Wisniewski'), A('Aiko', 'Tanaka')],
    year: 2017,
    venueName: 'Journal of Synthetic Computing',
    abstract:
      'We present kernel methods that scale to graphs with millions of nodes by combining low-rank approximations with sampling. On synthetic graph benchmarks the method matches exact kernels within 1 percent while running ten times faster.'
  }
]

module.exports = { CORPUS }
