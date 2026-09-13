import { act } from 'react'
import { beforeEach, describe, expect, it } from 'bun:test'
import { getAppState, resetAppStore, useAppStore } from '../state/store'
import { seedRankedStore } from '../state/testkit'
import { BedLightPanel } from './BedLightPanel'
import { mount } from './testkit'

/**
 * The live figures, on the step that works them out.
 *
 * The layout cards and the guided plan card print the three figures a bed is placed by as snapshots
 * of the layout search. This panel reads `bedLight`, which every run rewrites
 */
beforeEach(async () => {
  resetAppStore()
  await seedRankedStore()
})

describe('light in each bed', () => {
  it('lists every bed with the light the editor holds for it', async () => {
    const harness = await mount(<BedLightPanel />)
    const bed = getAppState().plot?.beds[0]
    expect(bed).toBeDefined()
    expect(harness.get('list-bed-light')).not.toBeNull()
    const dli = harness.get(`readout-bed-light-dli-${String(bed?.id)}`).textContent ?? ''
    expect(dli).toMatch(/mol\/m²\/d/)
    const shade = harness.get(`readout-bed-light-shade-${String(bed?.id)}`).textContent ?? ''
    expect(shade).toMatch(/^\d+%$/)
    // the seeded light is the layout search's, and the source line says so
    expect(harness.get('readout-bed-light-source').textContent).toMatch(/quick run/)
    await harness.unmount()
  })

  it("says to run the light check while there's no light to read", async () => {
    const harness = await mount(<BedLightPanel />)
    await act(async () => {
      useAppStore.setState({ bedLight: [] })
    })
    expect(harness.get('status-bed-light').textContent).toMatch(/Run the light check/)
    expect(harness.find('list-bed-light')).toBeNull()
    await harness.unmount()
  })
})
