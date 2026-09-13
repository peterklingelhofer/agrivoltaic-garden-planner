import { describe, expect, it } from 'bun:test'
import type { TmySeries } from '../types/weather'
import { seriesOffsetMinutesAt, standardOffsetHours, utcOffsetMinutesAt } from './timezone'

/** Only the two fields the clock reads; the rest of a series is not what is under test */
const fixed = { utcOffsetHours: -5 } as TmySeries

describe('the offset a zone keeps at an instant', () => {
  it('follows daylight saving in New York', () => {
    expect(utcOffsetMinutesAt('America/New_York', Date.UTC(2024, 0, 15, 12))).toBe(-300)
    expect(utcOffsetMinutesAt('America/New_York', Date.UTC(2024, 6, 15, 12))).toBe(-240)
  })

  it('keeps the half hour Kolkata has and the longitude rule loses', () => {
    expect(utcOffsetMinutesAt('Asia/Kolkata', Date.UTC(2024, 0, 15))).toBe(330)
    expect(utcOffsetMinutesAt('Asia/Kolkata', Date.UTC(2024, 6, 15))).toBe(330)
  })

  it('reads the day the clocks change per instant rather than off the cached day', () => {
    // 10 March 2024, 07:00 UTC is 02:00 EST becoming 03:00 EDT
    expect(utcOffsetMinutesAt('America/New_York', Date.UTC(2024, 2, 10, 6))).toBe(-300)
    expect(utcOffsetMinutesAt('America/New_York', Date.UTC(2024, 2, 10, 8))).toBe(-240)
  })

  it('reads the longitude fallback zone with its inverted sign', () => {
    expect(utcOffsetMinutesAt('Etc/GMT+5', Date.UTC(2024, 6, 1))).toBe(-300)
  })

  it('answers with the fallback for a zone name it does not know', () => {
    expect(utcOffsetMinutesAt('Nowhere/Invalid', Date.UTC(2024, 0, 1), -300)).toBe(-300)
    expect(utcOffsetMinutesAt('', Date.UTC(2024, 0, 1), 90)).toBe(90)
  })
})

describe('the standard offset of a zone', () => {
  it('is the winter offset north and south, and the half hour where there is one', () => {
    expect(standardOffsetHours('America/New_York', 0)).toBe(-5)
    expect(standardOffsetHours('Australia/Sydney', 0)).toBe(10)
    expect(standardOffsetHours('Asia/Kolkata', 0)).toBe(5.5)
  })

  it('is the fallback for a zone it does not know', () => {
    expect(standardOffsetHours('Nowhere/Invalid', -7)).toBe(-7)
  })
})

describe('the clock a weather series runs on', () => {
  it('is the fixed offset where the series names no zone, and the zone where it does', () => {
    const july = Date.UTC(2024, 6, 15, 12)
    expect(seriesOffsetMinutesAt(fixed, july)).toBe(-300)
    expect(seriesOffsetMinutesAt({ ...fixed, timezone: 'America/New_York' }, july)).toBe(-240)
    expect(seriesOffsetMinutesAt({ ...fixed, timezone: 'Nowhere/Invalid' }, july)).toBe(-300)
  })
})
