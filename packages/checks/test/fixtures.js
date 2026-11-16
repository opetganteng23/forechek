'use strict'
const { parseManuscript } = require('@publication-prepare/manuscript')
const { loadBuiltinProfiles } = require('@publication-prepare/venues')

const PARA = (s) => `${s} `.repeat(6).trim()

const GOOD_MD = `# Deteksi Anomali Jaringan dengan Autoencoder Ringan

**Keywords:** anomaly detection, autoencoder, IoT

## Abstract
${PARA('This paper proposes a lightweight autoencoder for network anomaly detection on constrained IoT gateways and evaluates it on public traces with strong baselines.')}

## Introduction
${PARA('Network anomalies threaten constrained IoT deployments \\cite{wulandari2021adaptive} and prior detectors require heavy hardware (Santoso, 2020).')} Kontak: penulis@kampus.ac.id

## Methodology
${PARA('We train a three layer autoencoder on benign traffic windows and threshold the reconstruction error using a validation split with fixed seeds and published hyperparameters.')}

## Results
${PARA('The detector reaches an F1 score of 0.94 on the test traces and outperforms the isolation forest baseline by six points while using half the memory.')}

## Conclusion
${PARA('A lightweight autoencoder is sufficient for gateway level anomaly detection, although evaluation on encrypted traffic remains future work.')}

## References
[1] A. Author, "Title," IEEE Access, 2020.
[2] B. Author, "Other," IEEE Access, 2021.
`

const REFS = [
  { citeKey: 'wulandari2021adaptive', title: 'Adaptive Sparse Attention', year: 2021, doi: '10.99999/a', authors: [{ family: 'Wulandari' }], verification: { status: 'verified' } },
  { citeKey: 'santoso2020graph', title: 'Graph Networks', year: 2020, doi: '10.99999/g', authors: [{ family: 'Santoso' }], verification: { status: 'verified' } }
]

const venues = Object.fromEntries(loadBuiltinProfiles().map((p) => [p.slug, p]))
const clone = (o) => JSON.parse(JSON.stringify(o))
const parse = (src, fmt = 'markdown') => parseManuscript(src, fmt)

module.exports = { GOOD_MD, REFS, venues, clone, parse, PARA }
