import { act } from 'react'
import { beforeEach, describe, expect, it } from 'bun:test'
import { getAppState, resetAppStore } from '../state/store'
import { millimetersPerYear } from '../types/units'
import { GroundPanel } from './BedPanel'
import { mount, type Harness } from './testkit'

/**
 * The bed panel's Irrigation select once wrote the method alone, and the rules read a separate
 * flag, so a bed set to None stayed watered as far as the ranking knew. This drives the real
 * select and reads the bed the store holds
 */
beforeEach(() => {
  localStorage.clear()
  resetAppStore()
})

const choose = async (harness: Harness, value: string): Promise<void> => {
  const target = harness.get('control-bed-irrigation') as HTMLSelectElement
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  setter?.call(target, value)
  await act(async () => {
    target.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

const irrigationNow = () => {
  const bed = getAppState().plot?.beds[0]
  if (bed === undefined) throw new Error('no bed')
  return bed.irrigation
}

describe('the bed panel irrigation select', () => {
  it('moves the flag and the depth with the method', async () => {
    const harness = await mount(<GroundPanel />)
    const bed = getAppState().plot?.beds[0]
    if (bed === undefined) throw new Error('no bed to test against')
    await act(async () => {
      getAppState().selectBed(bed.id)
    })
    expect(irrigationNow()).toEqual({ method: 'drip', available: true, appliedMmPerYear: 180 })

    await choose(harness, 'none')
    expect(irrigationNow()).toEqual({ method: 'none', available: false, appliedMmPerYear: 0 })

    // coming off "none" (depth 0) gets the default depth back
    await choose(harness, 'sprinkler')
    expect(irrigationNow()).toEqual({ method: 'sprinkler', available: true, appliedMmPerYear: 180 })

    // a bed that had its own depth keeps it when the method changes between watered ones
    await act(async () => {
      const current = getAppState().plot?.beds[0]
      if (current === undefined) throw new Error('no bed')
      getAppState().upsertBed({
        ...current,
        irrigation: { method: 'drip', available: true, appliedMmPerYear: millimetersPerYear(300) },
      })
    })
    await choose(harness, 'flood')
    expect(irrigationNow()).toEqual({ method: 'flood', available: true, appliedMmPerYear: 300 })

    await choose(harness, 'none')
    expect(irrigationNow()).toEqual({ method: 'none', available: false, appliedMmPerYear: 0 })
    await harness.unmount()
  })
})
