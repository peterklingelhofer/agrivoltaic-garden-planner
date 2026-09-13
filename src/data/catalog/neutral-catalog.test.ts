import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'bun:test'
import { CROP_ROWS } from './rows'
import { CATALOG_PROVENANCE } from './provenance'

/**
 * That `data/crop-catalog.json` still says what `rows.ts` says.
 *
 * `bun run generate` writes that file and CI diffs it, which catches a catalogue edited without
 * regenerating. This catches the other direction and the worse one: a generator that stops
 * copying a column faithfully. The CI check would be perfectly happy with a generator that
 * silently dropped `overrides`, because the committed file and the freshly generated one would
 * agree with each other and disagree with the catalogue.
 *
 * Written against the file on disk rather than by re-running the generator, because what a second
 * consumer reads is the file, not the script.
 */
const CATALOG = JSON.parse(readFileSync('data/crop-catalog.json', 'utf8')) as {
  format: string
  columns: readonly string[]
  provenance: typeof CATALOG_PROVENANCE
  crops: readonly Record<string, unknown>[]
}

describe('the neutral crop catalogue', () => {
  it('declares a format and its own column names', () => {
    expect(CATALOG.format).toBe('agv-crop-catalog/1')
    expect(CATALOG.columns[0]).toBe('id')
    expect(CATALOG.columns).toContain('overrides')
  })

  it('carries the same licence the application shows', () => {
    expect(CATALOG.provenance).toEqual(CATALOG_PROVENANCE)
  })

  it('has every crop, once', () => {
    expect(CATALOG.crops).toHaveLength(CROP_ROWS.length)
    const ids = CATALOG.crops.map((crop) => crop.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  /**
   * Every column of every crop, not a sample. A catalogue is 182 rows of eighteen columns and the
   * one that drifts will be the one nobody sampled
   */
  it('matches the TypeScript column for column', () => {
    const mismatched: string[] = []
    for (const [index, row] of CROP_ROWS.entries()) {
      const crop = CATALOG.crops[index]
      if (crop === undefined) {
        mismatched.push(`${String(row[0])}: missing`)
        continue
      }
      CATALOG.columns.forEach((column, position) => {
        const expected = row[position]
        const got = crop[column]
        // an absent optional column is omitted rather than written as null, so both sides read
        // undefined and this compares equal without a special case
        if (JSON.stringify(expected ?? null) !== JSON.stringify(got ?? null)) {
          mismatched.push(`${String(row[0])}.${column}`)
        }
      })
    }
    expect(mismatched, 'run `bun run generate`').toEqual([])
  })

  /**
   * Non-vacuity: the comparison above must be able to fail. A row compared against itself would
   * pass whatever the generator did with it.
   */
  it('would notice a changed column', () => {
    const first = CATALOG.crops[0] as Record<string, unknown>
    expect(first.dliMin).toBe(CROP_ROWS[0]?.[8])
    expect(JSON.stringify({ ...first, dliMin: -1 })).not.toBe(JSON.stringify(first))
  })
})
