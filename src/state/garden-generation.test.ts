import { beforeEach, describe, expect, it } from 'bun:test'
import { siteFixture } from '../recommend/testkit'
import { DEFAULT_MAX_CROPS_PER_BED } from '../recommend/suggest'
import type { Bed } from '../types/garden'
import type { CandidateArchetype } from '../types/onboarding'
import { cropsPerBedFor, OBJECTIVE_PRESETS } from './onboarding'
import { failed, ready } from './slices'
import { GENERATION_NEEDS_SITE, getAppState, resetAppStore, useAppStore } from './store'
import { designScenarioFixture as scenarioFor, scenarioSetFixture } from './testkit'

/**
 * Applying a scenario writes a plot, an array and beds with something growing in them, so a novice
 * doesn't have to find the recommendation panel, the polyculture panel and the apply action, per
 * bed, before the product does anything at all. Everything below drives the real pipeline: the real
 * catalog, the real ranking, the real calendar and the store's own `applySuggestion`, because a
 * second write path is exactly the thing this must not become
 */

const plantingsIn = (beds: readonly Bed[]): number =>
  beds.reduce((total, bed) => total + bed.plantings.length, 0)

const generate = async (archetype: CandidateArchetype = 'balanced'): Promise<void> => {
  await getAppState().applyDesign(scenarioFor(archetype))
}

beforeEach(() => {
  localStorage.clear()
  resetAppStore()
  useAppStore.setState({ site: ready(siteFixture()), autoRun: false })
})

describe('applying a scenario hands over a planted garden, not an empty one', () => {
  it('places the beds the light chose and puts something in them', async () => {
    await generate()
    const state = getAppState()
    const plot = state.plot
    expect(plot).not.toBeNull()
    expect(plot?.beds.length).toBe(scenarioFor('balanced').layout.beds.length)
    expect(plantingsIn(plot?.beds ?? [])).toBeGreaterThan(0)
    expect(state.generated?.plantingCount).toBe(plantingsIn(plot?.beds ?? []))
    expect(state.generated?.beds.map((bed) => bed.zone)).toEqual(['bright-gap', 'shaded-band'])
  })

  it('only plants what each bed own light admits, bed by bed', async () => {
    await generate()
    const state = getAppState()
    const sets = state.sets
    expect(sets.status).toBe('ready')
    if (sets.status !== 'ready') return
    let checked = 0
    for (const bed of state.plot?.beds ?? []) {
      const ranked = sets.value.find((entry) => entry.bedId === bed.id)?.ranked ?? []
      expect(ranked.length).toBeGreaterThan(0)
      for (const planting of bed.plantings) {
        const outcome = ranked.find((entry) => entry.cropId === planting.cropId)?.outcome
        expect(
          outcome,
          `${planting.cropId as string} was never ranked for ${bed.id as string}`,
        ).toBeDefined()
        expect(outcome?.verdict).not.toBe('excluded')
        checked += 1
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('carries the light each bed was placed in, rather than one plot average', async () => {
    await generate()
    const light = getAppState().bedLight
    expect(light.length).toBe(2)
    const rsr = light.map((entry) => entry.monthlyRsr[5] as number)
    expect(Math.max(...rsr)).toBeGreaterThan(Math.min(...rsr))
  })

  /**
   * The before-and-after for a generated garden. Every bed says what it got, and a shaded one also
   * says what standing there cost it, which is the whole reason one bed gets a shade-tolerant crop
   * and another two meters away doesn't
   */
  it('says what the shaded bed gave up against the brightest one in the same plot', async () => {
    await generate()
    const state = getAppState()
    const beds = state.generated?.beds ?? []
    expect(beds.length).toBe(2)
    const bright = beds.find((bed) => bed.zone === 'bright-gap')
    const shaded = beds.find((bed) => bed.zone === 'shaded-band')
    expect(bright?.lostToShade).toEqual([])
    expect(shaded?.lostToShade.length).toBeGreaterThan(0)

    const sets = state.sets
    if (sets.status !== 'ready') throw new Error('no ranking')
    const refusedIn = (bedId: string): ReadonlySet<string> =>
      new Set(
        (sets.value.find((entry) => (entry.bedId as string) === bedId)?.ranked ?? [])
          .filter(
            (entry) =>
              entry.outcome.verdict === 'excluded' && entry.outcome.limiting.stage === 'light-gate',
          )
          .map((entry) => entry.cropId as string),
      )
    const brightRefused = refusedIn(bright?.bedId as string)
    const shadedRefused = refusedIn(shaded?.bedId as string)
    for (const cropId of shaded?.lostToShade ?? []) {
      // refused here, allowed there: anything the site refuses outright is refused in both
      expect(shadedRefused.has(cropId as string)).toBe(true)
      expect(brightRefused.has(cropId as string)).toBe(false)
    }
  })

  /**
   * The claim the preview button makes is that it shows the garden the apply button writes. It's
   * only true while both are built by `plotForScenario`, so this is the test that keeps a second
   * implementation from creeping in
   */
  it('previews exactly the garden the apply then writes, geometry and beds alike', async () => {
    const scenario = scenarioFor('balanced')
    useAppStore.setState({
      onboarding: {
        ...getAppState().onboarding,
        designs: ready({ ...scenarioSetFixture(), scenarios: [scenario] }),
      },
    })

    getAppState().previewScenario('balanced')
    const previewed = getAppState().previewPlot
    expect(previewed).not.toBeNull()
    expect(getAppState().previewArchetype).toBe('balanced')
    // previewing commits nothing: the design on the store is untouched
    expect(getAppState().plot).not.toBe(previewed)

    await getAppState().applyDesign(scenario)
    const written = getAppState().plot
    expect(written?.arrays.map((a) => a.geometry)).toEqual(previewed?.arrays.map((a) => a.geometry))
    expect(written?.beds.map((b) => b.footprint)).toEqual(previewed?.beds.map((b) => b.footprint))
    // and the preview is dropped once it has been committed, so nothing draws it twice
    expect(getAppState().previewPlot).toBeNull()
    expect(getAppState().previewArchetype).toBeNull()
  })

  it("drops the preview without writing anything when it's dismissed", async () => {
    const before = getAppState().plot
    useAppStore.setState({
      onboarding: { ...getAppState().onboarding, designs: ready(scenarioSetFixture()) },
    })
    getAppState().previewScenario('energy-first')
    expect(getAppState().previewPlot).not.toBeNull()
    getAppState().previewScenario(null)
    expect(getAppState().previewPlot).toBeNull()
    expect(getAppState().plot).toBe(before)
  })

  /**
   * A preview is built from the answers it was raised against, so an answer that moves under it
   * leaves the scene drawing a garden nothing would now propose
   */
  it('drops a standing preview when an answer moves under it', () => {
    useAppStore.setState({
      onboarding: { ...getAppState().onboarding, designs: ready(scenarioSetFixture()) },
    })
    getAppState().previewScenario('energy-first')
    expect(getAppState().previewPlot).not.toBeNull()

    getAppState().answerOnboarding({ ambition: 'leafy-and-herbs' })
    expect(getAppState().previewPlot).toBeNull()
    expect(getAppState().previewArchetype).toBeNull()
  })

  it("isn't additive: generating twice lands the same garden, never a doubled one", async () => {
    await generate()
    const first = plantingsIn(getAppState().plot?.beds ?? [])
    expect(first).toBeGreaterThan(0)
    await generate()
    expect(plantingsIn(getAppState().plot?.beds ?? [])).toBe(first)
  })

  it('is reversible, and puts the plot back exactly as it stood', async () => {
    const before = getAppState().plot
    await generate()
    expect(getAppState().plot).not.toBe(before)
    getAppState().undoGeneration()
    const state = getAppState()
    expect(state.plot).toBe(before)
    expect(state.generated).toBeNull()
    expect(state.generationUndo).toBeNull()
    expect(state.bedLight).toEqual([])
    // an undone layout is no longer applied, so the app must stop saying otherwise
    expect(state.onboarding.appliedArchetype).toBeNull()
  })

  /**
   * If a second apply overwrote the undo slot with the first generated layout, undoing after
   * re-opening the wizard would land the grower on a garden they never drew. The undo target must
   * stay pinned to what they had before guided setup touched anything
   */
  it('keeps the pre-generation plot as the undo target across a second apply, not the first generated layout', async () => {
    const before = getAppState().plot
    await generate('balanced')
    const firstGenerated = getAppState().plot
    expect(firstGenerated).not.toBe(before)
    await generate('energy-first')
    expect(getAppState().plot).not.toBe(firstGenerated)
    getAppState().undoGeneration()
    expect(getAppState().plot).toBe(before)
  })
})

describe('nothing is dropped quietly', () => {
  it("states why the beds are empty when there's no site to rank against", async () => {
    useAppStore.setState({ site: failed('no site was resolved') })
    await generate()
    const generated = getAppState().generated
    expect(generated?.plantingCount).toBe(0)
    expect(generated?.layoutRefusals).toContain(GENERATION_NEEDS_SITE)
    expect(generated?.beds.length).toBe(2)
  })

  it('keeps the layout explanation with the generation, in the words the wizard showed', async () => {
    await generate()
    expect(getAppState().generated?.explanation).toBe(scenarioFor('balanced').layout.explanation)
  })
})

describe('the answers the grower gave are the ones it works to', () => {
  it('gates the water-limited pathway on whether the plot can be watered', async () => {
    getAppState().answerOnboarding({ irrigationAvailable: false })
    await generate()
    for (const bed of getAppState().plot?.beds ?? []) {
      expect(bed.irrigation.available).toBe(false)
      expect(bed.irrigation.method).toBe('none')
      expect(bed.irrigation.appliedMmPerYear).toBe(0)
    }
  })

  it('lets a preference for simplicity cap how many crops a bed carries', async () => {
    const simple = OBJECTIVE_PRESETS.find((preset) => preset.id === 'balanced')
    expect(simple).toBeDefined()
    expect(cropsPerBedFor({ food: 0, energy: 0, water: 0, simplicity: 1 })).toBe(1)
    expect(cropsPerBedFor({ food: 1, energy: 0, water: 0, simplicity: 0 })).toBe(
      DEFAULT_MAX_CROPS_PER_BED,
    )
    getAppState().answerOnboarding({
      objective: { food: 0, energy: 0, water: 0, simplicity: 1 },
    })
    await generate()
    for (const bed of getAppState().plot?.beds ?? []) {
      expect(bed.plantings.length).toBeLessThanOrEqual(1)
    }
  })
})

describe('a garden is more than one dish', () => {
  /**
   * Two beds in one even field rank the same crops in the same order, so taking the first
   * combination for both would plant the same three crops twice. The second bed takes the first
   * combination the first bed didn't, when one fits
   */
  it('gives beds that read the same light different combinations', async () => {
    await generate('no-array-control')
    const state = getAppState()
    const beds = state.plot?.beds ?? []
    expect(beds.length).toBe(2)
    const combos = beds.map((bed) =>
      bed.plantings
        .map((planting) => planting.cropId as string)
        .sort((a, b) => a.localeCompare(b))
        .join('+'),
    )
    const offered = state.generated?.suggestions.map((entry) => entry.set.suggestions.length) ?? []
    expect(Math.min(...offered)).toBeGreaterThan(1)
    expect(combos[0]).not.toBe(combos[1])
  })
})

/**
 * The ranking a generation plants from is the one it awaited. `useAutoRecommend` starts runs of its
 * own while a guided apply is in flight, and a later run wins the token. The earlier run then
 * writes nothing, and reading `sets` off the store afterward would read a ranking made for
 * whatever plot the later run was about. Bed ids are deterministic, so that wrong ranking would
 * plant without any error
 */
describe('the ranking a generation rests on', () => {
  it('returns the sets it computed, and writes them when nothing newer has started', async () => {
    await generate()
    const returned = await getAppState().recommend()
    expect(returned).not.toBeNull()
    expect(getAppState().sets.status).toBe('ready')
    if (getAppState().sets.status === 'ready' && returned !== null) {
      expect(getAppState().sets).toEqual(ready(returned))
    }
  })

  it('still hands a superseded run its own answer, and keeps the store for the newer one', async () => {
    await generate()
    const first = getAppState().recommend()
    const second = getAppState().recommend()
    const [older, newer] = await Promise.all([first, second])
    expect(older).not.toBeNull()
    expect(newer).not.toBeNull()
    if (newer === null) return
    expect(getAppState().sets).toEqual(ready(newer))
  })

  it("returns null rather than a ranking when there's no site to rank against", async () => {
    useAppStore.setState({ site: failed('no site was resolved') })
    expect(await getAppState().recommend()).toBeNull()
  })

  it('plants from the ranking it awaited even when a later run supersedes it', async () => {
    // the moment the generation's own ranking is in flight, a run started under it, the way
    // the auto-run does, wins the token and the generation's run writes nothing to the store
    let later: Promise<unknown> | null = null
    const unsubscribe = useAppStore.subscribe((state, previous) => {
      if (state.ranking && !previous.ranking && later === null) later = state.recommend()
    })
    await generate()
    unsubscribe()
    expect(later).not.toBeNull()
    await later
    const plot = getAppState().plot
    expect(plantingsIn(plot?.beds ?? [])).toBeGreaterThan(0)
    expect(getAppState().generated?.layoutRefusals).toEqual([])
  })
})
