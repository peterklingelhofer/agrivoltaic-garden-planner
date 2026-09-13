import { describe, expect, it } from 'bun:test'
import type { BedId, CropId } from '../types/ids'
import type { SeasonRecord } from '../types/simulation'
import { historyByYear, seasonsOnBed } from './history'

const bed = 'bed-a' as BedId
const other = 'bed-b' as BedId
const tomato = 'tomato' as CropId
const carrot = 'carrot' as CropId

const record = (season: number, bedId: BedId, cropId: CropId): SeasonRecord => ({
  season,
  year: 2020 + season,
  bedId,
  cropId,
  harvested: true,
})

describe('what the ground remembers', () => {
  const records = [
    record(1, bed, tomato),
    record(1, other, carrot),
    record(2, bed, carrot),
    record(4, bed, tomato),
  ]

  it('keys one bed past seasons by number and leaves the other bed out', () => {
    const history = historyByYear(records, bed, 5)
    expect([...history.keys()].sort()).toEqual([1, 2, 4])
    expect(history.get(1)).toEqual([tomato])
    expect(history.get(2)).toEqual([carrot])
    expect(history.get(4)).toEqual([tomato])
  })

  it('never includes the season being planted, which would rotate a crop against itself', () => {
    const history = historyByYear(records, bed, 4)
    expect(history.has(4)).toBe(false)
    expect([...history.keys()].sort()).toEqual([1, 2, 3])
  })

  it('anchors the season just gone with an empty entry, so a long gap is counted in full', () => {
    const history = historyByYear(records, bed, 9)
    expect(history.get(8)).toEqual([])
    expect(historyByYear([], bed, 1).size).toBe(0)
  })

  it('counts the seasons a family has been taken off a bed, not the plantings', () => {
    const familyOf = (id: CropId): string | null => (id === tomato ? 'Solanaceae' : 'Apiaceae')
    expect(seasonsOnBed(records, bed, familyOf, 'Solanaceae')).toBe(2)
    expect(seasonsOnBed(records, bed, familyOf, 'Apiaceae')).toBe(1)
    expect(seasonsOnBed(records, other, familyOf, 'Solanaceae')).toBe(0)
  })
})
