import { describe, expect, it } from 'bun:test'
import { calendarDate, dayLabel, dayOfYearFrom, daysInMonth, DAYS_IN_YEAR } from './calendar'

describe('a day of the year and the date it names are the same fact', () => {
  it('round-trips every day of the reference year', () => {
    for (let day = 1; day <= DAYS_IN_YEAR; day++) {
      const { month, date } = calendarDate(day)
      expect(dayOfYearFrom(month, date), dayLabel(day)).toBe(day)
    }
  })

  it('clamps into the month rather than rolling over into the next one', () => {
    // Date.UTC(2001, 1, 31) is 3 March; a gardener who picked 31 and then picked February
    // meant the end of February
    expect(dayOfYearFrom(2, 31)).toBe(dayOfYearFrom(2, 28))
    expect(dayLabel(dayOfYearFrom(2, 31))).toBe('28 Feb')
    expect(dayLabel(dayOfYearFrom(4, 31))).toBe('30 Apr')
  })

  it('knows how long each month of the reference year is', () => {
    expect([...Array(12)].map((_, i) => daysInMonth(i + 1))).toEqual([
      31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
    ])
  })
})
