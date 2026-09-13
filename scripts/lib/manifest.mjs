/**
 * `public/data/manifest.json`, which two build scripts now write into.
 *
 * The generator, the date it ran, the format it writes and whether it validated are properties of a
 * LAYER, so that is where they live: the botanical region grid is built by a different script from
 * a different upstream in a different version of the format.
 *
 * Each script owns the entries carrying its own name and replaces exactly those, so running
 * either one leaves the other's provenance untouched. That's the whole reason this is a merge:
 * rebuilding the climate grids means a gigabyte of rasters, and it must not be
 * the price of rebuilding a 35 kB one
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const EMPTY = { layers: [], notShipped: [] }

const read = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/**
 * The old shape read as the new one. Everything a single-generator manifest holds was written by
 * that generator, so its top-level fields describe every entry in it, and pushing them down loses
 * nothing. Entries that already name a generator are left exactly as they are, which is what
 * makes this a no-op on every run after the first
 */
const migrated = (manifest) => {
  if (manifest === null) return EMPTY
  const owner = {
    generator: manifest.generator,
    generatedAt: manifest.generatedAt,
    format: manifest.format,
    validated: manifest.validated,
  }
  const stamp = (entry, fields) => (entry.generator === undefined ? { ...fields, ...entry } : entry)
  return {
    layers: (manifest.layers ?? []).map((layer) => stamp(layer, owner)),
    notShipped: (manifest.notShipped ?? []).map((entry) =>
      stamp(entry, { generator: owner.generator, generatedAt: owner.generatedAt }),
    ),
  }
}

/**
 * Replaces this generator's entries and keeps everybody else's, in the order they were already
 * in. Nothing is sorted: a script pushes its layers in a fixed order and re-running it must
 * produce the same file, so a stable diff comes for free and a reordering one would be noise
 */
export const writeManifest = (
  file,
  { generator, generatedAt, format, validated, layers, notShipped = [] },
) => {
  const previous = migrated(read(file))
  const theirs = (entries) => entries.filter((entry) => entry.generator !== generator)
  const merged = {
    layers: [
      ...theirs(previous.layers),
      ...layers.map((layer) => ({ generator, generatedAt, format, validated, ...layer })),
    ],
    notShipped: [
      ...theirs(previous.notShipped),
      ...notShipped.map((entry) => ({ generator, generatedAt, ...entry })),
    ],
  }
  mkdirSync(new URL('./', file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(merged, null, 2)}\n`)
  return merged
}
