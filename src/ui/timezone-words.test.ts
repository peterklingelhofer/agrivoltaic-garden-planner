import { describe, expect, it } from 'bun:test'
import { timezoneWords } from './timezone-words'

describe('the timezone readout', () => {
  it('prints an IANA name as it is', () => {
    expect(timezoneWords('Australia/Melbourne')).toBe('Australia/Melbourne')
    expect(timezoneWords('Asia/Kolkata')).toBe('Asia/Kolkata')
  })

  it('turns the longitude fallback into the offset it means, sign the everyday way round', () => {
    expect(timezoneWords('Etc/GMT-10')).toBe(
      'UTC+10, computed from the longitude; daylight saving not known',
    )
    expect(timezoneWords('Etc/GMT+5')).toBe(
      'UTC-5, computed from the longitude; daylight saving not known',
    )
    expect(timezoneWords('Etc/GMT')).toBe(
      'UTC, computed from the longitude; daylight saving not known',
    )
  })
})
