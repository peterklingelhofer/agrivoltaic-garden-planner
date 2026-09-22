import { describe, expect, it } from 'bun:test'
import type { Site } from '../types/site'
import type { DegreesLatitude, EpochMillis } from '../types/units'
import { HOURS_PER_TMY, type TmySeries } from '../types/weather'
import { dayLengthHours, growingSeasonIndex, leafOnMonthsFor } from './phenology'

interface SyntheticYear {
  readonly meanC: number
  readonly amplitudeC?: number
  readonly diurnalC?: number
  readonly dewDepressionC?: number
  /** Overrides `dewDepressionC` with a value that varies by day of year (0-indexed), for the
   * dry-season fixture below */
  readonly dewDepressionAt?: (dayOfYear: number) => number
  /** Shifts the annual sinusoid, in days, so a southern-hemisphere fixture can reuse the same
   * shape six months over, needing no second formula */
  readonly phaseShiftDays?: number
}

/**
 * An 8760-hour typical year, entirely formula-built: hourly temperature
 * is an annual sinusoid plus a diurnal swing, dew point a fixed depression below it. Every
 * `TmySeries` field the phenology code never reads (irradiance, wind, pressure) stays zero
 */
const syntheticYear = ({
  meanC,
  amplitudeC = 0,
  diurnalC = 0,
  dewDepressionC = 0,
  dewDepressionAt,
  phaseShiftDays = 0,
}: SyntheticYear): TmySeries => {
  const hours = HOURS_PER_TMY
  const start = Date.UTC(2024, 0, 1)
  const utcMillis = new Float64Array(hours)
  const dryBulbC = new Float32Array(hours)
  const dewPointC = new Float32Array(hours)
  const depressionAt = dewDepressionAt ?? (() => dewDepressionC)
  for (let hour = 0; hour < hours; hour += 1) {
    utcMillis[hour] = start + hour * 3_600_000
    const dayOfYear = Math.floor(hour / 24)
    const hourOfDay = hour % 24
    const annual =
      // the warmest day lags the solstice by about a month, as it does over land
      meanC + amplitudeC * Math.cos((2 * Math.PI * (dayOfYear - 202 - phaseShiftDays)) / 365)
    const diurnal = (diurnalC / 2) * Math.sin((2 * Math.PI * (hourOfDay - 6)) / 24)
    const temperature = annual + diurnal
    dryBulbC[hour] = temperature
    dewPointC[hour] = temperature - depressionAt(dayOfYear)
  }
  return {
    source: 'open-meteo',
    decomposition: 'passthrough',
    utcOffsetHours: 0,
    startUtcMillis: start as EpochMillis,
    utcMillis,
    ghiWM2: new Float32Array(hours),
    dniWM2: new Float32Array(hours),
    dhiWM2: new Float32Array(hours),
    dryBulbC,
    dewPointC,
    windSpeedMS: new Float32Array(hours),
    pressureMb: new Float32Array(hours),
    provenance: {
      datasetLabel: 'synthetic',
      yearsCovered: [2024],
      licence: 'CC0',
      attribution: 'test',
      retrievedUtcMillis: start as EpochMillis,
      isTypicalMeteorologicalYear: true,
    },
  }
}

// leafOnMonthsFor reads only site.location.latitudeDeg, so the rest of Site stays absent rather
// than hand-rolling the whole fixture: src/sim may not import src/recommend/testkit's siteFixture
const siteAt = (latitudeDeg: number): Site =>
  ({ location: { latitudeDeg: latitudeDeg as DegreesLatitude } }) as unknown as Site

/** True where the twelve months hold exactly one contiguous run, wrapping past December allowed */
const isContiguousCycle = (months: readonly boolean[]): boolean => {
  let risingEdges = 0
  for (let month = 0; month < 12; month += 1) {
    if (months[month] && !months[(month + 11) % 12]) risingEdges += 1
  }
  return risingEdges <= 1
}

describe('dayLengthHours', () => {
  it('is 12 h at the equator on any day of year', () => {
    expect(dayLengthHours(0, 1)).toBeCloseTo(12, 6)
    expect(dayLengthHours(0, 200)).toBeCloseTo(12, 6)
  })

  it('is 24 h at latitude 80 on the June solstice and 0 h on the December one', () => {
    expect(dayLengthHours(80, 172)).toBe(24)
    expect(dayLengthHours(80, 355)).toBe(0)
  })

  it('is between 8 and 9 h at latitude 42 in late December', () => {
    const hours = dayLengthHours(42, 355)
    expect(hours).toBeGreaterThan(8)
    expect(hours).toBeLessThan(9)
  })
})

describe('leafOnMonthsFor', () => {
  it('gives a temperate northern site a contiguous season holding July and excluding January', () => {
    const series = syntheticYear({ meanC: 8.5, amplitudeC: 13.5, diurnalC: 5, dewDepressionC: 3 })
    const months = leafOnMonthsFor(siteAt(42), series)
    expect(months[6]).toBe(true)
    expect(months[0]).toBe(false)
    expect(isContiguousCycle(months)).toBe(true)
  })

  it('mirrors that season across the equator, holding January and excluding July', () => {
    const series = syntheticYear({
      meanC: 8.5,
      amplitudeC: 13.5,
      diurnalC: 5,
      dewDepressionC: 3,
      phaseShiftDays: 182.5,
    })
    const months = leafOnMonthsFor(siteAt(-42), series)
    expect(months[0]).toBe(true)
    expect(months[6]).toBe(false)
    expect(isContiguousCycle(months)).toBe(true)
  })

  it('keeps a humid tropical site in leaf all twelve months', () => {
    const series = syntheticYear({ meanC: 28, diurnalC: 5, dewDepressionC: 2 })
    const months = leafOnMonthsFor(siteAt(5), series)
    expect(months).toEqual(new Array(12).fill(true))
  })

  it('bares a tropical dry season where the dew point sits 30 C below the temperature', () => {
    // day 151 is 1 June and day 304 is 1 November on a 365-day year, landing exactly on five
    // calendar months
    const series = syntheticYear({
      meanC: 33,
      diurnalC: 6,
      dewDepressionAt: (dayOfYear) => (dayOfYear >= 151 && dayOfYear < 304 ? 30 : 2),
    })
    const index = growingSeasonIndex(series, 10)
    const midMonth = [14, 45, 73, 104, 134, 165, 195, 226, 257, 287, 318, 348]
    const bare = midMonth.map((day) => (index[day] ?? 0) < 0.5)
    expect(bare.slice(5, 10)).toEqual([true, true, true, true, true])
    expect(bare[0]).toBe(false)
    expect(bare[11]).toBe(false)
  })

  it('keeps a drawn tree at that same site in leaf through the dry season, being watered', () => {
    const series = syntheticYear({
      meanC: 33,
      diurnalC: 6,
      dewDepressionAt: (dayOfYear) => (dayOfYear >= 151 && dayOfYear < 304 ? 30 : 2),
    })
    expect(leafOnMonthsFor(siteAt(10), series)).toEqual(new Array(12).fill(true))
  })

  it('never puts a site in leaf whose minimum never rises above -2 C', () => {
    const series = syntheticYear({ meanC: -10 })
    const months = leafOnMonthsFor(siteAt(60), series)
    expect(months).toEqual(new Array(12).fill(false))
  })
})
