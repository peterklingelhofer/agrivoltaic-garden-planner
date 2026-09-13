import { describe, expect, it } from 'bun:test'
import { localClock, localDateLabel, localMinutesOfDay, zoneLabel } from './local-clock'

describe('the clock on the wall where the garden is', () => {
  // 14:54 UTC on 2026-09-06
  const instant = Date.UTC(2026, 8, 6, 14, 54)

  it('shifts a UTC instant by the site offset and wraps past midnight', () => {
    expect(localClock(instant, -5)).toBe('09:54')
    expect(localClock(instant, 0)).toBe('14:54')
    expect(localClock(instant, 10)).toBe('00:54')
    expect(localMinutesOfDay(instant, 10)).toBe(54)
  })

  it('names the zone when one is known, with the offset the clock keeps at that instant', () => {
    expect(zoneLabel(-4, 'America/New_York')).toBe('local time in America/New_York, UTC-4')
    expect(zoneLabel(5.5, 'Asia/Kolkata')).toBe('local time in Asia/Kolkata, UTC+5.5')
  })

  it('names the offset and that there is no daylight saving in it', () => {
    expect(zoneLabel(-5)).toBe('local time, UTC-5, no daylight saving')
    expect(zoneLabel(0)).toBe('local time, UTC+0, no daylight saving')
  })

  it('dates the day on the same wall clock', () => {
    // 01:30 UTC on 7 September is still the evening of the 6th in New England
    const late = Date.UTC(2026, 8, 7, 1, 30)
    expect(localDateLabel(late, -5)).toBe('2026-09-06')
    expect(localDateLabel(late, 0)).toBe('2026-09-07')
  })
})
