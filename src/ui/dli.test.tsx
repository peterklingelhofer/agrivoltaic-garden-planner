import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { vi } from '../../test/vi'
import { loadCompanionRules, loadRotationConstraints } from '../data/companions'
import { loadCropCatalog } from '../data/crops'
import { runRecommendationPipeline } from '../recommend/pipeline'
import { bedFixture, bedLightFixture, plotFixture, siteFixture } from '../recommend/testkit'
import { DEFAULT_WEIGHTS } from '../recommend/stages/rank'
import { ready } from '../state/slices'
import { resetAppStore, useAppStore } from '../state/store'
import cslEntries from '../../docs/CITATIONS.csl.json'
import { bedId, cropId } from '../types/ids'
import { dayOfYear } from '../types/units'
import type { Crop } from '../types/crop'
import type { CropRecommendation, LimitingFactorKind } from '../types/recommend'
import { CalendarTimeline } from './CalendarTimeline'
import { DliEvidenceLink, DliEvidenceNote, DliEvidencePanel } from './DliEvidence'
import {
  DLI_CALIBRATION,
  DLI_DISCLOSURE,
  DLI_HEADLINE,
  DLI_STANDFIRST,
  RUNKLE_ATTRIBUTION,
  RUNKLE_CITED,
  RUNKLE_CITEKEY_GAP,
  RUNKLE_QUOTE,
  THRESHOLD_LABEL,
  dliEvidence,
  dliThresholdKind,
} from './dli'
import { RankingSection } from './RecommendationPanel'
import { mount } from './testkit'

const cropBy = (catalog: readonly Crop[], id: string): Crop => {
  const found = catalog.find((crop) => String(crop.id) === id)
  if (found === undefined) throw new Error(`no crop ${id}`)
  return found
}

describe('the DLI threshold a crop was gated on names its own evidence', () => {
  it('maps every light-gate cause and refuses every other one', () => {
    const causes: readonly (readonly [LimitingFactorKind, string | null])[] = [
      [{ kind: 'dli-minimum', month: 6 }, 'minimum'],
      [{ kind: 'dli-disorder-ceiling', month: 7 }, 'disorder-ceiling'],
      [{ kind: 'max-design-rsr' }, 'max-design-rsr'],
      [{ kind: 'hardiness' }, null],
      [{ kind: 'chill' }, null],
      [{ kind: 'water' }, null],
    ]
    for (const [cause, expected] of causes) {
      expect(dliThresholdKind(cause), cause.kind).toBe(expected)
    }
    expect(Object.keys(THRESHOLD_LABEL).sort()).toEqual([
      'disorder-ceiling',
      'max-design-rsr',
      'minimum',
    ])
  })

  it('marks a tree-fruit minimum as a class-level inference, not a measurement', async () => {
    const catalog = await loadCropCatalog()
    const evidence = dliEvidence(cropBy(catalog, 'apple'), 'minimum')
    expect(evidence).not.toBeNull()
    expect(evidence?.tier).toBe('C')
    expect(evidence?.provenance).toBe('inferred')
    expect(evidence?.classInference).toBe(true)
    expect(evidence?.summary).toContain('class-level inference')
    expect(evidence?.summary).toContain('no cited work measured it for this crop')
    expect(evidence?.citations.length).toBeGreaterThan(0)
    // FAO ECOCROP holds no DLI values, so no tree fruit may cite it for one
    expect(evidence?.citations).not.toContain('fao-ecocrop')
  })

  it('distinguishes a measured threshold from an inferred one on primitives', async () => {
    const catalog = await loadCropCatalog()
    const measured = dliEvidence(cropBy(catalog, 'lettuce-leaf'), 'minimum')
    const inferred = dliEvidence(cropBy(catalog, 'apple'), 'minimum')
    expect(measured?.classInference).toBe(false)
    expect(measured?.provenance).toBe('verbatim')
    expect(measured?.tier).toBe('A')
    expect(measured?.summary).toContain('Tier A')
    expect(measured?.summary).not.toBe(inferred?.summary)
    expect(measured?.tier).not.toBe(inferred?.tier)
  })

  it('reports an unsourced ceiling as unsourced and a missing one as absent', async () => {
    const catalog = await loadCropCatalog()
    const ceiling = dliEvidence(cropBy(catalog, 'lettuce-leaf'), 'disorder-ceiling')
    expect(ceiling?.tier).toBeNull()
    expect(ceiling?.provenance).toBe('unsourced')
    expect(ceiling?.summary).toContain('has no source among the works listed in Sources')
    expect(dliEvidence(cropBy(catalog, 'apple'), 'disorder-ceiling')).toBeNull()
  })

  it('renders every DLI class in the catalog rather than only the ones tests name', async () => {
    const catalog = await loadCropCatalog()
    const kinds = new Set(
      catalog.map((crop) => dliEvidence(crop, 'minimum')?.provenance ?? 'missing'),
    )
    expect(kinds.has('inferred')).toBe(true)
    expect(kinds.has('missing')).toBe(false)
    for (const crop of catalog) {
      const rsr = dliEvidence(crop, 'max-design-rsr')
      expect(rsr?.citations.length ?? 0, String(crop.id)).toBeGreaterThan(0)
    }
  })
})

describe('the DLI disclosure states the limitation without overstating it', () => {
  it('names the crops with no published figure and the transplant scope', () => {
    const text = DLI_DISCLOSURE.map((point) => `${point.heading} ${point.body}`).join(' ')
    for (const crop of ['apple', 'pear', 'sweet cherry', 'apricot', 'watermelon', 'pumpkin']) {
      expect(text, crop).toContain(crop)
    }
    expect(text).toContain('Twelve of eighteen')
    expect(text).toContain('raising seedlings (plugs) in a greenhouse')
    expect(text).toContain('Tier C')
    expect(DLI_HEADLINE).toContain('only a guide')
    expect(DLI_STANDFIRST).toContain('provisional')
  })

  it('keeps the calibration: the ordinal claim survives the caveats', () => {
    const text = `${DLI_STANDFIRST} ${DLI_CALIBRATION}`
    expect(text).toContain('ordering')
    expect(DLI_CALIBRATION).toContain('the evidence supports the crop ordering')
    expect(DLI_DISCLOSURE.map((point) => point.id)).toContain('ordinal-holds')
  })

  it('quotes Runkle and cites the Runkle work the corpus actually holds', () => {
    const corpus = new Set((cslEntries as readonly { readonly id: string }[]).map((e) => e.id))
    expect(RUNKLE_QUOTE).toBe('In my opinion, there is no such thing as a DLI requirement')
    expect(RUNKLE_ATTRIBUTION).toContain('Runkle')
    expect(corpus.has(RUNKLE_CITED)).toBe(true)
    // the quoted column has no citekey, so the disclosure has to say so rather than borrow one
    expect(RUNKLE_CITEKEY_GAP).toContain('no citekey')
  })
})

describe('the disclosure and the inline note render', () => {
  beforeEach(() => {
    resetAppStore()
    vi.stubGlobal('fetch', () => new Promise(() => undefined))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('publishes the disclosure as a findable panel', async () => {
    const harness = await mount(<DliEvidencePanel />)
    expect(harness.find('panel-dli-evidence')).not.toBeNull()
    expect(harness.get('readout-dli-evidence-runkle').textContent).toContain(RUNKLE_QUOTE)
    expect(harness.all('item-dli-evidence-ordinal-holds').length).toBe(1)
    expect(harness.get('list-dli-evidence').children.length).toBe(DLI_DISCLOSURE.length)
    expect(harness.get('readout-dli-evidence-calibration').textContent).toContain(
      'the evidence supports the crop ordering',
    )
    // grade D/E belong to the folklore panel alone
    expect(harness.container.querySelectorAll('[data-grade]').length).toBe(0)
    await harness.unmount()
  })

  it('reaches the disclosure from the Plants tab', async () => {
    const harness = await mount(<DliEvidenceLink />)
    expect(harness.get('panel-dli-evidence-inline').textContent).toContain(DLI_HEADLINE)
    await harness.click('action-dli-evidence-open')
    expect(useAppStore.getState().sidebarStep).toBe('sources')
    await harness.unmount()
  })

  it('gives an inferred threshold different markup from a measured one', async () => {
    const catalog = await loadCropCatalog()
    const inferred = dliEvidence(cropBy(catalog, 'apple'), 'minimum')
    const measured = dliEvidence(cropBy(catalog, 'lettuce-leaf'), 'minimum')
    expect(inferred).not.toBeNull()
    expect(measured).not.toBeNull()
    const harness = await mount(
      <>
        <DliEvidenceNote evidence={inferred!} subjectId="apple" prefix="recommendation" />
        <DliEvidenceNote evidence={measured!} subjectId="lettuce-leaf" prefix="recommendation" />
      </>,
    )
    const a = harness.get('readout-recommendation-dli-evidence-apple')
    const b = harness.get('readout-recommendation-dli-evidence-lettuce-leaf')
    expect(a.getAttribute('data-class-inference')).toBe('true')
    expect(b.getAttribute('data-class-inference')).toBe('false')
    expect(a.getAttribute('data-tier')).toBe('C')
    expect(b.getAttribute('data-tier')).toBe('A')
    expect(harness.get('badge-recommendation-dli-tier-apple').textContent).toContain('provisional')
    expect(a.textContent).not.toBe(b.textContent)
    await harness.unmount()
  })
})

const dliLimited = (item: CropRecommendation): boolean =>
  item.outcome.verdict !== 'recommended' && dliThresholdKind(item.outcome.limiting.cause) !== null

describe('a crop held back by light says which threshold held it', () => {
  beforeEach(() => {
    resetAppStore()
    vi.stubGlobal('fetch', () => new Promise(() => undefined))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the evidence tier beside the limiting factor in the ranking', async () => {
    const [catalog, companionRules, rotationConstraints] = await Promise.all([
      loadCropCatalog(),
      loadCompanionRules(),
      loadRotationConstraints(),
    ])
    const bed = bedFixture('bed-1')
    const sets = runRecommendationPipeline({
      site: siteFixture(),
      plot: plotFixture([bed]),
      bedLight: [bedLightFixture('bed-1', 0.55)],
      catalog,
      companionRules,
      rotationConstraints,
      frostPercentile: 50,
      weights: DEFAULT_WEIGHTS,
      preferredCropIds: [],
    })
    const first = sets[0]
    expect(first).toBeDefined()
    const gated = first!.ranked.filter(dliLimited).slice(0, 4)
    expect(gated.length).toBeGreaterThan(0)

    useAppStore.setState({
      catalog: ready(catalog),
      sets: ready([{ ...first!, ranked: gated }]),
    })
    const harness = await mount(<RankingSection />)
    for (const item of gated) {
      const note = harness.get(`readout-recommendation-dli-evidence-${item.cropId}`)
      expect(['A', 'B', 'C', 'none'], String(item.cropId)).toContain(note.getAttribute('data-tier'))
      expect(note.textContent?.length ?? 0).toBeGreaterThan(20)
    }
    await harness.unmount()
  })

  it('says the same thing at the calendar light gate', async () => {
    const catalog = await loadCropCatalog()
    useAppStore.setState({ catalog: ready(catalog) })
    const harness = await mount(
      <CalendarTimeline
        calendars={[
          {
            bedId: bedId('bed-1'),
            entries: [
              {
                cropId: cropId('apple'),
                plantings: [],
                harvest: {
                  start: dayOfYear(200),
                  end: dayOfYear(220),
                  basis: { kind: 'catalog-window' },
                },
                successions: [],
                feasibility: { kind: 'light-limited', month: 6 },
                frostRiskPercentile: 50,
                notes: [],
              },
            ],
          },
        ]}
      />,
    )
    const note = harness.get('readout-calendar-dli-evidence-apple')
    expect(note.getAttribute('data-class-inference')).toBe('true')
    expect(note.getAttribute('data-tier')).toBe('C')
    expect(harness.find('badge-calendar-dli-tier-apple')).not.toBeNull()
    await harness.unmount()
  })
})
