import { beforeAll, describe, expect, it, mock } from 'bun:test'
import { vi } from '../../test/vi'
import { loadCompanionRules, loadRotationConstraints } from '../data/companions'
import { loadCropCatalog } from '../data/crops'
import type { AccumulationProgress } from '../sim/backend'
import { simCacheKey } from '../sim/worker/client'
import type { OnboardingAnswers } from '../types/onboarding'
import { degreesLatitude, degreesLongitude, meters } from '../types/units'
import {
  type DesignDependencies,
  type DesignProgress,
  type SimulationRunner,
  suggestDesigns,
} from './design'
import { siteFixture, tmyFixture } from './testkit'

/**
 * The default runner is the module import, and the only way to see which one a search used is
 * to count calls through the module itself. The spy forwards to the real bake, so what this
 * file measures is the wiring and never a different simulation
 */
const direct = vi.hoisted(() => ({ calls: 0 }))

/*
  copied into a fresh object before the mock is installed: bun's mock.module mutates the shared
  module object in place rather than swapping in a new one, so a bare `await import(...)` here
  would alias the very thing being replaced and `actual.runSimulation` below would recurse into
  the mock instead of reaching the real bake
*/
const actual = { ...(await import('../sim/pipeline')) }
mock.module('../sim/pipeline', () => ({
  ...actual,
  runSimulation: ((...args) => {
    direct.calls += 1
    return actual.runSimulation(...args)
  }) satisfies SimulationRunner,
}))

const actualRun = async (...args: Parameters<SimulationRunner>): ReturnType<SimulationRunner> => {
  return actual.runSimulation(...args)
}

/**
 * Vertical bifacial offers two archetypes rather than five, on the smallest plot the layout
 * still fills: this file is about which runner is called and what it reports, so it buys none
 * of the bake time the measured tests in `design.test.ts` need
 */
const answersFor = (patch: Partial<OnboardingAnswers> = {}): OnboardingAnswers => ({
  location: { latitudeDeg: degreesLatitude(42.37), longitudeDeg: degreesLongitude(-72.52) },
  locationLabel: 'Test plot',
  plotWidthM: meters(6),
  plotDepthM: meters(4),
  objective: { food: 0.4, energy: 0.3, water: 0.2, simplicity: 0.1 },
  ambition: 'mixed-vegetables',
  exposure: 'open',
  mounting: 'vertical-bifacial',
  maxHeightM: null,
  irrigationAvailable: true,
  experience: 'novice',
  maxBeds: null,
  ...patch,
})

describe('the bake every candidate costs is injectable', () => {
  let deps: Partial<DesignDependencies>

  beforeAll(async () => {
    const [catalog, companionRules, rotationConstraints] = await Promise.all([
      loadCropCatalog(),
      loadCompanionRules(),
      loadRotationConstraints(),
    ])
    deps = {
      site: siteFixture(),
      weather: tmyFixture(),
      catalog,
      companionRules,
      rotationConstraints,
      backend: 'cpu-reference',
      targetCellSizeM: meters(0.5),
    }
    direct.calls = 0
  }, 300_000)

  it('falls back to the module import, so the engine still runs with no worker at all', async () => {
    direct.calls = 0
    const set = await suggestDesigns(answersFor(), deps)
    expect(set.scenarios).toHaveLength(2)
    expect(direct.calls).toBe(2)
  }, 600_000)

  it('bakes through the runner it was given, and through nothing else', async () => {
    direct.calls = 0
    const seen: Parameters<SimulationRunner>[] = []
    const run: SimulationRunner = (site, plot, weather, options, onProgress) => {
      seen.push([site, plot, weather, options, onProgress])
      return actualRun(site, plot, weather, options, onProgress)
    }
    const set = await suggestDesigns(answersFor(), { ...deps, run })
    expect(set.scenarios).toHaveLength(2)
    expect(seen).toHaveLength(2)
    expect(direct.calls).toBe(0)
    // the control is baked first, so the injected runner sees a plot with no array before one
    expect(seen[0]?.[1].arrays).toHaveLength(0)
    expect(seen[1]?.[1].arrays).toHaveLength(1)
  }, 600_000)

  /**
   * Running through the client means running through its memo, and every candidate differs from
   * its siblings in array geometry alone. Tilt lives in the tracker rather than in `RowGeometry`,
   * so this is really asking whether the key reads it: it does, through the tracker it stringifies
   */
  it('gives every candidate a cache key of its own, so no two share one bake', async () => {
    const keys: string[] = []
    const run: SimulationRunner = (site, plot, weather, options, onProgress) => {
      keys.push(simCacheKey(site, plot, weather, options))
      return actualRun(site, plot, weather, options, onProgress)
    }
    const set = await suggestDesigns(answersFor({ mounting: 'any' }), { ...deps, run })
    expect(set.scenarios).toHaveLength(5)
    expect(new Set(keys).size).toBe(5)
  }, 600_000)

  it('reports which candidate is baking and how far into its own bake', async () => {
    const bake: AccumulationProgress = { passesDone: 3, passesTotal: 8, elapsedMs: 12 }
    const run: SimulationRunner = (site, plot, weather, options, onProgress) => {
      onProgress(bake)
      return actualRun(site, plot, weather, options, onProgress)
    }
    const reported: DesignProgress[] = []
    await suggestDesigns(answersFor(), {
      ...deps,
      run,
      onProgress: (progress) => reported.push(progress),
    })
    expect(reported.length).toBeGreaterThanOrEqual(6)
    expect(reported.every((entry) => entry.candidatesTotal === 2)).toBe(true)
    // a bar drawn from this never goes backwards and never claims more than was baked
    const done = reported.map((entry) => entry.candidatesDone)
    expect(done).toEqual([...done].sort((a, b) => a - b))
    expect(done[0]).toBe(0)
    expect(done.at(-1)).toBe(2)
    expect(reported.map((entry) => entry.archetype)).toContain('no-array-control')
    expect(reported.map((entry) => entry.archetype)).toContain('vertical-east-west')
    expect(reported.filter((entry) => entry.bake !== null).map((entry) => entry.bake)).toContain(
      bake,
    )
  }, 600_000)
})
