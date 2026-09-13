import { beforeAll, describe, expect, it } from 'bun:test'
import { loadCompanionRules, loadRotationConstraints } from '../data/companions'
import { loadCropCatalog } from '../data/crops'
import { cosDeg } from '../sim/math'
import { REFERENCE_MAX_TILT_DEG, REFERENCE_MIN_TILT_DEG } from '../sim/pv/ler'
import type {
  ArrayCandidate,
  CandidateArchetype,
  DesignScenario,
  OnboardingAnswers,
} from '../types/onboarding'
import type { ScenarioSet } from '../types/onboarding'
import type { Site } from '../types/site'
import { degrees, degreesLatitude, degreesLongitude, meters } from '../types/units'
import {
  AMBITION_SHADE_BUDGET,
  ARCHETYPE_ORDER,
  candidatesFor,
  type DesignDependencies,
  groundLightPlan,
  scoreResolution,
  shadeBudgetFor,
  suggestDesigns,
} from './design'
import { siteFixture, tmyFixture } from './testkit'

const answersFor = (patch: Partial<OnboardingAnswers> = {}): OnboardingAnswers => ({
  location: { latitudeDeg: degreesLatitude(42.37), longitudeDeg: degreesLongitude(-72.52) },
  locationLabel: 'Test plot',
  plotWidthM: meters(16),
  plotDepthM: meters(12),
  objective: { food: 0.4, energy: 0.3, water: 0.2, simplicity: 0.1 },
  ambition: 'mixed-vegetables',
  exposure: 'open',
  mounting: 'any',
  maxHeightM: null,
  irrigationAvailable: true,
  experience: 'novice',
  maxBeds: null,
  ...patch,
})

/** The band every archetype's tilt is clamped into, so a rule figure compares like with like */
const clampTilt = (tiltDeg: number): number =>
  Math.min(REFERENCE_MAX_TILT_DEG, Math.max(REFERENCE_MIN_TILT_DEG, tiltDeg))

const siteAt = (latitudeDeg: number): Site =>
  siteFixture({
    location: {
      latitudeDeg: degreesLatitude(latitudeDeg),
      longitudeDeg: degreesLongitude(-72.52),
    },
  })

const pick = (
  archetype: CandidateArchetype,
  answers: OnboardingAnswers,
  site: Site,
): ArrayCandidate => {
  const found = candidatesFor(answers, site).find((entry) => entry.archetype === archetype)
  if (found === undefined) throw new Error(`no ${archetype} candidate`)
  return found
}

const balancedAt = (
  latitudeDeg: number,
  patch: Partial<OnboardingAnswers> = {},
): ArrayCandidate => {
  const site = siteAt(latitudeDeg)
  return pick('balanced', answersFor({ location: site.location, ...patch }), site)
}

/** Projected ground coverage, which is the quantity the shade budget is expressed in */
const projectedCoverage = (candidate: ArrayCandidate): number =>
  candidate.tracker.mode === 'fixed'
    ? candidate.groundCoverRatio * cosDeg(candidate.tracker.tiltDeg)
    : candidate.groundCoverRatio

const tiltOf = (candidate: ArrayCandidate): number =>
  candidate.tracker.mode === 'fixed' ? candidate.tracker.tiltDeg : 0

const envelopeHeightM = (candidate: ArrayCandidate): number =>
  candidate.geometry.clearanceHeightM +
  candidate.geometry.collectorWidthM *
    (candidate.tracker.mode === 'fixed'
      ? cosDeg(degrees(90 - candidate.tracker.tiltDeg))
      : cosDeg(degrees(90 - candidate.tracker.maxRotationDeg)) / 2)

describe('geometry is derived from the answers', () => {
  it('raises tilt with latitude and clamps it into the shippable band', () => {
    const tilts = [5, 20, 35, 42.37, 60].map((latitude) => tiltOf(balancedAt(latitude)))
    expect(tilts).toEqual([...tilts].sort((a, b) => a - b))
    for (const tilt of tilts) {
      expect(tilt).toBeGreaterThanOrEqual(10)
      expect(tilt).toBeLessThanOrEqual(35)
    }
    // 0.75 of the latitude for the balanced archetype, inside the clamp
    expect(tiltOf(balancedAt(20))).toBeCloseTo(15, 6)
    expect(tiltOf(balancedAt(5))).toBeCloseTo(10, 6)
    expect(tiltOf(balancedAt(60))).toBeCloseTo(35, 6)
  })

  it('faces the equator in both hemispheres and lays the rows across the pitch direction', () => {
    const north = balancedAt(42.37)
    const south = balancedAt(-33.9)
    expect(north.tracker.mode).toBe('fixed')
    if (north.tracker.mode !== 'fixed' || south.tracker.mode !== 'fixed') throw new Error('fixed')
    expect(north.tracker.surfaceAzimuthDeg).toBe(180)
    expect(south.tracker.surfaceAzimuthDeg).toBe(0)
    // the rows run east to west in both hemispheres; the hemisphere is in the surface azimuth
    expect(north.geometry.rowAzimuthDeg).toBe(90)
    expect(south.geometry.rowAzimuthDeg).toBe(90)
    // mirroring the hemisphere must not change the tilt, which depends on |latitude|
    expect(tiltOf(south)).toBeCloseTo(tiltOf(balancedAt(33.9)), 6)
  })

  it('builds the pitch from the coverage target and the collector width, not from a default', () => {
    for (const latitude of [12, 30, 42.37, 55]) {
      const candidate = balancedAt(latitude)
      expect(candidate.geometry.collectorWidthM / candidate.geometry.pitchM).toBeCloseTo(
        candidate.groundCoverRatio,
        6,
      )
    }
  })

  it('takes the row count and row length from the plot dimensions', () => {
    const site = siteAt(42.37)
    const small = pick('balanced', answersFor({ location: site.location }), site)
    const large = pick(
      'balanced',
      answersFor({ location: site.location, plotWidthM: meters(40), plotDepthM: meters(40) }),
      site,
    )
    expect(large.geometry.rowCount).toBeGreaterThan(small.geometry.rowCount)
    expect(large.geometry.rowLengthM).toBeGreaterThan(small.geometry.rowLengthM)
    expect(small.geometry.rowLengthM).toBeLessThanOrEqual(16)
    expect(large.geometry.rowLengthM).toBeLessThanOrEqual(40)
    expect(small.geometry.rowCount).toBeGreaterThanOrEqual(1)
    expect((small.geometry.rowCount - 1) * small.geometry.pitchM).toBeLessThanOrEqual(12)
  })

  it('offers only the archetypes the mounting choice admits', () => {
    const site = siteAt(42.37)
    const named = (mounting: OnboardingAnswers['mounting']): readonly CandidateArchetype[] =>
      candidatesFor(answersFor({ location: site.location, mounting }), site).map(
        (entry) => entry.archetype,
      )
    expect(named('any')).toEqual(ARCHETYPE_ORDER)
    expect(named('overhead-canopy')).not.toContain('vertical-east-west')
    expect(named('vertical-bifacial')).toEqual(['vertical-east-west', 'no-array-control'])
    for (const mounting of [
      'any',
      'overhead-canopy',
      'ground-rows',
      'vertical-bifacial',
    ] as const) {
      expect(named(mounting)).toContain('no-array-control')
    }
  })

  it('stands the vertical rows upright at the published spacing and bottom-edge height', () => {
    const site = siteAt(42.37)
    const vertical = pick('vertical-east-west', answersFor({ location: site.location }), site)
    if (vertical.tracker.mode !== 'fixed') throw new Error('fixed')
    expect(vertical.tracker.tiltDeg).toBe(90)
    expect(vertical.tracker.surfaceAzimuthDeg).toBe(90)
    expect(vertical.geometry.pitchM).toBeGreaterThanOrEqual(8)
    expect(vertical.geometry.pitchM).toBeLessThanOrEqual(15)
    expect(vertical.geometry.clearanceHeightM).toBeGreaterThanOrEqual(1)
    // a tighter shade budget must widen the spacing, never narrow it
    const fruiting = pick(
      'vertical-east-west',
      answersFor({ location: site.location, ambition: 'fruiting-and-berries' }),
      site,
    )
    expect(fruiting.geometry.pitchM).toBeGreaterThan(vertical.geometry.pitchM)
  })
})

describe('the height limit is a hard limit', () => {
  it('leaves the geometry alone when there is no limit', () => {
    const candidate = balancedAt(42.37)
    expect(candidate.rationale).not.toContain('height limit')
    expect(envelopeHeightM(candidate)).toBeGreaterThan(4)
  })

  it('spends the limit on the panel bank before it spends it on headroom', () => {
    const candidate = balancedAt(42.37, { maxHeightM: meters(4.5) })
    expect(envelopeHeightM(candidate)).toBeLessThanOrEqual(4.5 + 1e-9)
    expect(candidate.rationale).toContain('height limit')
    expect(candidate.rationale).toContain('modules deep')
    // headroom under the panels is untouched while the bank still has something to give
    expect(candidate.geometry.clearanceHeightM).toBeCloseTo(3.4, 6)
    expect(candidate.geometry.collectorWidthM).toBeLessThan(
      balancedAt(42.37).geometry.collectorWidthM,
    )
  })

  it('names only the clearance floors the headroom actually falls below', () => {
    const tight = balancedAt(42.37, { maxHeightM: meters(2.5) })
    expect(envelopeHeightM(tight)).toBeLessThanOrEqual(2.5 + 1e-9)
    expect(tight.geometry.clearanceHeightM).toBeLessThan(8 * 0.3048)
    expect(tight.geometry.clearanceHeightM).toBeGreaterThan(2.1)
    expect(tight.rationale).toContain('Massachusetts expedited design parameters')
    expect(tight.rationale).toContain('exception request')
    expect(tight.rationale).not.toContain('DIN SPEC 91434 Category I')

    const tighter = balancedAt(42.37, { maxHeightM: meters(2) })
    expect(envelopeHeightM(tighter)).toBeLessThanOrEqual(2 + 1e-9)
    expect(tighter.geometry.clearanceHeightM).toBeLessThan(2.1)
    expect(tighter.rationale).toContain('DIN SPEC 91434 Category I')
    expect(tighter.rationale).toContain('Massachusetts expedited design parameters')
  })

  it('keeps the vertical rows vertical rather than tilting them to fit', () => {
    const site = siteAt(42.37)
    const candidate = pick(
      'vertical-east-west',
      answersFor({ location: site.location, maxHeightM: meters(2.4) }),
      site,
    )
    if (candidate.tracker.mode !== 'fixed') throw new Error('fixed')
    expect(candidate.tracker.tiltDeg).toBe(90)
    expect(envelopeHeightM(candidate)).toBeLessThanOrEqual(2.4 + 1e-9)
  })
})

describe('the growing ambition bounds the shade budget', () => {
  it('reads the budget off the max design RSR of the crop classes that ambition covers', () => {
    for (const ambition of Object.keys(
      AMBITION_SHADE_BUDGET,
    ) as (keyof typeof AMBITION_SHADE_BUDGET)[]) {
      expect(shadeBudgetFor(answersFor({ ambition }))).toBeCloseTo(
        AMBITION_SHADE_BUDGET[ambition],
        6,
      )
    }
    expect(shadeBudgetFor(answersFor({ exposure: 'overshadowed' }))).toBeLessThan(
      shadeBudgetFor(answersFor({ exposure: 'open' })),
    )
  })

  it('never lets any archetype spend more shade than the budget allows', () => {
    const site = siteAt(42.37)
    for (const ambition of [
      'leafy-and-herbs',
      'mixed-vegetables',
      'fruiting-and-berries',
    ] as const) {
      const answers = answersFor({ location: site.location, ambition })
      const budget = shadeBudgetFor(answers)
      for (const candidate of candidatesFor(answers, site)) {
        expect(
          projectedCoverage(candidate),
          `${ambition} ${candidate.archetype}`,
        ).toBeLessThanOrEqual(budget + 1e-9)
      }
    }
  })

  it('refuses a fruiting grower the coverage a leafy grower can take', () => {
    const site = siteAt(42.37)
    const leafy = pick(
      'energy-first',
      answersFor({ location: site.location, ambition: 'leafy-and-herbs' }),
      site,
    )
    const fruiting = pick(
      'energy-first',
      answersFor({ location: site.location, ambition: 'fruiting-and-berries' }),
      site,
    )
    expect(projectedCoverage(fruiting)).toBeLessThan(projectedCoverage(leafy))
    expect(projectedCoverage(fruiting)).toBeLessThanOrEqual(
      AMBITION_SHADE_BUDGET['fruiting-and-berries'] + 1e-9,
    )
    // energy-first sits at the top of the agrivoltaic band, never at a conventional coverage
    expect(leafy.groundCoverRatio).toBeLessThanOrEqual(0.5 + 1e-9)
    expect(leafy.groundCoverRatio).toBeGreaterThan(
      pick('food-first', answersFor({ location: site.location, ambition: 'leafy-and-herbs' }), site)
        .groundCoverRatio,
    )
  })
})

const FORBIDDEN_DETERMINATION =
  /\b(compliant|non-compliant|noncompliant|pass|passes|fail|failed|fails|approved|rejected)\b/i

const JARGON = /\b(GCR|RSR|DLI|ground cover ratio|relative shade ratio|daily light integral)\b/i

describe('a full five-scenario run', () => {
  let deps: Partial<DesignDependencies>
  let result: ScenarioSet
  let elapsedMs = 0

  beforeAll(async () => {
    const [catalog, companionRules, rotationConstraints] = await Promise.all([
      loadCropCatalog(),
      loadCompanionRules(),
      loadRotationConstraints(),
    ])
    deps = {
      site: siteAt(42.37),
      weather: tmyFixture(),
      catalog,
      companionRules,
      rotationConstraints,
      backend: 'cpu-reference',
    }
    const started = Date.now()
    result = await suggestDesigns(answersFor(), deps)
    elapsedMs = Date.now() - started
  }, 600_000)

  it('bakes all five archetypes inside the interactive budget', () => {
    expect(result.scenarios).toHaveLength(5)
    expect(new Set(result.scenarios.map((entry) => entry.candidate.archetype)).size).toBe(5)
    // recorded so a regression in the search cost is visible: the CPU reference backend in
    // node is the slow path, the browser runs the same bake on WebGL2 or WebGPU
    expect(elapsedMs).toBeGreaterThan(0)
    expect(elapsedMs).toBeLessThan(60_000)
  })

  it('never presents a preview number as a final one', () => {
    expect(result.evaluatedAt).toBe('preview')
    expect(result.notConsidered.join(' ')).toContain('preview-quality')
  })

  it('says how far the search went rather than truncating it silently', () => {
    expect(result.notConsidered.join(' ')).toContain('Exactly 5 geometries were evaluated')
    expect(result.notConsidered.join(' ')).toContain('almost nothing was swept around them')
    // the one sweep that does run has to be named, not glossed over by the sentence above it
    expect(result.notConsidered.join(' ')).toContain('trying every angle from 10 to 35 degrees')
  })

  it('makes the no-array control genuinely open sky', () => {
    const control = result.scenarios.find(
      (entry) => entry.candidate.archetype === 'no-array-control',
    )
    if (control === undefined) throw new Error('no control')
    // the two accumulations reach the same numbers by different routes, so they agree to
    // float32 rounding rather than bit-identically
    expect(control.light.meanShadeRatio).toBeLessThan(1e-6)
    expect(control.production.annualAcKwh).toBe(0)
    expect(control.production.cropsLostToShade).toEqual([])
    expect(control.candidate.groundCoverRatio).toBe(0)
    expect(control.candidate.geometry.rowCount).toBe(0)
    for (const other of result.scenarios) {
      expect(other.light.meanGrowingSeasonDli).toBeLessThanOrEqual(
        control.light.meanGrowingSeasonDli + 1e-6,
      )
      expect(other.light.worstCellDli).toBeLessThanOrEqual(control.light.worstCellDli + 1e-6)
    }
  })

  it('costs the panels something real in light and gives something real back in power', () => {
    const shaded = result.scenarios.filter(
      (entry) => entry.candidate.archetype !== 'no-array-control',
    )
    expect(shaded).toHaveLength(4)
    for (const entry of shaded) {
      expect(entry.light.meanShadeRatio).toBeGreaterThan(0)
      expect(entry.production.annualAcKwh).toBeGreaterThan(0)
    }
  })

  it('reports every yield as a band and never as a point', () => {
    for (const entry of result.scenarios) {
      const band = entry.production.landEquivalentRatio
      expect(band.intervalKind).toBe('confidence')
      expect(band.interval.upper).toBeGreaterThan(band.interval.lower)
    }
  })

  it('keeps every rendered string free of a compliance determination', () => {
    for (const entry of result.scenarios) {
      for (const text of [
        entry.plainSummary,
        entry.tradeoff,
        entry.candidate.rationale,
        ...entry.flags.notes,
      ]) {
        expect(text, text).not.toMatch(FORBIDDEN_DETERMINATION)
      }
    }
    for (const note of result.notConsidered) expect(note).not.toMatch(FORBIDDEN_DETERMINATION)
  })

  it('writes the summary and the trade-off for someone who has never heard of GCR', () => {
    for (const entry of result.scenarios) {
      expect(entry.plainSummary.length).toBeGreaterThan(40)
      expect(entry.tradeoff.length).toBeGreaterThan(40)
      expect(entry.plainSummary, entry.plainSummary).not.toMatch(JARGON)
      expect(entry.tradeoff, entry.tradeoff).not.toMatch(JARGON)
    }
  })

  it('never claims high confidence, because the crop light thresholds cannot support it', () => {
    for (const entry of result.scenarios) {
      expect(['low', 'moderate']).toContain(entry.confidence)
    }
  })

  it('carries the Massachusetts geometry flags for every scenario', () => {
    for (const entry of result.scenarios) {
      expect(entry.flags.notes.length).toBeGreaterThan(0)
      expect(typeof entry.flags.meetsExpeditedClearance).toBe('boolean')
      expect(typeof entry.flags.fiftyPercentEverywhere).toBe('boolean')
    }
  })

  it('returns the same set for the same answers', async () => {
    const again = await suggestDesigns(answersFor(), deps)
    expect(again.scenarios.map((entry) => entry.candidate.archetype)).toEqual(
      result.scenarios.map((entry) => entry.candidate.archetype),
    )
    expect(again.scenarios.map((entry) => entry.score)).toEqual(
      result.scenarios.map((entry) => entry.score),
    )
    expect(again.recommendedArchetype).toBe(result.recommendedArchetype)
    expect(again.notConsidered).toEqual(result.notConsidered)
  }, 600_000)
})

describe('ranking answers to the objective weights', () => {
  let deps: Partial<DesignDependencies>

  beforeAll(async () => {
    const [catalog, companionRules, rotationConstraints] = await Promise.all([
      loadCropCatalog(),
      loadCompanionRules(),
      loadRotationConstraints(),
    ])
    deps = {
      site: siteAt(42.37),
      weather: tmyFixture(),
      catalog,
      companionRules,
      rotationConstraints,
      backend: 'cpu-reference',
      targetCellSizeM: meters(0.5),
    }
  }, 300_000)

  it('never puts the energy-first design first for a food-weighted grower', async () => {
    const set = await suggestDesigns(
      answersFor({ objective: { food: 1, energy: 0, water: 0, simplicity: 0 } }),
      deps,
    )
    expect(set.recommendedArchetype).not.toBe('energy-first')
    const order = set.scenarios.map((entry) => entry.candidate.archetype)
    expect(order.indexOf('energy-first')).toBeGreaterThan(order.indexOf('no-array-control'))
  }, 600_000)

  it('puts the energy-first design first for an energy-weighted grower', async () => {
    const set = await suggestDesigns(
      answersFor({ objective: { food: 0, energy: 1, water: 0, simplicity: 0 } }),
      deps,
    )
    expect(set.recommendedArchetype).toBe('energy-first')
  }, 600_000)

  it('names the archetypes the mounting choice dropped', async () => {
    const set = await suggestDesigns(answersFor({ mounting: 'overhead-canopy' }), deps)
    expect(set.scenarios).toHaveLength(4)
    expect(set.scenarios.map((entry) => entry.candidate.archetype)).not.toContain(
      'vertical-east-west',
    )
    expect(set.notConsidered.join(' ')).toContain(
      'Vertical east-west bifacial rows were not offered',
    )
    expect(set.notConsidered.join(' ')).toContain('Exactly 4 geometries were evaluated')
  }, 600_000)

  it('puts the no-array control first for a simplicity-weighted grower', async () => {
    const set = await suggestDesigns(
      answersFor({ objective: { food: 0, energy: 0, water: 0, simplicity: 1 } }),
      deps,
    )
    expect(set.recommendedArchetype).toBe('no-array-control')
  }, 600_000)
})

/**
 * The names on the comparison are a promise, and the one that is falsifiable from the numbers
 * beside them is this: the design called `energy-first` has to be the design that generates the
 * most. See `measuredEnergyPlan` for what a rule of thumb would cost it
 */
describe('the archetype names have to match the figures beside them', () => {
  let deps: Partial<DesignDependencies>

  beforeAll(async () => {
    const [catalog, companionRules, rotationConstraints] = await Promise.all([
      loadCropCatalog(),
      loadCompanionRules(),
      loadRotationConstraints(),
    ])
    deps = {
      site: siteAt(42.37),
      weather: tmyFixture(),
      catalog,
      companionRules,
      rotationConstraints,
      backend: 'cpu-reference',
      targetCellSizeM: meters(0.5),
    }
  }, 300_000)

  const kwhByArchetype = async (
    patch: Partial<OnboardingAnswers>,
  ): Promise<ReadonlyMap<CandidateArchetype, number>> => {
    const set = await suggestDesigns(answersFor(patch), deps)
    return new Map(
      set.scenarios.map((entry) => [
        entry.candidate.archetype,
        entry.production.annualAcKwh as number,
      ]),
    )
  }

  // a plot wider than it is deep is the hard case: a north-south tracker axis turns the rows across
  // the short side, and on a small plot that costs more capacity than tracking can win back
  it.each([
    ['a courtyard, wider than deep', { plotWidthM: meters(3.51), plotDepthM: meters(2.44) }],
    ['a smallholding', { plotWidthM: meters(16), plotDepthM: meters(11) }],
    ['a plot deeper than it is wide', { plotWidthM: meters(9), plotDepthM: meters(12) }],
  ])(
    'generates the most under the energy-first name on %s',
    async (_name, plot) => {
      const kwh = await kwhByArchetype(plot)
      const energyFirst = kwh.get('energy-first') ?? 0
      expect(energyFirst).toBeGreaterThan(0)
      for (const [archetype, value] of kwh) {
        if (archetype !== 'energy-first') expect(energyFirst).toBeGreaterThanOrEqual(value)
      }
    },
    600_000,
  )

  it('spends no more shade than the budget while it is measuring the tilt', async () => {
    const answers = answersFor({ plotWidthM: meters(16), plotDepthM: meters(11) })
    const budget = shadeBudgetFor(answers)
    for (const tiltDeg of [10, 21, 35]) {
      const candidate = candidatesFor(answers, siteAt(42.37), {
        'energy-first': { tiltDeg, tracking: false },
      }).find((entry) => entry.archetype === 'energy-first')
      expect(candidate).toBeDefined()
      expect(projectedCoverage(candidate as ArrayCandidate)).toBeLessThanOrEqual(budget + 1e-9)
    }
  })

  /**
   * The ordering is total and deterministic, and it was never the problem. The problem is that
   * a gap can be narrower than what the preview bake moves a score by, and the wizard used to
   * present that as a recommendation with nothing said about it. See `SCORE_RESOLUTION`
   */
  it('names every design that scored within the resolution of the numbers behind it', async () => {
    const set = await suggestDesigns(answersFor(), deps)
    const top = set.scenarios[0] as DesignScenario
    expect(set.scoreResolution).toBeGreaterThan(0)
    const inside = set.scenarios
      .slice(1)
      .filter((entry) => top.score - entry.score < set.scoreResolution)
      .map((entry) => entry.candidate.archetype)
    expect(set.tooCloseToCall).toEqual(inside)
    expect(set.tooCloseToCall).not.toContain(set.recommendedArchetype)
    for (const archetype of set.tooCloseToCall) {
      const found = set.scenarios.find((entry) => entry.candidate.archetype === archetype)
      expect(top.score - (found as DesignScenario).score).toBeLessThan(set.scoreResolution)
    }
  }, 600_000)

  /**
   * The margin has to widen exactly where the candidates crowd together, because the score
   * divides each term by its own spread and a collapsed spread magnifies the bake's own error.
   * Checked against the eight paired real-weather runs in `scoreResolution`
   */
  it('widens the margin as the candidates crowd together, and caps it at the weight', () => {
    const weights = { food: 0.35, energy: 0.35, water: 0.15, simplicity: 0.15 }
    // the candidate spreads those two runs actually produced, off the re-measurement
    const wide = scoreResolution(0.3087, 0.2736, weights)
    const tight = scoreResolution(0.0975, 0.0734, weights)
    expect(tight).toBeGreaterThan(wide)
    // Amherst 16 x 11 m moved 0.0001 and Bergen's courtyard moved 0.1543; both are covered
    expect(wide).toBeGreaterThan(0.0001)
    expect(tight).toBeGreaterThan(0.1543)
    // a term whose spread has collapsed contributes its weight and never more
    const collapsed = scoreResolution(0, 0, weights)
    expect(collapsed).toBeCloseTo(weights.food + weights.water, 9)
  })

  it('does not move the winner when the bake gets finer', async () => {
    const orderAt = async (cellM: number): Promise<readonly CandidateArchetype[]> =>
      (
        await suggestDesigns(answersFor(), { ...deps, targetCellSizeM: meters(cellM) })
      ).scenarios.map((entry) => entry.candidate.archetype)
    // the search is deterministic in its inputs; what was fragile is the margin, not the order
    expect(await orderAt(0.5)).toEqual(await orderAt(0.25))
  }, 900_000)

  /**
   * Which way tilt moves the light on the ground, at one row count: a STEEPER row covers less
   * ground from overhead, and the bake agrees. Measured 2026-09-11 on rows running east to
   * west: 0.256 -> 0.243 -> 0.218 at 10, 20 and 35 degrees on this 16 by 12 m plot.
   *
   * This has asserted both directions before, each time as a faithful reading of a broken
   * array: rows stepped sideways until 2026-09-01, then ran north to south with the panels
   * tilted along their own row until 2026-09-11. See `groundLightPlan`
   */
  it('leaves more light on the ground the steeper the panels stand, at one row count', async () => {
    const light = async (tiltDeg: number): Promise<{ rsr: number; rows: number }> => {
      const set = await suggestDesigns(answersFor({ mounting: 'ground-rows' }), {
        ...deps,
        tiltPlans: { balanced: { tiltDeg, tracking: false } },
      })
      const found = set.scenarios.find(
        (entry) => entry.candidate.archetype === 'balanced',
      ) as DesignScenario
      return { rsr: found.light.meanShadeRatio as number, rows: found.candidate.geometry.rowCount }
    }
    const flat = await light(REFERENCE_MIN_TILT_DEG)
    const steep = await light(REFERENCE_MAX_TILT_DEG)
    // an extra row would change the shade for a reason that has nothing to do with tilt
    expect(steep.rows).toBe(flat.rows)
    expect(steep.rsr).toBeLessThan(flat.rsr)
  }, 900_000)

  /**
   * The other falsifiable name. `food-first` promises the most light left on the ground, and its
   * latitude rule, `0.60 phi`, has no idea which way that quantity moves. At 55 N the rule asks for
   * 33 degrees, which closes the rows up enough to fit a second one on a 16 x 12 m plot: season RSR
   * 0.2197 against 0.1293 at the derived tilt, and 78 admissible crops against
   * 122. See `groundLightPlan`
   */
  it.each([20, 42.37, 55])(
    'keeps the most light on the ground at %s degrees',
    async (latitude) => {
      const site = siteAt(latitude)
      const set = await suggestDesigns(answersFor({ location: site.location }), { ...deps, site })
      const rsrOf = (archetype: CandidateArchetype): number =>
        (set.scenarios.find((entry) => entry.candidate.archetype === archetype) as DesignScenario)
          .light.meanShadeRatio
      for (const archetype of ['balanced', 'energy-first'] as const) {
        expect(rsrOf('food-first'), `${archetype} at ${String(latitude)}`).toBeLessThan(
          rsrOf(archetype),
        )
      }
    },
    900_000,
  )

  it('never leaves a food-first garden shadier than the latitude rule would', async () => {
    const site = siteAt(55)
    const answers = answersFor({ location: site.location, mounting: 'ground-rows' })
    const read = async (tiltDeg: number): Promise<DesignScenario> => {
      const set = await suggestDesigns(answers, {
        ...deps,
        site,
        tiltPlans: { 'food-first': { tiltDeg, tracking: false } },
      })
      return set.scenarios.find(
        (entry) => entry.candidate.archetype === 'food-first',
      ) as DesignScenario
    }
    const derived = groundLightPlan(answers, site).tiltDeg
    const byRule = await read(clampTilt(0.6 * 55))
    const chosen = await read(derived)
    expect(chosen.candidate.geometry.rowCount).toBeLessThanOrEqual(
      byRule.candidate.geometry.rowCount,
    )
    expect(chosen.light.meanShadeRatio).toBeLessThanOrEqual(byRule.light.meanShadeRatio + 1e-9)
    expect(chosen.production.cropsAvailable.length).toBeGreaterThanOrEqual(
      byRule.production.cropsAvailable.length,
    )
  }, 900_000)

  it('picks the tilt that puts the least panel over the plot from overhead', () => {
    for (const [latitude, widthM, depthM] of [
      [20, 16, 12],
      [42.37, 40, 25],
      [55, 30, 60],
    ] as const) {
      const site = siteAt(latitude)
      const answers = answersFor({
        location: site.location,
        plotWidthM: meters(widthM),
        plotDepthM: meters(depthM),
      })
      const overheadAt = (tiltDeg: number): number => {
        const found = candidatesFor(answers, site, {
          'food-first': { tiltDeg, tracking: false },
        }).find((entry) => entry.archetype === 'food-first') as ArrayCandidate
        return found.geometry.rowCount * cosDeg(degrees(tiltDeg))
      }
      const chosen = groundLightPlan(answers, site).tiltDeg
      for (let step = REFERENCE_MIN_TILT_DEG; step <= REFERENCE_MAX_TILT_DEG; step += 1) {
        expect(
          overheadAt(step),
          `${String(step)} deg at ${String(latitude)} N`,
        ).toBeGreaterThanOrEqual(overheadAt(chosen) - 1e-9)
      }
    }
    // and the answer moves with the plot: two rows fit at every tilt on the wide plot, so the
    // steepest row covers least; on the long plot a fifth row fits from 27 degrees, so the
    // answer is the steepest tilt that still holds four
    const wide = answersFor({ plotWidthM: meters(40), plotDepthM: meters(25) })
    expect(groundLightPlan(wide, siteAt(42.37)).tiltDeg).toBe(REFERENCE_MAX_TILT_DEG)
    const long = answersFor({ plotWidthM: meters(30), plotDepthM: meters(60) })
    const rowsOn = (answers: OnboardingAnswers, tiltDeg: number): number =>
      (
        candidatesFor(answers, siteAt(42.37), {
          'food-first': { tiltDeg, tracking: false },
        }).find((entry) => entry.archetype === 'food-first') as ArrayCandidate
      ).geometry.rowCount
    const chosenLong = groundLightPlan(long, siteAt(42.37)).tiltDeg
    expect(rowsOn(long, chosenLong)).toBe(rowsOn(long, REFERENCE_MIN_TILT_DEG))
    expect(chosenLong).toBeGreaterThan(REFERENCE_MIN_TILT_DEG)
    expect(rowsOn(long, chosenLong + 1)).toBeGreaterThan(rowsOn(long, chosenLong))
  })

  /**
   * Every candidate's rows lie inside the plot the search was given. They did not until
   * 2026-09-11: `rowAzimuthDeg` carried the surface azimuth, so 37 m rows sized for the width
   * ran across the 23 m depth, and a gardener watching the preview said "you've got solar
   * panels outside of the rectangle you said you had"
   */
  it('keeps every row of every candidate inside the plot', () => {
    const answers = answersFor({ plotWidthM: meters(38.4), plotDepthM: meters(22.9) })
    for (const mounting of [
      'any',
      'ground-rows',
      'overhead-canopy',
      'vertical-bifacial',
    ] as const) {
      for (const candidate of candidatesFor({ ...answers, mounting }, siteAt(42.37))) {
        const { geometry } = candidate
        if (geometry.rowCount === 0) continue
        // 90 runs along the width (east to west); 0 runs along the depth
        const runsAcrossWidth = geometry.rowAzimuthDeg === 90
        const alongM = runsAcrossWidth ? answers.plotWidthM : answers.plotDepthM
        const acrossM = runsAcrossWidth ? answers.plotDepthM : answers.plotWidthM
        expect(geometry.rowLengthM, candidate.archetype).toBeLessThanOrEqual(alongM)
        expect(
          (geometry.rowCount - 1) * geometry.pitchM + geometry.collectorWidthM,
          candidate.archetype,
        ).toBeLessThanOrEqual(acrossM)
      }
    }
  })

  /**
   * The budget is spent on a per-pitch footprint under an infinite-row assumption; the bake
   * measures a finite plot. The two are different quantities, so this asks whether the flag reports
   * the measurement
   */
  it('checks the shade the grower asked for against the shade the bake measured', async () => {
    const answers = answersFor({ mounting: 'ground-rows' })
    const budget = shadeBudgetFor(answers)
    const set = await suggestDesigns(answers, deps)
    for (const scenario of set.scenarios) {
      const { shade } = scenario.flags
      expect(shade.maxRatio).toBeCloseTo(budget, 9)
      expect(shade.measuredRatio).toBeCloseTo(scenario.light.meanShadeRatio, 9)
      // the verdict has to follow the measured figure, never the footprint it was sized from
      expect(shade.withinBudget).toBe(shade.measuredRatio <= budget + 1e-9)
    }
    // the open sky spends none of it, so the check can never refuse the baseline
    const control = set.scenarios.find(
      (entry) => entry.candidate.archetype === 'no-array-control',
    ) as DesignScenario
    expect(control.flags.shade.withinBudget).toBe(true)
  }, 600_000)

  /**
   * The sizing footprint and the measured ratio are not the same quantity, and this pins that they
   * differ.
   *
   * The footprint is `GCR * cos(tilt)`: a per-pitch figure that assumes rows running to the
   * horizon. The measured ratio is the mean over a baked plot, which has ends, edges and a five
   * metre margin of open ground around the scene. So the footprint is an upper bound on what a
   * real plot measures, and every configuration probed comes in under it: 10-35 deg on plots
   * from 10 x 40 to 30 x 60 m, measured 0.022 to 0.128 against a footprint of 0.165.
   *
   * This asserted the opposite until 2026-09-01 ("a footprint sized inside the budget whose
   * measured shade lands outside it") and passed, because `panelSnapshot` had its two horizontal
   * axes exchanged, which turned the array ninety degrees inside its own plot and changed which
   * of the two plot dimensions the rows were spread across. The flag it guards is still worth
   * having, and the test above is what holds it: the verdict follows the measured figure
   */
  it('reads the measured ratio, which is a different number from the sizing footprint', async () => {
    const answers = answersFor({ mounting: 'ground-rows' })
    const set = await suggestDesigns(answers, {
      ...deps,
      tiltPlans: { 'food-first': { tiltDeg: 30, tracking: false } },
    })
    const found = set.scenarios.find(
      (entry) => entry.candidate.archetype === 'food-first',
    ) as DesignScenario
    // 30 deg is where the tightening pitch admits a second row on a 12 m plot
    expect(found.candidate.geometry.rowCount).toBeGreaterThan(1)
    const footprint =
      found.candidate.tracker.mode === 'fixed'
        ? found.candidate.groundCoverRatio * cosDeg(found.candidate.tracker.tiltDeg)
        : found.candidate.groundCoverRatio
    expect(footprint).toBeLessThanOrEqual(shadeBudgetFor(answers) + 1e-9)
    // neither a bound nor a restatement: on a 12 m plot the second row's shadow reaches past
    // the bare margin, and the bake measured 0.217 against a footprint of 0.165 on 2026-09-11
    expect(Math.abs(found.flags.shade.measuredRatio - footprint)).toBeGreaterThan(0.01)
    expect(found.flags.shade.withinBudget).toBe(
      found.flags.shade.measuredRatio <= shadeBudgetFor(answers) + 1e-9,
    )
  }, 600_000)

  /**
   * The copy has now been wrong in BOTH directions, so this forbids both.
   *
   * It first told growers that flattening the panels "shortens the shadow on the ground". That
   * was replaced with the opposite, "does not brighten the ground, it dims it", which was
   * measured against an array whose rows stepped sideways to the way they faced and was itself
   * reversed on 2026-09-01. A claim that has been confidently wrong twice is worth pinning by
   * its exact words rather than by its direction
   */
  it('never claims either of the two things it has already got wrong about tilt', async () => {
    const set = await suggestDesigns(answersFor(), deps)
    for (const scenario of set.scenarios) {
      expect(scenario.candidate.rationale).not.toContain('shortens the shadow on the ground')
      expect(scenario.candidate.rationale).not.toContain('is smaller than the footprint')
      expect(scenario.candidate.rationale).not.toContain('does not brighten the ground')
      expect(scenario.candidate.rationale).not.toContain('sit closer to its neighbour to keep')
      expect(scenario.candidate.rationale).not.toContain('the steepest they can stand')
    }
  }, 600_000)

  it('says the tilt was measured rather than taken from a rule of thumb', async () => {
    const set = await suggestDesigns(answersFor(), deps)
    const energyFirst = set.scenarios.find(
      (entry) => entry.candidate.archetype === 'energy-first',
    ) as { readonly candidate: ArrayCandidate }
    // whichever way it went, fixed or tracked, it has to say it was measured and not assumed
    expect(energyFirst.candidate.rationale).toMatch(
      /this site's own weather|out-generated every fixed tilt/,
    )
    expect(energyFirst.candidate.rationale).not.toContain('of the site latitude')
  }, 600_000)
})
