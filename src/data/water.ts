import { banded, interval } from '../types/band'
import type { Banded } from '../types/band'
import { unsourcedClaim } from '../types/cited'
import type { SoilTexture } from '../types/site'
import type {
  ByMonth,
  DayOfYear,
  Days,
  Fraction,
  Meters,
  Millimeters,
  MillimetersPerYear,
} from '../types/units'
import type {
  BedRain,
  DailyWeather,
  DualKc,
  Et0Method,
  GrowthStage,
  PanelRainSplit,
  ReferenceEt,
  ShadeBenefitStatus,
  SoilWaterCapacity,
  StageCalendar,
  WaterBalanceRun,
  WaterLimitation,
} from '../types/water'
import type { TmySeries } from '../types/weather'
import { seriesOffsetMinutesAt } from '../sim/timezone'
import { saturationVapourPressureKpa } from '../sim/vapour'
import { at, clamp, DAYS_PER_YEAR, HOURS_PER_DAY, MONTH_LENGTH_DAYS, monthOfDay } from './util'

// re-exported unchanged: src/sim/vapour.ts holds the one definition so src/sim/phenology.ts
// (the Growing Season Index) and this file's own FAO-56 balance read the same figure
export { saturationVapourPressureKpa }

const MINUTES_PER_HOUR = 60
const MINUTES_PER_DAY = MINUTES_PER_HOUR * HOURS_PER_DAY

/** FAO-56 defines the reference surface as a 0.12 m grass with a fixed albedo */
export const REFERENCE_ALBEDO = 0.23
export const STEFAN_BOLTZMANN_MJ_M2_DAY_K4 = 4.903e-9
export const SOLAR_CONSTANT_MJ_M2_MIN = 0.082
export const KELVIN_OFFSET = 273.16

/**
 * Open-Meteo, PVGIS and NASA POWER report wind at 10 m, so FAO-56's log
 * profile in `windSpeedAt2m` brings it down to 2 m from here. The NSRDB's
 * wind is MERRA-2 reanalysis at 2 m and is scaled up to this height at
 * ingest, in tmy.ts's `normaliseWeather`, so every source lands on the same
 * convention before it reaches this constant
 */
export const TMY_WIND_HEIGHT_M = 10

export const slopeSaturationVapourPressureKpaPerC = (tempC: number): number =>
  (4098 * saturationVapourPressureKpa(tempC)) / (tempC + 237.3) ** 2

export const atmosphericPressureKpa = (elevationM: number): number =>
  101.3 * ((293 - 0.0065 * elevationM) / 293) ** 5.26

export const psychrometricConstantKpaPerC = (pressureKpa: number): number => 0.000665 * pressureKpa

export const windSpeedAt2m = (speedMS: number, heightM: number): number =>
  heightM === 2 ? speedMS : (speedMS * 4.87) / Math.log(67.8 * heightM - 5.42)

const toRadians = (deg: number): number => (deg * Math.PI) / 180

export const solarDeclinationRad = (dayIndex: number): number =>
  0.409 * Math.sin(((2 * Math.PI) / DAYS_PER_YEAR) * (dayIndex + 1) - 1.39)

export const sunsetHourAngleRad = (latitudeDeg: number, dayIndex: number): number =>
  Math.acos(
    clamp(-Math.tan(toRadians(latitudeDeg)) * Math.tan(solarDeclinationRad(dayIndex)), -1, 1),
  )

export const extraterrestrialRadiationMjM2Day = (latitudeDeg: number, dayIndex: number): number => {
  const latitude = toRadians(latitudeDeg)
  const declination = solarDeclinationRad(dayIndex)
  const sunset = sunsetHourAngleRad(latitudeDeg, dayIndex)
  const inverseDistance = 1 + 0.033 * Math.cos(((2 * Math.PI) / DAYS_PER_YEAR) * (dayIndex + 1))
  return (
    ((24 * 60) / Math.PI) *
    SOLAR_CONSTANT_MJ_M2_MIN *
    inverseDistance *
    (sunset * Math.sin(latitude) * Math.sin(declination) +
      Math.cos(latitude) * Math.cos(declination) * Math.sin(sunset))
  )
}

export const clearSkyRadiationMjM2Day = (
  extraterrestrialMjM2Day: number,
  elevationM: number,
): number => (0.75 + 2e-5 * elevationM) * extraterrestrialMjM2Day

/**
 * `shortwaveFactor` is the share of open-sky shortwave that still reaches the ground under an
 * array. Net longwave is deliberately left at its open-sky value: the reduced sky view factor does
 * cut nocturnal longwave loss, but no work in the corpus records a quantified figure for it
 */
export const netRadiationMjM2Day = (day: DailyWeather, shortwaveFactor = 1): number => {
  const vapour = day.actualVapourPressureKpa ?? saturationVapourPressureKpa(day.tMinC)
  const shortwave = (1 - REFERENCE_ALBEDO) * day.solarRadiationMjM2Day * shortwaveFactor
  const clearness =
    day.clearSkyRadiationMjM2Day <= 0
      ? 1
      : clamp(day.solarRadiationMjM2Day / day.clearSkyRadiationMjM2Day, 0.25, 1)
  const longwave =
    STEFAN_BOLTZMANN_MJ_M2_DAY_K4 *
    (((day.tMaxC + KELVIN_OFFSET) ** 4 + (day.tMinC + KELVIN_OFFSET) ** 4) / 2) *
    (0.34 - 0.14 * Math.sqrt(Math.max(vapour, 0))) *
    (1.35 * clearness - 0.35)
  return shortwave - longwave
}

/** FAO-56 equation 6, daily step, soil heat flux taken as zero */
export const penmanMonteithEt0Mm = (day: DailyWeather, shortwaveFactor = 1): number => {
  const vapourActual = day.actualVapourPressureKpa ?? 0
  const wind = day.windSpeed2mMS ?? 0
  const slope = slopeSaturationVapourPressureKpaPerC(day.tMeanC)
  const psychrometric = psychrometricConstantKpaPerC(day.pressureKpa)
  const vapourSaturation =
    (saturationVapourPressureKpa(day.tMaxC) + saturationVapourPressureKpa(day.tMinC)) / 2
  const radiationTerm = 0.408 * slope * netRadiationMjM2Day(day, shortwaveFactor)
  const aerodynamicTerm =
    ((psychrometric * 900) / (day.tMeanC + 273)) *
    wind *
    Math.max(vapourSaturation - vapourActual, 0)
  return Math.max(
    (radiationTerm + aerodynamicTerm) / (slope + psychrometric * (1 + 0.34 * wind)),
    0,
  )
}

/**
 * The documented fallback where the source ships no humidity or wind. It is
 * driven entirely by extraterrestrial radiation and the diurnal temperature
 * range, so panel shade enters it the same way, through the radiation term
 */
export const hargreavesSamaniEt0Mm = (day: DailyWeather, shortwaveFactor = 1): number =>
  Math.max(
    0.0023 *
      (day.tMeanC + 17.8) *
      Math.sqrt(Math.max(day.tMaxC - day.tMinC, 0)) *
      0.408 *
      day.extraterrestrialMjM2Day *
      shortwaveFactor,
    0,
  )

export const et0ForDay = (day: DailyWeather, method: Et0Method, shortwaveFactor = 1): number =>
  method === 'hargreaves-samani'
    ? hargreavesSamaniEt0Mm(day, shortwaveFactor)
    : penmanMonteithEt0Mm(day, shortwaveFactor)

const anyNonZero = (values: Float32Array): boolean => values.some((value) => value !== 0)

export const et0MethodFor = (weather: TmySeries): { method: Et0Method; reason: string | null } =>
  anyNonZero(weather.dewPointC) && anyNonZero(weather.windSpeedMS)
    ? { method: 'fao56-penman-monteith', reason: null }
    : {
        method: 'hargreaves-samani',
        reason: `${weather.source} supplies no ${anyNonZero(weather.dewPointC) ? 'wind speed' : 'humidity'}, so reference ET falls back to Hargreaves-Samani`,
      }

export const dailyWeatherFromTmy = (
  weather: TmySeries,
  latitudeDeg: number,
  elevationM: number | null,
): readonly DailyWeather[] => {
  // FAO-56 defines both the clear-sky term and the psychrometric pressure at sea level, so
  // that is the stated fallback where the elevation lookup returned nothing; the measured
  // TMY pressure is preferred over either whenever the series carries one
  const elevation = elevationM ?? 0
  const hours = weather.dryBulbC.length
  const maxima = new Float64Array(DAYS_PER_YEAR).fill(Number.NEGATIVE_INFINITY)
  const minima = new Float64Array(DAYS_PER_YEAR).fill(Number.POSITIVE_INFINITY)
  const radiation = new Float64Array(DAYS_PER_YEAR)
  const dewPoint = new Float64Array(DAYS_PER_YEAR)
  const wind = new Float64Array(DAYS_PER_YEAR)
  const pressure = new Float64Array(DAYS_PER_YEAR)
  const counts = new Float64Array(DAYS_PER_YEAR)

  for (let hour = 0; hour < hours; hour += 1) {
    // the day on the site's clock, so a night's minimum is one day's and not split across two
    const localMinutes =
      hour * MINUTES_PER_HOUR + seriesOffsetMinutesAt(weather, at(weather.utcMillis, hour))
    const day =
      ((Math.floor(localMinutes / MINUTES_PER_DAY) % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR
    const temperature = at(weather.dryBulbC, hour)
    maxima[day] = Math.max(at(maxima, day), temperature)
    minima[day] = Math.min(at(minima, day), temperature)
    radiation[day] = at(radiation, day) + (at(weather.ghiWM2, hour) * 3600) / 1e6
    dewPoint[day] = at(dewPoint, day) + at(weather.dewPointC, hour)
    wind[day] = at(wind, day) + at(weather.windSpeedMS, hour)
    pressure[day] = at(pressure, day) + at(weather.pressureMb, hour)
    counts[day] = at(counts, day) + 1
  }

  const { method } = et0MethodFor(weather)
  const humid = method === 'fao56-penman-monteith'
  const days: DailyWeather[] = []
  for (let day = 0; day < DAYS_PER_YEAR; day += 1) {
    const samples = Math.max(at(counts, day), 1)
    const tMaxC = Number.isFinite(at(maxima, day)) ? at(maxima, day) : 0
    const tMinC = Number.isFinite(at(minima, day)) ? at(minima, day) : 0
    const meanPressureMb = at(pressure, day) / samples
    const extraterrestrialMjM2Day = extraterrestrialRadiationMjM2Day(latitudeDeg, day)
    days.push({
      dayIndex: day,
      tMaxC,
      tMinC,
      tMeanC: (tMaxC + tMinC) / 2,
      actualVapourPressureKpa: humid
        ? saturationVapourPressureKpa(at(dewPoint, day) / samples)
        : null,
      windSpeed2mMS: humid ? windSpeedAt2m(at(wind, day) / samples, TMY_WIND_HEIGHT_M) : null,
      solarRadiationMjM2Day: at(radiation, day),
      extraterrestrialMjM2Day,
      clearSkyRadiationMjM2Day: clearSkyRadiationMjM2Day(extraterrestrialMjM2Day, elevation),
      pressureKpa: meanPressureMb > 0 ? meanPressureMb / 10 : atmosphericPressureKpa(elevation),
    })
  }
  return days
}

const byMonth = (values: readonly number[]): ByMonth<number> =>
  [...Array(12).keys()].map((month) => at(values, month)) as unknown as ByMonth<number>

/**
 * Annual reference ET. `shortwaveFactorByMonth` carries the share of open-sky
 * shortwave still reaching the ground in each month, which is how panel shade
 * enters the water balance
 */
export const referenceEt = (
  days: readonly DailyWeather[],
  method: Et0Method,
  fallbackReason: string | null,
  shortwaveFactorByMonth: readonly number[] | null,
): ReferenceEt => {
  const dailyMm: number[] = []
  const monthTotals = new Array<number>(12).fill(0)
  const monthDays = new Array<number>(12).fill(0)
  let annualMm = 0
  for (const day of days) {
    const month = monthOfDay(day.dayIndex) - 1
    const value = et0ForDay(
      day,
      method,
      shortwaveFactorByMonth ? at(shortwaveFactorByMonth, month) : 1,
    )
    dailyMm.push(value)
    monthTotals[month] = at(monthTotals, month) + value
    monthDays[month] = at(monthDays, month) + 1
    annualMm += value
  }
  return {
    method,
    fallbackReason,
    dailyMm,
    monthlyMeanMmPerDay: byMonth(
      monthTotals.map((total, month) =>
        at(monthDays, month) === 0 ? 0 : total / at(monthDays, month),
      ),
    ),
    annualMm: annualMm as MillimetersPerYear,
  }
}

interface TextureWaterProfile {
  readonly availableWaterMmPerMeter: readonly [number, number]
  readonly readilyEvaporableMm: number
}

const TEXTURE_WATER: Readonly<Record<SoilTexture, TextureWaterProfile>> = {
  sand: { availableWaterMmPerMeter: [55, 105], readilyEvaporableMm: 4 },
  'loamy-sand': { availableWaterMmPerMeter: [70, 120], readilyEvaporableMm: 6 },
  'sandy-loam': { availableWaterMmPerMeter: [110, 190], readilyEvaporableMm: 8 },
  loam: { availableWaterMmPerMeter: [130, 190], readilyEvaporableMm: 9 },
  'silt-loam': { availableWaterMmPerMeter: [130, 210], readilyEvaporableMm: 10 },
  silt: { availableWaterMmPerMeter: [150, 230], readilyEvaporableMm: 10 },
  'clay-loam': { availableWaterMmPerMeter: [130, 200], readilyEvaporableMm: 10 },
  'silty-clay-loam': { availableWaterMmPerMeter: [130, 190], readilyEvaporableMm: 11 },
  'sandy-clay': { availableWaterMmPerMeter: [120, 180], readilyEvaporableMm: 9 },
  'silty-clay': { availableWaterMmPerMeter: [130, 170], readilyEvaporableMm: 11 },
  clay: { availableWaterMmPerMeter: [120, 200], readilyEvaporableMm: 12 },
}

/**
 * FAO-56 tabulates these by texture class but the endpoints below were NOT checked against the
 * primary text, so they ship uncited, since a real source beside them would read as verification
 */
export const TEXTURE_WATER_CLAIM = unsourcedClaim(
  TEXTURE_WATER,
  "Texture-class available water and readily evaporable water are a curated approximation of the FAO-56 Table 19 ranges. The table itself wasn't verified against the primary document, so no citation is attached",
  'The width of every irrigation band on this panel comes from this range. Read the whole band as the answer, and take no midpoint from it',
)

/** FAO-56 evaporates from a 0.10 to 0.15 m surface layer; the shallow end is taken */
export const SURFACE_EVAPORATION_DEPTH_M = 0.1

/** Total evaporable water as a multiple of available water, since FAO-56's form needs a wilting point we do not store */
export const EVAPORABLE_OVER_AVAILABLE = 1.3

export const soilWaterCapacity = (texture: SoilTexture, rootDepthM: number): SoilWaterCapacity => {
  const profile = TEXTURE_WATER[texture]
  const depth = Math.max(rootDepthM, 0.05)
  const [low, high] = profile.availableWaterMmPerMeter
  const mean = (low + high) / 2
  const totalEvaporableMm = Math.max(
    EVAPORABLE_OVER_AVAILABLE * mean * SURFACE_EVAPORATION_DEPTH_M,
    profile.readilyEvaporableMm + 1,
  )
  return {
    texture,
    rootDepthM: depth as Meters,
    totalAvailableWaterMm: interval((low * depth) as Millimeters, (high * depth) as Millimeters),
    readilyEvaporableMm: profile.readilyEvaporableMm as Millimeters,
    totalEvaporableMm: totalEvaporableMm as Millimeters,
  }
}

/** FAO-56 rooting depths are for deep, well-managed soils; a shallow bed truncates them */
export const effectiveRootDepthM = (potentialM: number, soilDepthM: number): number =>
  Math.max(Math.min(potentialM, soilDepthM), 0.1)

/** FAO-56 chapter 9: Kc,min of 0.15 for bare soil, and the 1.20 cap of equation 99 for Kcb,full, taken without its height term */
export const KC_MIN = 0.15
export const KC_MAX = 1.2
export const INITIAL_CANOPY_COVER = 0.05
export const SENESCENT_COVER_SHARE = 0.6

interface StageBounds {
  readonly initial: number
  readonly development: number
  readonly mid: number
  readonly end: number
  readonly since: number
}

const stageBounds = (dayIndex: number, calendar: StageCalendar): StageBounds => {
  const initial = calendar.initialDays
  const development = initial + calendar.developmentDays
  const mid = development + calendar.midSeasonDays
  return {
    initial,
    development,
    mid,
    end: mid + calendar.lateSeasonDays,
    since:
      (((dayIndex - (calendar.plantingDay - 1)) % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR,
  }
}

const stageOf = (bounds: StageBounds): GrowthStage => {
  if (bounds.since >= bounds.end) return 'fallow'
  if (bounds.since < bounds.initial) return 'initial'
  if (bounds.since < bounds.development) return 'development'
  if (bounds.since < bounds.mid) return 'mid-season'
  return 'late-season'
}

export const stageAt = (dayIndex: number, calendar: StageCalendar): GrowthStage =>
  stageOf(stageBounds(dayIndex, calendar))

/**
 * FAO-56 Table 11 tabulates stage lengths per crop and per climate. The crop
 * catalogue carries none of them, so a planting's sow-to-harvest span is split
 * on a generic four-stage shape instead
 */
export const STAGE_SPLIT_CLAIM = unsourcedClaim(
  { initial: 0.2, development: 0.3, midSeason: 0.3, lateSeason: 0.2 },
  'Growth-stage lengths are split from the sow and harvest dates on a generic four-stage shape, because FAO-56 Table 11 tabulates them per crop and climate and the catalogue carries none of those lengths',
  'This moves water demand within the season and leaves its annual total unchanged. Read the seasonal shape as indicative',
)

export const stageCalendarFor = (plantingDay: number, seasonDays: number): StageCalendar => {
  const span = Math.max(seasonDays, 4)
  const shares = STAGE_SPLIT_CLAIM.value
  const initialDays = Math.round(span * shares.initial)
  const developmentDays = Math.round(span * shares.development)
  const midSeasonDays = Math.round(span * shares.midSeason)
  return {
    plantingDay: plantingDay as DayOfYear,
    initialDays: initialDays as Days,
    developmentDays: developmentDays as Days,
    midSeasonDays: midSeasonDays as Days,
    lateSeasonDays: Math.max(span - initialDays - developmentDays - midSeasonDays, 1) as Days,
  }
}

/**
 * FAO-56 chapter 9 (allen1998-fao56) derives the basal coefficient from ground cover and
 * height. Its equation 97 turns leaf area index into effective
 * cover as 1 - exp(-0.7 LAI), with one extinction coefficient for every crop, and equation 98
 * raises the cover to 1 / (1 + h) before scaling the coefficient. This function is the cover
 * term of equation 97 with the catalogue's per-habit `lightExtinctionK` in place of FAO-56's
 * 0.7, and `dualKcAt` applies equation 98's exponent to it. The habit values are this app's
 * own and are declared unsourced in `HABIT_CANOPY_CLAIM` (`catalog/schema.ts`), so no crop
 * coefficient is invented here and the one departure from FAO-56 is on the ledger
 */
export const canopyCoverFromLai = (leafAreaIndex: number, extinctionK: number): number =>
  clamp(1 - Math.exp(-Math.max(extinctionK, 0.1) * Math.max(leafAreaIndex, 0)), 0, 0.99)

export const dualKcAt = (
  dayIndex: number,
  calendar: StageCalendar,
  maxCanopyCover: number,
  heightM: number,
): DualKc => {
  const bounds = stageBounds(dayIndex, calendar)
  const stage = stageOf(bounds)
  const ramp = (from: number, span: number): number =>
    span <= 0 ? 1 : clamp((bounds.since - from) / span, 0, 1)
  const cover =
    stage === 'fallow'
      ? 0
      : stage === 'initial'
        ? INITIAL_CANOPY_COVER
        : stage === 'development'
          ? INITIAL_CANOPY_COVER +
            (maxCanopyCover - INITIAL_CANOPY_COVER) * ramp(bounds.initial, calendar.developmentDays)
          : stage === 'mid-season'
            ? maxCanopyCover
            : maxCanopyCover *
              (1 - (1 - SENESCENT_COVER_SHARE) * ramp(bounds.mid, calendar.lateSeasonDays))
  const basal =
    cover <= 0 ? 0 : KC_MIN + (KC_MAX - KC_MIN) * cover ** (1 / (1 + Math.max(heightM, 0.05)))
  return { stage, basal, canopyCoverFraction: cover as Fraction }
}

export interface BalanceDay {
  readonly et0Mm: number
  readonly rainfallMm: number
  readonly irrigationMm: number
  readonly kcb: number
  readonly canopyCoverFraction: number
}

export interface BalanceOptions {
  readonly totalAvailableWaterMm: number
  readonly depletionFraction: number
  readonly totalEvaporableMm: number
  readonly readilyEvaporableMm: number
  readonly autoIrrigate: boolean
}

/**
 * FAO-56 dual-coefficient root-zone balance. Depletion is tracked against total
 * available water, evaporation against a separate surface layer, and the water
 * stress coefficient Ks throttles transpiration once depletion passes the
 * readily available fraction p
 */
export const runWaterBalance = (
  days: readonly BalanceDay[],
  options: BalanceOptions,
): WaterBalanceRun => {
  const totalAvailable = Math.max(options.totalAvailableWaterMm, 1)
  const readilyAvailable = clamp(options.depletionFraction, 0.1, 0.8) * totalAvailable
  const totalEvaporable = Math.max(options.totalEvaporableMm, 1)
  const readilyEvaporable = Math.min(options.readilyEvaporableMm, totalEvaporable - 0.1)
  let rootDepletion = 0
  let surfaceDepletion = 0
  let cropEtMm = 0
  let actualEtMm = 0
  let rainfallMm = 0
  let irrigationMm = 0
  let stressDays = 0

  for (const day of days) {
    const reduction =
      surfaceDepletion <= readilyEvaporable
        ? 1
        : clamp((totalEvaporable - surfaceDepletion) / (totalEvaporable - readilyEvaporable), 0, 1)
    const exposed = clamp(1 - day.canopyCoverFraction, 0.01, 1)
    const evaporationKc = Math.min(reduction * Math.max(KC_MAX - day.kcb, 0), exposed * KC_MAX)
    const stress =
      rootDepletion <= readilyAvailable
        ? 1
        : clamp((totalAvailable - rootDepletion) / (totalAvailable - readilyAvailable), 0, 1)
    const topUp = options.autoIrrigate && rootDepletion >= readilyAvailable ? rootDepletion : 0
    const applied = day.irrigationMm + topUp
    const potential = (day.kcb + evaporationKc) * day.et0Mm
    const actual = (day.kcb * stress + evaporationKc) * day.et0Mm

    if (stress < 1) stressDays += 1
    cropEtMm += potential
    actualEtMm += actual
    rainfallMm += day.rainfallMm
    irrigationMm += applied
    rootDepletion = clamp(rootDepletion - day.rainfallMm - applied + actual, 0, totalAvailable)
    surfaceDepletion = clamp(
      surfaceDepletion - day.rainfallMm - applied + evaporationKc * day.et0Mm,
      0,
      totalEvaporable,
    )
  }

  const deficitMm = Math.max(cropEtMm - actualEtMm, 0)
  return {
    cropEtMm: cropEtMm as Millimeters,
    actualEtMm: actualEtMm as Millimeters,
    deficitMm: deficitMm as Millimeters,
    deficitFraction: (cropEtMm <= 0 ? 0 : deficitMm / cropEtMm) as Fraction,
    rainfallMm: rainfallMm as Millimeters,
    irrigationMm: irrigationMm as Millimeters,
    stressDays,
  }
}

export const dailyRainfallFromNormals = (monthlyPrecipMm: readonly number[]): readonly number[] =>
  [...Array(DAYS_PER_YEAR).keys()].map((day) => {
    const month = monthOfDay(day) - 1
    return at(monthlyPrecipMm, month) / at(MONTH_LENGTH_DAYS, month)
  })

/** A reference rooting depth for the site-level index, in the FAO-56 vegetable band */
export const SITE_REFERENCE_ROOT_DEPTH_M = 0.5
export const SITE_REFERENCE_DEPLETION_FRACTION = 0.5

/**
 * A boolean gate at an aridity index of 0.65 fires where rainfall covers under 65 percent of
 * reference demand. The graded index is the season deficit fraction, so the same site sits near
 * 0.35 and the two agree at the boundary
 */
export const WATER_LIMITED_INDEX = 0.35

export interface WaterLimitationInput {
  readonly et0: ReferenceEt
  readonly monthlyPrecipMm: readonly number[]
  readonly texture: SoilTexture
  readonly soilDepthM: number
}

const referenceBalanceDays = (
  et0: ReferenceEt,
  rainfall: readonly number[],
): readonly BalanceDay[] =>
  et0.dailyMm.map((value, day) => ({
    et0Mm: value,
    rainfallMm: at(rainfall, day),
    irrigationMm: 0,
    kcb: 1,
    canopyCoverFraction: 1,
  }))

export const waterLimitationOf = (input: WaterLimitationInput): WaterLimitation => {
  const capacity = soilWaterCapacity(
    input.texture,
    effectiveRootDepthM(SITE_REFERENCE_ROOT_DEPTH_M, input.soilDepthM),
  )
  const rainfall = dailyRainfallFromNormals(input.monthlyPrecipMm)
  const days = referenceBalanceDays(input.et0, rainfall)
  const deficitAt = (totalAvailableWaterMm: number): number =>
    runWaterBalance(days, {
      totalAvailableWaterMm,
      depletionFraction: SITE_REFERENCE_DEPLETION_FRACTION,
      totalEvaporableMm: capacity.totalEvaporableMm,
      readilyEvaporableMm: capacity.readilyEvaporableMm,
      autoIrrigate: false,
    }).deficitFraction

  const low = capacity.totalAvailableWaterMm.lower
  const high = capacity.totalAvailableWaterMm.upper
  const index = deficitAt((low + high) / 2)
  const annualPrecipMm = input.monthlyPrecipMm.reduce((total, value) => total + value, 0)
  return {
    index: index as Fraction,
    band: banded(
      interval(deficitAt(high) as Fraction, deficitAt(low) as Fraction),
      0.8,
      'range',
      'soil-water',
      [
        {
          source: 'soil-water',
          halfWidthFraction: (Math.abs(deficitAt(low) - deficitAt(high)) / 2) as Fraction,
          note: `Available water for a ${input.texture} spans ${low.toFixed(0)} to ${high.toFixed(0)} mm in the reference root zone`,
        },
      ],
    ),
    aridityIndex: input.et0.annualMm <= 0 ? 1 : annualPrecipMm / input.et0.annualMm,
    referenceEtMm: input.et0.annualMm,
    rainfallMm: annualPrecipMm as MillimetersPerYear,
    method: input.et0.method,
    fallbackReason: input.et0.fallbackReason,
    limited: index >= WATER_LIMITED_INDEX,
  }
}

export const ET0_METHOD_LABEL: Readonly<Record<Et0Method, string>> = {
  'fao56-penman-monteith': 'FAO-56 Penman-Monteith',
  'hargreaves-samani': 'Hargreaves-Samani',
}

const percent = (value: number): string => `${Math.round(value * 100)}%`

/**
 * The graded form of the water-limitation gate in Decision Record 6. `WATER_LIMITED_INDEX` is the
 * foot of the ramp, so no site at or below it can earn a bonus, and the scale then rises
 * continuously to one where rainfall covers none of season demand. An arid site sits high on the
 * ramp, a temperate garden at its foot.
 *
 * It asks for the index alone, so a surface holding a year's index without the
 * whole limitation behind it (a season's `YearSummary`) can ask this same
 * question
 */
export const shadeBenefitScale = (limitation: Pick<WaterLimitation, 'index'>): number =>
  clamp((limitation.index - WATER_LIMITED_INDEX) / (1 - WATER_LIMITED_INDEX), 0, 1)

export const shadeBenefitStatusOf = (limitation: WaterLimitation): ShadeBenefitStatus => {
  const scale = shadeBenefitScale(limitation)
  const deficit = `Rainfall leaves ${percent(limitation.index)} of season reference demand unmet`
  return {
    active: scale > 0,
    scale: scale as Fraction,
    reason:
      scale > 0
        ? `${deficit}, above the ${percent(WATER_LIMITED_INDEX)} threshold where the shade benefit starts, so the shade-benefit pathway runs at ${percent(scale)} of its maximum`
        : `${deficit}, at or below the ${percent(WATER_LIMITED_INDEX)} threshold where the shade benefit starts. The 2 to 3 times gains Barron-Gafford et al. 2019 measured in Arizona come from relieved water stress and don't transfer to a garden this well watered, so panel shade earns no yield bonus here`,
  }
}

export const describeWaterLimitation = (limitation: WaterLimitation): string =>
  `${limitation.limited ? 'limited' : 'not limited'}, index ${limitation.index.toFixed(2)} (${percent(limitation.band.interval.lower)} to ${percent(limitation.band.interval.upper)}), rainfall ${limitation.rainfallMm.toFixed(0)} mm against ${limitation.referenceEtMm.toFixed(0)} mm reference ET by ${ET0_METHOD_LABEL[limitation.method]}`

/**
 * The soil-moisture and air-temperature responses
 * flip sign between arid and temperate sites, and frost, dew and wind shelter
 * have no quantified figure anywhere in the corpus
 */
export const UNQUANTIFIED_MICROCLIMATE_CAVEAT =
  'Every number on this panel is modelled from a typical meteorological year. Nothing here was measured in your garden. Soil-moisture and air-temperature effects under panels flip sign between arid and temperate sites, and the frost, dew and wind-shelter effects are unquantified in the literature, so none of them is modelled here at all'

export const SHADE_ET_NOTE =
  'Reference ET under the array is recomputed with net shortwave cut by the simulated relative shade ratio, which lowers the radiation term and, through it, both transpiration and soil evaporation. Vapour pressure deficit and wind are left unchanged: the agrivoltaics literature reports their direction but no usable magnitude, and their sign flips between arid and temperate sites'

export const SHADE_ET_MEASURED_ANCHOR =
  'Measured anchors for the size of this effect: actual evapotranspiration down 10 to 30 percent at 50 to 70 percent transmitted light (Marrou et al. 2013), and lettuce water consumption down about 20 percent (Elamri et al. 2018). The proportionality to intercepted radiation is an inference'

/**
 * Marrou et al. 2013 measured 10 to 30 percent less actual evapotranspiration
 * about a 20 percent centre, so the modelled saving carries a relative half
 * width of half its own size
 */
export const SHADE_ET_RELATIVE_HALF_WIDTH = 0.5

export const shadeShortwaveFactors = (monthlyRsr: readonly number[]): readonly number[] =>
  [...Array(12).keys()].map((month) => clamp(1 - at(monthlyRsr, month), 0, 1))

/** Elamri et al. 2018 measured these on two different rain events, flat and rotation-avoiding panels */
export const RAIN_DISTRIBUTION_CV_FLAT = 2.13
export const RAIN_DISTRIBUTION_CV_ROTATED = 0.22

export const RUNOFF_CAPTURE_CLAIM = unsourcedClaim(
  { plainBed: 0.5, basin: 0.8 },
  "No source quantifies how much a bed keeps of the water in its drip strip, the strip of ground where a panel's runoff lands. A plain bed keeps half: the strip floods at several times the rain rate and the rest runs to the path. A bed with a basin or swale along the strip keeps four fifths. Elamri et al. 2018's event 07 is the nearest measured anchor: the top metre under the drip edge stored 6.7 of the 24.0 mm that landed on it, about a quarter to a third, one event on one silty soil with no basin. The half and the four fifths are both modelling assumptions",
)

export const RAIN_SHADOW_CAVEAT =
  "The sheltered share and the drip strips (the ground where a panel's runoff lands) follow the array's plan geometry under this site's winds in rain hours. Where the weather record carries the wind's direction, each hour's rain is placed by that hour's wind, by direction and speed. Where it does not, every direction is taken as equally likely at the rain-hour mean speed. The rain shadow moves by the panel's height times the wind at panel height over the raindrops' fall speed. Each hour's drops are sized from that hour's rain rate, and the rain is split into three equal thirds by how fast they fall, so a drizzle's small drops carry further than a downpour's and the shadow's downwind edge is soft. A panel facing the wind catches more than its plan area and one turned from it less, and the drip drifts by what a drop does in its whole fall from the edge. Elamri et al. 2018's model sensitivity analysis found the wind mattered more than the rain amount at 5 m"

export const TRACKER_RAIN_NOTE = `A tracker is taken lying flat in rain, its night stow and its widest shelter, shedding to both long edges half each. In practice one edge takes the lot: Elamri et al. 2018 measured a flat 2 m panel's whole catchment landing in one 0.3 m collector at a single edge, so a bed beside a flat tracker gets either twice what the app draws or none, and which edge depends on the tracker's own lean. Flat, its runoff leaves the edge through outlets about 20 cm wide (Elamri et al. 2018), so the strip is a line of puddles the model averages along. Elamri et al. 2018 measured how unevenly the water landed across a row: a coefficient of variation of ${RAIN_DISTRIBUTION_CV_FLAT} under a flat panel in one event, and ${RAIN_DISTRIBUTION_CV_ROTATED} in another where they rotated the panels out of the rain, a schedule no tracker here runs`

export const panelRainSplit = (rain: BedRain, hasBasin: boolean): PanelRainSplit => {
  const capture = hasBasin ? RUNOFF_CAPTURE_CLAIM.value.basin : RUNOFF_CAPTURE_CLAIM.value.plainBed
  return {
    interceptedFraction: rain.shelteredFraction,
    reachingBedFraction: (1 - rain.shelteredFraction) as Fraction,
    dripMultiple: rain.dripMultiple * capture,
    crossings: rain.crossings,
  }
}

export const millimetreBand = (low: number, high: number, note: string): Banded<Millimeters> =>
  banded(
    interval(Math.min(low, high) as Millimeters, Math.max(low, high) as Millimeters),
    0.8,
    'range',
    'soil-water',
    [
      {
        source: 'soil-water',
        halfWidthFraction: (Math.abs(high - low) /
          2 /
          Math.max(Math.abs(high + low) / 2, 1)) as Fraction,
        note,
      },
    ],
  )
