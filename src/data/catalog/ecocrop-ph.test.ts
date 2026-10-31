import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'bun:test'
import { ECOCROP_PH } from './ecocrop-ph.generated'
import { CROP_ROWS } from './rows'
import { type CropRow, DEFAULT_PH, expandRow } from './schema'

/**
 * The ECOCROP pH table against the record it's generated from and the catalog that reads it. The
 * record is read as text and parsed here, as the citation suites read the ledger, so `tsc` never
 * has to walk the JSON
 */
type Cutoff = 'PHMIN' | 'PHOPMN' | 'PHOPMX' | 'PHMAX'

interface EcocropRecord {
  readonly crops: Readonly<Record<string, { readonly ecocrop: Readonly<Record<Cutoff, number>> }>>
}

const RECORD = JSON.parse(
  readFileSync(`${import.meta.dir}/../../../docs/ecocrop-ph.json`, 'utf8'),
) as EcocropRecord

const rowOf = (id: string): CropRow => {
  const row = CROP_ROWS.find((one) => one[0] === id)
  if (row === undefined) throw new Error(`${id} is not a catalog crop`)
  return row
}

/** The four cutoffs `expandRow` gives the crop, in ECOCROP's order */
const phOf = (row: CropRow): number[] => {
  const { absoluteMin, optimumMin, optimumMax, absoluteMax } = expandRow(row).envelope.soilPh
  return [absoluteMin, optimumMin, optimumMax, absoluteMax]
}

describe('the ECOCROP pH table', () => {
  it('names only crops the catalog has', () => {
    const ids = new Set(CROP_ROWS.map((row) => row[0]))
    expect(Object.keys(ECOCROP_PH).filter((id) => !ids.has(id))).toEqual([])
  })

  it('holds every range in order and inside pH 3 to 10', () => {
    const outOfShape = Object.entries(ECOCROP_PH)
      .filter(
        ([, [min, low, high, max]]) =>
          !(3 <= min && min <= low && low <= high && high <= max && max <= 10),
      )
      .map(([id]) => id)
    expect(outOfShape).toEqual([])
  })

  it('carries what docs/ecocrop-ph.json records, crop for crop', () => {
    expect(Object.keys(ECOCROP_PH)).toHaveLength(Object.keys(RECORD.crops).length)
    const recorded = Object.fromEntries(
      Object.entries(RECORD.crops).map(([id, { ecocrop }]) => [
        id,
        [ecocrop.PHMIN, ecocrop.PHOPMN, ecocrop.PHOPMX, ecocrop.PHMAX],
      ]),
    )
    expect(ECOCROP_PH).toEqual(recorded)
  })
})

describe('expandRow on soil pH', () => {
  it("reads tomato and lettuce from the table and cites Recocrop's copy beside ECOCROP", () => {
    // checked by hand against Recocrop's ecocrop.rds: Lycopersicon esculentum and Lactuca sativa
    expect(phOf(rowOf('tomato'))).toEqual([5, 5.5, 6.8, 7.5])
    for (const id of ['lettuce-leaf', 'lettuce-head']) {
      expect(phOf(rowOf(id)), id).toEqual([4.2, 6, 7, 7.5])
    }
    expect(expandRow(rowOf('tomato')).envelope.citations).toEqual([
      'fao-ecocrop',
      'hijmans-recocrop',
    ])
  })

  it("keeps blueberry's own range over the table's", () => {
    const own = rowOf('blueberry')[17]?.ph
    const table = ECOCROP_PH.blueberry
    // both exist and differ, so the reading below tells them apart
    expect(own).toBeDefined()
    expect(table).toBeDefined()
    expect(own).not.toEqual(table)
    expect(phOf(rowOf('blueberry'))).toEqual([...(own ?? [])])
    expect(expandRow(rowOf('blueberry')).envelope.citations).toEqual(['fao-ecocrop'])
  })

  it('gives a row with neither range the default', () => {
    const neither = CROP_ROWS.filter(
      (row) => row[17]?.ph === undefined && ECOCROP_PH[row[0]] === undefined,
    )
    expect(neither.length).toBeGreaterThan(0)
    for (const row of neither) {
      expect(phOf(row), row[0]).toEqual([...DEFAULT_PH])
      expect(expandRow(row).envelope.citations, row[0]).toEqual(['fao-ecocrop'])
    }
  })
})
