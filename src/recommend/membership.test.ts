import { describe, expect, it } from 'bun:test'
import type { EcocropEnvelope, Trapezoid } from '../types/crop'
import type { Celsius, Days, Millimeters, PhUnits } from '../types/units'
import {
  ECOCROP_PARAMETERS,
  cycleLengthMembership,
  ecocropMembership,
  koppenMembership,
  trapezoidMembership,
} from './membership'

const shape = (a: number, b: number, c: number, d: number): Trapezoid<number> => ({
  absoluteMin: a,
  optimumMin: b,
  optimumMax: c,
  absoluteMax: d,
})

const envelope: EcocropEnvelope = {
  temperatureC: shape(8, 18, 27, 35) as Trapezoid<Celsius>,
  annualRainfallMm: shape(400, 600, 1400, 2800) as Trapezoid<Millimeters>,
  soilPh: shape(5, 6, 7.2, 8) as Trapezoid<PhUnits>,
  cycleLengthDays: { min: 55 as Days, max: 150 as Days },
  koppenCodes: ['Cfa', 'Dfa'],
  citations: ['fao-ecocrop'],
}

describe('trapezoid membership', () => {
  it('is zero outside the absolute bounds and one across the optimum', () => {
    const shape10 = shape(10, 20, 30, 40)
    expect(trapezoidMembership(5, shape10)).toBe(0)
    expect(trapezoidMembership(45, shape10)).toBe(0)
    expect(trapezoidMembership(25, shape10)).toBe(1)
  })

  it('ramps linearly on both shoulders', () => {
    const shape10 = shape(10, 20, 30, 40)
    expect(trapezoidMembership(15, shape10)).toBeCloseTo(0.5)
    expect(trapezoidMembership(35, shape10)).toBeCloseTo(0.5)
  })

  it('always lands inside the unit interval', () => {
    const shape10 = shape(10, 20, 30, 40)
    for (let value = -20; value <= 60; value += 0.5) {
      const membership = trapezoidMembership(value, shape10)
      expect(membership).toBeGreaterThanOrEqual(0)
      expect(membership).toBeLessThanOrEqual(1)
    }
  })

  it('tolerates a degenerate shoulder', () => {
    expect(trapezoidMembership(15, shape(10, 10, 30, 40))).toBe(1)
    // a zero-width upper shoulder collapses to the plateau edge
    expect(trapezoidMembership(35, shape(10, 20, 40, 40))).toBe(1)
    expect(trapezoidMembership(40, shape(10, 20, 40, 40))).toBe(0)
  })
})

describe('cycle length membership', () => {
  it('rewards a season that comfortably exceeds the maximum cycle', () => {
    expect(cycleLengthMembership(200, 55, 150)).toBe(1)
    expect(cycleLengthMembership(55, 55, 150)).toBeCloseTo(0.8)
    expect(cycleLengthMembership(20, 55, 150)).toBe(0)
  })
})

describe('koppen membership', () => {
  it('degrades rather than zeroing on a mismatch', () => {
    expect(koppenMembership('Cfa', ['Cfa', 'Dfa'])).toBe(1)
    expect(koppenMembership('Csb', ['Cfa', 'Dfa'])).toBeCloseTo(0.85)
    expect(koppenMembership('BWh', ['Cfa', 'Dfa'])).toBeCloseTo(0.7)
    expect(koppenMembership('BWh', [])).toBe(1)
  })
})

describe('ecocrop membership', () => {
  const observation = {
    meanTempC: 22,
    annualRainfallMm: 1000,
    soilPh: 6.5,
    seasonLengthDays: 200,
    koppenCode: 'Dfa',
  }

  it('is the minimum across parameters', () => {
    const score = ecocropMembership(envelope, { ...observation, soilPh: 5.5 }, false)
    const values = ECOCROP_PARAMETERS.map((parameter) => score.byParameter[parameter])
    expect(score.overall).toBeCloseTo(Math.min(...values))
  })

  it('names the limiting parameter as the argmin', () => {
    const score = ecocropMembership(envelope, { ...observation, soilPh: 5.2 }, false)
    expect(score.limitingParameter).toBe('soil-ph')
    expect(score.byParameter['soil-ph']).toBeCloseTo(score.overall)
  })

  it('disables the rainfall trapezoid when the bed is irrigated', () => {
    const dry = { ...observation, annualRainfallMm: 100 }
    expect(ecocropMembership(envelope, dry, false).byParameter.rainfall).toBe(0)
    expect(ecocropMembership(envelope, dry, true).byParameter.rainfall).toBe(1)
    expect(ecocropMembership(envelope, dry, false).limitingParameter).toBe('rainfall')
  })

  it('stays inside the unit interval for every parameter', () => {
    const score = ecocropMembership(envelope, observation, false)
    for (const parameter of ECOCROP_PARAMETERS) {
      expect(score.byParameter[parameter]).toBeGreaterThanOrEqual(0)
      expect(score.byParameter[parameter]).toBeLessThanOrEqual(1)
    }
  })
})
