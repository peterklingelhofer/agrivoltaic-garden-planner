import { act } from 'react'
import { beforeEach, describe, expect, it } from 'bun:test'
import { makeBed } from '../state/defaults'
import { isRectangle, metresBetween, polygonOf, rectangleRing, vec2 } from '../state/geom'
import { getAppState, resetAppStore } from '../state/store'
import type { Bed } from '../types/garden'
import { BedSizeFields, MIN_BED_M } from './BedSizeFields'
import { mount } from './testkit'

beforeEach(() => {
  resetAppStore()
})

const stored = (bed: Bed): Bed => {
  const found = getAppState().plot?.beds.find((entry) => entry.id === bed.id)
  if (found === undefined) throw new Error('bed gone')
  return found
}

const sides = (bed: Bed): readonly [number, number] => {
  const [a, b, c] = bed.footprint.exterior
  if (a === undefined || b === undefined || c === undefined) throw new Error('four corners')
  return [metresBetween(a, b), metresBetween(b, c)]
}

describe('a rectangular bed sized by two numbers', () => {
  it('shows the bed as it is and resizes it about its own middle', async () => {
    const bed = makeBed(1, { footprint: polygonOf(rectangleRing(vec2(4, -2), 8, 1.4)) })
    await act(async () => getAppState().upsertBed(bed))
    const harness = await mount(<BedSizeFields bed={stored(bed)} />)
    expect((harness.get('control-bed-width') as HTMLInputElement).value).toBe('8')
    expect((harness.get('control-bed-length') as HTMLInputElement).value).toBe('1.4')
    await harness.type('control-bed-length', '2')
    const after = stored(bed)
    expect(sides(after)).toEqual([8, 2])
    expect(isRectangle(after.footprint.exterior)).toBe(true)
    expect(after.footprint.exterior[0]).toEqual(vec2(0, -3))
    expect(after.areaM2).toBeCloseTo(16, 6)
  })

  it('keeps a turned bed turned', async () => {
    const bed = makeBed(1, { footprint: polygonOf(rectangleRing(vec2(0, 0), 6, 1, 30)) })
    await act(async () => getAppState().upsertBed(bed))
    const harness = await mount(<BedSizeFields bed={stored(bed)} />)
    await harness.type('control-bed-width', '3')
    const [a, b] = stored(bed).footprint.exterior
    if (a === undefined || b === undefined) throw new Error('four corners')
    expect(Math.atan2(b.yM - a.yM, b.xM - a.xM)).toBeCloseTo(Math.PI / 6, 9)
    expect(sides(stored(bed))[0]).toBeCloseTo(3, 9)
  })

  it('holds a bed between a hand-width and the plot', async () => {
    const bed = makeBed(1, { footprint: polygonOf(rectangleRing(vec2(0, 0), 8, 1.4)) })
    await act(async () => getAppState().upsertBed(bed))
    const harness = await mount(<BedSizeFields bed={stored(bed)} />)
    await harness.type('control-bed-length', '0.05')
    expect(sides(stored(bed))[1]).toBeCloseTo(MIN_BED_M, 9)
    // the default plot is 32 by 24, so nothing wider than 32 m
    await harness.type('control-bed-width', '900')
    expect(sides(stored(bed))[0]).toBeCloseTo(32, 9)
  })

  /**
   * A bed's own precision is a hundredth of a metre, finer than the tenth every length field
   * settled on when the unit switch was added: folding it onto one decimal would round 1.25 to
   * 1.3, and the browser could flag 1.25 as a step mismatch against a step of 0.1. The display
   * check lives in plot-size.test.tsx, where the bed is read live off the store and a typed value
   * actually re-renders. Mounted alone here, `bed` is a fixed prop and never does
   */
  it('keeps a typed hundredth of a metre in the stored geometry, 1.25 m included', async () => {
    const bed = makeBed(1, { footprint: polygonOf(rectangleRing(vec2(0, 0), 8, 1.4)) })
    await act(async () => getAppState().upsertBed(bed))
    const harness = await mount(<BedSizeFields bed={stored(bed)} />)
    await harness.type('control-bed-width', '1.25')
    expect(sides(stored(bed))[0]).toBeCloseTo(1.25, 9)
    await harness.unmount()
  })

  it('shows nothing for a bed drawn by hand', async () => {
    const bed = makeBed(1, {
      footprint: polygonOf([vec2(0, 0), vec2(8, 0), vec2(9, 5), vec2(2, 6), vec2(-1, 3)]),
    })
    await act(async () => getAppState().upsertBed(bed))
    const harness = await mount(<BedSizeFields bed={stored(bed)} />)
    expect(harness.find('control-bed-width')).toBeNull()
    expect(harness.find('control-bed-length')).toBeNull()
  })
})
