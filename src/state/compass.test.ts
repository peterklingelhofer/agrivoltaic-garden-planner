import { describe, expect, it } from 'bun:test'
import { headingDeg } from './compass'

describe('headingDeg', () => {
  it('reads north as 0 when north is up on screen', () => {
    expect(headingDeg(0, -1)).toBeCloseTo(0, 9)
  })

  it('turns clockwise with the compass: east up is 90', () => {
    expect(headingDeg(1, 0)).toBeCloseTo(90, 9)
  })

  it('reads south as 180', () => {
    expect(headingDeg(0, 1)).toBeCloseTo(180, 9)
  })

  it('reads west as 270', () => {
    expect(headingDeg(-1, 0)).toBeCloseTo(270, 9)
  })

  it('guards a zero-length input rather than reporting south', () => {
    expect(headingDeg(0, 0)).toBe(0)
  })
})
