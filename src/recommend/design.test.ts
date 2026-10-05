import { beforeAll, describe, expect, it } from 'bun:test'
import { loadCompanionRules, loadRotationConstraints } from '../data/companions'
import { cropById, loadCropCatalog } from '../data/crops'
import { cosDeg, sinDeg } from '../sim/math'
import { REFERENCE_MAX_TILT_DEG, REFERENCE_MIN_TILT_DEG } from '../sim/pv/ler'
import { polygonOf, rectangleRing, vec2 } from '../state/geom'
import { bedLayoutFixture } from '../state/testkit'
import type { Crop } from '../types/crop'
import type { House } from '../types/garden'
import { obstructionId } from '../types/ids'
import type { CropId } from '../types/ids'
import type {
  ArrayCandidate,
  BedLayout,
  BedPlacement,
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
  bedsFitSentence,
  candidatesFor,
  type DesignDependencies,
  groundLightPlan,
  lightAdequateBedCount,
  shadeBudgetFor,
  suggestDesigns,
} from './design'
import { BED_GAP_M, PLOT_MARGIN_M, POST_KEEP_CLEAR_M } from './layout'
import { bedLightFixture, siteFixture, tmyFixture } from './testkit'

const need = (catalog: readonly Crop[], id: string): Crop => {
  const crop = cropById(catalog, id as CropId)
  if (crop === undefined) throw new Error(`missing fixture crop ${id}`)
  return crop
}

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
    // the rows run east to west in both hemispheres: the hemisphere is in the surface azimuth
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
    // a tighter shade budget must widen the spacing
    const fruiting = pick(
      'vertical-east-west',
      answersFor({ location: site.location, ambition: 'fruiting-and-berries' }),
      site,
    )
    expect(fruiting.geometry.pitchM).toBeGreaterThan(vertical.geometry.pitchM)
  })
})

describe('the height limit is a hard limit', () => {
  it("leaves the geometry alone when there's no limit", () => {
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
    expect(tight.rationale).toContain('Massachusetts fast-track rules')
    expect(tight.rationale).toContain('in Massachusetts the layout would need an exception')
    expect(tight.rationale).not.toContain('DIN SPEC 91434 Category I')

    const tighter = balancedAt(42.37, { maxHeightM: meters(2) })
    expect(envelopeHeightM(tighter)).toBeLessThanOrEqual(2 + 1e-9)
    expect(tighter.geometry.clearanceHeightM).toBeLessThan(2.1)
    expect(tighter.rationale).toContain('DIN SPEC 91434 Category I')
    expect(tighter.rationale).toContain('Massachusetts fast-track rules')
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
    // energy-first sits at the top of the agrivoltaic band and stays inside it
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

  it('says how far the search went rather than truncating it silently', () => {
    expect(result.notConsidered.join(' ')).toContain('Exactly 5 geometries were evaluated')
    expect(result.notConsidered.join(' ')).toContain('almost nothing was swept around them')
    // the one sweep that does run has to be named, so the sentence above it can't gloss over it
    expect(result.notConsidered.join(' ')).toContain('trying every angle from 10 to 35 degrees')
  })

  it('makes the no-array control genuinely open sky', () => {
    const control = result.scenarios.find(
      (entry) => entry.candidate.archetype === 'no-array-control',
    )
    if (control === undefined) throw new Error('no control')
    // the two accumulations reach the same numbers by different routes, so they agree to
    // float32 rounding
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

  it("never claims high confidence, because the crop light thresholds can't support it", () => {
    for (const entry of result.scenarios) {
      expect(['low', 'moderate']).toContain(entry.confidence)
    }
  })

  it('carries the Massachusetts geometry flags for every scenario', () => {
    for (const entry of result.scenarios) {
      expect(entry.flags.notes.length).toBeGreaterThan(0)
      // every note is drawn as a line on the card, so none may be blank
      expect(entry.flags.notes).not.toContain('')
      expect(typeof entry.flags.meetsExpeditedClearance).toBe('boolean')
      expect(typeof entry.flags.fiftyPercentEverywhere).toBe('boolean')
    }
  })

  it("reads the open-sky control's water as exactly nothing saved", () => {
    const control = result.scenarios.find(
      (entry) => entry.candidate.archetype === 'no-array-control',
    )
    if (control === undefined) throw new Error('no control')
    const { deficitOpenSkyMm, deficitUnderPanelsMm, deficitSavedFraction } = control.water
    expect(Number.isFinite(deficitOpenSkyMm)).toBe(true)
    expect(Number.isFinite(deficitUnderPanelsMm)).toBe(true)
    // the two runs are identical by construction (no shade, no rain shadow), so the two
    // accumulations agree to float rounding. The saved fraction gets the margin the light figures
    // above are held to, and the mm figures a relative check, because they run in the hundreds
    expect(Math.abs(deficitSavedFraction)).toBeLessThan(1e-6)
    expect(Math.abs(deficitOpenSkyMm - deficitUnderPanelsMm)).toBeLessThan(deficitOpenSkyMm * 1e-5)
  })

  it("carries the balance's own deficit figures on every layout", () => {
    for (const entry of result.scenarios) {
      const { deficitOpenSkyMm, deficitUnderPanelsMm, deficitSavedFraction } = entry.water
      expect(Number.isFinite(deficitOpenSkyMm)).toBe(true)
      expect(Number.isFinite(deficitUnderPanelsMm)).toBe(true)
      expect(deficitOpenSkyMm).toBeGreaterThanOrEqual(0)
      expect(deficitUnderPanelsMm).toBeGreaterThanOrEqual(0)
      const expected = deficitOpenSkyMm > 0 ? 1 - deficitUnderPanelsMm / deficitOpenSkyMm : 0
      expect(deficitSavedFraction).toBeCloseTo(expected, 9)
    }
    const control = result.scenarios.find(
      (entry) => entry.candidate.archetype === 'no-array-control',
    ) as DesignScenario
    const paneled = result.scenarios.filter(
      (entry) => entry.candidate.archetype !== 'no-array-control',
    )
    // a layout with panels casts real shade and a real rain shadow, so at least one has to read
    // differently from the control's near-zero figure
    expect(
      paneled.some(
        (entry) =>
          Math.abs(entry.water.deficitSavedFraction - control.water.deficitSavedFraction) > 1e-6,
      ),
    ).toBe(true)
  })

  it('writes the water figure into the tradeoff sentence', () => {
    for (const entry of result.scenarios) {
      // the control has no panels to compare with, and a layout with no room has no beds
      if (entry.candidate.archetype === 'no-array-control' || entry.layout.beds.length === 0) {
        expect(entry.tradeoff).not.toContain('By the water balance')
      } else {
        expect(entry.tradeoff).toContain(
          "By the water balance, the beds' water shortfall over a year",
        )
        expect(entry.tradeoff).toContain('with no panels')
      }
    }
  })

  it("never counts more light-adequate beds than were placed, and names the shortfall when there's one", () => {
    for (const entry of result.scenarios) {
      expect(entry.lightAdequateBeds).toBeGreaterThanOrEqual(0)
      expect(entry.lightAdequateBeds).toBeLessThanOrEqual(entry.layout.beds.length)
      if (entry.candidate.archetype === 'no-array-control') continue
      expect(entry.tradeoff).toContain(
        bedsFitSentence(entry.layout.beds.length, entry.lightAdequateBeds),
      )
    }
  })

  /**
   * `evaluate` hands `placeBeds` a judge built off this candidate's own rain ground, so a bed
   * slides the way `layout.test.ts` proves it can. At least one paneled scenario on this plot has
   * to show the move in its own words, and every scenario's beds, slid or left centered, keep the
   * plot's working margin and stay off every row's own foundations
   */
  it('slides at least one bed onto the rain the rows shed, clear of the margin and every row', () => {
    const { plotWidthM, plotDepthM } = answersFor()
    const slid = result.scenarios.some(
      (entry) =>
        entry.candidate.archetype !== 'no-array-control' &&
        entry.layout.explanation.includes('onto the strip where rain runs off the rows'),
    )
    expect(slid).toBe(true)

    // widened past `POST_KEEP_CLEAR_M` where half a working gap is the larger of the two, the
    // same widening `postSpans` cuts a strip by before any bed is ever placed in it
    const postClearM = Math.max(POST_KEEP_CLEAR_M, BED_GAP_M / 2)
    for (const entry of result.scenarios) {
      const { geometry } = entry.candidate
      const crossIsX =
        Math.abs(cosDeg(geometry.rowAzimuthDeg)) > Math.abs(sinDeg(geometry.rowAzimuthDeg))
      const rowCentersM = Array.from(
        { length: geometry.rowCount },
        (_, row) =>
          (crossIsX ? geometry.originM.xM : geometry.originM.yM) +
          (row - (geometry.rowCount - 1) / 2) * geometry.pitchM,
      )
      for (const bed of entry.layout.beds) {
        for (const point of bed.footprint.exterior) {
          expect(Math.abs(point.xM), entry.candidate.archetype).toBeLessThanOrEqual(
            plotWidthM / 2 - PLOT_MARGIN_M + 1e-9,
          )
          expect(Math.abs(point.yM), entry.candidate.archetype).toBeLessThanOrEqual(
            plotDepthM / 2 - PLOT_MARGIN_M + 1e-9,
          )
        }
        const values = bed.footprint.exterior.map((point) =>
          crossIsX ? (point.xM as number) : (point.yM as number),
        )
        const lo = Math.min(...values)
        const hi = Math.max(...values)
        for (const center of rowCentersM) {
          const overlaps = lo < center + postClearM && hi > center - postClearM
          expect(
            overlaps,
            `${entry.candidate.archetype} ${bed.label} sits on the row at ${String(center)} m`,
          ).toBe(false)
        }
      }
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

/**
 * `placeBeds` draws a bed wherever the layout has room for one, so a ground-row strip can be
 * placed and still sit too deep in the shade for anything on the plant list to grow (Phoenix's
 * energy-first layout, 4 of 6 beds). The card's count has to tell those beds apart from ones a
 * crop can actually use
 */
describe('a placed bed only counts as getting enough light when a crop can grow there', () => {
  it('counts a bed with the list against one too dark for any crop on it', async () => {
    const catalog = await loadCropCatalog()
    const lettuce = need(catalog, 'lettuce-leaf')
    const site = siteFixture()
    const base = bedLayoutFixture('balanced')
    const brightBed = base.beds[0] as BedPlacement
    const shadedBed = base.beds[1] as BedPlacement
    const layout: BedLayout = {
      ...base,
      beds: [
        { ...brightBed, light: bedLightFixture('bright', 0.05) },
        { ...shadedBed, light: bedLightFixture('too-dark', 0.98) },
      ],
    }
    expect(lightAdequateBedCount([lettuce], site, layout)).toBe(1)
    // nothing on the list at all: neither bed can grow anything, however bright it is
    expect(lightAdequateBedCount([], site, layout)).toBe(0)
    // a layout with no beds placed has none to count
    expect(lightAdequateBedCount([lettuce], site, { ...layout, beds: [] })).toBe(0)
  })
})

describe('the bed-count sentence reads right at every count', () => {
  it('says how many beds the panels leave room for when every bed qualifies', () => {
    expect(bedsFitSentence(1, 1)).toBe('These panels leave room for 1 bed')
    expect(bedsFitSentence(6, 6)).toBe('These panels leave room for 6 beds')
  })

  it("says in words that there's no room for a bed", () => {
    expect(bedsFitSentence(0, 0)).toBe('These panels leave no room for a bed')
  })

  it("names the one bed directly when it's placed and doesn't qualify", () => {
    expect(bedsFitSentence(1, 0)).toBe(
      "These panels leave room for 1 bed, and it doesn't get enough light for anything on the plant list to grow",
    )
  })

  it('says none of them when nothing placed qualifies', () => {
    expect(bedsFitSentence(6, 0)).toBe(
      'These panels leave room for 6 beds, and none of them get enough light for anything on the plant list to grow',
    )
  })

  it("names the count that qualifies when it's somewhere in between", () => {
    expect(bedsFitSentence(6, 4)).toBe(
      'These panels leave room for 6 beds, and only 4 of them get enough light for anything on the plant list to grow',
    )
  })
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

  it('ranks a water-only grower by the balance and nothing else', async () => {
    const set = await suggestDesigns(
      answersFor({ objective: { food: 0, energy: 0, water: 1, simplicity: 0 } }),
      deps,
    )
    // found from the set itself: this pins the rule that the highest water score wins, whichever
    // archetype that turns out to be
    const best = set.scenarios.reduce((max, entry) =>
      entry.water.deficitSavedFraction > max.water.deficitSavedFraction ? entry : max,
    )
    expect(set.recommendedArchetype).toBe(best.candidate.archetype)
  }, 600_000)

  it('names the archetypes the mounting choice dropped', async () => {
    const set = await suggestDesigns(answersFor({ mounting: 'overhead-canopy' }), deps)
    expect(set.scenarios).toHaveLength(4)
    expect(set.scenarios.map((entry) => entry.candidate.archetype)).not.toContain(
      'vertical-east-west',
    )
    expect(set.notConsidered.join(' ')).toContain(
      "Vertical east-west bifacial rows weren't offered",
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

  it("spends no more shade than the budget while it's measuring the tilt", async () => {
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

  it("doesn't move the winner when the bake gets finer", async () => {
    const orderAt = async (cellM: number): Promise<readonly CandidateArchetype[]> =>
      (
        await suggestDesigns(answersFor(), { ...deps, targetCellSizeM: meters(cellM) })
      ).scenarios.map((entry) => entry.candidate.archetype)
    // the search is deterministic in its inputs, and the whole order holds at both cell sizes
    // because the search feeds the layout a judge. The slide settles each bed onto the row's drip
    // strip at either cell size, so the order doesn't depend on where the raster happens to cut a
    // bed's strip
    expect(await orderAt(0.5)).toEqual(await orderAt(0.25))
  }, 900_000)

  /**
   * Which way tilt moves the light on the ground, at one row count: a STEEPER row covers less
   * ground from overhead, and the bake agrees. Measured on rows running east to
   * west: 0.256 -> 0.243 -> 0.218 at 10, 20 and 35 degrees on this 16 by 12 m plot.
   *
   * A broken array's geometry can make either direction look like the faithful reading: rows
   * stepped sideways gives one, rows tilted along their own row gives the other. See `groundLightPlan`
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
    // steepest row covers least. On the long plot a fifth row fits from 27 degrees, so the
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
   * Every candidate's rows lie inside the plot the search was given. Holding the surface
   * azimuth in `rowAzimuthDeg` would size 37 m rows for the width and run them across the
   * 23 m depth, well outside the plot the grower asked for
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
        // 90 runs along the width (east to west), and 0 runs along the depth
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
   * The budget is spent on a per-pitch footprint under an infinite-row assumption. The bake
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
      // the verdict has to follow the measured figure over the footprint it was sized from
      expect(shade.withinBudget).toBe(shade.measuredRatio <= budget + 1e-9)
    }
    // the open sky spends none of it, so the check can never refuse the baseline
    const control = set.scenarios.find(
      (entry) => entry.candidate.archetype === 'no-array-control',
    ) as DesignScenario
    expect(control.flags.shade.withinBudget).toBe(true)
  }, 600_000)

  /**
   * The sizing footprint and the measured ratio aren't the same quantity, and this pins that they
   * differ.
   *
   * The footprint is `GCR * cos(tilt)`: a per-pitch figure that assumes rows running to the
   * horizon. The measured ratio is the mean over a baked plot, which has ends, edges and a five
   * meter margin of open ground around the scene. So the footprint is an upper bound on what a
   * real plot measures, and every configuration probed comes in under it: 10-35 deg on plots
   * from 10 x 40 to 30 x 60 m, measured 0.022 to 0.128 against a footprint of 0.165.
   *
   * A `panelSnapshot` with its two horizontal axes exchanged would turn the array ninety degrees
   * inside its own plot, changing which of the two plot dimensions the rows spread across, and
   * this assertion would read the opposite: "a footprint sized inside the budget whose measured
   * shade lands outside it." The flag it guards is still worth having, and the test above is
   * what holds it: the verdict follows the measured figure
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
    // the bare margin, and the bake measured 0.217 against a footprint of 0.165
    expect(Math.abs(found.flags.shade.measuredRatio - footprint)).toBeGreaterThan(0.01)
    expect(found.flags.shade.withinBudget).toBe(
      found.flags.shade.measuredRatio <= shadeBudgetFor(answers) + 1e-9,
    )
  }, 600_000)

  /**
   * Two specific claims about tilt are wrong: that flattening the panels "shortens the shadow on
   * the ground", and that it "does not brighten the ground, it dims it". Each is pinned by its
   * exact words
   */
  it('never claims either of the two things it has already got wrong about tilt', async () => {
    const set = await suggestDesigns(answersFor(), deps)
    for (const scenario of set.scenarios) {
      expect(scenario.candidate.rationale).not.toContain('shortens the shadow on the ground')
      expect(scenario.candidate.rationale).not.toContain('is smaller than the footprint')
      expect(scenario.candidate.rationale).not.toContain("doesn't brighten the ground")
      expect(scenario.candidate.rationale).not.toContain('sit closer to its neighbor to keep')
      expect(scenario.candidate.rationale).not.toContain('the steepest they can stand')
    }
  }, 600_000)

  it('says the tilt was measured rather than taken from a rule of thumb', async () => {
    const set = await suggestDesigns(answersFor(), deps)
    const energyFirst = set.scenarios.find(
      (entry) => entry.candidate.archetype === 'energy-first',
    ) as { readonly candidate: ArrayCandidate }
    // whichever way it went, fixed or tracked, it has to say it was measured
    expect(energyFirst.candidate.rationale).toMatch(
      /this site's own weather|out-generated every fixed tilt/,
    )
    expect(energyFirst.candidate.rationale).not.toContain('of the site latitude')
  }, 600_000)
})

/**
 * A house is drawn on the plot before the search ever runs (Decision Record 26), and the search
 * never lays a candidate's rows through it: the layout search never places a row of panels or a
 * bed inside a drawn house's footprint
 */
describe('a house on the plot keeps the search off its footprint', () => {
  const houseAt = (widthM: number, depthM: number): House => ({
    id: obstructionId('house-1'),
    kind: 'house',
    label: 'House 1',
    footprint: polygonOf(rectangleRing(vec2(0, 0), widthM, depthM)),
    heightM: meters(6),
  })

  it('drops a candidate whose rows run through the house', () => {
    const site = siteAt(42.37)
    const answers = answersFor({ location: site.location, mounting: 'ground-rows' })
    const clear = candidatesFor(answers, site)
    expect(clear.map((entry) => entry.archetype)).toContain('balanced')
    // wide enough to sit under every fixed candidate's rows on this 16 by 12 m plot
    const house = houseAt(40, 40)
    const blocked = candidatesFor(answers, site, {}, [house])
    const archetypes = blocked.map((entry) => entry.archetype)
    expect(archetypes).not.toContain('balanced')
    expect(archetypes).not.toContain('food-first')
    // the control carries no rows, so a house never takes it away
    expect(archetypes).toContain('no-array-control')
  })

  it("names the house in the search's own notes when every offered layout is blocked", async () => {
    const site = siteAt(42.37)
    const answers = answersFor({ location: site.location, mounting: 'ground-rows' })
    const house = houseAt(40, 40)
    const set = await suggestDesigns(answers, {
      site,
      weather: tmyFixture(),
      backend: 'cpu-reference',
      obstructions: [house],
    })
    expect(set.scenarios.map((entry) => entry.candidate.archetype)).toEqual(['no-array-control'])
    expect(set.notConsidered.join(' ')).toContain('House 1')
    expect(set.notConsidered.join(' ')).toContain('rows run through')
  }, 600_000)
})
