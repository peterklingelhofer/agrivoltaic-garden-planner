import { beforeEach, describe, expect, it } from 'bun:test'
import {
  bedFixture,
  bedLightFixture,
  frostFreeSiteFixture,
  plotFixture,
  siteFixture,
} from '../recommend/testkit'
import { makeArray } from './defaults'
import { ready } from './slices'
import {
  getAppState,
  PLANTED_AS_IT_STANDS,
  resetAppStore,
  SUGGESTION_NEEDS_ENERGY,
  useAppStore,
} from './store'

/**
 * "Plant every bed" plants the plot as it stands the way a guided apply does, through the same
 * code path, so the two can't plant differently. It replaces the optimizer, which put one crop
 * in every bed (Decision Record 10d), and it has to work on a plot with no panels at all, which
 * is the one plot the "No panels at all" card produces
 */

const combinationsOf = (): readonly string[] =>
  (getAppState().plot?.beds ?? []).map((bed) =>
    bed.plantings
      .map((planting) => planting.cropId as string)
      .sort((a, b) => a.localeCompare(b))
      .join('+'),
  )

/** Two beds reading the same light, with no panels over them: an even field, like the control */
const seedTwoBeds = (arrays = 0): void => {
  const beds = [bedFixture('bed-1'), bedFixture('bed-2')]
  const plot = plotFixture(beds)
  useAppStore.setState({
    autoRun: false,
    site: ready(siteFixture()),
    plot: { ...plot, arrays: Array.from({ length: arrays }, (_, index) => makeArray(index + 1)) },
    bedLight: beds.map((bed) => bedLightFixture(bed.id as string, 0)),
  })
}

beforeEach(() => {
  localStorage.clear()
  resetAppStore()
})

describe('planting every bed as the plot stands', () => {
  it('plants every bed, and records what it did with no layout behind it', async () => {
    seedTwoBeds()
    await getAppState().plantEveryBed()
    const state = getAppState()
    for (const bed of state.plot?.beds ?? []) {
      expect(bed.plantings.length, bed.id as string).toBeGreaterThan(0)
    }
    expect(state.generated?.archetype).toBeNull()
    expect(state.generated?.explanation).toBe(PLANTED_AS_IT_STANDS)
    expect(state.generated?.plotLostToShade).toEqual([])
    expect(state.generated?.beds.map((bed) => bed.bedId)).toEqual(['bed-1', 'bed-2'])
    expect(state.generated?.beds.every((bed) => bed.zone === 'even-light')).toBe(true)
    expect(state.generated?.plantingCount).toBe(
      (state.plot?.beds ?? []).reduce((total, bed) => total + bed.plantings.length, 0),
    )
  })

  /**
   * Pune: no frost in the record. An annual's calendar that read the curve's sentinel days as two
   * frosts would come back barren, and the fill would plant nothing. The fill plants through the
   * same derivation as a press, so this site is planted here
   */
  it('plants every bed on a site with no frost in the record', async () => {
    const site = frostFreeSiteFixture()
    const beds = [bedFixture('bed-1'), bedFixture('bed-2')]
    useAppStore.setState({
      autoRun: false,
      site: ready(site),
      plot: plotFixture(beds),
      bedLight: beds.map((bed) =>
        bedLightFixture(bed.id as string, 0, 36, site.normals.monthlyMeanDliMolM2Day),
      ),
    })
    await getAppState().plantEveryBed()
    const state = getAppState()
    for (const bed of state.plot?.beds ?? []) {
      expect(bed.plantings.length, bed.id as string).toBeGreaterThan(0)
    }
    // the refusals left are the tall perennials a bed takes only on request, and none is for a
    // missing calendar
    expect(state.planRefusals.filter((r) => r.reason.includes('no planting window'))).toEqual([])
  })

  it('gives beds that read the same light different combinations', async () => {
    seedTwoBeds()
    await getAppState().plantEveryBed()
    const [first, second] = combinationsOf()
    expect(first).toBeTruthy()
    expect(second).toBeTruthy()
    expect(first).not.toBe(second)
  })

  /**
   * Different combinations aren't yet a different garden: a second bed's card can differ from the
   * first by one crop, which can leave cucumber in five beds of six. Between cards that hold the
   * same number of liked crops, the one that repeats the fewest crops already planted wins
   */
  it('spreads the crops, so a second bed shares as few as it can with the first', async () => {
    seedTwoBeds()
    await getAppState().plantEveryBed()
    const state = getAppState()
    const [first, second] = state.plot?.beds ?? []
    const firstCrops = new Set((first?.plantings ?? []).map((planting) => planting.cropId))
    const shared = (second?.plantings ?? []).filter((planting) => firstCrops.has(planting.cropId))
    // the least the second bed's own cards could share, read off the set it was planted from
    const cards = state.generated?.suggestions.find((entry) => entry.bedId === second?.id)?.set
    const fewest = Math.min(
      ...(cards?.suggestions ?? [])
        .filter((card) => card.fits)
        .map((card) => card.cropIds.filter((id) => firstCrops.has(id)).length),
    )
    expect(shared.length).toBe(fewest)
  })

  it("is reversible, and isn't additive when pressed twice", async () => {
    seedTwoBeds()
    const before = getAppState().plot
    await getAppState().plantEveryBed()
    const once = combinationsOf()
    await getAppState().plantEveryBed()
    expect(combinationsOf()).toEqual(once)
    getAppState().undoGeneration()
    expect(getAppState().plot).toBe(before)
    expect(getAppState().generated).toBeNull()
  })

  /** No press is silent: with panels and no electricity figure, every bed says why it's empty */
  it('leaves the beds empty and says why when there are panels and no energy figure', async () => {
    seedTwoBeds(1)
    await getAppState().plantEveryBed()
    const state = getAppState()
    expect((state.plot?.beds ?? []).every((bed) => bed.plantings.length === 0)).toBe(true)
    expect(state.generated?.plantingCount).toBe(0)
    expect(state.generated?.beds.length).toBe(2)
    expect(state.generated?.layoutRefusals[0]).toContain(SUGGESTION_NEEDS_ENERGY)
  })

  /**
   * The beds are bare for the second the light and the ranking take, and without a notice the
   * plants step would read that second as "Nothing planted yet" right after the press that planted
   * them
   */
  it('says it is planting while the beds are bare, and stops saying so after', async () => {
    seedTwoBeds()
    const run = getAppState().plantEveryBed()
    expect(getAppState().planting).toBe(true)
    await run
    expect(getAppState().planting).toBe(false)
  })

  /**
   * "I like this" places it: a preference is a small weight in the score, so a liked crop that
   * sat only in a bed's second combination could be left out of every bed. On this
   * fixture the weight alone is enough to lift it. The greedy placement in `plantBeds` is the
   * backstop for the plots where it isn't, and this holds the promise either way
   */
  it('puts a liked crop in some bed when a fitting combination holds it', async () => {
    seedTwoBeds()
    await getAppState().plantEveryBed()
    const offered = getAppState().generated?.suggestions[0]?.set.suggestions ?? []
    const first = new Set((offered[0]?.cropIds ?? []).map((id) => id as string))
    const wanted = offered
      .filter((entry) => entry.fits)
      .flatMap((entry) => entry.cropIds)
      .find((id) => !first.has(id as string))
    expect(
      wanted,
      'the fixture offers a second combination with a crop the first lacks',
    ).toBeDefined()
    if (wanted === undefined) return
    getAppState().setPreference(wanted, 'prefer')
    await getAppState().plantEveryBed()
    const planted = (getAppState().plot?.beds ?? []).flatMap((bed) =>
      bed.plantings.map((planting) => planting.cropId),
    )
    expect(planted).toContain(wanted)
  })

  it('does nothing on a plot with no beds', async () => {
    useAppStore.setState({ plot: plotFixture([]), site: ready(siteFixture()) })
    await getAppState().plantEveryBed()
    expect(getAppState().generated).toBeNull()
    expect(getAppState().generationUndo).toBeNull()
  })
})
