import { describe, expect, it } from 'bun:test'
import { DEFAULT_IRRIGATION_MM_PER_YEAR, irrigationOf } from './garden'
import type { IrrigationMethod } from './garden'
import { millimetersPerYear } from './units'

const WATERED: readonly IrrigationMethod[] = [
  'hand',
  'sprinkler',
  'drip',
  'subsurface-drip',
  'flood',
]

describe('irrigationOf', () => {
  it('gives "none" no water to count on', () => {
    expect(irrigationOf('none')).toEqual({
      method: 'none',
      available: false,
      appliedMmPerYear: millimetersPerYear(0),
    })
  })

  it('gives drip the default depth and marks it available', () => {
    expect(DEFAULT_IRRIGATION_MM_PER_YEAR).toBe(180)
    expect(irrigationOf('drip')).toEqual({
      method: 'drip',
      available: true,
      appliedMmPerYear: DEFAULT_IRRIGATION_MM_PER_YEAR,
    })
  })

  it('keeps a passed depth for a watered method and zeroes it for "none"', () => {
    const depth = millimetersPerYear(300)
    expect(irrigationOf('sprinkler', depth).appliedMmPerYear).toBe(300)
    expect(irrigationOf('none', depth)).toEqual({
      method: 'none',
      available: false,
      appliedMmPerYear: millimetersPerYear(0),
    })
  })

  it('marks every method but "none" available', () => {
    for (const method of WATERED) {
      const irrigation = irrigationOf(method)
      expect(irrigation.available).toBe(true)
      expect(irrigation.appliedMmPerYear).toBe(DEFAULT_IRRIGATION_MM_PER_YEAR)
    }
  })
})
