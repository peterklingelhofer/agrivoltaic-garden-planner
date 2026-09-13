import { cropLabel } from '../data/crops'
import { at, DAYS_PER_YEAR, mean } from '../data/util'
import {
  canopyCoverFromLai,
  dailyRainfallFromNormals,
  dailyWeatherFromTmy,
  dualKcAt,
  effectiveRootDepthM,
  et0MethodFor,
  millimetreBand,
  panelRainSplit,
  referenceEt,
  runWaterBalance,
  shadeBenefitStatusOf,
  shadeShortwaveFactors,
  SHADE_ET_MEASURED_ANCHOR,
  SHADE_ET_NOTE,
  SHADE_ET_RELATIVE_HALF_WIDTH,
  SITE_REFERENCE_DEPLETION_FRACTION,
  SITE_REFERENCE_ROOT_DEPTH_M,
  soilWaterCapacity,
  stageCalendarFor,
  type BalanceDay,
  type BalanceOptions,
} from '../data/water'
import { banded, interval, widenBand } from '../types/band'
import type { Crop } from '../types/crop'
import type { Bed, GardenPlot } from '../types/garden'
import type { BedLight } from '../types/light'
import type { Site } from '../types/site'
import type { Fraction } from '../types/units'
import type {
  BedWaterBalance,
  DailyWeather,
  Et0Method,
  ReferenceEt,
  StageCalendar,
} from '../types/water'
import type { TmySeries } from '../types/weather'

export interface WaterBalanceInput {
  readonly site: Site
  readonly weather: TmySeries
  readonly plot: GardenPlot
  readonly bedLight: readonly BedLight[]
  readonly catalog: readonly Crop[]
}

interface BedCrop {
  readonly maxCanopyCover: number
  readonly heightM: number
  readonly rootDepthM: number
  readonly depletionFraction: number
  readonly calendar: StageCalendar | null
  readonly label: string
}

const REFERENCE_CROP: BedCrop = {
  maxCanopyCover: 1,
  heightM: 0.12,
  rootDepthM: SITE_REFERENCE_ROOT_DEPTH_M,
  depletionFraction: SITE_REFERENCE_DEPLETION_FRACTION,
  calendar: null,
  label: 'the FAO-56 reference grass, because no planting in this bed matches the loaded catalogue',
}

const seasonLengthDays = (sowDay: number, harvestEndDay: number): number =>
  (harvestEndDay - sowDay + DAYS_PER_YEAR) % DAYS_PER_YEAR || DAYS_PER_YEAR

const bedCropOf = (bed: Bed, catalog: readonly Crop[]): BedCrop => {
  for (const planting of bed.plantings) {
    const crop = catalog.find((entry) => entry.id === planting.cropId)
    if (crop === undefined) continue
    return {
      maxCanopyCover: canopyCoverFromLai(
        crop.footprint.leafAreaIndex,
        crop.footprint.lightExtinctionK,
      ),
      heightM: crop.footprint.heightM.typicalM,
      rootDepthM: crop.roots.maxEffectiveDepthM,
      depletionFraction: crop.roots.depletionFraction,
      calendar: stageCalendarFor(
        planting.sowDay,
        seasonLengthDays(planting.sowDay, planting.harvestEndDay),
      ),
      // named the way the rest of the app names a crop, with the botanical name kept beside it:
      // a caveat reading "crop coefficients follow Vaccinium vitis-idaea" tells a gardener nothing
      label: `${cropLabel(crop)} (${crop.taxonomy.acceptedName}), the first planting in this bed with a catalogue entry`,
    }
  }
  return REFERENCE_CROP
}

const balanceDays = (
  et0: ReferenceEt,
  rainfall: readonly number[],
  crop: BedCrop,
): readonly BalanceDay[] =>
  et0.dailyMm.map((et0Mm, day) => {
    const kc =
      crop.calendar === null
        ? null
        : dualKcAt(day, crop.calendar, crop.maxCanopyCover, crop.heightM)
    return {
      et0Mm,
      rainfallMm: at(rainfall, day),
      irrigationMm: 0,
      kcb: kc === null ? 1 : kc.basal,
      canopyCoverFraction: kc === null ? 1 : kc.canopyCoverFraction,
    }
  })

interface SharedInput {
  readonly site: Site
  readonly days: readonly DailyWeather[]
  readonly method: Et0Method
  readonly reason: string | null
  readonly openSkyEt: ReferenceEt
  readonly rainfall: readonly number[]
  readonly catalog: readonly Crop[]
}

const share = (value: number): string => `${Math.round(value * 100)}%`

/**
 * One bed, one year, FAO-56 dual coefficient, run twice: open sky and under the
 * array. Panels enter through the shortwave term of reference ET and through
 * the rain split, and every band is the soil's own available-water range
 */
export const bedWaterBalance = (
  shared: SharedInput,
  bed: Bed,
  light: BedLight | null,
): BedWaterBalance => {
  const monthlyRsr = light === null ? new Array<number>(12).fill(0) : [...light.monthlyRsr]
  const crop = bedCropOf(bed, shared.catalog)
  const capacity = soilWaterCapacity(
    bed.soil.textureClass,
    effectiveRootDepthM(crop.rootDepthM, bed.soil.effectiveDepthM),
  )
  const rain = panelRainSplit(
    mean(monthlyRsr),
    bed.irrigation.harvestsPanelRunoff,
    bed.waterHarvesting.some((element) => element.tiedToArrayDripLine),
  )
  const underPanelsEt = referenceEt(
    shared.days,
    shared.method,
    shared.reason,
    shadeShortwaveFactors(monthlyRsr),
  )
  const reaching = rain.reachingBedFraction + rain.harvestedFraction
  const openDays = balanceDays(shared.openSkyEt, shared.rainfall, crop)
  const panelDays = balanceDays(
    underPanelsEt,
    shared.rainfall.map((millimetres) => millimetres * reaching),
    crop,
  )

  const options = (totalAvailableWaterMm: number, autoIrrigate: boolean): BalanceOptions => ({
    totalAvailableWaterMm,
    depletionFraction: crop.depletionFraction,
    totalEvaporableMm: capacity.totalEvaporableMm,
    readilyEvaporableMm: capacity.readilyEvaporableMm,
    autoIrrigate,
  })
  const low = capacity.totalAvailableWaterMm.lower
  const high = capacity.totalAvailableWaterMm.upper
  const irrigation = (days: readonly BalanceDay[], totalAvailableWaterMm: number): number =>
    runWaterBalance(days, options(totalAvailableWaterMm, true)).irrigationMm
  const bandNote = `Available water for a ${capacity.texture} spans ${low.toFixed(0)} to ${high.toFixed(0)} mm in this root zone, and that range is the whole width of this band`

  const openSky = runWaterBalance(openDays, options((low + high) / 2, false))
  const underPanels = runWaterBalance(panelDays, options((low + high) / 2, false))
  const saving =
    openSky.cropEtMm <= 0 ? 0 : Math.max(1 - underPanels.cropEtMm / openSky.cropEtMm, 0)

  return {
    bedId: bed.id,
    capacity,
    rain,
    openSky,
    underPanels,
    openSkyEt0Mm: shared.openSkyEt.annualMm,
    underPanelsEt0Mm: underPanelsEt.annualMm,
    irrigationOpenSkyMm: millimetreBand(
      irrigation(openDays, low),
      irrigation(openDays, high),
      bandNote,
    ),
    irrigationUnderPanelsMm: millimetreBand(
      irrigation(panelDays, low),
      irrigation(panelDays, high),
      bandNote,
    ),
    evapotranspirationSaving: widenBand(
      banded(interval(saving as Fraction, saving as Fraction), 0.8, 'range', 'soil-water', []),
      {
        source: 'soil-water',
        halfWidthFraction: SHADE_ET_RELATIVE_HALF_WIDTH as Fraction,
        note: SHADE_ET_MEASURED_ANCHOR,
      },
    ),
    shadeBenefit: shadeBenefitStatusOf(shared.site.waterLimitation),
    method: shared.method,
    notes: [
      `Crop coefficients follow ${crop.label}`,
      `Panels intercept ${share(rain.interceptedFraction)} of rainfall before it reaches this bed and return ${share(rain.harvestedFraction)} of the year's rain through captured runoff`,
      SHADE_ET_NOTE,
    ],
  }
}

export const waterBalances = (input: WaterBalanceInput): readonly BedWaterBalance[] => {
  const { method, reason } = et0MethodFor(input.weather)
  const days = dailyWeatherFromTmy(
    input.weather,
    input.site.location.latitudeDeg,
    input.site.elevationM,
  )
  const shared: SharedInput = {
    site: input.site,
    days,
    method,
    reason,
    openSkyEt: referenceEt(days, method, reason, null),
    rainfall: dailyRainfallFromNormals(input.site.normals.monthlyPrecipMm),
    catalog: input.catalog,
  }
  return input.plot.beds.map((bed) =>
    bedWaterBalance(shared, bed, input.bedLight.find((entry) => entry.bedId === bed.id) ?? null),
  )
}
