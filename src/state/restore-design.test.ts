import { beforeEach, describe, expect, it } from 'bun:test'
import { bedLight as bedLightOf } from '../sim/aggregate'
import { byMonth } from '../sim/units'
import type { Planting } from '../types/garden'
import { bedId, cropId, obstructionId, plantingId } from '../types/ids'
import type { DliRaster } from '../types/light'
import type { Fraction, Meters, DayOfYear } from '../types/units'
import { makeArray, makeBed } from './defaults'
import { polygonOf, rectangleRing, vec2 } from './geom'
import { snapshotHistory, sameHistory, type HistorySnapshot } from './history'
import { lightGeometryKey, lightIsStale } from './light-freshness'
import { idle, loading, ready } from './slices'
import { getAppState, resetAppStore, useAppStore } from './store'

/**
 * `restoreDesign` is what undo and redo end in. The history decides WHEN a design comes back, and
 * these hold the line on WHAT comes back with it: every slice derived from the design is either
 * settled the way an edit of the same field settles it, or left standing, and none is left
 * describing a garden that is gone
 *
 * The actions are called straight, with no pauses and no history in the way: this is the store's
 * side of the bargain
 */

const state = getAppState

beforeEach(() => {
  localStorage.clear()
  resetAppStore()
})

const shot = (): HistorySnapshot => snapshotHistory(state())

/** A real raster, small, with the same light everywhere: 10 under the panels, 20 in the open */
const tinyRaster = (): DliRaster => {
  const cols = 40
  const rows = 40
  const field = (value: number): Float32Array => new Float32Array(cols * rows).fill(value)
  return {
    grid: {
      extent: {
        minXM: -10 as Meters,
        minYM: -10 as Meters,
        maxXM: 10 as Meters,
        maxYM: 10 as Meters,
      },
      cellSizeM: 0.5 as Meters,
      cols,
      rows,
    },
    skyViewFactor: field(1),
    annualUnderArrayMolM2Day: field(10),
    annualOpenSkyMolM2Day: field(20),
    monthlyUnderArrayMolM2Day: byMonth(() => field(10)),
    monthlyOpenSkyMolM2Day: byMonth(() => field(20)),
    windows: [],
    quality: {
      subdivision: 'tregenza-mf1',
      sunDirectionCount: 145,
      substepsPerHour: 1,
      parFraction: 0.45 as Fraction,
      photonConversionUmolPerJ: 4.57,
      interreflectionApplied: false,
      seasonalParHalfWidthFraction: 0.1 as Fraction,
    },
  }
}

/** What stands in for a finished set of compliance checks, so keeping or clearing it can be seen */
const CHECKS = [{ regime: 'a stand-in' }] as never

/** A bake finished over the garden as it stands */
const bake = (): DliRaster => {
  const raster = tinyRaster()
  const plot = state().plot
  if (plot === null) throw new Error('no plot')
  useAppStore.setState({
    raster: ready(raster),
    bedLight: plot.beds.map((bed) => bedLightOf(raster, bed.id, bed.footprint)),
    bedLightSubdivision: raster.quality.subdivision,
    lightGeometry: lightGeometryKey(plot),
    compliance: CHECKS,
  })
  return raster
}

const rasterOnScreen = (): DliRaster | null => {
  const raster = state().raster
  return raster.status === 'ready' ? raster.value : null
}

const aPlanting = (): Planting => ({
  id: plantingId('planting-test'),
  bedId: bedId('bed-1'),
  cropId: cropId('tomato'),
  cultivarId: null,
  role: 'target-crop',
  tier: 'mid-canopy',
  sowDay: 100 as DayOfYear,
  harvestStartDay: 200 as DayOfYear,
  harvestEndDay: 240 as DayOfYear,
  plantCount: 4,
})

/** A search that has finished, set after any edit that would itself have dropped it */
const finishASearch = (): void => {
  useAppStore.setState((s) => ({ onboarding: { ...s.onboarding, designs: ready({} as never) } }))
}

const searchStatus = (): string => state().onboarding.designs.status

describe('every tracked key comes back', () => {
  it('puts back the very values it was handed, and leaves what the history leaves out', () => {
    const earlier = shot()
    state().upsertBed(makeBed(7))
    state().setMaxCropsPerBed(9)
    state().setWildlife({ favorNative: true })
    state().answerOnboarding({ ambition: 'fruiting-and-berries' })
    state().setPlantYear(5)
    state().setSidebarStep('check')
    state().setLengthUnit('ft')
    state().setOverlay({ opacity: 0.1 })
    expect(sameHistory(shot(), earlier)).toBe(false)
    state().restoreDesign(earlier)
    expect(sameHistory(shot(), earlier)).toBe(true)
    // where the grower was looking stays where it was
    expect(state().sidebarStep).toBe('check')
    expect(state().lengthUnit).toBe('ft')
    expect(state().overlay.opacity).toBe(0.1)
  })
})

describe('the light when a design comes back', () => {
  it('keeps the raster, and reads the beds off it again, when the geometry is unchanged', () => {
    const raster = bake()
    const earlier = shot()
    // a planting is downstream of the light, so the key ignores it
    state().addPlanting(aPlanting())
    expect(state().plot).not.toBe(earlier.plot)
    useAppStore.setState({ bedLight: [] })
    state().restoreDesign(earlier)
    expect(state().plot).toBe(earlier.plot)
    expect(rasterOnScreen()).toBe(raster)
    expect(state().bedLight.map((light) => light.bedId)).toEqual(['bed-1', 'bed-2', 'bed-3'])
    expect(state().lightGeometry).toBe(lightGeometryKey(earlier.plot!))
    expect(state().compliance).toBe(CHECKS)
  })

  it('goes idle when the geometry changed since the light was computed', () => {
    const earlier = shot()
    state().upsertBed(makeBed(1, { label: 'moved' }))
    bake()
    state().restoreDesign(earlier)
    expect(state().raster.status).toBe('idle')
    expect(state().bedLight).toEqual([])
    expect(state().bedLightSubdivision).toBeNull()
    expect(state().lightGeometry).toBeNull()
    expect(state().compliance).toEqual([])
    expect(state().progress).toBeNull()
  })

  it('goes idle when a row of panels is the difference', () => {
    bake()
    const earlier = shot()
    state().upsertArray(makeArray(1, { label: 'turned' }))
    bake()
    state().restoreDesign(earlier)
    expect(state().raster.status).toBe('idle')
  })

  it('keeps a raster stale for the garden on screen but fresh for the one returning', () => {
    const raster = bake()
    const earlier = shot()
    state().upsertBed(makeBed(1, { label: 'moved' }))
    expect(lightIsStale(state())).toBe(true)
    state().restoreDesign(earlier)
    expect(rasterOnScreen()).toBe(raster)
    expect(lightIsStale(state())).toBe(false)
  })

  it('drops a bake that is still running, since it cannot be known to fit', () => {
    bake()
    const earlier = shot()
    state().upsertBed(makeBed(1, { label: 'moved' }))
    useAppStore.setState({
      raster: loading(),
      progress: { passesDone: 1, passesTotal: 4, elapsedMs: 12 },
    })
    state().restoreDesign(earlier)
    expect(state().raster.status).toBe('idle')
    expect(state().progress).toBeNull()
  })

  it('leaves the light alone when only a number of the design came back', () => {
    const raster = bake()
    const earlier = shot()
    state().setMaxCropsPerBed(9)
    const before = state().bedLight
    state().restoreDesign(earlier)
    expect(rasterOnScreen()).toBe(raster)
    expect(state().bedLight).toBe(before)
  })

  it('reads the beds again when the surroundings answer comes back', () => {
    bake()
    const earlier = shot()
    state().answerOnboarding({ exposure: 'overshadowed' })
    // the answer takes 60 percent of the light before the ranking sees it
    expect(state().bedLight[0]?.monthlyMeanDliMolM2Day[6]).toBeCloseTo(4, 5)
    state().restoreDesign(earlier)
    expect(state().bedLight[0]?.monthlyMeanDliMolM2Day[6]).toBeCloseTo(10, 5)
  })

  it('reads the compliance checks again when the frost percentile comes back', () => {
    bake()
    const earlier = shot()
    state().setFrostPercentile(50)
    useAppStore.setState({ compliance: CHECKS })
    state().restoreDesign(earlier)
    expect(state().frostPercentile).toBe(earlier.frostPercentile)
    expect(state().compliance).not.toBe(CHECKS)
  })
})

describe('a finished layout search when a design comes back', () => {
  it('is dropped when the boundary moved', () => {
    const earlier = shot()
    state().setBoundary(polygonOf(rectangleRing(vec2(0, 0), 40, 30)))
    finishASearch()
    state().restoreDesign(earlier)
    expect(searchStatus()).toBe('idle')
  })

  it('is kept when only a bed changed', () => {
    const earlier = shot()
    state().upsertBed(makeBed(7))
    finishASearch()
    state().restoreDesign(earlier)
    expect(searchStatus()).toBe('ready')
  })

  it('is dropped, with its preview, when an answer the search reads comes back', () => {
    const earlier = shot()
    state().answerOnboarding({ maxBeds: 2 })
    finishASearch()
    useAppStore.setState({ previewPlot: state().plot, previewArchetype: 'balanced' })
    state().restoreDesign(earlier)
    expect(searchStatus()).toBe('idle')
    expect(state().previewPlot).toBeNull()
    expect(state().previewArchetype).toBeNull()
  })

  it('is kept when the answer that came back is one the search never reads', () => {
    const earlier = shot()
    state().answerOnboarding({ experience: 'experienced' })
    finishASearch()
    state().restoreDesign(earlier)
    expect(state().answers.experience).toBe(earlier.answers.experience)
    expect(searchStatus()).toBe('ready')
  })
})

describe('the record of a guided generation when a design comes back', () => {
  const generationState = (earlier: HistorySnapshot): void => {
    useAppStore.setState((s) => ({
      generated: { archetype: 'balanced' } as never,
      generationUndo: earlier.plot,
      planRefusals: [{ bedId: bedId('bed-1'), cropId: cropId('tomato'), reason: 'too shaded' }],
      onboarding: { ...s.onboarding, appliedArchetype: 'balanced' },
    }))
  }

  it('goes with the plot it described', () => {
    const earlier = shot()
    state().upsertBed(makeBed(7))
    generationState(earlier)
    state().restoreDesign(earlier)
    expect(state().generated).toBeNull()
    expect(state().generationUndo).toBeNull()
    expect(state().planRefusals).toEqual([])
    expect(state().onboarding.appliedArchetype).toBeNull()
  })

  it('stays when the plot did not move', () => {
    const earlier = shot()
    state().setMaxCropsPerBed(9)
    generationState(earlier)
    state().restoreDesign(earlier)
    expect(state().generated).not.toBeNull()
    expect(state().generationUndo).not.toBeNull()
    expect(state().planRefusals.length).toBe(1)
    expect(state().onboarding.appliedArchetype).toBe('balanced')
  })
})

describe('the energy figure when a design comes back', () => {
  it('goes idle when the rows of panels moved, as editing them does', () => {
    const earlier = shot()
    state().upsertArray(makeArray(1, { label: 'turned' }))
    useAppStore.setState({ energy: ready({} as never) })
    state().restoreDesign(earlier)
    expect(state().energy.status).toBe('idle')
  })

  it('goes idle when the ground cover moved', () => {
    const earlier = shot()
    state().setGroundCover('straw-mulch')
    useAppStore.setState({ energy: ready({} as never) })
    state().restoreDesign(earlier)
    expect(state().energy.status).toBe('idle')
  })

  it('stays when only a bed or a planting came back', () => {
    const earlier = shot()
    state().addPlanting(aPlanting())
    useAppStore.setState({ energy: ready({} as never) })
    state().restoreDesign(earlier)
    expect(state().energy.status).toBe('ready')
  })
})

describe('what is left standing', () => {
  it('keeps the ranking, the calendars and the suggestions an edit of the plot keeps', () => {
    const earlier = shot()
    state().upsertBed(makeBed(7))
    useAppStore.setState({
      sets: ready([]),
      calendars: ready([]),
      suggestions: ready({} as never),
    })
    const { sets, calendars, suggestions } = state()
    state().restoreDesign(earlier)
    expect(state().sets).toBe(sets)
    expect(state().calendars).toBe(calendars)
    expect(state().suggestions).toBe(suggestions)
  })

  it('keeps the place it was looked up at', () => {
    const earlier = shot()
    state().upsertBed(makeBed(7))
    useAppStore.setState({ site: ready({} as never), weather: idle() })
    const { site, location, locationLabel } = state()
    state().restoreDesign(earlier)
    expect(state().site).toBe(site)
    expect(state().location).toBe(location)
    expect(state().locationLabel).toBe(locationLabel)
  })

  it('keeps the seasons that were run', () => {
    const earlier = shot()
    state().upsertBed(makeBed(7))
    state().setYearChoice('driest')
    const { simulation } = state()
    state().restoreDesign(earlier)
    expect(state().simulation).toBe(simulation)
  })
})

describe('a selection the restored plot no longer holds', () => {
  it('is cleared for a bed, a row of panels and a house or tree', () => {
    const earlier = shot()
    state().upsertBed(makeBed(7))
    state().upsertArray(makeArray(2))
    state().addHouse()
    useAppStore.setState({
      selectedBedId: bedId('bed-7'),
      selectedArrayId: makeArray(2).id,
      selectedObstructionId: obstructionId('house-1'),
    })
    state().restoreDesign(earlier)
    expect(state().selectedBedId).toBeNull()
    expect(state().selectedArrayId).toBeNull()
    expect(state().selectedObstructionId).toBeNull()
  })

  it('stays when what it points at is in the plot that came back', () => {
    state().selectBed(bedId('bed-2'))
    const earlier = shot()
    state().upsertBed(makeBed(7))
    state().restoreDesign(earlier)
    expect(state().selectedBedId).toBe('bed-2')
  })
})
