import { beforeEach, describe, expect, it } from 'bun:test'
import { bedLightFixture } from '../recommend/testkit'
import { getAppState, resetAppStore, useAppStore } from '../state/store'
import type { BedLight } from '../types/light'
import { BedPanel } from './BedPanel'
import { mount } from './testkit'

/**
 * The reading exists and is tested in `src/recommend/frost.test.ts`. What these check is that it
 * reaches a grower at all, and that the caveat travels with it: a shelter claim shown without the
 * "no temperature, no shifted date, and chill goes DOWN" line beside it is the reading most
 * likely to be misused
 */

beforeEach(() => {
  localStorage.clear()
  resetAppStore()
})

const withBedLight = (skyViewFactor: number): void => {
  const bed = getAppState().plot?.beds[0]
  if (bed === undefined) throw new Error('no bed')
  const light: BedLight = {
    ...bedLightFixture(bed.id, 1 - skyViewFactor),
    bedId: bed.id,
    skyViewFactor: skyViewFactor as never,
  }
  useAppStore.setState({ bedLight: [light] })
}

describe('what the bed says about frost', () => {
  it('says nothing at all until the light has been computed', async () => {
    const harness = await mount(<BedPanel />)
    expect(harness.find('readout-bed-frost-shelter')).toBeNull()
    expect(harness.get('readout-bed-sky-view').textContent).toContain('run the simulation')
  })

  it('prints the share of sky the bed can see, once there is a field to read it from', async () => {
    withBedLight(0.55)
    const harness = await mount(<BedPanel />)
    expect(harness.get('readout-bed-sky-view').textContent).toContain('55%')
  })

  it('names the shelter and carries the caveat with it, under a panel', async () => {
    withBedLight(0.55)
    const harness = await mount(<BedPanel />)
    const note = harness.get('readout-bed-frost-shelter')
    expect(note.dataset.shelter).toBe('sheltered')
    expect(note.textContent).toMatch(/frost cloth/i)
    expect(harness.get('readout-bed-frost-caveat').textContent).toMatch(/chill/i)
    expect(harness.get('badge-bed-frost-shelter').dataset.tier).toBe('C')
  })

  it('claims nothing for a bed in the open, and offers no caveat it does not need', async () => {
    withBedLight(0.98)
    const harness = await mount(<BedPanel />)
    const note = harness.get('readout-bed-frost-shelter')
    expect(note.dataset.shelter).toBe('open')
    expect(note.textContent).toMatch(/open ground/i)
    expect(harness.find('readout-bed-frost-caveat')).toBeNull()
  })
})
