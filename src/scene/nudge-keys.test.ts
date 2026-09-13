import { act, createElement } from 'react'
import { beforeEach, describe, expect, it } from 'bun:test'
import { makeArray, makeBed } from '../state/defaults'
import { polygonOf, rectangleRing, vec2 } from '../state/geom'
import { getAppState, resetAppStore } from '../state/store'
import { mount } from '../ui/testkit'
import { NUDGE_M, SHIFT_NUDGE_M, useNudgeKeys } from './useGroundDrag'

/*
  A `.test.ts` beside the scene's `.test.tsx` files on purpose: the scene half of the suite runs
  without a DOM and the DOM half skips `scene/*.test.tsx`, and this hook listens on `window`
*/

const Keys = (): null => {
  useNudgeKeys()
  return null
}

const press = async (
  key: string,
  init: KeyboardEventInit = {},
  target: EventTarget = window,
): Promise<void> => {
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
    )
  })
}

const corner = (): { readonly xM: number; readonly yM: number } => {
  const point = getAppState().plot?.beds[0]?.footprint.exterior[0]
  if (point === undefined) throw new Error('no bed')
  return point
}

beforeEach(() => {
  resetAppStore()
  getAppState().upsertBed(makeBed(1, { footprint: polygonOf(rectangleRing(vec2(0, 0), 4, 2)) }))
})

describe('moving the selected thing with the arrow keys', () => {
  it('nudges a bed 0.1 m east, west, north and south in Move mode, 1 m with Shift', async () => {
    getAppState().setMode('move')
    getAppState().selectBed(getAppState().plot?.beds[0]?.id ?? null)
    const harness = await mount(createElement(Keys))
    const start = corner()
    await press('ArrowRight')
    expect(corner().xM).toBeCloseTo(start.xM + NUDGE_M, 9)
    await press('ArrowUp')
    expect(corner().yM).toBeCloseTo(start.yM + NUDGE_M, 9)
    await press('ArrowLeft', { shiftKey: true })
    expect(corner().xM).toBeCloseTo(start.xM + NUDGE_M - SHIFT_NUDGE_M, 9)
    await press('ArrowDown', { shiftKey: true })
    expect(corner().yM).toBeCloseTo(start.yM + NUDGE_M - SHIFT_NUDGE_M, 9)
    await harness.unmount()
  })

  it('nudges a selected row of panels by its origin', async () => {
    getAppState().upsertArray(makeArray(1))
    getAppState().setMode('move')
    const arrayId = getAppState().plot?.arrays[0]?.id ?? null
    getAppState().selectArray(arrayId)
    const harness = await mount(createElement(Keys))
    const before = getAppState().plot?.arrays[0]?.geometry.originM
    await press('ArrowUp')
    const after = getAppState().plot?.arrays[0]?.geometry.originM
    expect(after?.yM).toBeCloseTo((before?.yM ?? 0) + NUDGE_M, 9)
    expect(after?.xM).toBeCloseTo(before?.xM ?? 0, 9)
    await harness.unmount()
  })

  it('does nothing outside Move mode, with nothing selected, or from inside a field', async () => {
    getAppState().selectBed(getAppState().plot?.beds[0]?.id ?? null)
    const harness = await mount(createElement(Keys))
    const start = corner()
    await press('ArrowRight')
    expect(corner()).toEqual(start)

    await act(async () => {
      getAppState().setMode('move')
      getAppState().selectBed(null)
    })
    await press('ArrowRight')
    expect(corner()).toEqual(start)

    await act(async () => getAppState().selectBed(getAppState().plot?.beds[0]?.id ?? null))
    const field = document.createElement('input')
    document.body.append(field)
    await press('ArrowRight', {}, field)
    expect(corner()).toEqual(start)
    field.remove()
    await harness.unmount()
  })
})
