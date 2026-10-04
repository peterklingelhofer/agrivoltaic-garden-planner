import { beforeEach, describe, expect, it } from 'bun:test'
import { siteFixture } from '../recommend/testkit'
import { makePlot } from '../state/defaults'
import { polygonOf, rectangleOf, rectangleRing } from '../state/geom'
import { ready } from '../state/slices'
import { getAppState, resetAppStore, useAppStore } from '../state/store'
import { banded, interval } from '../types/band'
import type { ComplianceCheck } from '../types/compliance'
import type { House } from '../types/garden'
import { obstructionId } from '../types/ids'
import { meters } from '../types/units'
import type { Fraction } from '../types/units'
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
      footprint: polygonOf(rectangleRing(size.center, size.widthM + 1, size.depthM + 1)),
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

const regime = (id: ComplianceCheck['regime']['id']): ComplianceCheck['regime'] => ({
  id,
  label: id,
  verifiability: 'estimate-only',
  determinationBarrier: 'the program decides',
  citations: [] as unknown as ComplianceCheck['regime']['citations'],
})

/** A Massachusetts check with no criteria, and a rule judged on field yield with one estimate */
const CHECKS: readonly ComplianceCheck[] = [
  {
    regime: regime('us-ma-smart'),
    results: [],
    overall: 'meets-expedited-parameters',
    isDetermination: false,
  },
  {
    regime: regime('de-din-spec-91434'),
    results: [
      {
        criterion: { key: 'reference-yield', label: 'Reference yield', thresholdText: '66%' },
        outcome: 'estimate',
        estimated: banded(
          interval(0.5 as Fraction, 0.9 as Fraction),
          0.8,
          'confidence',
          'crop-response',
          [],
        ),
        threshold: 0.66,
        unit: 'fraction',
        requiresFieldAgronomy: true,
        disclaimer: '',
      },
    ],
    overall: 'indeterminate',
    isDetermination: false,
  },
]

describe('what a rule card shows', () => {
  it('says its barrier once on each card, and carries no badge on any card', async () => {
    useAppStore.setState({ compliance: CHECKS })
    const harness = await mount(<CompliancePanel />)
    for (const check of CHECKS) {
      const text = harness.get(`item-compliance-${check.regime.id}`).textContent ?? ''
      expect(text.split(check.regime.determinationBarrier).length - 1, check.regime.id).toBe(1)
    }
    expect(harness.container.querySelector('[data-testid^="badge-compliance-"]')).toBeNull()
    // an estimate with no disclaimer of its own draws no line for one
    expect(harness.get('item-criterion-reference-yield').querySelector('.disclaimer')).toBeNull()
    await harness.unmount()
  })

  it("tells a garden outside Massachusetts the rule isn't its own, without naming the place", async () => {
    useAppStore.setState({ site: ready({ ...siteFixture(), botanicalArea: 'NWJ' }) })
    const harness = await mount(<CompliancePanel />)
    const note = harness.get('readout-compliance-elsewhere').textContent ?? ''
    expect(note).toMatch(/^This garden isn't in Massachusetts/)
    expect(note).not.toContain(getAppState().locationLabel)
    await harness.unmount()
  })
})
