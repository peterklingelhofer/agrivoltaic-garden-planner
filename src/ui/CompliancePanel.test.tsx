import { beforeEach, describe, expect, it } from 'bun:test'
import { makePlot } from '../state/defaults'
import { polygonOf, rectangleOf, rectangleRing } from '../state/geom'
import { resetAppStore, useAppStore } from '../state/store'
import type { House } from '../types/garden'
import { obstructionId } from '../types/ids'
import { meters } from '../types/units'
import { CompliancePanel } from './CompliancePanel'
import { mount } from './testkit'

beforeEach(() => {
  resetAppStore()
})

/**
 * A hand placement that overlaps a house is never blocked (a drag is never blocked), but the
 * check step says so in plain words, above the regulatory regimes below it
 */
describe('the check step names a bed drawn through a house', () => {
  it('reads a sentence for a bed standing inside a house, above the regime results', async () => {
    const plot = makePlot()
    const bed = plot.beds[0]
    if (bed === undefined) throw new Error('the fixture plot carries no bed')
    const size = rectangleOf(bed.footprint.exterior)
    if (size === null) throw new Error('the fixture bed is always a rectangle')
    const house: House = {
      id: obstructionId('house-1'),
      kind: 'house',
      label: 'House 1',
      footprint: polygonOf(rectangleRing(size.centre, size.widthM + 1, size.depthM + 1)),
      heightM: meters(6),
    }
    useAppStore.setState({ plot: { ...plot, obstructions: [house] } })
    const harness = await mount(<CompliancePanel />)
    const notice = harness.get('readout-check-overlap-0')
    expect(notice.textContent).toBe(
      `${bed.label} stands inside ${house.label}. The light check reads no light under its roof.`,
    )
    await harness.unmount()
  })

  it('says nothing when nothing on the plot overlaps a house', async () => {
    useAppStore.setState({ plot: makePlot() })
    const harness = await mount(<CompliancePanel />)
    expect(harness.find('readout-check-overlap-0')).toBeNull()
    await harness.unmount()
  })
})
