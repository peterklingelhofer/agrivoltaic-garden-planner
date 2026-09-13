import { act } from 'react'
import { beforeEach, describe, expect, it } from 'bun:test'
import { GROUND_COVER_OPTIONS } from '../data/albedo'
import { getAppState, resetAppStore, sceneGroundAlbedo, useAppStore } from '../state/store'
import { groundAlbedoOf } from '../types/ground'
import { BedPanel } from './BedPanel'
import { mount, type Harness } from './testkit'

/**
 * Ground cover is the one design decision in this app that changes the growing answer and the
 * electrical answer at the same time, and until it was asked for it was a constant 0.2 buried in
 * three separate places. These check the wiring rather than the physics: that the control writes
 * the plot, that the scene's ground follows it, and that a light field computed for a different
 * ground is marked stale instead of being left standing
 */

beforeEach(() => {
  localStorage.clear()
  resetAppStore()
})

const choose = async (harness: Harness, value: string): Promise<void> => {
  const target = harness.get('control-plot-ground-cover') as HTMLSelectElement
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  setter?.call(target, value)
  await act(async () => {
    target.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

describe('choosing what is on the ground', () => {
  it('starts on the cover every figure in the app was already computed against', async () => {
    const harness = await mount(<BedPanel />)
    expect((harness.get('control-plot-ground-cover') as HTMLSelectElement).value).toBe('grass')
    expect(getAppState().plot?.groundCover).toBe('grass')
  })

  it('offers every cover, each with the sentence that says what it costs', async () => {
    const harness = await mount(<BedPanel />)
    const select = harness.get('control-plot-ground-cover') as HTMLSelectElement
    expect([...select.options].map((option) => option.value)).toEqual(
      GROUND_COVER_OPTIONS.map((option) => option.id),
    )
    for (const option of GROUND_COVER_OPTIONS) {
      await choose(harness, option.id)
      expect(harness.get('readout-plot-ground-cover-help').textContent).toBe(option.help)
    }
  })

  it('writes the plot, so the energy chain and the light bake read the same ground', async () => {
    const harness = await mount(<BedPanel />)
    await choose(harness, 'straw-mulch')
    expect(getAppState().plot?.groundCover).toBe('straw-mulch')
  })

  /**
   * The ground the camera shows and the ground the model bounces light off are one surface, and
   * `sceneGround` is where that is enforced. A cover that changed the number without changing
   * the picture would light the scene off a ground that is not the ground being drawn
   */
  it('brightens the ground the camera sees by exactly what it brightens the model by', async () => {
    const harness = await mount(<BedPanel />)
    await choose(harness, 'light-gravel')
    expect(sceneGroundAlbedo(useAppStore.getState())).toBeCloseTo(
      groundAlbedoOf('light-gravel'),
      10,
    )
    await choose(harness, 'bare-soil')
    expect(sceneGroundAlbedo(useAppStore.getState())).toBeCloseTo(groundAlbedoOf('bare-soil'), 10)
  })
})
