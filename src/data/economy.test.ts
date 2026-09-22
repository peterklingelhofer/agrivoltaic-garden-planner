import { describe, expect, it } from 'bun:test'
import type { KilowattHours, KilowattsDc } from '../types/units'
import {
  buildCostUsdBand,
  CROP_MOUNT_COST_USD_PER_WDC,
  currencyOf,
  DEFAULT_ECONOMY_INPUTS,
  electricityValue,
  FIXED_TILT_BASELINE_USD_PER_WDC,
  isCurrencyCode,
  paybackBlocker,
  paybackOf,
  paybackYearsBand,
  priceInUse,
  typedCostOf,
} from './economy'
import type { RetailPrice } from './retail-price'
import { citedVerbatim } from '../types/cited'

const FOUR_KW = 4 as KilowattsDc

const priceAt = (usdPerKwh: number): RetailPrice => ({
  usdPerKwh: citedVerbatim(usdPerKwh, 'B', ['eia-electric-power-monthly-5-6-a'], null),
  stateCode: 'MA',
  year: 2025,
  sourceLabel: 'test',
})

describe('the crop-mount benchmarks', () => {
  it('quotes NREL Figure 3 and the baseline it is a premium over', () => {
    expect(CROP_MOUNT_COST_USD_PER_WDC.vertical.value).toBe(1.83)
    expect(CROP_MOUNT_COST_USD_PER_WDC['tracker-stilt'].value).toBe(2.09)
    expect(CROP_MOUNT_COST_USD_PER_WDC['reinforced-regular'].value).toBe(2.33)
    expect(FIXED_TILT_BASELINE_USD_PER_WDC.value).toBe(1.53)
    // the executive summary's $0.80 top premium is exactly the dearest mount minus the baseline,
    // which is what makes the two figures a cross-check on each other
    expect(
      CROP_MOUNT_COST_USD_PER_WDC['reinforced-regular'].value -
        FIXED_TILT_BASELINE_USD_PER_WDC.value,
    ).toBeCloseTo(0.8, 10)
  })

  it('carries the report on every figure, verbatim and caveated', () => {
    for (const cited of [
      ...Object.values(CROP_MOUNT_COST_USD_PER_WDC),
      FIXED_TILT_BASELINE_USD_PER_WDC,
    ]) {
      expect(cited.provenance).toBe('verbatim')
      expect(cited.tier).toBe('B')
      expect(cited.citations).toEqual(['horowitz2020-dual-use-capital-costs'])
      expect(cited.caveat).toContain('500 kW')
    }
  })
})

describe('buildCostUsdBand', () => {
  it('is the nameplate in watts times the cheapest and dearest crop mount', () => {
    const cost = buildCostUsdBand(FOUR_KW)
    expect(cost.value.interval.lower).toBeCloseTo(4000 * 1.83, 6)
    expect(cost.value.interval.upper).toBeCloseTo(4000 * 2.33, 6)
    expect(cost.value.intervalKind).toBe('range')
    expect(cost.value.dominantSource).toBe('mount-structure')
  })

  it('scales linearly and collapses to nothing for no array', () => {
    const one = buildCostUsdBand(1 as KilowattsDc)
    expect(buildCostUsdBand(3 as KilowattsDc).value.interval.upper).toBeCloseTo(
      one.value.interval.upper * 3,
      6,
    )
    const none = buildCostUsdBand(0 as KilowattsDc)
    expect(none.value.interval.lower).toBe(0)
    expect(none.value.interval.upper).toBe(0)
  })

  it('is derived, cites the report, and says what was multiplied', () => {
    const cost = buildCostUsdBand(FOUR_KW)
    expect(cost.provenance).toBe('derived')
    expect(cost.tier).toBe('B')
    expect(cost.citations).toEqual(['horowitz2020-dual-use-capital-costs'])
    expect(cost.derivation).toContain('4.00 kW DC')
    expect(cost.derivation).toContain('1000 watts per kilowatt')
    expect(cost.derivation).toContain('$1.83')
    expect(cost.derivation).toContain('$2.33')
    // the leap the derivation can't justify is named
    expect(cost.caveat).toContain('2020 US dollars')
    expect(cost.caveat).toContain('size curve')
    expect(cost.caveat).toContain('no financing, operations or revenue')
  })
})

describe('electricityValue', () => {
  it('is a year of generation at the state price', () => {
    expect(electricityValue(1200 as KilowattHours, priceAt(0.3048))).toBeCloseTo(365.76, 6)
  })

  it('is nothing when nothing was generated', () => {
    expect(electricityValue(0 as KilowattHours, priceAt(0.3048))).toBe(0)
  })

  it('is the same year at a typed tariff, in the tariff’s currency', () => {
    const typed = { sourceId: 'user' as const, perKwh: 0.25, currency: 'EUR' }
    expect(electricityValue(1200 as KilowattHours, typed)).toBeCloseTo(300, 6)
    expect(currencyOf(typed)).toBe('EUR')
    expect(currencyOf(priceAt(0.3048))).toBe('USD')
  })
})

/**
 * The typed figures stand in for the sources wherever typed: a typed tariff for the state average,
 * a typed cost for the benchmark. A typed zero is a cleared field and counts as nothing typed
 */
describe('what the grower typed', () => {
  it('prefers a typed tariff to the state price and falls back to it otherwise', () => {
    const retail = priceAt(0.3048)
    expect(priceInUse({ perKwh: 0.4, currency: 'EUR', installedCost: null }, retail)).toEqual({
      sourceId: 'user',
      perKwh: 0.4,
      currency: 'EUR',
    })
    expect(priceInUse(DEFAULT_ECONOMY_INPUTS, retail)).toBe(retail)
    expect(priceInUse({ ...DEFAULT_ECONOMY_INPUTS, perKwh: 0 }, retail)).toBe(retail)
    expect(priceInUse(DEFAULT_ECONOMY_INPUTS, null)).toBeNull()
  })

  it('reads a typed cost the same way', () => {
    expect(typedCostOf({ perKwh: null, currency: 'GBP', installedCost: 6000 })).toEqual({
      sourceId: 'user',
      amount: 6000,
      currency: 'GBP',
    })
    expect(typedCostOf({ ...DEFAULT_ECONOMY_INPUTS, installedCost: 0 })).toBeNull()
    expect(typedCostOf(DEFAULT_ECONOMY_INPUTS)).toBeNull()
  })

  it('accepts a currency of exactly three capital letters', () => {
    expect(isCurrencyCode('USD')).toBe(true)
    expect(isCurrencyCode('EUR')).toBe(true)
    expect(isCurrencyCode('eur')).toBe(false)
    expect(isCurrencyCode('EU')).toBe(false)
    expect(isCurrencyCode('EURO')).toBe(false)
    expect(isCurrencyCode('')).toBe(false)
  })
})

describe("paybackOf and why there's none", () => {
  const cost = buildCostUsdBand(FOUR_KW)
  const euros = { sourceId: 'user' as const, perKwh: 0.4, currency: 'EUR' }
  const typedEuros = { sourceId: 'user' as const, amount: 8000, currency: 'EUR' }

  it('is the benchmark band over the year at a US-dollar price', () => {
    const payback = paybackOf(cost, null, 500, priceAt(0.3048))
    if (payback === null || 'sourceId' in payback) throw new Error('expected the band')
    expect(payback.value.interval.lower).toBeCloseTo((4000 * 1.83) / 500, 6)
    expect(paybackBlocker(null, 500, priceAt(0.3048))).toBeNull()
  })

  it('is a point over the year when the cost was typed in the price’s currency', () => {
    expect(paybackOf(cost, typedEuros, 500, euros)).toEqual({ sourceId: 'user', years: 16 })
    expect(paybackBlocker(typedEuros, 500, euros)).toBeNull()
  })

  it('has no payback for a benchmark in dollars against a tariff in euros, and says so', () => {
    expect(paybackOf(cost, null, 500, euros)).toBeNull()
    expect(paybackBlocker(null, 500, euros)).toBe(
      "Payback needs the panels' cost typed in EUR, since the benchmark on file is in US dollars.",
    )
  })

  it('has no payback for a typed cost in euros against the state price, and says so', () => {
    expect(paybackOf(cost, typedEuros, 500, priceAt(0.3048))).toBeNull()
    expect(paybackBlocker(typedEuros, 500, priceAt(0.3048))).toBe(
      'Payback needs the electricity price typed in EUR, since the price on file is in US dollars.',
    )
  })

  it("says nothing where there's no value to pay anything back with", () => {
    expect(paybackOf(cost, null, null, euros)).toBeNull()
    expect(paybackOf(cost, null, 0, priceAt(0.3048))).toBeNull()
    expect(paybackOf(null, null, 500, priceAt(0.3048))).toBeNull()
    expect(paybackBlocker(null, null, euros)).toBeNull()
    expect(paybackBlocker(null, 500, null)).toBeNull()
  })
})

describe('paybackYearsBand', () => {
  it('divides the cost band by one year of electricity', () => {
    const cost = buildCostUsdBand(FOUR_KW)
    const payback = paybackYearsBand(cost, 500)
    expect(payback?.value.interval.lower).toBeCloseTo((4000 * 1.83) / 500, 6)
    expect(payback?.value.interval.upper).toBeCloseTo((4000 * 2.33) / 500, 6)
  })

  it('is null when the year earned nothing, rather than an infinity', () => {
    const cost = buildCostUsdBand(FOUR_KW)
    expect(paybackYearsBand(cost, 0)).toBeNull()
    expect(paybackYearsBand(cost, -1)).toBeNull()
    expect(paybackYearsBand(cost, Number.NaN)).toBeNull()
    expect(paybackYearsBand(cost, Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('keeps the cost band’s provenance and says it is undiscounted', () => {
    const payback = paybackYearsBand(buildCostUsdBand(FOUR_KW), 500)
    expect(payback?.provenance).toBe('derived')
    expect(payback?.citations).toEqual(['horowitz2020-dual-use-capital-costs'])
    expect(payback?.value.intervalKind).toBe('range')
    expect(payback?.derivation).toContain('$500.00')
    expect(payback?.caveat).toContain('no discount rate')
    expect(payback?.caveat).toContain('electricity price for every year')
  })

  /** dividing both ends by one number can't change the fractional width of the band */
  it('leaves the band as wide, in relative terms, as the cost it came from', () => {
    const cost = buildCostUsdBand(FOUR_KW)
    const payback = paybackYearsBand(cost, 500)
    expect(payback?.value.contributions).toEqual(cost.value.contributions)
  })
})
