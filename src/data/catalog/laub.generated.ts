// GENERATED FILE. Do not edit by hand
// Source of truth: docs/laub-2022-table-s2.json
// Written by scripts/generate-laub.mjs, which `bun run generate` runs
import type { LaubCropGroup } from '../../types/crop'

export interface LaubGroupData {
  readonly studies: number
  /** DERIVED by algebraic recovery from the published predictions, never published */
  readonly b1PerPercentRsr: number
  /**
   * RSR (percent) of the highest predicted yield, null where the curve declines from the lowest
   * tabulated level. Computed from `predicted`, because the paper's own prose names 25% for
   * fruits where its Table S2 peaks at 30%
   */
  readonly benefitPeakRsrPercent: number | null
  /** RSR (percent) of the last level the table classes B, null where no level is classed B */
  readonly benefitPhaseEndRsrPercent: number | null
  readonly predicted: readonly number[]
  readonly ciLow: readonly number[]
  readonly ciHigh: readonly number[]
  /** B benefiting, T tolerant, S sensitive. Non-monotonic at high RSR as published */
  readonly responseClass: readonly ('B' | 'T' | 'S')[]
}

export const LAUB_RSR_LEVELS_PERCENT: readonly number[] = [
  5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90,
]

/** Shared across all nine groups: the RSR2 x crop type interaction was eliminated at p=0.3932 */
export const LAUB_B2_PER_PERCENT_RSR = -7.3293e-5

export const LAUB_MODEL_FORM = 'log10(Y/100) = b1*RSR + b2*RSR^2'

export const LAUB_SOURCE = {
  doi: '10.1007/s13593-022-00783-7',
  dataset: 'https://zenodo.org/records/5716091',
  openAccessPdf: 'https://d-nb.info/1265367027/34',
  supplement:
    'https://static-content.springer.com/esm/art%3A10.1007%2Fs13593-022-00783-7/MediaObjects/13593_2022_783_MOESM1_ESM.docx',
  retrieved: '2026-07-30',
  studies: 58,
  dataPoints: 428,
  species: 38,
} as const

/** Per-field provenance. Only the coefficients are derived; everything else is verbatim */
export const LAUB_PROVENANCE = {
  predictions: 'verbatim',
  confidenceIntervals: 'verbatim, 95% CONFIDENCE intervals not prediction intervals',
  responseClasses: 'verbatim, non-monotonic at high RSR as published, not corrected',
  coefficients: 'DERIVED by algebraic recovery, not published anywhere, cite as derived from',
} as const

/** 95 % CONFIDENCE intervals, symmetric on the log10 scale. Prediction intervals are not tabulated in the paper */
export const LAUB_INTERVAL_KIND = 'confidence-95' as const

export const LAUB_CI_SYMMETRIC_ON_LOG10 = true

export const LAUB_ANOVA = {
  RSR: { numDF: 1, denDF: 33.18, F: 0, p: 0.9713 },
  RSR2: { numDF: 1, denDF: 31.09, F: 12.05, p: 0.0015 },
  RSRxCropType: { numDF: 8, denDF: 55.22, F: 7.16, p: 0.0001, pIsUpperBound: true },
} as const

export const LAUB_AUTHOR_CAVEAT =
  'uncertainties due to random plot scale effects are large, while at country or continental scales the mean response to shading, represented by the confidence intervals, is the more valid estimator.'

export const LAUB_GROUPS: Readonly<Record<LaubCropGroup, LaubGroupData>> = {
  berries: {
    studies: 5,
    b1PerPercentRsr: 0.00435911,
    benefitPeakRsrPercent: 30,
    benefitPhaseEndRsrPercent: 55,
    predicted: [
      104.7, 108.7, 111.9, 114.3, 115.7, 116.1, 115.6, 114.1, 111.6, 108.3, 104.2, 99.5, 94.1, 88.3,
      82.2, 75.8, 69.3, 62.9,
    ],
    ciLow: [
      100.3, 100, 99.1, 97.5, 95.2, 92.2, 88.5, 84.3, 79.5, 74.3, 68.8, 63, 57, 51.1, 45.2, 39.5,
      34.1, 29.1,
    ],
    ciHigh: [
      109.3, 118.1, 126.4, 133.9, 140.6, 146.3, 150.8, 154.3, 156.6, 157.9, 158.1, 157.2, 155.4,
      152.8, 149.4, 145.4, 140.9, 135.9,
    ],
    responseClass: [
      'B',
      'B',
      'B',
      'B',
      'B',
      'B',
      'B',
      'B',
      'B',
      'B',
      'B',
      'T',
      'T',
      'T',
      'T',
      'T',
      'T',
      'T',
    ],
  },
  fruits: {
    studies: 7,
    b1PerPercentRsr: 0.00428533,
    benefitPeakRsrPercent: 30,
    benefitPhaseEndRsrPercent: 55,
    predicted: [
      104.6, 108.5, 111.6, 113.9, 115.2, 115.5, 114.9, 113.3, 110.8, 107.4, 103.3, 98.5, 93.1, 87.3,
      81.1, 74.8, 68.3, 61.9,
    ],
    ciLow: [
      100.4, 100.2, 99.3, 97.6, 95.2, 92.2, 88.4, 84, 79, 73.6, 67.9, 61.9, 55.8, 49.7, 43.8, 38.1,
      32.7, 27.7,
    ],
    ciHigh: [
      109, 117.5, 125.5, 132.8, 139.3, 144.8, 149.3, 152.8, 155.3, 156.7, 157.2, 156.7, 155.3,
      153.2, 150.4, 146.9, 142.9, 138.4,
    ],
    responseClass: [
      'B',
      'B',
      'B',
      'B',
      'B',
      'B',
      'B',
      'B',
      'B',
      'B',
      'B',
      'T',
      'T',
      'T',
      'T',
      'T',
      'T',
      'T',
    ],
  },
  'fruity-vegetables': {
    studies: 3,
    b1PerPercentRsr: 0.00319481,
    benefitPeakRsrPercent: 20,
    benefitPhaseEndRsrPercent: 40,
    predicted: [
      103.3, 105.8, 107.5, 108.3, 108.2, 107.1, 105.2, 102.5, 98.9, 94.7, 89.9, 84.7, 79.1, 73.2,
      67.2, 61.2, 55.2, 49.4,
    ],
    ciLow: [
      97.7, 94.8, 91.3, 87.3, 82.8, 77.9, 72.7, 67.2, 61.6, 55.9, 50.3, 44.7, 39.4, 34.3, 29.6,
      25.2, 21.2, 17.7,
    ],
    ciHigh: [
      109.2, 118.1, 126.5, 134.3, 141.2, 147.2, 152.2, 156.1, 158.9, 160.5, 161, 160.4, 158.7,
      156.1, 152.7, 148.5, 143.6, 138.2,
    ],
    responseClass: [
      'B',
      'B',
      'B',
      'B',
      'B',
      'B',
      'B',
      'B',
      'T',
      'T',
      'T',
      'T',
      'T',
      'T',
      'T',
      'T',
      'T',
      'T',
    ],
  },
  forages: {
    studies: 11,
    b1PerPercentRsr: 0.0021618,
    benefitPeakRsrPercent: 15,
    benefitPhaseEndRsrPercent: 25,
    predicted: [
      102.1, 103.3, 103.7, 103.3, 101.9, 99.7, 96.8, 93.2, 88.9, 84.1, 78.9, 73.4, 67.7, 62, 56.2,
      50.6, 45.1, 39.9,
    ],
    ciLow: [
      98.4, 96.4, 93.9, 90.9, 87.5, 83.6, 79.2, 74.5, 69.4, 64.1, 58.5, 52.8, 47.2, 41.6, 36.2,
      31.1, 26.4, 22.1,
    ],
    ciHigh: [
      105.9, 110.8, 114.6, 117.3, 118.8, 119.1, 118.3, 116.5, 113.8, 110.4, 106.4, 102, 97.3, 92.4,
      87.3, 82.2, 77.1, 72.1,
    ],
    responseClass: [
      'B',
      'B',
      'B',
      'B',
      'B',
      'T',
      'T',
      'T',
      'T',
      'T',
      'T',
      'T',
      'T',
      'T',
      'T',
      'T',
      'T',
      'T',
    ],
  },
  'leafy-vegetables': {
    studies: 4,
    b1PerPercentRsr: 0.00127197,
    benefitPeakRsrPercent: 10,
    benefitPhaseEndRsrPercent: 15,
    predicted: [
      101, 101.3, 100.6, 99.1, 96.8, 93.8, 90.1, 85.8, 81.1, 75.9, 70.5, 64.9, 59.3, 53.7, 48.2,
      42.9, 37.9, 33.2,
    ],
    ciLow: [
      96.4, 92.4, 87.9, 83.1, 77.9, 72.5, 66.9, 61.2, 55.5, 49.8, 44.3, 39, 33.9, 29.2, 24.9, 20.9,
      17.4, 14.3,
    ],
    ciHigh: [
      105.9, 111, 115.1, 118.2, 120.3, 121.4, 121.4, 120.4, 118.5, 115.7, 112.3, 108.2, 103.6, 98.6,
      93.4, 88, 82.4, 76.9,
    ],
    responseClass: [
      'B',
      'B',
      'B',
      'T',
      'T',
      'T',
      'T',
      'T',
      'T',
      'T',
      'T',
      'T',
      'T',
      'T',
      'T',
      'T',
      'T',
      'T',
    ],
  },
  'c3-cereals': {
    studies: 10,
    b1PerPercentRsr: -0.00227979,
    benefitPeakRsrPercent: null,
    benefitPhaseEndRsrPercent: null,
    predicted: [
      97, 93.3, 89, 84.2, 78.9, 73.4, 67.7, 61.9, 56.1, 50.4, 45, 39.8, 34.8, 30.3, 26.1, 22.3,
      18.9, 15.9,
    ],
    ciLow: [
      93.8, 87.4, 80.9, 74.4, 67.9, 61.5, 55.2, 49.1, 43.3, 37.7, 32.5, 27.7, 23.3, 19.4, 15.9,
      12.9, 10.3, 8.2,
    ],
    ciHigh: [
      100.3, 99.6, 97.8, 95.2, 91.7, 87.6, 83, 78, 72.8, 67.5, 62.2, 57.1, 52.1, 47.3, 42.8, 38.6,
      34.6, 31,
    ],
    responseClass: [
      'T',
      'T',
      'T',
      'T',
      'T',
      'T',
      'T',
      'T',
      'T',
      'T',
      'S',
      'S',
      'S',
      'T',
      'T',
      'T',
      'T',
      'T',
    ],
  },
  'tubers-root-crops': {
    studies: 2,
    b1PerPercentRsr: -0.00247235,
    benefitPeakRsrPercent: null,
    benefitPhaseEndRsrPercent: null,
    predicted: [
      96.8, 92.9, 88.4, 83.4, 78.1, 72.4, 66.6, 60.8, 55, 49.3, 43.9, 38.7, 33.9, 29.4, 25.2, 21.5,
      18.2, 15.3,
    ],
    ciLow: [
      91, 82.2, 73.7, 65.6, 57.9, 50.7, 44.1, 38, 32.4, 27.5, 23, 19.1, 15.7, 12.8, 10.3, 8.2, 6.5,
      5,
    ],
    ciHigh: [
      103, 105, 106.1, 106.1, 105.2, 103.4, 100.7, 97.3, 93.2, 88.6, 83.7, 78.4, 72.9, 67.4, 61.9,
      56.5, 51.3, 46.3,
    ],
    responseClass: [
      'T',
      'T',
      'T',
      'T',
      'T',
      'T',
      'T',
      'T',
      'S',
      'S',
      'S',
      'S',
      'S',
      'S',
      'T',
      'T',
      'T',
      'T',
    ],
  },
  'grain-legumes': {
    studies: 14,
    b1PerPercentRsr: -0.00450551,
    benefitPeakRsrPercent: null,
    benefitPhaseEndRsrPercent: null,
    predicted: [
      94.6, 88.6, 82.4, 76, 69.5, 63, 56.6, 50.4, 44.6, 39.1, 33.9, 29.2, 25, 21.2, 17.8, 14.8,
      12.2, 10,
    ],
    ciLow: [
      91.6, 83.4, 75.5, 67.9, 60.7, 53.8, 47.3, 41.2, 35.6, 30.4, 25.7, 21.4, 17.7, 14.4, 11.5, 9.2,
      7.2, 5.5,
    ],
    ciHigh: [
      97.6, 94.2, 90, 85, 79.5, 73.7, 67.7, 61.7, 55.8, 50.2, 44.9, 40, 35.4, 31.2, 27.4, 24, 20.9,
      18.2,
    ],
    responseClass: [
      'S',
      'S',
      'S',
      'S',
      'S',
      'S',
      'S',
      'S',
      'S',
      'S',
      'S',
      'S',
      'S',
      'S',
      'S',
      'S',
      'S',
      'S',
    ],
  },
  'maize-c4': {
    studies: 10,
    b1PerPercentRsr: -0.00565256,
    benefitPeakRsrPercent: null,
    benefitPhaseEndRsrPercent: null,
    predicted: [
      93.3, 86.3, 79.2, 72, 65, 58.1, 51.5, 45.3, 39.5, 34.2, 29.3, 24.9, 21, 17.6, 14.6, 12, 9.8,
      7.9,
    ],
    ciLow: [
      90.2, 80.9, 72.2, 64, 56.3, 49.2, 42.6, 36.6, 31.2, 26.3, 21.9, 18.1, 14.7, 11.8, 9.4, 7.4,
      5.7, 4.4,
    ],
    ciHigh: [
      96.5, 92.1, 86.9, 81.1, 75, 68.6, 62.3, 56.1, 50.1, 44.4, 39.2, 34.4, 30, 26.1, 22.6, 19.4,
      16.7, 14.3,
    ],
    responseClass: [
      'S',
      'S',
      'S',
      'S',
      'S',
      'S',
      'S',
      'S',
      'S',
      'S',
      'S',
      'S',
      'S',
      'S',
      'S',
      'S',
      'S',
      'S',
    ],
  },
}
