import { describe, expect, it } from 'bun:test'
import { clamp, degreesToRadians } from './math'

describe('clamp', () => {
  it('keeps values within range unchanged', () => {
    expect(clamp(5, 0, 10)).toBe(5)
  })

  it('clamps values above the max', () => {
    expect(clamp(15, 0, 10)).toBe(10)
  })

  it('clamps values below the min', () => {
    expect(clamp(-5, 0, 10)).toBe(0)
  })
})

describe('degreesToRadians', () => {
  it('converts 180 degrees to pi radians', () => {
    expect(degreesToRadians(180)).toBeCloseTo(Math.PI)
  })
})
