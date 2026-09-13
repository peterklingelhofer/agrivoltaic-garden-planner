import { beforeEach, describe, expect, it } from 'bun:test'
import { DEFAULT_COMPATIBILITY_WEIGHTS } from '../recommend/compatibility'
import type { CropId } from '../types/ids'
import type { Fraction } from '../types/units'
import { makeArray } from './defaults'
import { seedRankedStore } from './testkit'
import { resetAppStore, useAppStore } from './store'

const BLUEBERRY = 'blueberry' as CropId

const suggestions = () => {
  const state = useAppStore.getState().suggestions
  expect(state.status).toBe('ready')
  if (state.status !== 'ready') throw new Error('no suggestions')
  return state.value
}

const cropsSuggested = (): readonly string[] => [
  ...new Set(suggestions().suggestions.flatMap((entry) => entry.cropIds.map((id) => id as string))),
]

beforeEach(async () => {
  resetAppStore()
  await seedRankedStore()
})

describe('preferences are the request', () => {
  it('starts with none and refuses to invent an anchor', () => {
    expect(useAppStore.getState().preferences.entries).toEqual([])
    useAppStore.getState().suggest()
    expect(suggestions().anchorCropIds).toEqual([])
  })

  it('turns a require into the anchor every suggestion is built around', () => {
    useAppStore.getState().setPreference(BLUEBERRY, 'require')
    useAppStore.getState().suggest()
    expect(suggestions().anchorCropIds).toEqual([BLUEBERRY])
    for (const suggestion of suggestions().suggestions) {
      expect(suggestion.cropIds).toContain(BLUEBERRY)
    }
  })

  it('replaces a kind rather than stacking two entries on one crop', () => {
    const store = useAppStore.getState()
    store.setPreference(BLUEBERRY, 'prefer')
    store.setPreference(BLUEBERRY, 'avoid')
    const entries = useAppStore.getState().preferences.entries
    expect(entries).toHaveLength(1)
    expect(entries[0]?.kind).toBe('avoid')
  })

  it('clears a crop when the kind is null and keeps the weight when it is not', () => {
    const store = useAppStore.getState()
    store.setPreference(BLUEBERRY, 'prefer')
    store.setPreferenceWeight(BLUEBERRY, 0.25 as Fraction)
    store.setPreference(BLUEBERRY, 'avoid')
    expect(useAppStore.getState().preferences.entries[0]?.weight).toBe(0.25)
    useAppStore.getState().setPreference(BLUEBERRY, null)
    expect(useAppStore.getState().preferences.entries).toEqual([])
  })

  it('removes an excluded crop from every suggestion instead of down-weighting it', () => {
    useAppStore.getState().setPreference(BLUEBERRY, 'require')
    useAppStore.getState().suggest()
    const victim = cropsSuggested().find((cropId) => cropId !== 'blueberry')
    expect(victim).toBeDefined()
    if (victim === undefined) return
    useAppStore.getState().setPreference(victim as CropId, 'exclude')
    useAppStore.getState().suggest()
    expect(cropsSuggested()).not.toContain(victim)
  })

  it('feeds the ranking pipeline the same preferred list, so one object drives both', () => {
    useAppStore.getState().setPreference(BLUEBERRY, 'prefer')
    expect(useAppStore.getState().preferences.entries.map((entry) => entry.kind)).toEqual([
      'prefer',
    ])
    useAppStore.getState().clearPreferences()
    expect(useAppStore.getState().preferences.entries).toEqual([])
    expect(useAppStore.getState().suggestions.status).toBe('idle')
  })
})

describe('the advanced controls are wired to the engine, not to a display', () => {
  it('carries a compatibility weight of zero through to the term contribution', () => {
    useAppStore.getState().setPreference(BLUEBERRY, 'require')
    useAppStore.getState().suggest()
    const before = suggestions()
      .suggestions.flatMap((entry) => entry.pairs)
      .flatMap((pair) => pair.terms)
      .filter((term) => term.kind === 'soil-ph')
    expect(before.length).toBeGreaterThan(0)
    expect(before.some((term) => term.contribution !== 0)).toBe(true)

    useAppStore.getState().setCompatibilityWeight('soil-ph', 0)
    useAppStore.getState().suggest()
    const after = suggestions()
      .suggestions.flatMap((entry) => entry.pairs)
      .flatMap((pair) => pair.terms)
      .filter((term) => term.kind === 'soil-ph')
    expect(after.length).toBeGreaterThan(0)
    for (const term of after) expect(term.contribution).toBe(0)
  })

  it('restores the documented defaults on reset', () => {
    useAppStore.getState().setCompatibilityWeight('allelopathy', 0.9)
    expect(useAppStore.getState().compatibilityWeights.allelopathy).toBe(0.9)
    useAppStore.getState().resetCompatibilityWeights()
    expect(useAppStore.getState().compatibilityWeights).toEqual(DEFAULT_COMPATIBILITY_WEIGHTS)
  })

  it('caps a combination at the crop count the advanced control names', () => {
    useAppStore.getState().setPreference(BLUEBERRY, 'require')
    useAppStore.getState().setMaxCropsPerBed(2)
    useAppStore.getState().suggest()
    for (const suggestion of suggestions().suggestions) {
      expect(suggestion.cropIds.length).toBeLessThanOrEqual(2)
    }
  })

  it('moves influence without letting it become a constraint', () => {
    useAppStore.getState().setPreferenceInfluence(0.9 as Fraction)
    expect(useAppStore.getState().preferences.influence).toBe(0.9)
  })
})

describe('applying a suggestion writes plantings through addPlanting', () => {
  it('places one planting per allocation and reports whatever it refused', () => {
    useAppStore.getState().setPreference(BLUEBERRY, 'require')
    useAppStore.getState().suggest()
    const [best] = suggestions().suggestions
    expect(best).toBeDefined()
    if (best === undefined) return
    const before = useAppStore.getState().plot?.beds[0]?.plantings.length ?? 0
    expect(before).toBe(0)

    useAppStore.getState().applySuggestion(best)
    const after = useAppStore.getState().plot?.beds[0]?.plantings ?? []
    const refused = useAppStore.getState().planRefusals
    expect(after.length + refused.length).toBe(best.space.allocations.length)
    expect(after.length).toBeGreaterThan(0)
    for (const planting of after) {
      expect(planting.bedId).toBe(best.bedId)
      expect(best.cropIds).toContain(planting.cropId)
      const allocation = best.space.allocations.find((entry) => entry.cropId === planting.cropId)
      expect(planting.plantCount).toBe(allocation?.plantCount)
    }
  })

  it('is idempotent, because a repeated apply replaces by planting id', () => {
    useAppStore.getState().setPreference(BLUEBERRY, 'require')
    useAppStore.getState().suggest()
    const [best] = suggestions().suggestions
    if (best === undefined) throw new Error('no suggestion')
    useAppStore.getState().applySuggestion(best)
    const once = useAppStore.getState().plot?.beds[0]?.plantings.length ?? 0
    useAppStore.getState().applySuggestion(best)
    expect(useAppStore.getState().plot?.beds[0]?.plantings.length).toBe(once)
  })
})

describe('refusing to run beats running on invented inputs', () => {
  it('refuses without a ranking and says what is missing', () => {
    resetAppStore()
    useAppStore.getState().suggest()
    const state = useAppStore.getState().suggestions
    expect(state.status).toBe('error')
    if (state.status === 'error') expect(state.message.length).toBeGreaterThan(0)
  })

  it('refuses without an electricity term rather than assuming one, where there are panels', () => {
    const plot = useAppStore.getState().plot
    if (plot === null) throw new Error('no plot')
    useAppStore.setState({ energy: { status: 'idle' }, plot: { ...plot, arrays: [makeArray(1)] } })
    useAppStore.getState().suggest()
    const state = useAppStore.getState().suggestions
    expect(state.status).toBe('error')
    if (state.status === 'error') expect(state.message).toMatch(/land equivalent ratio/)
  })

  /**
   * With no panels there is no electricity, and the term is a zero band rather than a missing
   * one: the search's own no-array control scores on the same, and a garden with no panels is
   * still a garden that can be planted
   */
  it('scores a plot with no panels on a zero electricity term rather than refusing', () => {
    useAppStore.setState({ energy: { status: 'idle' } })
    expect(useAppStore.getState().plot?.arrays).toEqual([])
    useAppStore.getState().suggest()
    const state = useAppStore.getState().suggestions
    expect(state.status).toBe('ready')
    if (state.status !== 'ready') return
    expect(state.value.suggestions.length).toBeGreaterThan(0)
    expect(state.value.suggestions[0]?.ler.electricity.interval.upper).toBe(0)
  })
})
