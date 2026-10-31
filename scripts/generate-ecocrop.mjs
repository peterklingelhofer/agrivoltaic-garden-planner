/**
 * Emits `src/data/catalog/ecocrop-ph.generated.ts` from `docs/ecocrop-ph.json`.
 *
 * The JSON is the provenance record: for each catalog crop it matched, the FAO ECOCROP row (NAME,
 * SCIENTNAME, CODE), the route that matched it and the row's four soil pH cutoffs as Recocrop's
 * copy of the table prints them. This writes the cutoffs alone, keyed by crop id, so the numbers
 * `schema.ts` reads can't drift from the record that says where each one came from. The same
 * argument `generate-laub.mjs` makes for Table S2: a few hundred numbers nobody diffs by eye.
 *
 * The output is formatted the way Biome formats it, so `bun run generate` leaves a clean tree
 * and `biome check` has nothing to say about a file it didn't write.
 *
 *     node scripts/generate-ecocrop.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'

const ROOT = new URL('..', import.meta.url)
const SOURCE = new URL('docs/ecocrop-ph.json', ROOT)
const TARGET = new URL('src/data/catalog/ecocrop-ph.generated.ts', ROOT)

const record = JSON.parse(readFileSync(SOURCE, 'utf8'))

const CUTOFFS = ['PHMIN', 'PHOPMN', 'PHOPMX', 'PHMAX']

const key = (name) => (/^[A-Za-z_$][\w$]*$/.test(name) ? name : `'${name}'`)

const entries = Object.entries(record.crops).map(([id, entry]) => {
  const values = CUTOFFS.map((field) => entry.ecocrop?.[field])
  // a hand edit to the JSON that drops a field would otherwise print undefined into the catalog
  if (!values.every((value) => typeof value === 'number' && Number.isFinite(value))) {
    throw new Error(`docs/ecocrop-ph.json: ${id} doesn't carry four numeric pH cutoffs`)
  }
  return `  ${key(id)}: [${values.map(String).join(', ')}],`
})

const body = `// GENERATED FILE. Do not edit by hand
// Source of truth: docs/ecocrop-ph.json
// Written by scripts/generate-ecocrop.mjs, which \`bun run generate\` runs

/**
 * FAO ECOCROP's soil pH cutoffs for each catalog crop matched to an ECOCROP row, in the order
 * PHMIN, PHOPMN, PHOPMX, PHMAX: absolute minimum, optimal minimum, optimal maximum and absolute
 * maximum. Read from ${record.source.file} in ${record.source.repository},
 * licensed ${record.source.license}. A row's own \`ph\` override wins over this table
 */
export const ECOCROP_PH: Readonly<Record<string, readonly [number, number, number, number]>> = {
${entries.join('\n')}
}
`

writeFileSync(TARGET, body)
console.log(`wrote ${entries.length} ECOCROP pH ranges to src/data/catalog/ecocrop-ph.generated.ts`)
