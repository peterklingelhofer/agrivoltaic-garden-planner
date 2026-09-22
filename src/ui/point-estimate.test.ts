import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'bun:test'
import { Glob } from 'bun'
import { loadCompanionRules, loadRotationConstraints } from '../data/companions'
import { loadCropCatalog } from '../data/crops'
import { runRecommendationPipeline } from '../recommend/pipeline'
import { bedFixture, bedLightFixture, plotFixture, siteFixture } from '../recommend/testkit'
import { DEFAULT_WEIGHTS } from '../recommend/stages/rank'
import type { Banded } from '../types/band'
import { intervalNoun } from './format'

// the source of every module, read off disk because the runner is bun
const MODULES: Record<string, string> = {}
for (const path of new Glob('src/**/*.{ts,tsx}').scanSync('.')) {
  MODULES[`/${path}`] = readFileSync(path, 'utf8')
}

const ALL: readonly (readonly [string, string])[] = Object.entries(MODULES)
  .map(([path, text]) => [path.replace(/^\/src\//, ''), text] as const)
  .filter(([file]) => !/\.test\.tsx?$/.test(file))

const containing = (needle: string, within: (file: string) => boolean): readonly string[] =>
  ALL.filter(([file, text]) => within(file) && text.includes(needle))
    .map(([file]) => file)
    .sort()

/**
 * Decision Record 7: a yield is a band. `unsafeBandMidpoint` collapses one, and it
 * exists so the optimiser can put a scalar into an objective function that has to
 * order candidates. Nothing that renders, holds view state or builds a scene may
 * reach for it, because the only reason to want a midpoint there is to show one
 */
const MIDPOINT_ALLOWED: readonly string[] = [
  'types/band.ts',
  'recommend/stages/interactions.ts',
  // ranks polyculture combinations against each other; the suggestion it emits still
  // carries the whole banded LER and never a collapsed yield
  'recommend/suggest.ts',
  // the season simulation applies a companion rule's measured band the way interactions.ts does,
  // as one multiplier, and ranks measured rules by midpoint to borrow a size for a folklore
  // claim. The harvest it reports is a draw INSIDE the crop-response band and the band travels
  // with it; the midpoint never reaches a screen (Decision Record 14)
  'simulation/evidence.ts',
  'simulation/pests.ts',
  'simulation/season.ts',
]

describe('no point estimate escapes a band', () => {
  it('keeps unsafeBandMidpoint out of every rendering, scene and state module', () => {
    const presentation = (file: string): boolean =>
      file.startsWith('ui/') ||
      file.startsWith('scene/') ||
      file.startsWith('state/') ||
      file === 'App.tsx' ||
      file === 'main.tsx'
    expect(containing('unsafeBandMidpoint', presentation)).toEqual([])
  })

  it('pins the whole set of modules allowed to collapse a band', () => {
    // a test file may name it to prove the guard refuses one; production code may not
    expect(containing('unsafeBandMidpoint', () => true)).toEqual([...MIDPOINT_ALLOWED].sort())
  })

  it('found the modules it claims to scan', () => {
    const files = ALL.map(([file]) => file)
    expect(files.length).toBeGreaterThan(50)
    expect(files).toContain('ui/YieldBand.tsx')
    expect(files).toContain('App.tsx')
  })
})

/**
 * Laub et al. 2022 Table S2 tabulates a 95% CONFIDENCE interval and no prediction interval, so
 * labelling a band "prediction interval" is a mistake. The noun is data on the band: exactly one
 * function turns the kind into words, and every band the recommender produces declares `confidence`
 */
describe('bands are confidence intervals and say so', () => {
  it('produces the interval noun in exactly one module', () => {
    // the quoted literal, not the phrase: several modules carry the disclaimer that
    // Laub tabulates no prediction interval, which is the opposite of the mistake
    for (const noun of ["'prediction interval'", "'confidence interval'"]) {
      expect(
        containing(noun, () => true),
        noun,
      ).toEqual(['ui/format.ts'])
    }
    expect(intervalNoun('confidence')).toBe('confidence interval')
    expect(intervalNoun('prediction')).toBe('prediction interval')
  })

  it('never hardcodes the noun in a renderer', () => {
    const renderers = (file: string): boolean =>
      (file.startsWith('ui/') || file.startsWith('scene/')) && file !== 'ui/format.ts'
    expect(containing('confidence interval', renderers)).toEqual([])
    expect(containing('prediction interval', renderers)).toEqual([])
  })

  it('labels every yield band the pipeline produces as a confidence interval', async () => {
    const [catalog, companionRules, rotationConstraints] = await Promise.all([
      loadCropCatalog(),
      loadCompanionRules(),
      loadRotationConstraints(),
    ])
    const bed = bedFixture('bed-1')
    const sets = runRecommendationPipeline({
      site: siteFixture(),
      plot: plotFixture([bed]),
      bedLight: [bedLightFixture('bed-1', 0.3)],
      catalog,
      companionRules,
      rotationConstraints,
      frostPercentile: 50,
      weights: DEFAULT_WEIGHTS,
      preferredCropIds: [],
    })
    const bands: Banded<number>[] = []
    for (const set of sets) {
      for (const item of set.ranked) {
        if (item.outcome.verdict === 'excluded') continue
        bands.push(item.outcome.estimate.relativeYield)
      }
    }
    expect(bands.length).toBeGreaterThan(0)
    for (const band of bands) {
      expect(band.intervalKind).toBe('confidence')
      expect(band.confidence).toBe(0.95)
      // a band whose endpoints meet is a point estimate in band clothing
      expect(band.interval.upper).toBeGreaterThan(band.interval.lower)
      // the term the band is said to be dominated by is one it lists, and this app's own
      // crowding shift is listed by name and never folded into the published curve
      const sources = band.contributions.map((term) => term.source)
      expect(sources).toContain(band.dominantSource)
      expect(sources).toContain('crowding')
    }
  })
})
