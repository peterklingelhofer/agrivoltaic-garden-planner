/**
 * Emits the crop catalogue in a format that is not TypeScript.
 *
 * This is the step most likely to be skipped, because it is
 * the only one with no visible symptom when it is missed: a second consumer transcribes the
 * catalogue, the two copies drift, and nothing fails. This is the same answer the physics tables
 * already got in `generate-rust-tables.mjs`, for the same reason, and it earns the same CI drift
 * check.
 *
 * **The TypeScript stays upstream, and here that is not merely convention.** `rows.ts` carries the
 * evidence trail in its comments, and they are load-bearing: one of them
 * records that a DLI figure "was verbatim ReduSystems vendor copy, so it is deleted not
 * re-cited", which is the kind of thing this project treats as a release blocker. JSON has no
 * comments. Moving the catalogue into JSON as the authoring format would delete that reasoning,
 * so what moves is a projection of the data and the comments stay where they can be read.
 *
 * The output is NOT in `public/`, deliberately. The browser already has the catalogue in its
 * bundle; shipping a second copy as a fetchable asset would add a few hundred kilobytes to serve
 * nobody. This file is for a build-time consumer: a Rust crate, a notebook, anything that is not
 * this application.
 *
 *     node scripts/generate-catalog.mjs
 */
import { writeFileSync } from 'node:fs'

const ROOT = new URL('..', import.meta.url)
const OUT = 'data/crop-catalog.json'

const { CROP_ROWS } = await import(new URL('src/data/catalog/rows.ts', ROOT).href)
// `provenance.ts` and not `schema.ts`: the schema has runtime imports with no file extension,
// which a bundler resolves and plain Node does not. See the note in that file
const { CATALOG_PROVENANCE } = await import(new URL('src/data/catalog/provenance.ts', ROOT).href)

/**
 * The tuple's column names, in order, from `CropRow` in `schema.ts`.
 *
 * Written out, because a positional tuple has no names at runtime and a
 * consumer reading `row[8]` and hoping it is `dliMin` is exactly the fragility this file exists to
 * remove. `columns` ships beside the rows so the format is self-describing, and the length check
 * below fails the build if `CropRow` grows a column and this list does not.
 */
const COLUMNS = [
  'id',
  'acceptedName',
  'family',
  'commonNames',
  'laubGroup',
  'dliClass',
  'habit',
  'archetype',
  'dliMin',
  'dliTargetLow',
  'dliTargetHigh',
  'tier',
  'shade',
  'daysToMaturity',
  'spacingCm',
  'heightM',
  'widthM',
  'overrides',
]

/** Positional tuples become named objects, because a name cannot be miscounted */
const named = (row) => {
  if (row.length > COLUMNS.length) {
    throw new Error(
      `${String(row[0])} has ${String(row.length)} columns and COLUMNS names ${String(COLUMNS.length)}: CropRow changed and this generator did not`,
    )
  }
  const out = {}
  COLUMNS.forEach((column, index) => {
    const value = row[index]
    if (value !== undefined) out[column] = value
  })
  return out
}

const seen = new Set()
for (const row of CROP_ROWS) {
  if (seen.has(row[0])) throw new Error(`duplicate crop id: ${String(row[0])}`)
  seen.add(row[0])
}

const document = {
  // a version, because the first consumer that is not in this repository cannot be asked to
  // re-read the generator when a column moves
  format: 'agv-crop-catalog/1',
  generatedFrom: 'src/data/catalog/rows.ts',
  provenance: CATALOG_PROVENANCE,
  columns: COLUMNS,
  crops: CROP_ROWS.map(named),
}

writeFileSync(new URL(OUT, ROOT), `${JSON.stringify(document, null, 2)}\n`)
console.log(`${OUT} written: ${String(document.crops.length)} crops`)
