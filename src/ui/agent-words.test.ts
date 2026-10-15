import { describe, expect, it } from 'bun:test'
import { wordsFor } from './agent-words'
import { formatLength } from './format'

/**
 * A resize is said in the unit the design is kept in, and the light's state is said as it is:
 * `useAutoLight` computes it again by itself unless auto-run is off
 */
describe('the words for a resized plot', () => {
  it('prints the sides in feet when the design is in feet, rounded', () => {
    const lines = wordsFor(
      {
        kind: 'resized',
        widthM: 12.192,
        depthM: 12.192,
        fromAreaM2: null,
        unit: 'ft',
        recomputing: true,
      },
      [],
    )
    expect(lines[0]?.text).toMatch(/^The plot is 40(\.0)? ft by 40(\.0)? ft now\.$/)
    expect(lines[1]?.text).toBe('The light is being computed again for the new shape.')
  })

  it('names the area a square came from, and calls the light stale only when auto-run is off', () => {
    const lines = wordsFor(
      {
        kind: 'resized',
        widthM: 4.31,
        depthM: 4.31,
        fromAreaM2: 18.58,
        unit: 'ft',
        recomputing: false,
      },
      [],
    )
    expect(lines[0]?.text).toMatch(/^200 sq ft is about 14(\.1)? ft by 14(\.1)? ft, a square/)
    expect(lines[1]?.tone).toBe('caveat')
  })

  it('keeps meters when the design is in meters', () => {
    const lines = wordsFor(
      { kind: 'resized', widthM: 6, depthM: 4, fromAreaM2: null, unit: 'm', recomputing: true },
      [],
    )
    // the app's own meter formatter, two decimals under ten, so one rule prints every length
    expect(lines[0]?.text).toBe(
      `The plot is ${formatLength(6, 'm')} by ${formatLength(4, 'm')} now.`,
    )
  })
})
