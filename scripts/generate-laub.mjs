/**
 * Emits `src/data/catalog/laub.generated.ts` from `docs/laub-2022-table-s2.json`.
 *
 * The module says "GENERATED FILE" and names that JSON as its source of truth, and this script is
 * what generates it, so the two can't drift with no symptom. Table S2 is 162 published numbers
 * plus nine response-class rows, which is exactly the shape of data nobody diffs by eye, and the
 * same argument `generate-rust-tables.mjs` makes for the physics tables.
 *
 * Two fields are computed here. A person transcribed them by hand once, and got both wrong.
 * `benefitPeakRsrPercent` is the argmax of the published predictions, and
 * `benefitPhaseEndRsrPercent` is the last level the table classes B. The single field they
 * replace held the argmax for two groups, a phase boundary for a third, and for fruits the
 * paper's own prose sentence, which its own table contradicts by five RSR points.
 *
 * The output is formatted the way Biome formats it, so `bun run generate` leaves a clean tree
 * and `biome check` has nothing to say about a file it didn't write.
 *
 *     node scripts/generate-laub.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'

const ROOT = new URL('..', import.meta.url)
const SOURCE = new URL('docs/laub-2022-table-s2.json', ROOT)
const TARGET = new URL('src/data/catalog/laub.generated.ts', ROOT)

const table = JSON.parse(readFileSync(SOURCE, 'utf8'))

/** The JSON's camelCase keys against the `LaubCropGroup` union the app is written in */
const GROUP_KEYS = [
  ['berries', 'berries'],
  ['fruits', 'fruits'],
  ['fruityVegetables', 'fruity-vegetables'],
  ['forages', 'forages'],
  ['leafyVegetables', 'leafy-vegetables'],
  ['c3Cereals', 'c3-cereals'],
  ['tubersRootCrops', 'tubers-root-crops'],
  ['grainLegumes', 'grain-legumes'],
  ['corn', 'corn-c4'],
]

const LINE_WIDTH = 100

/** Biome fills an array of number literals: as many per line as fit inside the print width */
const fill = (values, indent) => {
  const pad = ' '.repeat(indent)
  const lines = []
  let line = pad
  for (const value of values) {
    const piece = `${String(value)},`
    if (line !== pad && `${line} ${piece}`.length > LINE_WIDTH) {
      lines.push(line)
      line = `${pad}${piece}`
    } else {
      line = line === pad ? `${pad}${piece}` : `${line} ${piece}`
    }
  }
  lines.push(line)
  return lines.join('\n')
}

/** A quoted element per line, which is how Biome breaks an array it can't fill */
const perLine = (values, indent) =>
  values.map((value) => `${' '.repeat(indent)}'${value}',`).join('\n')

const key = (name) => (/^[A-Za-z_$][\w$]*$/.test(name) ? name : `'${name}'`)

const argmax = (values) => {
  let best = 0
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] > values[best]) best = index
  }
  return best
}

const groupBody = (jsonKey) => {
  const group = table.groups[jsonKey]
  if (group === undefined) throw new Error(`docs/laub-2022-table-s2.json has no ${jsonKey}`)
  const peakAt = argmax(group.predicted)
  // an interior maximum only: where the curve declines from the lowest tabulated level there is
  // no peak to report, and naming the first level would read as one
  const peak = peakAt === 0 ? null : table.rsrLevels[peakAt]
  const lastB = group.class.lastIndexOf('B')
  const phaseEnd = lastB === -1 ? null : table.rsrLevels[lastB]
  return [
    `    studies: ${String(group.studies)},`,
    `    b1PerPercentRsr: ${String(group.b1PerPercentRsr)},`,
    `    benefitPeakRsrPercent: ${String(peak)},`,
    `    benefitPhaseEndRsrPercent: ${String(phaseEnd)},`,
    '    predicted: [',
    fill(group.predicted, 6),
    '    ],',
    '    ciLow: [',
    fill(group.ciLow, 6),
    '    ],',
    '    ciHigh: [',
    fill(group.ciHigh, 6),
    '    ],',
    '    responseClass: [',
    perLine(group.class, 6),
    '    ],',
  ].join('\n')
}

const anova = Object.entries(table.anova)
  .map(([name, row]) => {
    const fields = Object.entries(row)
      .map(([field, value]) => `${field}: ${String(value)}`)
      .join(', ')
    return `  ${key(name)}: { ${fields} },`
  })
  .join('\n')

const body = `// GENERATED FILE. Do not edit by hand
// Source of truth: docs/laub-2022-table-s2.json
// Written by scripts/generate-laub.mjs, which \`bun run generate\` runs
import type { LaubCropGroup } from '../../types/crop'

export interface LaubGroupData {
  readonly studies: number
  /** DERIVED by algebraic recovery from the published predictions, never published */
  readonly b1PerPercentRsr: number
  /**
   * RSR (percent) of the highest predicted yield, null where the curve declines from the lowest
   * tabulated level. Computed from \`predicted\`, because the paper's own prose names 25% for
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
${fill(table.rsrLevels, 2)}
]

/** Shared across all nine groups: the RSR2 x crop type interaction was eliminated at p=${String(table.model.sharedQuadraticRationale.match(/p=([\d.]+)/)?.[1] ?? '0.3932')} */
export const LAUB_B2_PER_PERCENT_RSR = ${table.model.b2PerPercentRsr.toExponential()}

export const LAUB_MODEL_FORM = '${table.model.form}'

export const LAUB_SOURCE = {
  doi: '${table.source.doi}',
  dataset: '${table.source.dataset}',
  openAccessPdf: '${table.source.openAccessPdf}',
  supplement:
    '${table.source.supplement}',
  retrieved: '${table.source.retrieved}',
  studies: ${String(table.totals.studies)},
  dataPoints: ${String(table.totals.dataPoints)},
  species: ${String(table.totals.species)},
} as const

/** Per-field provenance. Only the coefficients are derived; everything else is verbatim */
export const LAUB_PROVENANCE = {
  predictions: '${table.provenance.predictions}',
  confidenceIntervals: '${table.provenance.confidenceIntervals}',
  responseClasses: '${table.provenance.responseClasses}',
  coefficients: '${table.provenance.coefficients}',
} as const

/** 95 % CONFIDENCE intervals, symmetric on the log10 scale. Prediction intervals are not tabulated in the paper */
export const LAUB_INTERVAL_KIND = 'confidence-95' as const

export const LAUB_CI_SYMMETRIC_ON_LOG10 = ${String(table.model.ciSymmetricOnLog10)}

export const LAUB_ANOVA = {
${anova}
} as const

export const LAUB_AUTHOR_CAVEAT =
  '${table.authorCaveatVerbatim}'

export const LAUB_GROUPS: Readonly<Record<LaubCropGroup, LaubGroupData>> = {
${GROUP_KEYS.map(([jsonKey, name]) => `  ${key(name)}: {\n${groupBody(jsonKey)}\n  },`).join('\n')}
}
`

writeFileSync(TARGET, body)
console.log(`wrote ${GROUP_KEYS.length} Laub crop groups to src/data/catalog/laub.generated.ts`)
