import { banded, interval } from '../types/band'
import type {
  ComplianceCheck,
  ComplianceRegime,
  ComplianceRegimeId,
  Criterion,
  CriterionResult,
} from '../types/compliance'
import type { GardenPlot } from '../types/garden'
import type { DliRaster, GrowingWindow, TimeWindowSpec } from '../types/light'
import type { Fraction } from '../types/units'
import { at, clamp } from './math'
import { monthValue } from './units'

export interface ComplianceInput {
  readonly plot: GardenPlot
  readonly raster: DliRaster
  readonly growingWindow: GrowingWindow
}

const FEET_TO_M = 0.3048
export const MA_FIXED_CLEARANCE_M = 8 * FEET_TO_M
export const MA_TRACKING_CLEARANCE_M = 10 * FEET_TO_M
const MA_MIN_TRANSMISSION = 0.5
const MA_MAX_NAMEPLATE_KW_AC = 5000
const MA_MAX_DC_AC_RATIO = 2
const MA_MAX_NAMEPLATE_KW_DC = 7500

// 225 CMR 28.02, verbatim: "For April through September, 9 AM to 6 PM. For March and October,
// 10 AM to 5 PM." Hour bounds are half-open, so 6 PM is the end of the window, not an extra hour.
//
// TIME BASIS, an explicit assumption because the regulation is ambiguous: 'local-clock', read
// off the site's own clock, daylight saving included where the weather series names its zone
// (the site lookup stamps one) and its fixed standard-time offset where it does not. A legal
// text writing "9 AM" is naming a wall clock, not a solar hour angle, and the DOER Shading
// Analysis Tool is not specified either way. Two consequences are disclosed rather than hidden:
// Massachusetts observes daylight saving for the whole of March-October, so the window is read
// on EDT, an hour earlier by the sun than the same hours on standard time; and apparent solar
// time drifts from clock time by the equation of time plus longitude within the zone, up to
// roughly +/-45 min at this longitude. Pass 'solar' basis to measure the other reading
export const MA_GROWING_SEASON_HOURS: TimeWindowSpec = {
  key: 'ma-growing-season-hours',
  label: 'Massachusetts Growing Season Hours (225 CMR 28.02)',
  basis: 'local-clock',
  clauses: [
    { months: [3, 4, 5, 6, 7, 8], startHour: 9, endHour: 18 },
    { months: [2, 9], startHour: 10, endHour: 17 },
  ],
}

// fallback only, for a raster baked without the window: the GSH months with no hour restriction
const MA_GROWING_SEASON_MONTHS = [2, 3, 4, 5, 6, 7, 8, 9] as const

const MA_GSH_DISCLAIMER =
  'Measured over Growing Season Hours as defined in 225 CMR 28.02, accumulated at a 15-minute timestep on the local clock, daylight saving included where the site timezone is known. What remains approximate: DOER mandates its own Shading Analysis Tool, so this figure has no standing whatever its accuracy. Every parameter is waivable under 225 CMR 28.07(5)(b)3.b.iv. The regulation does not say whether the 50% test is cumulative over the window or worst-instantaneous, and the worst cell of the cumulative window is reported here. Whether "9 AM" is read on the clock or by solar time is unresolved in the text, and daylight saving is in force across the whole window'

const MA_MONTH_FALLBACK_DISCLAIMER =
  'Measured over March-October with no hour-of-day restriction, because this light map was computed without the Growing Season Hours window. 225 CMR 28.02 specifies April-September 09:00-18:00 and March/October 10:00-17:00, so this over-counts early and late daylight. Compute the light again with the window to measure the regulated quantity'

const MA_WAIVER_NOTE =
  'These are design parameters for the expedited track. DOER requires applicants to use its own Shading Analysis Tool, and every parameter is waivable under 225 CMR 28.07(5)(b)3.b.iv, so a miss becomes an exception request'

const AGRONOMIC_BARRIER = 'Defined on measured agricultural yield, which geometry cannot establish'

const REGIMES: Readonly<Record<ComplianceRegimeId, ComplianceRegime>> = {
  'us-ma-smart': {
    id: 'us-ma-smart',
    label: 'Massachusetts SMART Dual-use Agricultural STGU',
    verifiability: 'estimate-only',
    determinationBarrier:
      'DOER mandates its own Shading Analysis Tool, the regulation does not say whether the 50% test is cumulative or worst-instantaneous, and every parameter is waivable',
    citations: ['ma-225-cmr-28', 'ma-doer-shading-analysis-tool', 'ma-smart-astgu-guideline'],
  },
  'de-din-spec-91434': {
    id: 'de-din-spec-91434',
    label: 'Germany DIN SPEC 91434:2021-05',
    verifiability: 'estimate-only',
    determinationBarrier: AGRONOMIC_BARRIER,
    citations: ['din-spec-91434-2021'],
  },
  'jp-maff': {
    id: 'jp-maff',
    label: 'Japan MAFF solar sharing',
    verifiability: 'estimate-only',
    determinationBarrier: AGRONOMIC_BARRIER,
    citations: ['japan-maff-solar-sharing'],
  },
  'it-dm-436-2023': {
    id: 'it-dm-436-2023',
    label: 'Italy DM 436/2023',
    verifiability: 'estimate-only',
    determinationBarrier: AGRONOMIC_BARRIER,
    citations: ['italy-dm-436-2023'],
  },
  'fr-decret-2024-318': {
    id: 'fr-decret-2024-318',
    label: 'France decret 2024-318',
    verifiability: 'estimate-only',
    determinationBarrier: AGRONOMIC_BARRIER,
    citations: ['france-decret-2024-318'],
  },
}

const criterion = (key: string, label: string, thresholdText: string): Criterion => ({
  key,
  label,
  thresholdText,
})

const monthsInWindow = (window: GrowingWindow): number[] => {
  const start = clamp(Math.trunc(window.startMonth), 1, 12)
  const end = clamp(Math.trunc(window.endMonth), 1, 12)
  const months: number[] = []
  for (let month = start; ; month = (month % 12) + 1) {
    months.push(month - 1)
    if (month === end) break
  }
  return months
}

interface WorstTransmission {
  readonly worst: number
  readonly cells: number
}

// the MA rule is a per-point minimum, so it is simultaneously a shading limit and a
// homogeneity constraint: take the worst cell over the whole accumulation window
const worstTransmission = (
  cells: number,
  under: (index: number) => number,
  open: (index: number) => number,
): WorstTransmission => {
  let worst = 1
  let counted = 0
  for (let i = 0; i < cells; i += 1) {
    const openTotal = open(i)
    if (openTotal <= 0) continue
    counted += 1
    worst = Math.min(worst, under(i) / openTotal)
  }
  return { worst: counted === 0 ? 0 : worst, cells: counted }
}

const sumOverMonths =
  (values: DliRaster['monthlyUnderArrayMolM2Day'], months: readonly number[]) =>
  (index: number): number =>
    months.reduce((total, month) => total + at(monthValue(values, month), index), 0)

const worstTransmissionOverMonths = (
  raster: DliRaster,
  months: readonly number[],
): WorstTransmission =>
  worstTransmission(
    raster.grid.cols * raster.grid.rows,
    sumOverMonths(raster.monthlyUnderArrayMolM2Day, months),
    sumOverMonths(raster.monthlyOpenSkyMolM2Day, months),
  )

const worstSeasonTransmission = (raster: DliRaster, window: GrowingWindow): WorstTransmission =>
  worstTransmissionOverMonths(raster, monthsInWindow(window))

// prefer the regulated quantity; fall back to the month approximation only when the raster was
// baked without the window, and say which one produced the number
const growingSeasonHours = (
  raster: DliRaster,
): WorstTransmission & { readonly disclaimer: string } => {
  const window = raster.windows.find((entry) => entry.spec.key === MA_GROWING_SEASON_HOURS.key)
  if (window === undefined) {
    return {
      ...worstTransmissionOverMonths(raster, MA_GROWING_SEASON_MONTHS),
      disclaimer: MA_MONTH_FALLBACK_DISCLAIMER,
    }
  }
  return {
    ...worstTransmission(
      raster.grid.cols * raster.grid.rows,
      (index) => at(window.underArrayMolM2Day, index),
      (index) => at(window.openSkyMolM2Day, index),
    ),
    disclaimer: MA_GSH_DISCLAIMER,
  }
}

const clearanceResults = (plot: GardenPlot): CriterionResult[] =>
  plot.arrays.map((array) => {
    const tracking = array.tracker.mode !== 'fixed'
    const threshold = tracking ? MA_TRACKING_CLEARANCE_M : MA_FIXED_CLEARANCE_M
    const measured = array.geometry.clearanceHeightM as number
    const spec = criterion(
      `clearance:${array.id}`,
      `Lowest module edge clearance, ${array.label}`,
      tracking ? '10 ft at horizontal position (tracking)' : '8 ft (fixed tilt)',
    )
    return measured >= threshold
      ? { criterion: spec, outcome: 'meets', measured, threshold, unit: 'm' }
      : {
          criterion: spec,
          outcome: 'misses',
          measured,
          threshold,
          unit: 'm',
          remedy: `Raise the clearance height to at least ${threshold.toFixed(2)} m`,
          worstCellFraction: null,
        }
  })

const threshold = (
  spec: Criterion,
  measured: number,
  limit: number,
  unit: string,
  remedy: string,
  ok: boolean,
): CriterionResult =>
  ok
    ? { criterion: spec, outcome: 'meets', measured, threshold: limit, unit }
    : {
        criterion: spec,
        outcome: 'misses',
        measured,
        threshold: limit,
        unit,
        remedy,
        worstCellFraction: null,
      }

export const checkMassachusettsSmart = (input: ComplianceInput): ComplianceCheck => {
  const { worst, cells, disclaimer } = growingSeasonHours(input.raster)
  const sunlight = criterion(
    'sunlight-everywhere',
    'Sunlight reaching every square foot during Growing Season Hours',
    'at least 50% of open-sky PAR at every point beneath, behind and adjacent to the design',
  )
  const dcKw = input.plot.arrays.reduce(
    (total, array) => total + (array.derived.nameplateDcKw as number),
    0,
  )
  const acKw = input.plot.arrays.reduce(
    (total, array) => total + (array.derived.nameplateAcKw as number),
    0,
  )
  const dcAcRatio = acKw > 0 ? dcKw / acKw : 0
  const results: CriterionResult[] = [
    cells === 0
      ? { criterion: sunlight, outcome: 'not-applicable', reason: 'The raster has no lit cells' }
      : {
          criterion: sunlight,
          outcome: 'approximate',
          measured: worst,
          threshold: MA_MIN_TRANSMISSION,
          unit: 'fraction',
          windowDisclaimer: disclaimer,
          remedy:
            worst >= MA_MIN_TRANSMISSION
              ? null
              : 'Widen the pitch, raise the array, or increase module transmittance',
        },
    ...clearanceResults(input.plot),
    threshold(
      criterion('nameplate-dc', 'DC nameplate', `${MA_MAX_NAMEPLATE_KW_DC} kW DC ceiling`),
      dcKw,
      MA_MAX_NAMEPLATE_KW_DC,
      'kW DC',
      `Reduce the DC nameplate below ${MA_MAX_NAMEPLATE_KW_DC} kW`,
      dcKw <= MA_MAX_NAMEPLATE_KW_DC,
    ),
    threshold(
      criterion('nameplate-ac', 'System size', '5 MW AC cap for the expedited track'),
      acKw,
      MA_MAX_NAMEPLATE_KW_AC,
      'kW AC',
      'Reduce the installed AC capacity below 5 MW',
      acKw <= MA_MAX_NAMEPLATE_KW_AC,
    ),
    threshold(
      criterion('dc-ac-ratio', 'DC to AC ratio', 'at most 2:1'),
      dcAcRatio,
      MA_MAX_DC_AC_RATIO,
      'ratio',
      'Lower the DC nameplate or raise inverter capacity',
      dcAcRatio <= MA_MAX_DC_AC_RATIO,
    ),
  ]
  const misses = results.some(
    (result) =>
      result.outcome === 'misses' ||
      (result.outcome === 'approximate' && result.measured < result.threshold),
  )
  return {
    regime: REGIMES['us-ma-smart'],
    results,
    overall: misses ? 'requires-exception-request' : 'meets-expedited-parameters',
    isDetermination: false,
    waiverNote: MA_WAIVER_NOTE,
  }
}

interface EstimateSpec {
  readonly key: string
  readonly label: string
  readonly thresholdText: string
  readonly threshold: number
  readonly unit: string
}

const ESTIMATE_SPECS: Readonly<Record<Exclude<ComplianceRegimeId, 'us-ma-smart'>, EstimateSpec>> = {
  'de-din-spec-91434': {
    key: 'reference-yield',
    label: 'Reference yield retained',
    thresholdText: '66% of reference yield, 2.10 m clearance, area loss under 10%/15%',
    threshold: 0.66,
    unit: 'fraction',
  },
  'jp-maff': {
    key: 'regional-average-yield',
    label: 'Yield versus the regional average',
    thresholdText: '80% of the regional average yield, 2 m clearance',
    threshold: 0.8,
    unit: 'fraction',
  },
  'it-dm-436-2023': {
    key: 'agricultural-area',
    label: 'Agricultural area retained',
    thresholdText: 'at least 70% of the area agricultural, 2.1 m for crops',
    threshold: 0.7,
    unit: 'fraction',
  },
  'fr-decret-2024-318': {
    key: 'control-zone-yield',
    label: 'Yield versus a control zone',
    thresholdText: '90% of a control zone, 40% maximum coverage',
    threshold: 0.9,
    unit: 'fraction',
  },
}

// agronomic regimes need field data; geometry alone can only bound the light term,
// so these are always EstimateResult and never a determination
const estimateRegime = (input: ComplianceInput, regime: ComplianceRegimeId): ComplianceCheck => {
  const spec = ESTIMATE_SPECS[regime as Exclude<ComplianceRegimeId, 'us-ma-smart'>]
  const { worst } = worstSeasonTransmission(input.raster, input.growingWindow)
  const cells = input.raster.grid.cols * input.raster.grid.rows
  let transmitted = 0
  let openTotal = 0
  for (let i = 0; i < cells; i += 1) {
    transmitted += at(input.raster.annualUnderArrayMolM2Day, i)
    openTotal += at(input.raster.annualOpenSkyMolM2Day, i)
  }
  const meanTransmission = openTotal > 0 ? transmitted / openTotal : 0
  const estimated = banded(
    interval(
      clamp(Math.min(meanTransmission, worst) * 0.9, 0, 1) as Fraction,
      clamp(meanTransmission * 1.1, 0, 1) as Fraction,
    ),
    0.8,
    'confidence',
    'crop-response',
    [
      {
        source: 'crop-response',
        halfWidthFraction: 0.45 as Fraction,
        note: 'Laub et al. 2022 95% confidence intervals dominate, light transmission is only a proxy for yield',
      },
      {
        source: 'seasonal-par',
        halfWidthFraction: input.raster.quality.seasonalParHalfWidthFraction,
        note: 'Seasonal cumulative PAR is treated as +/-10%',
      },
    ],
  )
  return {
    regime: REGIMES[regime],
    results: [
      {
        criterion: { key: spec.key, label: spec.label, thresholdText: spec.thresholdText },
        outcome: 'estimate',
        estimated,
        threshold: spec.threshold,
        unit: spec.unit,
        requiresFieldAgronomy: true,
        disclaimer:
          'Estimate only. This regime is defined on measured agricultural yield and cannot be verified from geometry',
      },
    ],
    overall: 'indeterminate',
    isDetermination: false,
    waiverNote: REGIMES[regime].determinationBarrier,
  }
}

export const checkRegime = (input: ComplianceInput, regime: ComplianceRegimeId): ComplianceCheck =>
  regime === 'us-ma-smart' ? checkMassachusettsSmart(input) : estimateRegime(input, regime)

export const checkAllRegimes = (input: ComplianceInput): readonly ComplianceCheck[] =>
  (Object.keys(REGIMES) as ComplianceRegimeId[]).map((regime) => checkRegime(input, regime))
