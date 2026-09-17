import {
  loadCompanionRules,
  loadRotationConstraints,
  partitionCompanionRules,
} from '../data/companions'
import { loadCropCatalog } from '../data/crops'
import { loadTekRules } from '../data/tek'
import { bedCalendar } from '../recommend/calendar'
import { runRecommendationPipeline } from '../recommend/pipeline'
import { DEFAULT_WEIGHTS } from '../recommend/stages/rank'
import { bedFixture, bedLightFixture, plotFixture, siteFixture } from '../recommend/testkit'
import { REFERENCE_DEFINITION } from '../sim/pv/ler'
import { PVWATTS_DEFAULT_LOSSES } from '../sim/pv/losses'
import { PV_CHAIN_PROVENANCE } from '../sim/pv/provenance'
import { banded, interval } from '../types/band'
import type { PvEnergyReport } from '../types/energy'
import { bedId, cropId } from '../types/ids'
import type {
  ArrayCandidate,
  BedLayout,
  BedPlacement,
  CandidateArchetype,
  DesignScenario,
  LightZoneKind,
  ScenarioSet,
} from '../types/onboarding'
import type {
  Degrees,
  Fraction,
  KilowattHours,
  KilowattsAc,
  KilowattsDc,
  KwhPerKwp,
  Meters,
  Ratio,
  SquareMeters,
} from '../types/units'
import {
  degrees,
  fraction,
  kilowattHours,
  meters,
  molPerM2Day,
  ratio,
  squareMeters,
} from '../types/units'
import { DEFAULT_LOCATION, DEFAULT_LOCATION_LABEL } from './defaults'
import { polygonOf, rectangleRing, vec2 } from './geom'
import { answersOf, DEFAULT_WIZARD_ANSWERS } from './onboarding'
import { ready } from './slices'
import { useAppStore } from './store'

/**
 * A design candidate and its evaluation in the shape `src/recommend/design.ts` returns, so
 * the wizard and the results view can be driven without a five-bake search behind them
 */
export const designCandidateFixture = (archetype: CandidateArchetype): ArrayCandidate => ({
  archetype,
  label: `A layout: ${archetype}`,
  geometry: {
    collectorWidthM: meters(3.5),
    pitchM: meters(archetype === 'energy-first' ? 6 : 9),
    rowLengthM: meters(9),
    rowCount: 2,
    modulesPerRow: 8,
    clearanceHeightM: meters(2.5),
    rowAzimuthDeg: degrees(90),
    originM: vec2(0, 0),
  },
  tracker: { mode: 'fixed', tiltDeg: degrees(30), surfaceAzimuthDeg: degrees(180) },
  groundCoverRatio: fraction(0.39),
  rationale: 'it is what those answers imply',
  citations: [],
})

const placementFixture = (
  index: number,
  zone: LightZoneKind,
  shadeRatio: number,
): BedPlacement => ({
  bedId: bedId(`bed-${String(index)}`),
  label: `Bed ${String(index)}`,
  footprint: polygonOf(rectangleRing(vec2(0, -1 + (index - 1) * 2), 7, 1.2)),
  zone,
  summary: {
    meanGrowingSeasonDli: molPerM2Day(30 * (1 - shadeRatio)),
    worstCellGrowingSeasonDli: molPerM2Day(24 * (1 - shadeRatio)),
    shadeRatio: fraction(shadeRatio),
  },
  light: bedLightFixture(`bed-${String(index)}`, shadeRatio),
  reason: zone === 'shaded-band' ? 'it sits under a panel row' : 'it sits in the gap between rows',
})

/** Two beds that genuinely differ in light, because a mix is what the placement produces */
export const bedLayoutFixture = (archetype: CandidateArchetype): BedLayout =>
  archetype === 'no-array-control'
    ? {
        beds: [placementFixture(1, 'even-light', 0), placementFixture(2, 'even-light', 0)],
        banded: false,
        explanation: 'The ground light over this plot is one even field',
        refusals: [],
      }
    : {
        beds: [placementFixture(1, 'bright-gap', 0.08), placementFixture(2, 'shaded-band', 0.42)],
        banded: true,
        explanation: 'The light under these panels comes at two levels',
        refusals: [],
      }

export const designScenarioFixture = (archetype: CandidateArchetype): DesignScenario => ({
  candidate: designCandidateFixture(archetype),
  layout: bedLayoutFixture(archetype),
  energyRatio: banded(
    interval(
      fraction(archetype === 'no-array-control' ? 0 : 0.28),
      fraction(archetype === 'no-array-control' ? 0 : 0.36),
    ),
    0.8,
    'range',
    'optical-geometry',
    [],
  ),
  light: {
    meanGrowingSeasonDli: molPerM2Day(21),
    worstCellDli: molPerM2Day(12),
    meanShadeRatio: fraction(archetype === 'no-array-control' ? 0 : 0.28),
    homogeneity: fraction(0.7),
  },
  production: {
    annualAcKwh: kilowattHours(archetype === 'no-array-control' ? 0 : 4200),
    landEquivalentRatio: banded(
      interval(ratio(0.9), ratio(1.3)),
      0.8,
      'range',
      'optical-geometry',
      [{ source: 'optical-geometry', halfWidthFraction: fraction(0.2), note: 'geometry' }],
    ),
    cropsAvailable: [],
    // what the panels cost the plot against the open sky, which the control by definition has none of
    cropsLostToShade:
      archetype === 'no-array-control' ? [] : [cropId('watermelon'), cropId('sweet-potato')],
  },
  flags: {
    meetsExpeditedClearance: true,
    fiftyPercentEverywhere: true,
    shade: {
      maxRatio: 0.3 as Fraction,
      measuredRatio: 0.18 as Fraction,
      withinBudget: true,
    },
    notes: ['a caveat'],
  },
  score: 0.7,
  plainSummary: 'what it does for you',
  tradeoff: 'what it costs you',
  confidence: 'moderate',
})

export const scenarioSetFixture = (recommended: CandidateArchetype = 'balanced'): ScenarioSet => ({
  answers: answersOf(DEFAULT_WIZARD_ANSWERS, DEFAULT_LOCATION, DEFAULT_LOCATION_LABEL, null),
  plotAreaM2: squareMeters(48),
  scenarios: [
    designScenarioFixture('no-array-control'),
    designScenarioFixture('food-first'),
    designScenarioFixture('balanced'),
    designScenarioFixture('energy-first'),
  ],
  recommendedArchetype: recommended,
  notConsidered: ['cost, planning permission and the grid connection'],
})

/**
 * One PV chain result any panel needing an electricity term can be seeded with. The band
 * is deliberately a `range`, which is what the chain actually produces
 */
export const energyReportFixture = (): PvEnergyReport => ({
  arrays: [],
  nameplateDcKw: 30.96 as KilowattsDc,
  nameplateAcKw: 25.8 as KilowattsAc,
  dcAcRatio: 1.2 as Ratio,
  annualAcKwh: 37850 as KilowattHours,
  clippingLossKwh: 120 as KilowattHours,
  clippingLossFraction: 0.0032 as Fraction,
  losses: PVWATTS_DEFAULT_LOSSES,
  systemLossFraction: 0.1408 as Fraction,
  rowShadingLossFraction: 0.0013 as Fraction,
  bifacialGainFraction: 0.096 as Fraction,
  specificYieldKwhPerKwp: 1222 as KwhPerKwp,
  annualAcKwhPerM2Land: 103.4,
  landAreaM2: 366 as SquareMeters,
  reference: {
    groundCoverRatio: 0.4 as Fraction,
    tiltDeg: 35 as Degrees,
    surfaceAzimuthDeg: 180 as Degrees,
    dcAcRatio: 1.2 as Ratio,
    definition: REFERENCE_DEFINITION,
    annualAcKwhPerM2Land: 106.6,
  },
  energyRatio: banded(
    interval(0.82 as Fraction, 1.12 as Fraction),
    0.8,
    'range',
    'optical-geometry',
    [
      {
        source: 'optical-geometry',
        halfWidthFraction: 0.127 as Fraction,
        note: 'The reference is defined at a ground cover ratio sole-use plants vary around',
      },
    ],
  ),
  provenance: PV_CHAIN_PROVENANCE,
})

/** pH 5.4: the one soil in this catalogue where a blueberry anchor is the interesting case */
export const ACID_SOIL = {
  phUnits: 5.4,
  textureClass: 'loam',
  drainage: 'well',
  effectiveDepthM: 1.5 as Meters,
  organicMatterFraction: 0.04 as Fraction,
  sourceId: 'user',
} as const

/**
 * A store already carrying everything the polyculture surface reads: a resolved site, one
 * acid bed, its light field, the catalogue, a real ranking and a real calendar. Automatic
 * ranking is off, so a test drives the actions rather than racing a debounce
 */
export const seedRankedStore = async (): Promise<void> => {
  const [catalog, companionRules, rotationConstraints, tekRules] = await Promise.all([
    loadCropCatalog(),
    loadCompanionRules(),
    loadRotationConstraints(),
    loadTekRules(),
  ])
  const bed = bedFixture('bed-a', { soil: ACID_SOIL, areaM2: 12 as SquareMeters })
  const plot = plotFixture([bed])
  const light = bedLightFixture('bed-a', 0.2)
  const site = siteFixture({ soil: ACID_SOIL })
  useAppStore.setState({
    autoRun: false,
    site: ready(site),
    plot,
    selectedBedId: bed.id,
    bedLight: [light],
    catalog: ready(catalog),
    sets: ready(
      runRecommendationPipeline({
        site,
        plot,
        bedLight: [light],
        catalog,
        companionRules,
        rotationConstraints,
        frostPercentile: 20,
        weights: DEFAULT_WEIGHTS,
        preferredCropIds: [],
      }),
    ),
    calendars: ready([bedCalendar(site, light, catalog, 20)]),
    companionRules: ready(partitionCompanionRules(companionRules)),
    rotationConstraints,
    tekRules: ready(tekRules),
    energy: ready(energyReportFixture()),
  })
}
