import { loadCompanionRules, loadRotationConstraints } from '../data/companions'
import { cropById, cropName, loadCropCatalog } from '../data/crops'
import { growingWindowFor as siteGrowingWindow } from '../data/growing-window'
import { DEFAULT_FROST_PERCENTILE, resolveSite } from '../data/site'
import { clamp } from '../data/util'
import { bedLight as bedLightOf, seasonLight } from '../sim/aggregate'
import type { AccumulationProgress, BackendKind } from '../sim/backend'
import { detectBackendKind } from '../sim/backend'
import {
  checkMassachusettsSmart,
  MA_FIXED_CLEARANCE_M,
  MA_TRACKING_CLEARANCE_M,
} from '../sim/compliance'
import { decompose, selectDecompositionModel } from '../sim/decomposition'
import { derivedArrayMetrics, equatorFacingAzimuth } from '../sim/geometry'
import { cosDeg, radiansToDegrees, sinDeg } from '../sim/math'
import type { SimulationOptions } from '../sim/pipeline'
import { FINAL_OPTIONS, runSimulation } from '../sim/pipeline'
import type { PvChainOptions } from '../types/energy'
import { chainOptionsFor, runAnnualChain } from '../sim/pv/chain'
import { DEFAULT_GROUND_COVER, type GroundCover } from '../types/ground'
import { energyRatio, REFERENCE_MAX_TILT_DEG, REFERENCE_MIN_TILT_DEG } from '../sim/pv/ler'
import { observerFor, solarPositionSeries } from '../sim/solar'
import { polygonAreaM2 } from '../state/geom'
import type { Banded } from '../types/band'
import type { CompanionRule, RotationConstraint } from '../types/companion'
import type { ComplianceCheck } from '../types/compliance'
import type { Crop } from '../types/crop'
import type { Bed, GardenPlot, House, Obstruction } from '../types/garden'
import type { Polygon2D } from '../types/geo'
import { arrayId, bedId, plotId } from '../types/ids'
import type { CropId } from '../types/ids'
import type { DliRaster, GrowingWindow } from '../types/light'
import type {
  ArrayCandidate,
  BedLayout,
  CandidateArchetype,
  DesignObjective,
  DesignScenario,
  GrowingAmbition,
  MountingPreference,
  OnboardingAnswers,
  ScenarioFlags,
  ScenarioLight,
  ScenarioSet,
  ScenarioWater,
  ScenarioYield,
  ShadeBudgetCheck,
} from '../types/onboarding'
import type { ModuleSpec, PvArray, RowGeometry, TrackerConfig } from '../types/pv'
import type { CropRecommendation } from '../types/recommend'
import type { Site } from '../types/site'
import type { Degrees, Fraction, KilowattHours, Meters } from '../types/units'
import { degrees, fraction, meters, millimeters, squareMeters, wattsPeak } from '../types/units'
import type { BedRain, RainField, RainWind } from '../types/water'
import type { SolarPositionSeries, TmySeries } from '../types/weather'
import { placeBeds } from './layout'
import { houseFootprints, housesOf, overlapsAHouse, rowsFootprint } from './overlap'
import { runRecommendationPipeline } from './pipeline'
import { rainGround, rainOnBed, rainWind, type RainGround } from './rain'
import { DEFAULT_WEIGHTS, scoreOf } from './stages/rank'
import { SURROUNDINGS_SHADE, shadedBySurroundings } from './surroundings'
import { bedShortfallMm, waterBalanceShared, waterBalances } from './water'
import { landEquivalentRatio } from './yield'

/**
 * How one candidate's annual bake is run. It's the signature `runSimulation` and
 * `SimClient.run` already share, so the browser can hand over the worker client and keep five
 * bakes off the thread that has to animate through them
 */
export type SimulationRunner = typeof runSimulation

/**
 * Where the search has got to, reported per candidate: a bar drawn from
 * the bake alone would restart from zero five times, reading as five stalls when it's one run
 */
export interface DesignProgress {
  readonly candidatesDone: number
  readonly candidatesTotal: number
  /** The candidate being baked now, so a caller can name what the search is working on */
  readonly archetype: CandidateArchetype
  /** How far into that candidate's own bake, null once it's finished or served from a memo */
  readonly bake: AccumulationProgress | null
}

/** Everything `suggestDesigns` reads from outside itself, injectable so the search is testable */
export interface DesignDependencies {
  readonly site: Site
  readonly weather: TmySeries
  readonly catalog: readonly Crop[]
  readonly companionRules: readonly CompanionRule[]
  readonly rotationConstraints: readonly RotationConstraint[]
  readonly backend: BackendKind
  /** The ground under the rows, which is a term in every energy figure the search reports */
  readonly groundCover: GroundCover
  /**
   * What already stands near the space. Every candidate plot the search bakes carries it, so a
   * house the grower drew shades the search's own bakes the same way it shades the editor's
   * (Decision Record 26)
   */
  readonly obstructions: readonly Obstruction[]
  readonly targetCellSizeM: Meters
  /**
   * The two other bake settings a test can override to run the search coarse and fast, for the
   * same reason `targetCellSizeM` is injectable
   */
  readonly subdivision: SimulationOptions['subdivision']
  readonly substepsPerHour: number
  /**
   * Tilt forced on a named archetype, injectable for the same reason the bake settings are.
   * The rationale each candidate carries makes a claim about which way tilt moves the light on
   * the ground, and the only way to check a claim like that is to hold everything else still and
   * bake both. `energy-first` fills its own entry from `measuredEnergyPlan`
   */
  readonly tiltPlans: Partial<Record<TiltedArchetype, EnergyPlan>>
  /**
   * The runner every candidate is baked with. It defaults to the direct import, which is what
   * keeps the search working headless, in node and under `bun test` with no worker at all. The app
   * passes the worker client's so the search doesn't run on the thread the wizard draws on
   */
  readonly run: SimulationRunner
  readonly onProgress: (progress: DesignProgress) => void
}

/**
 * A 430 W bifacial glass-glass module, the mainstream class this recommender sizes every
 * candidate from. It's the recommender's own hardware choice, separate from the editor's default,
 * so that changing what a user may hand-place never silently changes what we propose
 */
export const DESIGN_MODULE: ModuleSpec = {
  widthM: meters(1.134),
  heightM: meters(1.762),
  nameplateWp: wattsPeak(430),
  bifacialityFactor: fraction(0.7),
  transmittanceFraction: fraction(0),
  rearReflectance: fraction(0.05),
  backsheet: 'glass-glass',
}

/**
 * How much more one of the two big weights has to carry than the other before the answers are
 * read as asking for one side. The presets put food and electricity at 35% each for "a bit of
 * both", so anything inside this margin of equal is the balanced layout's to claim
 */
export const NAMESAKE_MARGIN = 1.15

/** The layout named for what the answers asked for most */
export const namesakeOf = (weights: {
  readonly food: number
  readonly energy: number
}): CandidateArchetype =>
  weights.food > weights.energy * NAMESAKE_MARGIN
    ? 'food-first'
    : weights.energy > weights.food * NAMESAKE_MARGIN
      ? 'energy-first'
      : 'balanced'

export const ARCHETYPE_ORDER: readonly CandidateArchetype[] = [
  'food-first',
  'balanced',
  'energy-first',
  'vertical-east-west',
  'no-array-control',
]

export type TiltedArchetype = 'food-first' | 'balanced' | 'energy-first'

const TILTED: readonly TiltedArchetype[] = ['food-first', 'balanced', 'energy-first']

const MOUNTING_ARCHETYPES: Readonly<Record<MountingPreference, readonly CandidateArchetype[]>> = {
  'overhead-canopy': [...TILTED, 'no-array-control'],
  'ground-rows': [...TILTED, 'no-array-control'],
  'vertical-bifacial': ['vertical-east-west', 'no-array-control'],
  any: [...TILTED, 'vertical-east-west', 'no-array-control'],
}

const MOUNTING_EXCLUSION: Readonly<Record<MountingPreference, string | null>> = {
  'overhead-canopy':
    "Vertical east-west bifacial rows weren't offered, because you asked for a canopy over the garden and this layout stands beside the crop instead of above it",
  'ground-rows':
    "Vertical east-west bifacial rows weren't offered, because you asked for ground-level rows at a conventional tilt",
  'vertical-bifacial':
    "The three elevated canopy layouts weren't offered, because you asked for vertical bifacial rows",
  any: null,
}

/**
 * The season-cumulative shade a grower of this kind of plant can absorb, from the max design
 * RSR column of Decision Record section 6: leafy greens 40-50 percent, brassicas 30-40,
 * solanaceae 20-25 temperate, cucurbits 20-30, strawberry 15-20. The fruiting figure is set
 * by strawberry, which is the tightest of the three classes that ambition covers
 */
export const AMBITION_SHADE_BUDGET: Readonly<Record<GrowingAmbition, number>> = {
  'leafy-and-herbs': 0.45,
  'mixed-vegetables': 0.3,
  'fruiting-and-berries': 0.18,
}

/**
 * A site that is already shaded by something else has less shade left to spend on panels. The
 * share the surroundings take is the one table the bed light is dimmed by (`surroundings.ts`),
 * so the search and the ranking read the same answer
 */
export const shadeBudgetFor = (answers: OnboardingAnswers): Fraction =>
  fraction(AMBITION_SHADE_BUDGET[answers.ambition] * (1 - SURROUNDINGS_SHADE[answers.exposure]))

// The energy optimum is about 0.85 of the latitude, and agrivoltaic designs run below it to shorten
// the shadow and lower the structure. `energy-first` takes its fixed tilt from a sweep on the
// site's own weather, because measured against this project's own chain the rule loses to
// `balanced`: see `measuredEnergyPlan`
const TILT_LATITUDE_FACTOR: Readonly<Record<TiltedArchetype, number>> = {
  'food-first': 0.6,
  balanced: 0.75,
  'energy-first': 0.85,
}

/** How much of the grower's shade budget each archetype is willing to spend */
const SHADE_BUDGET_SHARE: Readonly<Record<TiltedArchetype, number>> = {
  'food-first': 0.55,
  balanced: 0.8,
  'energy-first': 1,
}

const CLEARANCE_TARGET_M: Readonly<Record<TiltedArchetype, number>> = {
  'food-first': 4.2,
  balanced: 3.4,
  'energy-first': 2.6,
}

const MODULES_UP_THE_SLOPE: Readonly<Record<TiltedArchetype, number>> = {
  'food-first': 1,
  balanced: 2,
  'energy-first': 2,
}

// 2-5 m is the dominant clearance band for elevated agrivoltaics, GCR
// 0.25-0.50 versus 0.8+ projected for conventional PV
const APV_MIN_GCR = 0.08
const APV_MAX_GCR = 0.5
const APV_MAX_CLEARANCE_M = 5
/** DIN SPEC 91434 clause on Category I. Category II carries no clearance floor at all */
export const DIN_CATEGORY_I_CLEARANCE_M = 2.1
/** Ground-level rows stand beside the crop, so only DIN Category II applies and it has no floor */
const GROUND_ROW_CLEARANCE_M = 0.8
const MIN_WORKABLE_CLEARANCE_M = 0.5

// The Next2Sun archetype: pitch 8-15 m, bottom edge 0.8-1.0 m, and crops keep
// at least 75 percent of open-field light at 8 m
const VERTICAL_MIN_PITCH_M = 8
const VERTICAL_MAX_PITCH_M = 15
const VERTICAL_SHADE_AT_MIN_PITCH = 0.25
const VERTICAL_CLEARANCE_M = 1
const VERTICAL_MODULES_UP = 2

const TRACKER_MAX_ROTATION_DEG = 55
/** Above this latitude a tracker's winter shadow is too long to be worth the extra clearance */
const TRACKING_MAX_LATITUDE_DEG = 50

const PLOT_EDGE_MARGIN_M = 0.5
const MAX_ROWS = 12

/** One garden's worth of crops, held fixed so the portfolio ratio compares like with like */
export const DESIGN_BASKET_SIZE = 6

const rectangle = (widthM: number, depthM: number): Polygon2D => ({
  exterior: [
    { xM: meters(-widthM / 2), yM: meters(-depthM / 2) },
    { xM: meters(widthM / 2), yM: meters(-depthM / 2) },
    { xM: meters(widthM / 2), yM: meters(depthM / 2) },
    { xM: meters(-widthM / 2), yM: meters(depthM / 2) },
  ],
  holes: [],
})

// the site's own frost-free months, the window every other seasonal figure in the app reads
const growingWindowFor = (site: Site): GrowingWindow =>
  siteGrowingWindow(site, DEFAULT_FROST_PERCENTILE)

const equatorFacingAzimuthDeg = (site: Site): Degrees =>
  equatorFacingAzimuth(site.location.latitudeDeg)

interface HeightPlan {
  readonly clearanceM: number
  readonly tiltDeg: number
  readonly stackCount: number
}

interface HeightModel {
  /** The module dimension that runs up the slope */
  readonly unitM: number
  /** A fixed bank rises its whole slant width. A tracker pivots about its center */
  readonly riseFactor: number
  readonly tiltAdjustable: boolean
  readonly minTiltDeg: number
}

const envelopeHeightM = (plan: HeightPlan, model: HeightModel): number =>
  plan.clearanceM + plan.stackCount * model.unitM * sinDeg(degrees(plan.tiltDeg)) * model.riseFactor

interface Fitted {
  readonly plan: HeightPlan
  readonly compromises: readonly string[]
}

/**
 * `maxHeightM` is a hard limit, so it's spent in the order that costs the grower least:
 * first the number of modules stacked up the slope, then tilt, and only then the clearance
 * the crop has to work under. Every step it takes is reported in plain words
 */
export const fitToMaxHeight = (
  target: HeightPlan,
  model: HeightModel,
  maxHeightM: number | null,
): Fitted => {
  if (maxHeightM === null || envelopeHeightM(target, model) <= maxHeightM) {
    return { plan: target, compromises: [] }
  }
  const limit = maxHeightM.toFixed(1)
  const compromises: string[] = []
  let plan = target

  while (plan.stackCount > 1 && envelopeHeightM(plan, model) > maxHeightM) {
    plan = { ...plan, stackCount: plan.stackCount - 1 }
  }
  if (plan.stackCount < target.stackCount) {
    compromises.push(
      `Your ${limit} m height limit cut the panel bank from ${String(target.stackCount)} modules deep to ${String(plan.stackCount)}, so this design generates less than it otherwise would`,
    )
  }

  if (model.tiltAdjustable && envelopeHeightM(plan, model) > maxHeightM) {
    const room = maxHeightM - plan.clearanceM
    const needed = room / Math.max(plan.stackCount * model.unitM * model.riseFactor, 1e-6)
    const tiltDeg = clamp(
      radiansToDegrees(Math.asin(clamp(needed, 0, 1))),
      model.minTiltDeg,
      plan.tiltDeg,
    )
    if (tiltDeg < plan.tiltDeg) {
      compromises.push(
        `Your ${limit} m height limit flattened the panels from ${plan.tiltDeg.toFixed(0)} to ${tiltDeg.toFixed(0)} degrees, which costs some winter electricity`,
      )
      plan = { ...plan, tiltDeg }
    }
  }

  if (envelopeHeightM(plan, model) > maxHeightM) {
    const clearanceM = Math.max(
      MIN_WORKABLE_CLEARANCE_M,
      maxHeightM - (envelopeHeightM(plan, model) - plan.clearanceM),
    )
    // name only the floors this headroom is actually under. DIN Category I is the lower of the
    // two, so falling below it always means falling below the Massachusetts figure as well
    const below = [
      clearanceM < DIN_CATEGORY_I_CLEARANCE_M ? 'the 2.10 m of DIN SPEC 91434 Category I' : null,
      clearanceM < MA_FIXED_CLEARANCE_M
        ? 'the 8 ft of the Massachusetts expedited design parameters'
        : null,
    ].filter((entry): entry is string => entry !== null)
    compromises.push(
      below.length === 0
        ? `Your ${limit} m height limit lowered the headroom under the panels to ${clearanceM.toFixed(2)} m`
        : `Your ${limit} m height limit forced the headroom under the panels down to ${clearanceM.toFixed(2)} m, below ${below.join(' and ')}. Working under it will be cramped, and the Massachusetts figure would need an exception request`,
    )
    plan = { ...plan, clearanceM }
  }
  return { plan, compromises }
}

const arrayWithDerived = (
  label: string,
  geometry: RowGeometry,
  tracker: TrackerConfig,
): PvArray => {
  const base: PvArray = {
    id: arrayId('suggested'),
    label,
    geometry,
    tracker,
    module: DESIGN_MODULE,
    derived: {
      groundCoverRatio: fraction(0),
      projectedGroundCoverRatio: fraction(0),
      maxHeightM: meters(0),
      nameplateDcKw: 0 as PvArray['derived']['nameplateDcKw'],
      nameplateAcKw: 0 as PvArray['derived']['nameplateAcKw'],
    },
  }
  return { ...base, derived: derivedArrayMetrics(base) }
}

interface RowFill {
  readonly rowCount: number
  readonly rowLengthM: number
  readonly modulesPerRow: number
}

/** Rows and their length come from the plot alone: this is the only place */
const fillPlot = (
  answers: OnboardingAnswers,
  rowAxisNorthSouth: boolean,
  pitchM: number,
  groundSpanM: number,
): RowFill => {
  const alongM = rowAxisNorthSouth ? answers.plotDepthM : answers.plotWidthM
  const acrossM = rowAxisNorthSouth ? answers.plotWidthM : answers.plotDepthM
  const rowLengthM = Math.max(DESIGN_MODULE.widthM, alongM - 2 * PLOT_EDGE_MARGIN_M)
  const usableM = acrossM - 2 * PLOT_EDGE_MARGIN_M - groundSpanM
  return {
    rowCount: clamp(Math.floor(usableM / pitchM) + 1, 1, MAX_ROWS),
    rowLengthM,
    modulesPerRow: Math.max(1, Math.round(rowLengthM / DESIGN_MODULE.widthM)),
  }
}

const ELEVATED_CITATIONS = [
  'dupraz2024-gcr-proxy',
  'trommsdorff2021-heggelbach',
  'laub2022-shade-meta',
  'din-spec-91434-2021',
  'ma-225-cmr-28',
] as const

const VERTICAL_CITATIONS = [
  'arena2024-vertical-bifacial',
  'szarek2026-high-latitude-vertical',
] as const

const CONTROL_CITATIONS = ['dupraz2011-agrivoltaics'] as const

/**
 * What each archetype is called out loud. Exported because two surfaces name one: the scenario
 * cards read it off the candidate they were built from, and the panel recapping what was planted
 * keeps only the archetype and so has nothing to read it off
 */
export const ARCHETYPE_LABEL: Readonly<Record<CandidateArchetype, string>> = {
  'food-first': 'Food first',
  balanced: 'Balanced',
  'energy-first': 'Energy first',
  'vertical-east-west': 'Vertical panels, east and west facing',
  'no-array-control': 'No panels at all',
}

const tracksFor = (answers: OnboardingAnswers, site: Site, heightRoomM: number | null): boolean =>
  answers.mounting !== 'ground-rows' &&
  Math.abs(site.location.latitudeDeg) <= TRACKING_MAX_LATITUDE_DEG &&
  (heightRoomM === null ||
    heightRoomM >=
      MA_TRACKING_CLEARANCE_M +
        (DESIGN_MODULE.heightM * sinDeg(degrees(TRACKER_MAX_ROTATION_DEG))) / 2)

/**
 * How `energy-first` is to be built, measured on the site's own weather and never asserted.
 * See `measuredEnergyPlan`
 */
export interface EnergyPlan {
  readonly tiltDeg: number
  readonly tracking: boolean
}

const tiltedCandidate = (
  archetype: TiltedArchetype,
  answers: OnboardingAnswers,
  site: Site,
  measured: EnergyPlan | null = null,
): ArrayCandidate => {
  const latitude = Math.abs(site.location.latitudeDeg)
  const tracking =
    measured?.tracking ??
    (archetype === 'energy-first' && tracksFor(answers, site, answers.maxHeightM))
  const tiltDeg =
    measured?.tiltDeg ??
    clamp(
      TILT_LATITUDE_FACTOR[archetype] * latitude,
      REFERENCE_MIN_TILT_DEG,
      REFERENCE_MAX_TILT_DEG,
    )
  const floorClearanceM =
    answers.mounting === 'ground-rows'
      ? GROUND_ROW_CLEARANCE_M
      : Math.max(
          DIN_CATEGORY_I_CLEARANCE_M,
          tracking ? MA_TRACKING_CLEARANCE_M : MA_FIXED_CLEARANCE_M,
        )
  const targetClearanceM =
    answers.mounting === 'ground-rows'
      ? GROUND_ROW_CLEARANCE_M
      : clamp(CLEARANCE_TARGET_M[archetype], floorClearanceM, APV_MAX_CLEARANCE_M)
  const model: HeightModel = {
    unitM: DESIGN_MODULE.heightM,
    riseFactor: tracking ? 0.5 : 1,
    tiltAdjustable: !tracking,
    minTiltDeg: REFERENCE_MIN_TILT_DEG,
  }
  const { plan, compromises } = fitToMaxHeight(
    {
      clearanceM: targetClearanceM,
      tiltDeg: tracking ? TRACKER_MAX_ROTATION_DEG : tiltDeg,
      stackCount: MODULES_UP_THE_SLOPE[archetype],
    },
    model,
    answers.maxHeightM,
  )
  const finalTiltDeg = tracking ? tiltDeg : plan.tiltDeg
  const collectorWidthM = plan.stackCount * DESIGN_MODULE.heightM
  // the shade budget is a projected ground coverage, and slant GCR is what pitch is built from
  const projected = shadeBudgetFor(answers) * SHADE_BUDGET_SHARE[archetype]
  const groundCoverRatio = clamp(
    projected / (tracking ? 1 : cosDeg(degrees(finalTiltDeg))),
    APV_MIN_GCR,
    APV_MAX_GCR,
  )
  const pitchM = collectorWidthM / groundCoverRatio
  /*
    The direction the rows RUN, which is what `arrayLayout` and `sim/geometry.ts` read it as: a
    fixed row facing the equator runs east to west, and a north-south tracker axis runs north to
    south. Holding the surface azimuth here would turn every fixed candidate's rows
    north to south with the panels tilted along their own row, 37 m of panel laid across a
    23 m plot, well outside the plot the grower asked for
  */
  const rowAzimuthDeg = degrees(tracking ? 0 : 90)
  const fill = fillPlot(answers, tracking, pitchM, collectorWidthM * cosDeg(degrees(finalTiltDeg)))
  const tracker: TrackerConfig = tracking
    ? {
        mode: 'single-axis-horizontal-ns',
        axisTiltDeg: degrees(0),
        axisAzimuthDeg: equatorFacingAzimuthDeg(site),
        maxRotationDeg: degrees(TRACKER_MAX_ROTATION_DEG),
        backtracking: true,
      }
    : {
        mode: 'fixed',
        tiltDeg: degrees(finalTiltDeg),
        surfaceAzimuthDeg: equatorFacingAzimuthDeg(site),
      }
  const geometry: RowGeometry = {
    collectorWidthM: meters(collectorWidthM),
    pitchM: meters(pitchM),
    rowLengthM: meters(fill.rowLengthM),
    rowCount: fill.rowCount,
    modulesPerRow: fill.modulesPerRow,
    clearanceHeightM: meters(plan.clearanceM),
    rowAzimuthDeg,
    originM: { xM: meters(0), yM: meters(0) },
  }
  const rationale = [
    tracking
      ? `Rows track the sun about a north-south axis, so the panels follow it from morning to evening. Tracking is only offered here because the site is at ${latitude.toFixed(0)} degrees of latitude and the design can carry the 10 ft of headroom the Massachusetts expedited parameters ask of a tracker${measured === null ? '' : ", and it's only taken because it out-generated every fixed tilt on this plot"}`
      : archetype === 'food-first' && measured !== null
        ? `Panels are fixed at ${finalTiltDeg.toFixed(0)} degrees, the angle between ${String(REFERENCE_MIN_TILT_DEG)} and ${String(REFERENCE_MAX_TILT_DEG)} that puts the least panel over this plot as seen from overhead: a steeper row covers less ground, a flatter row sits further from the next so fewer rows fit, and this is where the two come out lowest for a plot this size. The light figure beside this design is measured from that arrangement`
        : measured !== null
          ? `Panels are fixed at ${finalTiltDeg.toFixed(0)} degrees, which is the tilt that generated the most over a year of this site's own weather. It was measured a degree at a time from ${String(REFERENCE_MIN_TILT_DEG)} to ${String(REFERENCE_MAX_TILT_DEG)} degrees, because this is the design that is meant to generate the most and a rule of thumb that puts it below the balanced one would make the name wrong`
          : `Panels are fixed at ${finalTiltDeg.toFixed(0)} degrees, which is ${TILT_LATITUDE_FACTOR[archetype].toFixed(2)} of the site latitude of ${latitude.toFixed(0)} degrees, a published rule of thumb anchored on the energy optimum near 0.85 of latitude. Nothing on this plot was measured to arrive at it. Tilting steeper from here shrinks each row's footprint on the ground and brings the rows closer together, how much light that leaves the beds is the measured figure beside this design`,
    `Rows sit ${pitchM.toFixed(1)} m apart, which puts about ${(projected * 100).toFixed(0)} percent of the ground under panel as seen from overhead. That's the footprint the shade budget for this planting allows. The light the plot loses is a separate figure, measured over the whole year and reported with this design. It comes out lower than the footprint where light reaches in from the sides, and higher where ${geometry.rowCount === 1 ? 'the rows are close enough for their shadows to sweep most of the ground' : `all ${String(geometry.rowCount)} rows put a moving shadow over most of the plot`}`,
    `Headroom under the lowest panel edge is ${plan.clearanceM.toFixed(2)} m`,
    ...compromises,
  ].join('. ')
  return {
    archetype,
    label: ARCHETYPE_LABEL[archetype],
    geometry,
    tracker,
    groundCoverRatio: fraction(groundCoverRatio),
    rationale,
    citations: [...ELEVATED_CITATIONS],
  }
}

const verticalCandidate = (answers: OnboardingAnswers): ArrayCandidate => {
  const model: HeightModel = {
    unitM: DESIGN_MODULE.widthM,
    riseFactor: 1,
    tiltAdjustable: false,
    minTiltDeg: 90,
  }
  const { plan, compromises } = fitToMaxHeight(
    { clearanceM: VERTICAL_CLEARANCE_M, tiltDeg: 90, stackCount: VERTICAL_MODULES_UP },
    model,
    answers.maxHeightM,
  )
  const collectorWidthM = plan.stackCount * DESIGN_MODULE.widthM
  const pitchM = clamp(
    (VERTICAL_MIN_PITCH_M * VERTICAL_SHADE_AT_MIN_PITCH) / Math.max(shadeBudgetFor(answers), 0.05),
    VERTICAL_MIN_PITCH_M,
    VERTICAL_MAX_PITCH_M,
  )
  const fill = fillPlot(answers, true, pitchM, DESIGN_MODULE.widthM)
  const geometry: RowGeometry = {
    collectorWidthM: meters(collectorWidthM),
    pitchM: meters(pitchM),
    rowLengthM: meters(fill.rowLengthM),
    rowCount: fill.rowCount,
    modulesPerRow: fill.modulesPerRow,
    clearanceHeightM: meters(plan.clearanceM),
    // north-south walls run north to south. The faces look east and west
    rowAzimuthDeg: degrees(0),
    originM: { xM: meters(0), yM: meters(0) },
  }
  return {
    archetype: 'vertical-east-west',
    label: ARCHETYPE_LABEL['vertical-east-west'],
    geometry,
    tracker: { mode: 'fixed', tiltDeg: degrees(90), surfaceAzimuthDeg: degrees(90) },
    groundCoverRatio: fraction(collectorWidthM / pitchM),
    rationale: [
      'Panels stand upright in north-south walls, catching the morning sun on one face and the evening sun on the other',
      `The shadow is a narrow band that sweeps across the ground, and at solar noon there is almost none of it. Rows are ${pitchM.toFixed(1)} m apart, the literature puts crops at 8 m spacing above 75 percent of open-field light`,
      `The bottom edge sits ${plan.clearanceM.toFixed(2)} m off the ground, at or above the 1 m the published work asks for even ground brightness`,
      ...compromises,
    ].join('. '),
    citations: [...VERTICAL_CITATIONS],
  }
}

const controlCandidate = (): ArrayCandidate => ({
  archetype: 'no-array-control',
  label: ARCHETYPE_LABEL['no-array-control'],
  geometry: {
    collectorWidthM: meters(0),
    pitchM: meters(1),
    rowLengthM: meters(0),
    rowCount: 0,
    modulesPerRow: 0,
    clearanceHeightM: meters(0),
    rowAzimuthDeg: degrees(0),
    originM: { xM: meters(0), yM: meters(0) },
  },
  tracker: { mode: 'fixed', tiltDeg: degrees(0), surfaceAzimuthDeg: degrees(180) },
  groundCoverRatio: fraction(0),
  rationale:
    "No panels: the open sky over your plot, and the garden you already have. Every other design on this list is read against it, so you can see what it costs you. It's also the crop denominator of the land equivalent ratio",
  citations: [...CONTROL_CITATIONS],
})

/**
 * How `food-first` is built. Its name promises the most light left on the ground, and like
 * `energy-first` it was taking a tilt from a latitude rule that doesn't know which way that
 * quantity moves. This derives it instead, and it costs NO simulation: what a fixed row takes
 * from the ground scales with the panel it puts overhead, and that is arithmetic.
 *
 * Each row's overhead footprint is `collectorWidth * cos(tilt)`, so a steeper row covers less
 * ground. And `fillPlot` puts a whole number of rows on a finite plot, with the pitch
 * `collectorWidth * cos(tilt) / projected` closing up as tilt rises until another row fits.
 * The panel over the plot is the product of the two, `rows(tilt) * cos(tilt)`, and it's not
 * monotonic in tilt: on a 40 by 25 m plot two rows fit at every tilt in the band and the
 * steepest shades least, while on a 30 by 60 m plot the flattest tilt fits four rows where 20
 * degrees fits five, and the flattest shades least. So the band is walked a degree at a time and
 * the tilt with the least panel overhead wins, the flatter of two equals.
 *
 * Measured on the rows as they run (east to west) with the CPU reference
 * backend at 42.4 N, ground rows: at one row, season RSR FALLS as tilt rises, 0.256 -> 0.243 ->
 * 0.218 on 16 by 12 m and 0.267 -> 0.262 -> 0.246 on 40 by 25 m at 10, 20 and 35 degrees. On
 * 30 by 60 m the flattest tilt is four rows at 0.221 against five rows at 0.264 and 0.254. The
 * ratio 0.256 / 0.218 is 1.17 against cos(10) / cos(35) of 1.20, which is the footprint doing
 * nearly all of the work.
 *
 * Figures read off rows that run north to south with the panels tilted along their own row (see
 * `rowAzimuthDeg` in `tiltedCandidate`) are faithful readings of an array that can't exist, and
 * they can support either rule: that flatter dims the ground, or that flatter brightens it
 */
export const groundLightPlan = (answers: OnboardingAnswers, site: Site): EnergyPlan => {
  let best: EnergyPlan = { tiltDeg: REFERENCE_MIN_TILT_DEG, tracking: false }
  let least = Number.POSITIVE_INFINITY
  for (let tiltDeg = REFERENCE_MIN_TILT_DEG; tiltDeg <= REFERENCE_MAX_TILT_DEG; tiltDeg += 1) {
    const plan: EnergyPlan = { tiltDeg, tracking: false }
    const built = tiltedCandidate('food-first', answers, site, plan)
    // the tilt the height cap left, which is what the rows were actually spaced for
    const stood = built.tracker.mode === 'fixed' ? built.tracker.tiltDeg : tiltDeg
    const overhead = built.geometry.rowCount * cosDeg(degrees(stood))
    if (overhead < least - 1e-9) {
      least = overhead
      best = plan
    }
  }
  return best
}

/** The house a candidate's rows run through, or null when it stands clear or carries no rows */
const houseUnderRows = (candidate: ArrayCandidate, houses: readonly House[]): House | null =>
  candidate.geometry.rowCount === 0 || houses.length === 0
    ? null
    : overlapsAHouse(rowsFootprint(candidate.geometry), houses)

export const candidatesFor = (
  answers: OnboardingAnswers,
  site: Site,
  tiltPlans: Partial<Record<TiltedArchetype, EnergyPlan>> = {},
  /** Drawn houses no candidate's rows may run through. A tree is never policed (Record 26) */
  houses: readonly House[] = [],
): readonly ArrayCandidate[] => {
  // `food-first` needs no weather to settle its tilt, so it defaults here. `energy-first` does,
  // so `suggestDesigns` passes it in. An injected plan wins over either
  const plans: Partial<Record<TiltedArchetype, EnergyPlan>> = {
    'food-first': groundLightPlan(answers, site),
    ...tiltPlans,
  }
  const offered = new Set(MOUNTING_ARCHETYPES[answers.mounting])
  const built = ARCHETYPE_ORDER.filter((archetype) => offered.has(archetype)).map((archetype) =>
    archetype === 'no-array-control'
      ? controlCandidate()
      : archetype === 'vertical-east-west'
        ? verticalCandidate(answers)
        : tiltedCandidate(
            archetype as TiltedArchetype,
            answers,
            site,
            plans[archetype as TiltedArchetype] ?? null,
          ),
  )
  return built.filter((candidate) => houseUnderRows(candidate, houses) === null)
}

/**
 * Why a candidate the mounting choice offers is missing from `candidatesFor`'s own list: its rows
 * run through a house. Read separately from the filtered list itself, on the same inputs, so naming
 * what was dropped costs one more build of the geometry, which is cheap
 */
export const houseOverlapNotes = (
  answers: OnboardingAnswers,
  site: Site,
  houses: readonly House[],
  tiltPlans: Partial<Record<TiltedArchetype, EnergyPlan>> = {},
): readonly string[] => {
  if (houses.length === 0) return []
  return candidatesFor(answers, site, tiltPlans).flatMap((candidate) => {
    const house = houseUnderRows(candidate, houses)
    return house === null
      ? []
      : [`${candidate.label} wasn't offered, because its rows run through ${house.label}`]
  })
}

const plotFor = (
  answers: OnboardingAnswers,
  site: Site,
  candidate: ArrayCandidate,
  groundCover: GroundCover,
  obstructions: readonly Obstruction[],
): GardenPlot => {
  const footprint = rectangle(answers.plotWidthM, answers.plotDepthM)
  const bed: Bed = {
    id: bedId('whole-plot'),
    label: 'Whole plot',
    footprint,
    areaM2: squareMeters(answers.plotWidthM * answers.plotDepthM),
    soil: site.soil,
    irrigation: {
      method: answers.irrigationAvailable ? 'drip' : 'none',
      available: answers.irrigationAvailable,
      appliedMmPerYear: (answers.irrigationAvailable
        ? 300
        : 0) as Bed['irrigation']['appliedMmPerYear'],
    },
    raisedHeightM: meters(0),
    modifiers: [],
    waterHarvesting: [],
    plantings: [],
  }
  return {
    id: plotId('suggested'),
    siteId: site.id,
    label: answers.locationLabel,
    boundary: footprint,
    northOffsetDeg: degrees(0),
    originOffsetM: { xM: meters(0), yM: meters(0) },
    beds: [bed],
    arrays:
      candidate.archetype === 'no-array-control'
        ? []
        : [arrayWithDerived(candidate.label, candidate.geometry, candidate.tracker)],
    obstructions,
    groundCover,
  }
}

const flagsFrom = (check: ComplianceCheck, shade: ShadeBudgetCheck): ScenarioFlags => {
  const clearance = check.results.filter((result) => result.criterion.key.startsWith('clearance:'))
  const sunlight = check.results.find((result) => result.criterion.key === 'sunlight-everywhere')
  const notes = [
    ...check.results.flatMap((result) =>
      result.outcome === 'misses' || (result.outcome === 'approximate' && result.remedy !== null)
        ? [`${result.criterion.label}: ${result.remedy ?? ''}`]
        : [],
    ),
    ...(sunlight?.outcome === 'approximate' ? [sunlight.windowDisclaimer] : []),
    ...(check.waiverNote === '' ? [] : [check.waiverNote]),
    clearance.length === 0
      ? "There's no array, so no clearance parameter applies"
      : `Measured against the Massachusetts SMART Dual-use expedited design parameters, which this design ${check.overall === 'meets-expedited-parameters' ? 'meets' : 'would need an exception request for'}`,
  ]
  return {
    meetsExpeditedClearance: clearance.every((result) => result.outcome === 'meets'),
    fiftyPercentEverywhere:
      sunlight !== undefined &&
      sunlight.outcome === 'approximate' &&
      sunlight.measured >= sunlight.threshold,
    shade,
    notes,
  }
}

const lightGateExcluded = (ranked: readonly CropRecommendation[]): readonly CropId[] =>
  ranked
    .filter(
      (entry) =>
        entry.outcome.verdict === 'excluded' && entry.outcome.limiting.stage === 'light-gate',
    )
    .map((entry) => entry.cropId)

const admitted = (ranked: readonly CropRecommendation[]): readonly CropRecommendation[] =>
  ranked.filter((entry) => entry.outcome.verdict !== 'excluded')

const basketOf = (ranked: readonly CropRecommendation[]): readonly CropRecommendation[] =>
  [...admitted(ranked)]
    .sort(
      (a, b) => scoreOf(b) - scoreOf(a) || (a.cropId as string).localeCompare(b.cropId as string),
    )
    .slice(0, DESIGN_BASKET_SIZE)

interface Evaluated {
  readonly candidate: ArrayCandidate
  readonly light: ScenarioLight
  readonly production: ScenarioYield
  readonly water: ScenarioWater
  readonly flags: ScenarioFlags
  readonly layout: BedLayout
  readonly energyRatio: Banded<Fraction>
  readonly lightExcluded: readonly CropId[]
  readonly tierCShare: number
}

/** A plot with no room for a bed still gets a scenario: it just gets no beds, and says why */
const refusedLayout = (reason: string): BedLayout => ({
  beds: [],
  banded: false,
  explanation: reason,
  refusals: [reason],
})

/** The weather and solar position every candidate shares, computed once for the whole set */
interface Shared {
  readonly position: SolarPositionSeries
  readonly weather: TmySeries
  /**
   * Built once from `deps.groundCover`, because three separate readings are taken off it: the
   * per-candidate annual AC used to rank, the per-array energy in the report, and the reference
   * array inside the land equivalent ratio. Passing `DEFAULT_PV_CHAIN_OPTIONS` to each would have a
   * grower who mulched with straw compare layouts at grass albedo and then read a different number
   * for the winner in the editor
   */
  readonly chainOptions: PvChainOptions
  /**
   * The site's rain-hour wind rose, computed once for the whole set: every candidate bakes on
   * the same plot in the same weather, so the water term reads one shared rose across all five
   * candidates, the same one the app's own water panel would compute for this site
   */
  readonly rain: RainWind
}

/** Decision Record 2.3: the PV chain and the ground map must read the same sky */
const sharedFor = (deps: DesignDependencies): Shared => {
  const position = solarPositionSeries(deps.weather.utcMillis, observerFor(deps.site), 'nrel-spa')
  return {
    position,
    chainOptions: chainOptionsFor(deps.site, deps.weather, deps.groundCover),
    rain: rainWind(deps.weather),
    weather: decompose(
      deps.weather,
      position,
      selectDecompositionModel(
        deps.weather.decomposition !== 'passthrough' ||
          deps.weather.dniWM2.some((value) => value > 0),
        60,
      ),
    ),
  }
}

const annualAcKwhOf = (candidate: ArrayCandidate, shared: Shared): number =>
  runAnnualChain(
    arrayWithDerived(candidate.label, candidate.geometry, candidate.tracker),
    shared.weather,
    shared.position,
    shared.chainOptions,
  ).annualAcKwh

/**
 * How `energy-first` is built, measured on the site's own weather.
 *
 * Every other archetype here derives its geometry from a published rule of thumb, and for this
 * one that wasn't good enough. `energy-first` is the design whose whole promise is that it
 * generates the most, so a rule that puts it below `balanced`
 * makes the label a lie, and both halves of the rule were measured doing exactly that at 42.4 N
 * on this project's own chain. The bare-panel annual optimum sits near 0.85 of latitude,
 * but pitch here isn't free of tilt: the shade budget is fixed as a *projected*
 * ground coverage, so flattening the panels widens the rows by exactly as much as it shortens
 * their shadow, and the row-to-row shading falls with it. Swept a degree at a time on a 16 by
 * 11 m plot the curve is smooth with an interior maximum at 21 degrees and 10 027 kWh, falling
 * to 9 711 kWh by 35 degrees, which is below `balanced` at 31.8 degrees and 9 872 kWh on
 * identical hardware. Separately, a tracker turns the rows onto a north-south axis, and on a
 * 3.5 by 2.4 m courtyard that halved the modules the plot could hold and cost more than tracking
 * won back, so tracking is now taken only when it measures better.
 *
 * The sweep is whole degrees across the whole reference band, which is every tilt any sibling
 * archetype can be built at, so no sibling can beat `energy-first` on tilt alone. It spends no
 * extra shade: projected coverage is what the budget is written in and it's held fixed across the
 * sweep, so what moves is the shape of the shadow. Ties go to the
 * lower tilt, which casts the shorter shadow, and the order is fixed, so the search stays
 * deterministic. It costs one PV chain run per tilt and no light bake at all, which is why it's
 * affordable when a whole extra candidate isn't
 */
export const measuredEnergyPlan = (
  answers: OnboardingAnswers,
  site: Site,
  shared: Shared,
): EnergyPlan => {
  const latitude = Math.abs(site.location.latitudeDeg)
  const fixed = Array.from(
    { length: REFERENCE_MAX_TILT_DEG - REFERENCE_MIN_TILT_DEG + 1 },
    (_, index): EnergyPlan => ({ tiltDeg: REFERENCE_MIN_TILT_DEG + index, tracking: false }),
  )
  // a tracker's pose doesn't follow the tilt, so it's one candidate
  const plans: readonly EnergyPlan[] = tracksFor(answers, site, answers.maxHeightM)
    ? [
        ...fixed,
        {
          tiltDeg: clamp(
            TILT_LATITUDE_FACTOR['energy-first'] * latitude,
            REFERENCE_MIN_TILT_DEG,
            REFERENCE_MAX_TILT_DEG,
          ),
          tracking: true,
        },
      ]
    : fixed
  let best = plans[0] as EnergyPlan
  let bestKwh = -1
  for (const plan of plans) {
    const kwh = annualAcKwhOf(tiltedCandidate('energy-first', answers, site, plan), shared)
    if (kwh > bestKwh) {
      best = plan
      bestKwh = kwh
    }
  }
  return best
}

/**
 * A `RainField` built from a plot's own ground and whichever beds are asked about. The shelter,
 * drip and values arrays are the ground itself and never change bed to bed, only the per-bed
 * figures `rainOnBed` reads off them
 */
const fieldOf = (ground: RainGround, beds: readonly BedRain[]): RainField => ({
  grid: ground.grid,
  wind: ground.wind,
  shelter: ground.shelter,
  drip: ground.drip,
  values: ground.values,
  beds,
})

/**
 * What the slide asks at every offset it tries: how many millimeters a bed would go short of over
 * a year if it stood there, the same balance the water term below ranks the whole candidate on,
 * read at the mid capacity with no irrigation. Read on the reference crop, since a bed the search
 * is still trying positions for carries no planting yet, and area-weighted over the footprints it
 * is handed, one at a time as `slideBeds` asks today. `ground` is built once by the caller and
 * read again here at every offset, because the panel loop it costs is the expensive part of a
 * balance and one more balance run against it is cheap
 */
const shortfallJudge = (
  deps: DesignDependencies,
  plot: GardenPlot,
  raster: DliRaster,
  answers: OnboardingAnswers,
  ground: RainGround,
): ((footprints: readonly Polygon2D[]) => number) => {
  const template = plot.beds[0] as Bed
  const balanceShared = waterBalanceShared({
    site: deps.site,
    weather: deps.weather,
    plot,
    bedLight: [],
    catalog: deps.catalog,
    rain: fieldOf(ground, []),
  })
  return (footprints) => {
    let sumMm = 0
    let areaSumM2 = 0
    for (const [index, footprint] of footprints.entries()) {
      const bed: Bed = {
        ...template,
        id: bedId(`slide-${String(index)}`),
        label: `Slide candidate ${String(index)}`,
        footprint,
        areaM2: polygonAreaM2(footprint),
      }
      const light = shadedBySurroundings(bedLightOf(raster, bed.id, footprint), answers.exposure)
      const rain = rainOnBed(ground, plot.arrays, bed)
      sumMm += bedShortfallMm(balanceShared, bed, light, rain) * bed.areaM2
      areaSumM2 += bed.areaM2
    }
    return areaSumM2 > 0 ? sumMm / areaSumM2 : 0
  }
}

/**
 * The water balance's own reading of this candidate's placed beds: each bed's unirrigated
 * deficit in millimeters at the middle of its soil's available-water range, open to the sky and
 * again under this candidate's own monthly shade, rain shadows and drip strips, area-weighted
 * over the beds. `deficitMm` is the point figure the balance already produces, where
 * `irrigationOpenSkyMm` and `irrigationUnderPanelsMm` are `Banded` ones, and turning a band into
 * one number is gated behind an allowlist that Decision Record 10c keeps design.ts off.
 * The rain field runs on `ground`, this candidate's own rain ground, built once in `evaluate` and
 * passed in here. Every candidate's ground comes off the same rain-hour wind rose, `shared.rain`,
 * so every layout is still read against the same rain. A refused layout, no beds at all, saves
 * and loses nothing
 */
const scenarioWaterOf = (
  deps: DesignDependencies,
  plot: GardenPlot,
  layout: BedLayout,
  ground: RainGround,
): ScenarioWater => {
  if (layout.beds.length === 0) {
    return {
      deficitOpenSkyMm: millimeters(0),
      deficitUnderPanelsMm: millimeters(0),
      deficitSavedFraction: fraction(0),
    }
  }
  const template = plot.beds[0] as Bed
  const beds: Bed[] = layout.beds.map((placement) => ({
    ...template,
    id: placement.bedId,
    label: placement.label,
    footprint: placement.footprint,
    areaM2: polygonAreaM2(placement.footprint),
  }))
  const placed: GardenPlot = { ...plot, beds }
  const field = fieldOf(
    ground,
    placed.beds.map((bed) => rainOnBed(ground, placed.arrays, bed)),
  )
  const balances = waterBalances({
    site: deps.site,
    weather: deps.weather,
    plot: placed,
    bedLight: layout.beds.map((placement) => placement.light),
    catalog: deps.catalog,
    rain: field,
  })

  let openSumMm = 0
  let underSumMm = 0
  let areaSumM2 = 0
  for (const bed of beds) {
    const balance = balances.find((entry) => entry.bedId === bed.id)
    if (balance === undefined) continue
    openSumMm += balance.openSky.deficitMm * bed.areaM2
    underSumMm += balance.underPanels.deficitMm * bed.areaM2
    areaSumM2 += bed.areaM2
  }
  const deficitOpenSkyMm = areaSumM2 > 0 ? openSumMm / areaSumM2 : 0
  const deficitUnderPanelsMm = areaSumM2 > 0 ? underSumMm / areaSumM2 : 0
  return {
    deficitOpenSkyMm: millimeters(deficitOpenSkyMm),
    deficitUnderPanelsMm: millimeters(deficitUnderPanelsMm),
    deficitSavedFraction: fraction(
      deficitOpenSkyMm > 0 ? 1 - deficitUnderPanelsMm / deficitOpenSkyMm : 0,
    ),
  }
}

const evaluate = (
  deps: DesignDependencies,
  shared: Shared,
  answers: OnboardingAnswers,
  candidate: ArrayCandidate,
  plot: GardenPlot,
  raster: DliRaster,
  // null marks the open-sky control itself: it's the baseline, so nothing is lost to it
  controlLightExclusions: ReadonlySet<string> | null,
): Evaluated => {
  const bed = plot.beds[0] as Bed
  // the panels' own shade, which is what the shade budget and the daylight figures are
  // written in. The crops are judged on it with the surroundings' share taken off as well
  const light = bedLightOf(raster, bed.id, bed.footprint)
  const window = growingWindowFor(deps.site)
  const season = seasonLight(light, window, null)

  const sets = runRecommendationPipeline({
    site: deps.site,
    plot,
    bedLight: [shadedBySurroundings(light, answers.exposure)],
    catalog: deps.catalog,
    companionRules: deps.companionRules,
    rotationConstraints: deps.rotationConstraints,
    frostPercentile: DEFAULT_FROST_PERCENTILE,
    weights: DEFAULT_WEIGHTS,
    preferredCropIds: [],
  })
  const ranked = sets[0]?.ranked ?? []
  const basket = basketOf(ranked)

  const energies = plot.arrays.map((array) =>
    runAnnualChain(array, shared.weather, shared.position, shared.chainOptions),
  )
  const ratio = energyRatio(
    plot.arrays,
    energies,
    deps.site.location.latitudeDeg,
    shared.weather,
    shared.position,
    shared.chainOptions,
  ).ratio
  const estimates = basket.flatMap((entry) =>
    entry.outcome.verdict === 'excluded' ? [] : [entry.outcome.estimate],
  )

  const check = checkMassachusettsSmart({ plot, raster, growingWindow: window })
  const tierC = basket.filter(
    (entry) => cropById(deps.catalog, entry.cropId)?.light.dliMinMolM2Day.tier === 'C',
  ).length

  // this candidate's own rain ground, built once here and read again by the slide's judge at
  // every offset it tries and by the water term below, so the panel loop it costs is paid for
  // once per candidate
  const ground = rainGround(plot, shared.rain)
  const shortfallMm =
    plot.arrays.length === 0 ? undefined : shortfallJudge(deps, plot, raster, answers, ground)

  // the beds this candidate would get, placed against the ground light it actually casts
  const layout = placeBeds({
    plotWidthM: answers.plotWidthM,
    plotDepthM: answers.plotDepthM,
    arrays: plot.arrays,
    raster,
    window,
    maxBeds: answers.maxBeds ?? undefined,
    exposure: answers.exposure,
    houses: houseFootprints(plot),
    shortfallMm,
  })
  const resolvedLayout = layout.ok ? layout.value : refusedLayout(layout.reason)

  return {
    candidate,
    layout: resolvedLayout,
    energyRatio: ratio,
    light: {
      meanGrowingSeasonDli: season.meanDliMolM2Day,
      worstCellDli: season.minMonthlyDliMolM2Day,
      meanShadeRatio: season.cumulativeRsr,
      homogeneity: light.homogeneity.minOverMean,
    },
    production: {
      annualAcKwh: energies.reduce(
        (total, entry) => (total + entry.annualAcKwh) as KilowattHours,
        0 as KilowattHours,
      ),
      landEquivalentRatio: landEquivalentRatio(estimates, ratio).totalLer,
      cropsAvailable: admitted(ranked)
        .map((entry) => entry.cropId)
        .sort((a, b) => (a as string).localeCompare(b as string)),
      cropsLostToShade:
        controlLightExclusions === null
          ? []
          : lightGateExcluded(ranked)
              .filter((id) => !controlLightExclusions.has(id as string))
              .sort((a, b) => (a as string).localeCompare(b as string)),
    },
    // the water balance's own reading of these placed beds, the figure the water objective
    // ranks on, computed by `scenarioWaterOf`
    water: scenarioWaterOf(deps, plot, resolvedLayout, ground),
    // the shade the planting can take, against the shade the bake says it gets, since the footprint
    // the rows were sized from isn't a measurement
    flags: flagsFrom(check, {
      maxRatio: shadeBudgetFor(answers),
      measuredRatio: season.cumulativeRsr,
      withinBudget: season.cumulativeRsr <= shadeBudgetFor(answers) + 1e-9,
    }),
    lightExcluded: lightGateExcluded(ranked),
    tierCShare: basket.length === 0 ? 1 : tierC / basket.length,
  }
}

const normalize = (values: readonly number[]): readonly number[] => {
  const low = Math.min(...values)
  const high = Math.max(...values)
  return high - low <= 1e-9
    ? values.map(() => 1)
    : values.map((value) => (value - low) / (high - low))
}

const normalizedObjective = (objective: DesignObjective): DesignObjective => {
  const total = objective.food + objective.energy + objective.water + objective.simplicity
  if (total <= 0) return { food: 0.25, energy: 0.25, water: 0.25, simplicity: 0.25 }
  return {
    food: objective.food / total,
    energy: objective.energy / total,
    water: objective.water / total,
    simplicity: objective.simplicity / total,
  }
}

const simplicityOf = (evaluated: Evaluated): number => {
  if (evaluated.candidate.archetype === 'no-array-control') return 1
  const tracking = evaluated.candidate.tracker.mode !== 'fixed'
  return clamp(
    1 - 0.25 - (tracking ? 0.2 : 0) - 0.05 * Math.min(evaluated.candidate.geometry.rowCount, 6),
    0,
    1,
  )
}

/** Where Laub et al. 2022 tabulate their per-group yield anchors. Past it the evidence thins */
const LAUB_TABULATED_ANCHOR_RSR = 0.4

/**
 * Never `high`. Every scenario here rests on per-crop DLI absolutes that Decision Record 7
 * grades Tier C, so `moderate` is the ceiling this evidence supports and claiming the top of
 * the scale would be the false precision that record forbids.
 * A scenario falls to `low` when it adds an approximation of its own: a tracked array (whose
 * sky-patch pose is baked at peak elevation), shade past the 40 percent level where the crop
 * anchors are tabulated, a water-limited site (where the shade-benefit pathway is in play) or
 * a crop basket in which every entry's light threshold is an unmeasured class inference
 */
const confidenceOf = (evaluated: Evaluated, site: Site): DesignScenario['confidence'] =>
  evaluated.candidate.tracker.mode !== 'fixed' ||
  evaluated.light.meanShadeRatio > LAUB_TABULATED_ANCHOR_RSR ||
  site.waterLimitation.limited ||
  evaluated.tierCShare >= 1
    ? 'low'
    : 'moderate'

const listOf = (catalog: readonly Crop[], ids: readonly CropId[]): string =>
  ids
    .slice(0, 4)
    .map((id) => cropName(catalog, id))
    .join(', ')

const summaryOf = (evaluated: Evaluated, control: Evaluated): string => {
  const { candidate, light, production } = evaluated
  if (candidate.archetype === 'no-array-control') {
    return `No panels. Your plot gets about ${light.meanGrowingSeasonDli.toFixed(0)} moles of light per square meter a day through the growing season, and ${String(production.cropsAvailable.length)} plants from the catalog suit the site. Everything else on this list is measured against it`
  }
  const kept = (100 * (1 - light.meanShadeRatio)).toFixed(0)
  const geometry = candidate.geometry
  const orientation =
    candidate.archetype === 'vertical-east-west'
      ? 'standing upright in north-south walls'
      : geometry.rowAzimuthDeg === 90
        ? 'running east to west'
        : 'running north to south'
  return `${String(geometry.rowCount)} row${geometry.rowCount === 1 ? '' : 's'} of panels ${orientation}, ${geometry.pitchM.toFixed(1)} m apart, with ${geometry.clearanceHeightM.toFixed(1)} m of headroom underneath. Your plot keeps about ${kept} percent of the daylight it gets with no panels, and ${String(production.cropsAvailable.length)} of the ${String(control.production.cropsAvailable.length)} plants that suit your site still work under it`
}

/**
 * A yearly kWh the way a person says it: two figures and a thousands separator.
 *
 * Six digits with no comma, as in "roughly 268234 kWh", read as false precision from a model run,
 * and a grower can't read them at all
 */
export const roughKwh = (value: number): string => {
  const magnitude = Math.floor(Math.log10(Math.max(1, value)))
  const step = 10 ** Math.max(0, magnitude - 1)
  const rounded = Math.round(value / step) * step
  return String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

const tradeoffOf = (evaluated: Evaluated, catalog: readonly Crop[]): string => {
  const { candidate, light, production } = evaluated
  if (candidate.archetype === 'no-array-control') {
    return 'No electricity at all, and no shelter from heat or heavy rain. Every other design on this list trades some daylight for power, this one trades none'
  }
  const given = (100 * light.meanShadeRatio).toFixed(0)
  const kwh = roughKwh(production.annualAcKwh)
  const lost = production.cropsLostToShade
  const lostText =
    lost.length === 0
      ? 'Nothing on the plant list drops out at this shade level'
      : `${String(lost.length)} plant${lost.length === 1 ? '' : 's'} drop off the list at this shade level: ${listOf(catalog, lost)}`
  const patchy = light.homogeneity < 0.5
  const beds = evaluated.layout.beds.length
  // said before the layout is applied, so a grower who drew four beds sees up front that it fits
  // only two
  const bedsText = `${String(beds)} bed${beds === 1 ? '' : 's'} fit the light it leaves`
  const saved = evaluated.water.deficitSavedFraction
  const percent = Math.round(Math.abs(saved) * 100)
  const waterText =
    percent === 0
      ? 'By the water balance its beds go short of about the same water over a year as they would open to the sky'
      : saved > 0
        ? `By the water balance its beds go short of about ${String(percent)} percent less water over a year than they would open to the sky`
        : `By the water balance its beds go short of about ${String(percent)} percent more water over a year than they would open to the sky, where the rows keep rain off ground they leave in the sun`
  return `You give up about ${given} percent of your daylight for roughly ${kwh} kWh of electricity a year. ${bedsText}. ${waterText}. ${lostText}. ${patchy ? 'The darkest part of the plot gets less than half the light of the average, so keep the shade-tolerant plants for it' : 'The light is spread evenly enough that you can plant the whole plot much the same way'}`
}

const NOT_CONSIDERED_BASE: readonly string[] = [
  "Semi-transparent, checkerboard and spaced-module layouts weren't tried. They buy a more even ground light for a linear loss of electricity and are a real option this search doesn't cover",
  "The plot is treated as a level rectangle with a clear horizon. Slope, buildings, trees and fences on the site weren't modeled",
  "Cost, planning permission, grid connection and mounting structure weren't considered at all",
]

/**
 * Five candidate geometries, one per archetype, each scored on a full annual light bake
 * and ranked by the grower's own objective weights.
 *
 * The search is deliberately not a sweep. Each candidate costs one annual bake, so the cap is the
 * five archetypes, and `notConsidered` states it plainly. Geometry is derived from the answers:
 * tilt per archetype (see `groundLightPlan` and `measuredEnergyPlan`), the panels' facing from
 * hemisphere, pitch from the shade the planting can afford, rows and length from the plot,
 * clearance from the height limit and the applicable floors
 */
export const suggestDesigns = async (
  answers: OnboardingAnswers,
  overrides: Partial<DesignDependencies> = {},
): Promise<ScenarioSet> => {
  const resolved =
    overrides.site !== undefined && overrides.weather !== undefined
      ? { site: overrides.site, weather: overrides.weather }
      : await resolveSite(answers.location, answers.locationLabel, null)
  const [catalog, companionRules, rotationConstraints] = await Promise.all([
    overrides.catalog ?? loadCropCatalog(),
    overrides.companionRules ?? loadCompanionRules(),
    overrides.rotationConstraints ?? loadRotationConstraints(),
  ])
  const deps: DesignDependencies = {
    site: overrides.site ?? resolved.site,
    weather: overrides.weather ?? resolved.weather,
    catalog,
    companionRules,
    rotationConstraints,
    backend: overrides.backend ?? detectBackendKind(),
    groundCover: overrides.groundCover ?? DEFAULT_GROUND_COVER,
    obstructions: overrides.obstructions ?? [],
    targetCellSizeM: overrides.targetCellSizeM ?? FINAL_OPTIONS.targetCellSizeM,
    subdivision: overrides.subdivision ?? FINAL_OPTIONS.subdivision,
    substepsPerHour: overrides.substepsPerHour ?? FINAL_OPTIONS.substepsPerHour,
    tiltPlans: overrides.tiltPlans ?? {},
    run: overrides.run ?? runSimulation,
    onProgress: overrides.onProgress ?? (() => {}),
  }

  /**
   * One yield, before any of the work, and it's worth the line it costs.
   *
   * Everything below up to the first `onProgress` runs without touching the event loop: `sharedFor`
   * builds a year of NREL SPA solar positions and `measuredEnergyPlan` sweeps a degree at a time
   * through 27 annual chains. Measured on a 163-crop catalog at 8,760 hours, that is about 55 ms
   * and 73 ms respectively. Neither is slow enough to be worth moving off the main thread, but both
   * run BEFORE the caller's own "working" state has a chance to paint, so without this yield a
   * visitor pressing the button would get a tenth of a second of nothing.
   *
   * This waits on `setTimeout`: a resolved promise is drained before paint, so
   * awaiting one would yield to the scheduler without ever letting the browser draw
   */
  await new Promise((resolve) => setTimeout(resolve, 0))

  const shared = sharedFor(deps)
  const tiltPlans: Partial<Record<TiltedArchetype, EnergyPlan>> = {
    ...(MOUNTING_ARCHETYPES[answers.mounting].includes('energy-first')
      ? { 'energy-first': measuredEnergyPlan(answers, deps.site, shared) }
      : {}),
    // an injected plan wins, so a test can hold one archetype's tilt still and read the light
    ...deps.tiltPlans,
  }
  const houses = housesOf(deps.obstructions)
  const candidates = candidatesFor(answers, deps.site, tiltPlans, houses)
  // the control is baked first so every other scenario can subtract the crops the open sky
  // already refuses, and report only the ones the panels actually cost
  const ordered = [
    ...candidates.filter((entry) => entry.archetype === 'no-array-control'),
    ...candidates.filter((entry) => entry.archetype !== 'no-array-control'),
  ]

  const evaluated: Evaluated[] = []
  let controlExclusions: ReadonlySet<string> | null = null
  for (const [index, candidate] of ordered.entries()) {
    const plot = plotFor(answers, deps.site, candidate, deps.groundCover, deps.obstructions)
    const progressOf = (bake: AccumulationProgress | null): DesignProgress => ({
      candidatesDone: index,
      candidatesTotal: ordered.length,
      archetype: candidate.archetype,
      bake,
    })
    // reported before the bake starts, so a caller that draws this has something to draw from
    // the moment the candidate is picked up
    deps.onProgress(progressOf(null))
    const simulation = await deps.run(
      deps.site,
      plot,
      deps.weather,
      {
        ...FINAL_OPTIONS,
        targetCellSizeM: deps.targetCellSizeM,
        subdivision: deps.subdivision,
        substepsPerHour: deps.substepsPerHour,
        backend: deps.backend,
      },
      (bake) => {
        deps.onProgress(progressOf(bake))
      },
    )
    deps.onProgress({ ...progressOf(null), candidatesDone: index + 1 })
    const entry = evaluate(
      deps,
      shared,
      answers,
      candidate,
      plot,
      simulation.raster,
      candidate.archetype === 'no-array-control' ? null : controlExclusions,
    )
    if (candidate.archetype === 'no-array-control') {
      controlExclusions = new Set(entry.lightExcluded.map((id) => id as string))
    }
    evaluated.push(entry)
  }

  const control = evaluated[0] as Evaluated
  const weights = normalizedObjective(answers.objective)
  const foodRaw = evaluated.map(
    (entry) =>
      0.5 *
        Math.min(
          1,
          entry.production.cropsAvailable.length /
            Math.max(control.production.cropsAvailable.length, 1),
        ) +
      0.5 * (1 - entry.light.meanShadeRatio),
  )
  const energyRaw = evaluated.map((entry) => entry.production.annualAcKwh as number)
  const waterRaw = evaluated.map((entry) => entry.water.deficitSavedFraction)
  const simplicityRaw = evaluated.map(simplicityOf)
  const food = normalize(foodRaw)
  const energy = normalize(energyRaw)
  const water = normalize(waterRaw)
  const simplicity = normalize(simplicityRaw)

  const namesake = namesakeOf(weights)
  const scenarios: DesignScenario[] = evaluated
    .map((entry, index) => ({
      candidate: entry.candidate,
      light: entry.light,
      production: entry.production,
      water: entry.water,
      flags: entry.flags,
      layout: entry.layout,
      energyRatio: entry.energyRatio,
      score:
        weights.food * (food[index] ?? 0) +
        weights.energy * (energy[index] ?? 0) +
        weights.water * (water[index] ?? 0) +
        weights.simplicity * (simplicity[index] ?? 0),
      plainSummary: summaryOf(entry, control),
      tradeoff: tradeoffOf(entry, catalog),
      confidence: confidenceOf(entry, deps.site),
    }))
    // strict by score. Only an exactly equal score, two ideas that produced the same geometry,
    // goes to the layout named for what the answers asked for most
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.candidate.archetype === namesake) - Number(a.candidate.archetype === namesake) ||
        ARCHETYPE_ORDER.indexOf(a.candidate.archetype) -
          ARCHETYPE_ORDER.indexOf(b.candidate.archetype),
    )

  const exclusion = MOUNTING_EXCLUSION[answers.mounting]
  const notConsidered = [
    `Exactly ${String(candidates.length)} geometries were evaluated, one per design idea, and almost nothing was swept around them. No other clearance or row count was tried. No other pitch or tilt was tried either, except on the design meant to generate the most, because each full candidate costs a year of light simulation. That design had its tilt picked by trying every angle from ${String(REFERENCE_MIN_TILT_DEG)} to ${String(REFERENCE_MAX_TILT_DEG)} degrees against a year of electricity, which is cheap because it needs no light simulation at all`,
    ...(exclusion === null ? [] : [exclusion]),
    ...houseOverlapNotes(answers, deps.site, houses, tiltPlans),
    ...NOT_CONSIDERED_BASE,
  ]

  return {
    answers,
    plotAreaM2: squareMeters(answers.plotWidthM * answers.plotDepthM),
    scenarios,
    recommendedArchetype: scenarios[0]?.candidate.archetype ?? 'no-array-control',
    notConsidered,
  }
}
