import { beforeEach, describe, expect, it } from 'bun:test'
import { resetAppStore, useAppStore } from '../state/store'
import { seedRankedStore } from '../state/testkit'
import type { CropId } from '../types/ids'
import type { SuggestionRefusal } from '../types/polyculture'
import { PlantsPanel } from './PlantsPanel'
import { groupRefusals, plainWhy, refusalCause, suggestionHeadline } from './polyculture'
import { mount, type Harness } from './testkit'

/**
 * The combinations and the preferences that shape them, on the plants step: the chips say what
 * you like, the "More choices" fold carries must-have and never, and the combinations for the
 * selected bed follow every change without a press
 */

const BLUEBERRY = 'blueberry' as CropId

const refusal = (over: Partial<SuggestionRefusal> = {}): SuggestionRefusal => ({
  cropId: 'aronia' as CropId,
  reason: 'aronia optimizes at pH 6.0 to 7.2 and blueberry optimizes at pH 4.5 to 5.5',
  conflictsWithCropId: BLUEBERRY,
  limiting: null,
  termKind: 'soil-ph',
  ...over,
})

/** The step with every food crop's chip on show, so a crop is found by name whatever its rank */
const open = async (): Promise<Harness> => {
  const harness = await mount(<PlantsPanel />)
  if (harness.find('control-plants-likes-all') !== null) {
    await harness.click('control-plants-likes-all')
  }
  return harness
}

/** Marks blueberry as a must-have through the chip a user would click. The combinations follow */
const anchorOnBlueberry = async (harness: Harness): Promise<void> => {
  await harness.click(`control-polyculture-kind-${BLUEBERRY}-require`)
}

beforeEach(async () => {
  resetAppStore()
  await seedRankedStore()
})

describe('the preference picker', () => {
  it('offers a chip for the easy kinds and keeps the two hard ones in the fold', async () => {
    const harness = await open()
    const row = harness.get(`item-polyculture-preference-${BLUEBERRY}`)
    expect(row.dataset.kind).toBe('none')
    expect(harness.find(`control-plants-like-${BLUEBERRY}`)).not.toBeNull()
    const fold = harness.get('details-plants-more')
    for (const kind of ['require', 'exclude']) {
      expect(fold.contains(harness.get(`control-polyculture-kind-${BLUEBERRY}-${kind}`))).toBe(true)
    }
    for (const kind of ['prefer', 'avoid']) {
      expect(harness.find(`control-polyculture-kind-${BLUEBERRY}-${kind}`)).toBeNull()
    }
    const legend = harness.get('readout-polyculture-kinds').textContent ?? ''
    expect(legend).toContain('Must have')
    expect(legend).toContain('Removed from every suggestion outright')
    await harness.unmount()
  })

  it('writes the kind into the store and marks the chip pressed', async () => {
    const harness = await open()
    await harness.click(`control-polyculture-kind-${BLUEBERRY}-require`)
    expect(useAppStore.getState().preferences.entries).toEqual([
      { cropId: BLUEBERRY, kind: 'require', weight: 1 },
    ])
    const chip = harness.get(`control-polyculture-kind-${BLUEBERRY}-require`)
    expect(chip.getAttribute('aria-pressed')).toBe('true')
    expect(chip.className).toContain('pref-chip-active')
    expect(harness.get(`item-polyculture-preference-${BLUEBERRY}`).dataset.kind).toBe('require')
    await harness.unmount()
  })

  it('clears the crop when the pressed chip is clicked again', async () => {
    const harness = await open()
    await harness.click(`control-polyculture-kind-${BLUEBERRY}-require`)
    await harness.click(`control-polyculture-kind-${BLUEBERRY}-require`)
    expect(useAppStore.getState().preferences.entries).toEqual([])
    await harness.unmount()
  })

  it('keeps the deep controls folded and the weights out of the novice path', async () => {
    const harness = await open()
    const more = harness.get('details-plants-more') as HTMLDetailsElement
    expect(more.open).toBe(false)
    expect(more.contains(harness.get('control-polyculture-influence'))).toBe(true)
    expect(more.contains(harness.get('control-polyculture-weight-soil-ph'))).toBe(true)
    await harness.unmount()
  })
})

describe('the advanced controls reach the engine', () => {
  it('moves a compatibility weight into the store', async () => {
    const harness = await open()
    await harness.type('control-polyculture-weight-soil-ph', '0')
    expect(useAppStore.getState().compatibilityWeights['soil-ph']).toBe(0)
    await harness.click('action-polyculture-reset-weights')
    expect(useAppStore.getState().compatibilityWeights['soil-ph']).toBeGreaterThan(0)
    await harness.unmount()
  })

  it('moves the influence a preference is allowed to carry', async () => {
    const harness = await open()
    await harness.type('control-polyculture-influence', '0.9')
    expect(useAppStore.getState().preferences.influence).toBe(0.9)
    await harness.unmount()
  })

  it('offers a strength slider only for the kinds that carry one', async () => {
    const harness = await open()
    await harness.click(`control-polyculture-kind-${BLUEBERRY}-require`)
    expect(harness.find(`control-polyculture-strength-${BLUEBERRY}`)).toBeNull()
    // a press on the chip moves a must-have on to avoid, which leans the ranking and so carries a
    // strength
    await harness.click(`control-plants-like-${BLUEBERRY}`)
    expect(useAppStore.getState().preferences.entries[0]?.kind).toBe('avoid')
    await harness.type(`control-polyculture-strength-${BLUEBERRY}`, '0.4')
    expect(useAppStore.getState().preferences.entries[0]?.weight).toBe(0.4)
    await harness.unmount()
  })
})

/**
 * Provenance travels with use.
 *
 * Where a rule is applied, the card names it and the people it came from. Pointing at another step
 * for who the rules belong to would file a named people's practice under citations while the
 * practice itself is being applied to somebody's garden. `polyculture-risk-spreading` is pushed
 * onto every suggestion the engine makes, so any seeded suggestion exercises this
 */
describe("a traditional rule is credited where it's applied", () => {
  it('names the peoples and the missing endorsement on the card, not the slug', async () => {
    const harness = await open()
    await anchorOnBlueberry(harness)
    const credit = harness.get('readout-polyculture-tek-0')
    const said = credit.textContent ?? ''
    // the rule's own title rather than its key, and the people it came from
    expect(said).not.toMatch(/polyculture-risk-spreading/)
    expect(said).toMatch(/from the .+\(/)
    // the caveat is the point: nobody was asked, and that is said here rather than three steps away
    expect(said).toContain("Community endorsement wasn't sought")
    expect(
      harness.container.querySelectorAll('[data-testid^="item-polyculture-tek-0-"]').length,
    ).toBeGreaterThan(0)
    await harness.unmount()
  })
})

describe('the suggestion results read as advice first', () => {
  it('leads with crops, plant counts and whether it fits, and never a point yield', async () => {
    const harness = await open()
    await anchorOnBlueberry(harness)
    const headline = harness.get('readout-polyculture-headline-0').textContent ?? ''
    expect(headline).toContain('blueberry')
    expect(headline).toMatch(/\d+ plants/)
    expect(headline).toMatch(/fits your \d+\.\d m² bed/)
    // the ratio is next to it and is a band, both bounds rendered
    expect(harness.get('readout-polyculture-ler-0').textContent).toMatch(/^[\d.]+ to [\d.]+$/)
    expect(harness.get('readout-polyculture-ler-basis-0').textContent).toContain('interval')
    expect(harness.get('badge-polyculture-confidence-0').dataset.band).toBeDefined()
    expect(harness.get('readout-polyculture-tiers-0').textContent).toContain('canopy tier')
    expect(harness.get('readout-polyculture-space-0').textContent).toContain('m² bed')
    await harness.unmount()
  })

  it('expands into the per-term breakdown with verdicts, grades and citations', async () => {
    const harness = await open()
    await anchorOnBlueberry(harness)
    const terms = harness.container.querySelectorAll<HTMLElement>(
      '[data-testid^="item-polyculture-0-term-"]',
    )
    expect(terms.length).toBeGreaterThan(0)
    const kinds = new Set([...terms].map((node) => node.dataset.term))
    expect(kinds.has('soil-ph')).toBe(true)
    expect(kinds.has('light-overtopping')).toBe(true)
    for (const node of terms) {
      expect(node.dataset.verdict).toBeDefined()
      const text = node.textContent ?? ''
      expect(text).toMatch(
        node.dataset.scores === 'true' ? /scored, moves this pair by/ : /no effect on the score/,
      )
    }
    await harness.unmount()
  })

  it('never renders a grade D or E claim, only a count and where it lives', async () => {
    const harness = await open()
    await anchorOnBlueberry(harness)
    const grades = [...harness.container.querySelectorAll<HTMLElement>('[data-grade]')].map(
      (node) => node.dataset.grade,
    )
    expect(grades.length).toBeGreaterThan(0)
    expect(grades).not.toContain('D')
    expect(grades).not.toContain('E')
    for (const node of harness.container.querySelectorAll<HTMLElement>('.term-folklore')) {
      expect(node.textContent).toContain('Folklore panel')
    }
    await harness.unmount()
  })

  it('labels an unscorable term as shown-not-scored rather than hiding it', async () => {
    const harness = await open()
    await anchorOnBlueberry(harness)
    const unscored = [...harness.container.querySelectorAll<HTMLElement>('[data-scores="false"]')]
    for (const node of unscored) expect(node.textContent).toContain('no effect on the score')
    await harness.unmount()
  })
})

describe('refusals are the feature', () => {
  it('groups them by cause and names the pH conflict in prose', async () => {
    const harness = await open()
    await anchorOnBlueberry(harness)
    const group = harness.get('item-polyculture-refusal-group-soil-ph')
    expect(Number(group.dataset.count)).toBeGreaterThan(1)
    expect(harness.get('readout-polyculture-refusal-count').textContent).toMatch(
      /\d+ crop\(s\) were refused/,
    )
    const rows = group.querySelectorAll<HTMLElement>('[data-testid^="item-polyculture-refusal-"]')
    expect(rows.length).toBeGreaterThan(0)
    expect([...rows].some((node) => (node.textContent ?? '').includes('optimizes at pH'))).toBe(
      true,
    )
    await harness.unmount()
  })

  it("sorts a site-level refusal above a pairing one, because it's the harder no", () => {
    const groups = groupRefusals([
      refusal(),
      refusal({
        cropId: 'kale' as CropId,
        reason: 'excluded here',
        limiting: {
          stage: 'soil-water',
          cause: { kind: 'soil-ph' },
          membership: 0,
          explanation: 'x',
        } as SuggestionRefusal['limiting'],
      }),
    ])
    expect(groups.map((group) => group.cause)).toEqual(['site', 'soil-ph'])
  })

  it('reads each cause off the term that refused, not off its wording', () => {
    expect(refusalCause(refusal({ termKind: 'soil-ph' }))).toBe('soil-ph')
    expect(refusalCause(refusal({ termKind: 'light-overtopping' }))).toBe('light')
    expect(refusalCause(refusal({ termKind: 'shared-pest-or-pathogen' }))).toBe('shared-pest')
    expect(refusalCause(refusal({ termKind: 'root-stratification' }))).toBe('other')
    expect(refusalCause(refusal({ termKind: null }))).toBe('other')
  })

  it('groups a site refusal ahead of any term', () => {
    const limiting = { stage: 'climate-gate', membership: 0, explanation: 'too cold' }
    expect(refusalCause(refusal({ termKind: 'soil-ph', limiting: limiting as never }))).toBe('site')
  })

  /**
   * The one limiting factor a design causes rather than the site. A crop refused because the
   * panels shade it past its own ceiling would grow here fine with nothing over it, so reading
   * it as "this bed can't grow it" describes the wrong problem and hides the only part
   * the grower can act on
   */
  it('calls a light-gate refusal light, not a site one', () => {
    const limiting = (kind: string) =>
      ({ stage: 'light-gate', cause: { kind }, membership: 0, explanation: 'x' }) as never
    expect(refusalCause(refusal({ limiting: limiting('max-design-rsr') }))).toBe('light')
    expect(refusalCause(refusal({ limiting: limiting('dli-minimum') }))).toBe('light')
    expect(refusalCause(refusal({ limiting: limiting('dli-disorder-ceiling') }))).toBe('light')
    // and everything else a limiting factor names is still the harder no
    expect(refusalCause(refusal({ limiting: limiting('hardiness') }))).toBe('site')
    expect(refusalCause(refusal({ limiting: limiting('water') }))).toBe('site')
  })

  // the grouping reads the term kind, so a copy edit can't silently regroup the panel
  it('is unmoved by rewording an explanation', () => {
    const reworded = refusal({ termKind: 'soil-ph', reason: "acidity can't be reconciled" })
    expect(refusalCause(reworded)).toBe('soil-ph')
  })
})

describe('applying a suggestion', () => {
  it('places it in the bed and says so under the press', async () => {
    const harness = await open()
    await anchorOnBlueberry(harness)
    expect(harness.find('status-polyculture-applied-0')).toBeNull()
    await harness.click('action-polyculture-apply-0')
    const plantings = useAppStore.getState().plot?.beds[0]?.plantings ?? []
    expect(plantings.length).toBeGreaterThan(0)
    const outcome = harness.get('status-polyculture-applied-0')
    expect(outcome.textContent).toContain('Planted in')
    expect(Number(outcome.dataset.planted)).toBe(plantings.length)
    await harness.unmount()
  })
})

describe('the combinations follow the preferences without a press', () => {
  it('asks again when a must-have is set, and the anchors line says so', async () => {
    const harness = await open()
    expect(harness.find('action-polyculture-suggest')).toBeNull()
    expect(harness.get('readout-polyculture-anchors').textContent).toContain('for this bed')
    await anchorOnBlueberry(harness)
    expect(harness.get('readout-polyculture-anchors').textContent).toContain('blueberry')
    await harness.unmount()
  })
})

/**
 * The plain paragraph at the top of "Why these go together" is read off what the terms found
 * (kind and verdict) alone, since their prose is written in the register of its evidence.
 * A caution the score wasn't allowed to count (an inferred light threshold) is still something
 * to watch, so it's named
 */
describe('the plain case for a combination', () => {
  const crops = [
    ['tomato', 1.8],
    ['clover', 0.3],
  ] as const
  const catalog = crops.map(
    ([id, heightM]) =>
      ({
        id,
        taxonomy: { commonNames: [id] },
        footprint: { heightM: { typicalM: heightM } },
      }) as unknown as Parameters<typeof plainWhy>[0][number],
  )
  const term = (
    kind: string,
    verdict: string,
    scores = true,
    grade: string | null = 'B',
  ): Record<string, unknown> => ({ kind, verdict, scores, grade, explanation: 'evidence prose' })
  const suggestion = (terms: readonly Record<string, unknown>[]): Parameters<typeof plainWhy>[1] =>
    ({ pairs: [{ cropIds: ['tomato', 'clover'], terms }] }) as unknown as Parameters<
      typeof plainWhy
    >[1]

  it('says what speaks for it and what to watch, taller crop named as the shade', () => {
    const why = plainWhy(
      catalog,
      suggestion([
        term('root-stratification', 'benefit'),
        term('canopy-tier', 'benefit'),
        term('light-overtopping', 'caution', false, 'C'),
        term('water-regime', 'caution'),
      ]),
    )
    expect(why).toBe(
      'What speaks for it: their roots reach different depths and they stand at different heights, so they share the light. To watch: tomato will shade clover some and tomato and clover want different watering.',
    )
    expect(why).not.toContain('evidence prose')
  })

  it("leaves out folklore and a benefit that didn't score, and says so when nothing is left", () => {
    expect(
      plainWhy(
        catalog,
        suggestion([
          term('documented-companion', 'benefit', false, 'D'),
          term('soil-ph', 'benefit', false, 'C'),
        ]),
      ),
    ).toBe('Nothing in the evidence speaks against growing these together.')
  })
})

describe('the headline is prose, not a table', () => {
  // a small fixture rather than the real catalog, so the assertion is about the joining, whatever common name the catalog happens to carry for these ids today
  const catalogFixture = ['blueberry', 'teaberry', 'apple'].map(
    (id) =>
      ({ id, taxonomy: { commonNames: [id] } }) as unknown as Parameters<
        typeof suggestionHeadline
      >[0][number],
  )

  it('joins two crops and two counts the way a person would say them', () => {
    expect(
      suggestionHeadline(catalogFixture, {
        cropIds: ['blueberry', 'teaberry'],
        fits: true,
        space: {
          bedAreaM2: 12,
          allocations: [{ plantCount: 3 }, { plantCount: 54 }],
          shortfallM2: 0,
        },
      } as unknown as Parameters<typeof suggestionHeadline>[1]),
    ).toBe('blueberry and teaberry, about 3 and 50 plants, fits your 12.0 m² bed')
  })

  // exact while every count is small: "about" is only said when a figure was rounded
  it("says the counts exactly while they're small", () => {
    expect(
      suggestionHeadline(catalogFixture, {
        cropIds: ['blueberry', 'teaberry'],
        fits: true,
        space: {
          bedAreaM2: 12,
          allocations: [{ plantCount: 3 }, { plantCount: 12 }],
          shortfallM2: 0,
        },
      } as unknown as Parameters<typeof suggestionHeadline>[1]),
    ).toBe('blueberry and teaberry, 3 and 12 plants, fits your 12.0 m² bed')
  })

  it("states the shortfall rather than trimming a combination that doesn't fit", () => {
    expect(
      suggestionHeadline(catalogFixture, {
        cropIds: ['apple'],
        fits: false,
        space: { bedAreaM2: 2, allocations: [], shortfallM2: 14.4 },
      } as unknown as Parameters<typeof suggestionHeadline>[1]),
    ).toBe('apple, needs 14.4 m² more than your 2.0 m² bed')
  })
})
