import { banded, interval } from '../types/band'
import type { Bed, GardenPlot } from '../types/garden'
import { DEFAULT_GROUND_COVER } from '../types/ground'
import type { BedId, PlotId, SiteId } from '../types/ids'
import type { BedLight } from '../types/light'
import type {
  ChillAccumulation,
  ExceedancePercentile,
  FrostExceedanceCurve,
  Site,
} from '../types/site'
import type {
  ByMonth,
  Celsius,
  ChillHours,
  ChillPortions,
  DayOfYear,
  Days,
  DegreeDaysC,
  DegreesLatitude,
  DegreesLongitude,
  EpochMillis,
  Fraction,
  Meters,
  Millimeters,
  MillimetersPerYear,
  MolPerM2Day,
  SquareMeters,
  UtahChillUnits,
} from '../types/units'
import type { ClimateNormals, TmySeries } from '../types/weather'
import { frostExceedanceCurve } from '../data/agronomy'
import { DAYS_PER_YEAR } from '../data/util'

/** Deterministic fixtures shared by the recommender tests */
const twelve = <T>(value: T): ByMonth<T> => [
  value,
  value,
  value,
  value,
  value,
  value,
  value,
  value,
  value,
  value,
  value,
  value,
]

export const monthly = <T>(values: readonly T[]): ByMonth<T> =>
  [
    values[0],
    values[1],
    values[2],
    values[3],
    values[4],
    values[5],
    values[6],
    values[7],
    values[8],
    values[9],
    values[10],
    values[11],
  ] as ByMonth<T>

const SUMMER_SHAPE = [4, 7, 12, 20, 28, 34, 36, 32, 24, 14, 6, 3]

export const openSkyDli = (peak = 36): readonly number[] =>
  SUMMER_SHAPE.map((value) => (value / 36) * peak)

/** A bed's light: the temperate open-sky shape at `peakDli`, or a site's own monthly DLI as `open` */
export const bedLightFixture = (
  bedId: string,
  rsr: number,
  peakDli = 36,
  open: readonly number[] = openSkyDli(peakDli),
): BedLight => {
  const under = open.map((value) => value * (1 - rsr))
  return {
    bedId: bedId as BedId,
    cellCount: 400,
    monthlyMeanDliMolM2Day: monthly(under.map((value) => value as MolPerM2Day)),
    monthlyMinDliMolM2Day: monthly(under.map((value) => (value * 0.9) as MolPerM2Day)),
    monthlyOpenSkyDliMolM2Day: monthly(open.map((value) => value as MolPerM2Day)),
    monthlyRsr: twelve(rsr as Fraction),
    annualMeanDliMolM2Day: (under.reduce((a, b) => a + b, 0) / 12) as MolPerM2Day,
    // a fixture, not a derivation: the real sky view factor comes off the raster and is not a
    // function of the shade ratio, though the two move together for the obvious reason
    skyViewFactor: (1 - rsr) as Fraction,
    homogeneity: { coefficientOfVariation: 0.15 as Fraction, minOverMean: 0.8 as Fraction },
    quality: {
      subdivision: 'reinhart-mf2',
      sunDirectionCount: 780,
      substepsPerHour: 4,
      parFraction: 0.45 as Fraction,
      photonConversionUmolPerJ: 4.57,
      interreflectionApplied: true,
      seasonalParHalfWidthFraction: 0.1 as Fraction,
    },
  }
}

/** A record that frosts every year, which is what every hand-written curve in the tests is */
export const FROST_EVERY_YEAR: Pick<FrostExceedanceCurve, 'frostFree' | 'frostYears'> = {
  frostFree: { 10: false, 20: false, 30: false, 40: false, 50: false },
  frostYears: 30,
}

const frostCurve = (): FrostExceedanceCurve => ({
  ...FROST_EVERY_YEAR,
  thresholdC: 0 as Celsius,
  lastSpringFreeze: {
    10: 130 as DayOfYear,
    20: 125 as DayOfYear,
    30: 120 as DayOfYear,
    40: 115 as DayOfYear,
    50: 110 as DayOfYear,
  },
  firstFallFreeze: {
    10: 275 as DayOfYear,
    20: 280 as DayOfYear,
    30: 285 as DayOfYear,
    40: 290 as DayOfYear,
    50: 295 as DayOfYear,
  },
  frostFreeDays: {
    10: 145 as Days,
    20: 155 as Days,
    30: 165 as Days,
    40: 175 as Days,
    50: 185 as Days,
  },
})

const chill = (): ChillAccumulation => ({
  chillingHours: 1100 as ChillHours,
  utahChillUnits: 950 as UtahChillUnits,
  dynamicChillPortions: 62 as ChillPortions,
  seasonStart: 305 as DayOfYear,
  seasonEnd: 59 as DayOfYear,
})

const normals = (): ClimateNormals => ({
  monthlyMeanTempC: [-2, 0, 5, 11, 17, 22, 24, 23, 19, 12, 6, 0].map((v) => v as Celsius),
  monthlyMinTempC: [-7, -6, -1, 4, 10, 15, 18, 17, 13, 6, 1, -5].map((v) => v as Celsius),
  monthlyMaxTempC: [2, 4, 10, 17, 23, 28, 30, 29, 25, 18, 10, 4].map((v) => v as Celsius),
  monthlyPrecipMm: [70, 65, 80, 85, 95, 90, 95, 90, 85, 75, 80, 75].map((v) => v as Millimeters),
  monthlyMeanDliMolM2Day: openSkyDli(),
  heatDaysAbove30C: 12,
  normalsPeriod: '1991-2020',
  source: 'open-meteo',
})

export const siteFixture = (overrides: Partial<Site> = {}): Site => ({
  id: 'test-site' as SiteId,
  label: 'Test site',
  location: { latitudeDeg: 42.37 as DegreesLatitude, longitudeDeg: -71.11 as DegreesLongitude },
  elevationM: 20 as Meters,
  timezone: 'Etc/GMT+5',
  timezoneBasis: 'upstream',
  utcOffsetHours: -5,
  koppenCode: 'Dfa',
  botanicalArea: null,
  hardiness: [{ scheme: 'usda-2023', extremeMinTempC: -18 as Celsius, zoneLabel: '7a' }],
  heatDaysAbove30C: 12,
  normals: normals(),
  chill: chill(),
  frost: [frostCurve()],
  seasonGdd: { base4C: 2600 as DegreeDaysC, base10C: 1600 as DegreeDaysC, percentile: 20 },
  soil: {
    phUnits: 6.5,
    textureClass: 'loam',
    drainage: 'well',
    effectiveDepthM: 1.5 as Meters,
    organicMatterFraction: 0.04 as Fraction,
    sourceId: 'user',
  },
  waterLimitation: {
    index: 0.2 as Fraction,
    band: banded(interval(0.15 as Fraction, 0.25 as Fraction), 0.8, 'confidence', 'soil-water', []),
    aridityIndex: 1.4,
    referenceEtMm: 700 as MillimetersPerYear,
    rainfallMm: 985 as MillimetersPerYear,
    method: 'fao56-penman-monteith',
    fallbackReason: null,
    limited: false,
  },
  ...overrides,
})

const PHOENIX_MEAN_TEMP_C = [13, 15, 18, 23, 28, 33, 35, 34, 31, 24, 17, 12]
export const PHOENIX_OPEN_SKY_DLI = [24, 32, 42, 52, 58, 60, 55, 50, 45, 35, 26, 22]

/**
 * Phoenix, and the two beds a desert garden actually has. Hot, bright, frost-free from day 40 to
 * day 334, dry enough that the water-limitation pathways are all live, and lethal in July to
 * anything that cannot leave the bed. The DLI figures are the site's own open-sky normals; a bed
 * is the same year attenuated by its shade ratio. Soil and pH are the default site's, so a test
 * asking about temperature is not silently answered by another limb of the same envelope
 */
export const hotDesertSiteFixture = (overrides: Partial<Site> = {}): Site =>
  siteFixture({
    id: 'test-desert-site' as SiteId,
    label: 'Phoenix',
    location: { latitudeDeg: 33.45 as DegreesLatitude, longitudeDeg: -112.07 as DegreesLongitude },
    elevationM: 337 as Meters,
    timezone: 'America/Phoenix',
    utcOffsetHours: -7,
    koppenCode: 'BWh',
    botanicalArea: null,
    hardiness: [{ scheme: 'usda-2023', extremeMinTempC: -3 as Celsius, zoneLabel: '9b' }],
    heatDaysAbove30C: 167,
    normals: {
      monthlyMeanTempC: PHOENIX_MEAN_TEMP_C.map((v) => v as Celsius),
      monthlyMinTempC: PHOENIX_MEAN_TEMP_C.map((v) => (v - 8) as Celsius),
      monthlyMaxTempC: PHOENIX_MEAN_TEMP_C.map((v) => (v + 8) as Celsius),
      monthlyPrecipMm: [20, 20, 25, 8, 3, 1, 25, 25, 18, 15, 15, 25].map((v) => v as Millimeters),
      monthlyMeanDliMolM2Day: PHOENIX_OPEN_SKY_DLI,
      heatDaysAbove30C: 167,
      normalsPeriod: '1991-2020',
      source: 'open-meteo',
    },
    chill: {
      chillingHours: 180 as ChillHours,
      utahChillUnits: 150 as UtahChillUnits,
      dynamicChillPortions: 14 as ChillPortions,
      seasonStart: 320 as DayOfYear,
      seasonEnd: 45 as DayOfYear,
    },
    frost: [
      {
        ...FROST_EVERY_YEAR,
        thresholdC: 0 as Celsius,
        lastSpringFreeze: {
          10: 45 as DayOfYear,
          20: 40 as DayOfYear,
          30: 38 as DayOfYear,
          40: 36 as DayOfYear,
          50: 35 as DayOfYear,
        },
        firstFallFreeze: {
          10: 320 as DayOfYear,
          20: 327 as DayOfYear,
          30: 330 as DayOfYear,
          40: 332 as DayOfYear,
          50: 334 as DayOfYear,
        },
        frostFreeDays: {
          10: 275 as Days,
          20: 287 as Days,
          30: 292 as Days,
          40: 296 as Days,
          50: 299 as Days,
        },
      },
    ],
    seasonGdd: { base4C: 6800 as DegreeDaysC, base10C: 5200 as DegreeDaysC, percentile: 20 },
    waterLimitation: {
      index: 0.9 as Fraction,
      band: banded(
        interval(0.85 as Fraction, 0.95 as Fraction),
        0.8,
        'confidence',
        'soil-water',
        [],
      ),
      aridityIndex: 0.05,
      referenceEtMm: 2200 as MillimetersPerYear,
      rainfallMm: 200 as MillimetersPerYear,
      method: 'fao56-penman-monteith',
      fallbackReason: null,
      limited: true,
    },
    ...overrides,
  })

/**
 * Thirty identical years of daily minima on a cosine over the year, coldest in late January, or
 * late July when southern; `frostYears` of them dip `dipC` colder, so a record can hold frost
 * in some years and none in the rest
 */
export const dailyMinimaFixture = (
  meanC: number,
  swingC: number,
  southern: boolean,
  frostYears = 0,
  dipC = 0,
): Float32Array[] =>
  Array.from({ length: 30 }, (_, index) => {
    const year = new Float32Array(DAYS_PER_YEAR)
    const swing = swingC + (index < frostYears ? dipC : 0)
    for (let day = 0; day < DAYS_PER_YEAR; day += 1) {
      const phase = (2 * Math.PI * (day - 20)) / DAYS_PER_YEAR
      year[day] = meanC - (southern ? -1 : 1) * swing * Math.cos(phase)
    }
    return year
  })

const PUNE_MEAN_TEMP_C = [21, 23, 27, 30, 30, 27, 25, 24, 25, 25, 22, 20]

/**
 * Pune: a northern tropical site with no frost in the record (daily minima never below 8 C),
 * a monsoon holding most of the year's rain, and light that dips under the monsoon cloud
 */
export const frostFreeSiteFixture = (overrides: Partial<Site> = {}): Site =>
  siteFixture({
    id: 'test-frost-free-site' as SiteId,
    label: 'Pune',
    location: { latitudeDeg: 18.52 as DegreesLatitude, longitudeDeg: 73.86 as DegreesLongitude },
    elevationM: 560 as Meters,
    timezone: 'Asia/Kolkata',
    utcOffsetHours: 5.5,
    koppenCode: 'Aw',
    botanicalArea: null,
    hardiness: [{ scheme: 'usda-2023', extremeMinTempC: 8 as Celsius, zoneLabel: '11b' }],
    heatDaysAbove30C: 150,
    normals: {
      monthlyMeanTempC: PUNE_MEAN_TEMP_C.map((v) => v as Celsius),
      monthlyMinTempC: PUNE_MEAN_TEMP_C.map((v) => (v - 8) as Celsius),
      monthlyMaxTempC: PUNE_MEAN_TEMP_C.map((v) => (v + 8) as Celsius),
      monthlyPrecipMm: [2, 1, 3, 10, 35, 130, 190, 110, 130, 80, 30, 5].map(
        (v) => v as Millimeters,
      ),
      monthlyMeanDliMolM2Day: [30, 36, 42, 46, 46, 30, 24, 25, 32, 36, 32, 28],
      heatDaysAbove30C: 150,
      normalsPeriod: '1991-2020',
      source: 'open-meteo',
    },
    chill: {
      chillingHours: 0 as ChillHours,
      utahChillUnits: -400 as UtahChillUnits,
      dynamicChillPortions: 2 as ChillPortions,
      seasonStart: 305 as DayOfYear,
      seasonEnd: 59 as DayOfYear,
    },
    frost: [frostExceedanceCurve(dailyMinimaFixture(16, 8, false), 0 as Celsius)],
    seasonGdd: { base4C: 7500 as DegreeDaysC, base10C: 5300 as DegreeDaysC, percentile: 20 },
    waterLimitation: {
      index: 0.5 as Fraction,
      band: banded(
        interval(0.45 as Fraction, 0.55 as Fraction),
        0.8,
        'confidence',
        'soil-water',
        [],
      ),
      aridityIndex: 0.45,
      referenceEtMm: 1600 as MillimetersPerYear,
      rainfallMm: 726 as MillimetersPerYear,
      method: 'fao56-penman-monteith',
      fallbackReason: null,
      limited: true,
    },
    ...overrides,
  })

export const percentiles: readonly ExceedancePercentile[] = [10, 20, 30, 40, 50]

const HOURS_PER_TMY = 8760

/** Synthetic but well-formed 8760 h series; `humid` false drops the Penman-Monteith inputs */
export const tmyFixture = (humid = true): TmySeries => {
  const utcMillis = new Float64Array(HOURS_PER_TMY)
  const ghiWM2 = new Float32Array(HOURS_PER_TMY)
  const dryBulbC = new Float32Array(HOURS_PER_TMY)
  const start = Date.UTC(2021, 0, 1)
  for (let hour = 0; hour < HOURS_PER_TMY; hour += 1) {
    const hourOfDay = hour % 24
    const dayOfYear = Math.floor(hour / 24)
    const seasonal = 0.6 + 0.4 * Math.cos((2 * Math.PI * (dayOfYear - 172)) / 365)
    const daylight = Math.max(0, Math.sin((Math.PI * (hourOfDay - 6)) / 12))
    utcMillis[hour] = start + hour * 3_600_000
    ghiWM2[hour] = 900 * daylight * seasonal
    dryBulbC[hour] = 6 + 16 * seasonal + 5 * daylight
  }
  return {
    source: 'open-meteo',
    decomposition: 'passthrough',
    utcOffsetHours: -5,
    startUtcMillis: start as EpochMillis,
    utcMillis,
    ghiWM2,
    dniWM2: new Float32Array(HOURS_PER_TMY),
    dhiWM2: new Float32Array(HOURS_PER_TMY),
    dryBulbC,
    dewPointC: new Float32Array(HOURS_PER_TMY).fill(humid ? 8 : 0),
    windSpeedMS: new Float32Array(HOURS_PER_TMY).fill(humid ? 2 : 0),
    pressureMb: new Float32Array(HOURS_PER_TMY).fill(1013.25),
    provenance: {
      datasetLabel: 'synthetic-tmy',
      yearsCovered: [2021],
      licence: 'CC0',
      attribution: 'test',
      retrievedUtcMillis: start as EpochMillis,
      isTypicalMeteorologicalYear: true,
    },
  }
}

export const bedFixture = (bedId: string, overrides: Partial<Bed> = {}): Bed => ({
  id: bedId as BedId,
  label: bedId,
  footprint: {
    exterior: [
      { xM: 0 as Meters, yM: 0 as Meters },
      { xM: 4 as Meters, yM: 0 as Meters },
      { xM: 4 as Meters, yM: 3 as Meters },
      { xM: 0 as Meters, yM: 3 as Meters },
    ],
    holes: [],
  },
  areaM2: 12 as SquareMeters,
  soil: {
    phUnits: 6.5,
    textureClass: 'loam',
    drainage: 'well',
    effectiveDepthM: 1.5 as Meters,
    organicMatterFraction: 0.04 as Fraction,
    sourceId: 'user',
  },
  irrigation: {
    method: 'drip',
    available: true,
    appliedMmPerYear: 400 as MillimetersPerYear,
    harvestsPanelRunoff: false,
  },
  raisedHeightM: 0.3 as Meters,
  modifiers: [],
  waterHarvesting: [],
  plantings: [],
  ...overrides,
})

export const plotFixture = (beds: readonly Bed[]): GardenPlot => ({
  id: 'test-plot' as PlotId,
  siteId: 'test-site' as SiteId,
  label: 'Test plot',
  boundary: {
    exterior: [
      { xM: 0 as Meters, yM: 0 as Meters },
      { xM: 20 as Meters, yM: 0 as Meters },
      { xM: 20 as Meters, yM: 20 as Meters },
      { xM: 0 as Meters, yM: 20 as Meters },
    ],
    holes: [],
  },
  northOffsetDeg: 0 as never,
  originOffsetM: { xM: 0 as Meters, yM: 0 as Meters },
  beds,
  arrays: [],
  obstructions: [],
  groundCover: DEFAULT_GROUND_COVER,
})
