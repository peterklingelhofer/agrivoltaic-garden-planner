import { describe, expect, it } from 'bun:test'
import { looksUnmetered, MODEL_DOWNLOAD_MB } from './connection'

/**
 * The rule that decides whether 45 MB is spent without being asked for.
 *
 * Written as a table because the interesting cases are the ones where the browser says nothing.
 * Not knowing has to mean asking: `navigator.connection` is Chromium-only, so "assume it is fine"
 * would silently spend the data of every iPhone on the network
 */
describe('when it is fair to download without asking', () => {
  it('takes only an affirmative fast, unmetered connection', () => {
    expect(looksUnmetered({ effectiveType: '4g', saveData: false })).toBe(true)
    expect(looksUnmetered({ effectiveType: '4g' })).toBe(true)
  })

  it('asks when the browser says nothing at all', () => {
    expect(looksUnmetered(undefined)).toBe(false)
    expect(looksUnmetered(null)).toBe(false)
    expect(looksUnmetered({})).toBe(false)
  })

  it('asks when data is being saved, however fast the connection is', () => {
    expect(looksUnmetered({ effectiveType: '4g', saveData: true })).toBe(false)
  })

  it('asks on anything slower, where 45 MB is a quarter of an hour', () => {
    for (const effectiveType of ['3g', '2g', 'slow-2g']) {
      expect(looksUnmetered({ effectiveType }), effectiveType).toBe(false)
    }
  })

  it('states the size once, so the words and the docs cannot drift', () => {
    expect(MODEL_DOWNLOAD_MB).toBe(45)
  })
})
