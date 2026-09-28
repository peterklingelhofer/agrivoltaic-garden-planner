import type { Licensed } from '../types/evidence'
import type { LatLon } from '../types/geo'
import type {
  CompositeHardinessRating,
  FrostExceedanceCurve,
  HardinessRating,
  SoilProfile,
  TemperatureHardinessRating,
} from '../types/site'
import {
  type Celsius,
  degreesLatitude,
  degreesLongitude,
  type Fraction,
  type Meters,
  type Millimeters,
} from '../types/units'
import type { ClimateNormals, WeatherSourceId } from '../types/weather'
import { frostExceedanceCurve, FROST_THRESHOLDS_C } from './agronomy'
import { cacheKeyFor, DEFAULT_FETCH_OPTIONS, fetchJson } from './http'
import {
  mergedPowerBody,
  OPEN_METEO_ATTRIBUTION,
  POWER_FILL,
  type PowerBody,
  powerSpans,
} from './tmy'
import {
  at,
  DAYS_PER_YEAR,
  mean,
  MONTH_LENGTH_DAYS,
  MONTH_START_DAY,
  requireCoverage,
  sum,
} from './util'

export const USDA_PHZM_ATTRIBUTION = 'USDA-ARS and Oregon State University PRISM Climate Group'
/**
 * Condition 2 of the PRISM terms of use: altered data must carry a prominent
 * disclaimer and must not display the USDA-ARS or OSU logos. Resampling the 800 m
 * grid to the bundled cell size is an alteration, so this text is a license
 * obligation and has to reach the attribution surface
 */
export const USDA_PHZM_DISCLAIMER =
  'Zones are resampled from the 2023 PRISM grid and are not the official USDA Plant Hardiness Zone Map'
export const KOPPEN_ATTRIBUTION = 'Beck et al. 2018, Koppen-Geiger 1 km'
export const SOILGRIDS_ATTRIBUTION = 'ISRIC SoilGrids 2.0, CC BY 4.0'
/** The wording the Open Government Licence - Canada requires of anyone redistributing the data */
export const NRCAN_ATTRIBUTION =
  'Contains information licensed under the Open Government Licence - Canada: Plant Hardiness Zones of Canada, Natural Resources Canada'
/**
 * Shown wherever both ratings for a Canadian site appear. The two numbers measure different
 * things, so the copy has to stop the comparison a reader would otherwise make on sight
 */
export const NRCAN_SCHEME_NOTE =
  "The Natural Resources Canada (NRCan) zone is a composite index of seven climate variables, among them snow depth, wind gust and summer rainfall. It isn't a winter minimum temperature and doesn't convert to a USDA zone, because the two numbers come from different systems and can't be compared. The temperature rating beside it is measured separately from thirty years of daily minima and isn't derived from this zone."

export const NORMALS_PERIOD = '1991-2020'

/**
 * Kew's World Checklist of Vascular Plants, which is where every native-range answer in this
 * product comes from, and the geographical scheme it is indexed by. Both must be credited: WCVP is
 * CC BY 4.0 and the scheme is the TDWG standard the checklist cites
 */
export const WCVP_ATTRIBUTION =
  'Govaerts et al., World Checklist of Vascular Plants, Royal Botanic Gardens Kew, CC BY 4.0'

export const WGSRPD_ATTRIBUTION =
  'TDWG World Geographical Scheme for Recording Plant Distributions, edition 2'

/**
 * What a native range is NOT. A checklist records where a species grows wild, which is a
 * statement about the species. It says nothing about the cultivar in a seed packet, and nothing
 * at all about whether a plant is well behaved in a garden. Shown wherever the answer is
 */
export const WCVP_SCOPE_NOTE =
  "Native range is recorded for the wild species. It doesn't describe cultivated varieties bred from it, and being native is no reason on its own that a plant will thrive in your soil"

export const KOPPEN_GRID_PATH = '/data/koppen-beck-2018.grid'
export const USDA_PHZM_GRID_PATH = '/data/usda-phzm-2023.grid'
export const NRCAN_GRID_PATH = '/data/nrcan-hardiness.grid'
export const WGSRPD_GRID_PATH = '/data/wgsrpd-level3.grid'

/**
 * What `scripts/fetch-static-layers.mjs` builds into `public/data/`, and what the loader falls back
 * to when a file is absent, truncated or corrupt. The fallback is a real derivation from CC BY 4.0
 * reanalysis, so a deploy without the assets is degraded and still
 * correct. See docs/STATIC-LAYERS.md
 */
export interface StaticLayerRequirement {
  readonly path: string
  readonly upstream: string
  readonly note: string
}

export const STATIC_LAYERS_TO_FETCH: readonly StaticLayerRequirement[] = [
  {
    path: 'public/data/koppen-beck-2018.grid',
    upstream:
      'https://figshare.com/articles/dataset/Present_and_future_K_ppen-Geiger_climate_classification_maps_at_1-km_resolution/6396959',
    note: "Beck et al. 2018, the published 5 arcmin aggregate of the 1 km classification. The 1 km raster is 933 megapixels and can't be bundled",
  },
  {
    path: 'public/data/usda-phzm-2023.grid',
    upstream: 'https://prism.oregonstate.edu/phzm/',
    note: "the official 2023 PRISM 800 m mean annual extreme minimum temperature grid, classified to half-zones. CONUS only. OPHZ isn't used: it traces the 2012 map",
  },
  {
    path: 'public/data/nrcan-hardiness.grid',
    upstream: 'https://open.canada.ca/data/en/dataset/adda404d-93e4-48e9-b6bf-5d1d3952ff22',
    note: "NRCan 4th edition zone polygons, Open Government Licence Canada, rasterized to 0.05 deg. Carried as a CompositeHardinessRating, which can't hold a temperature: the scheme is an index and the type makes the USDA crosswalk decision 9 forbids unrepresentable rather than merely discouraged",
  },
  {
    path: 'public/data/wgsrpd-level3.grid',
    upstream: 'https://github.com/tdwg/wgsrpd',
    note: "TDWG level 3 botanical countries rasterized to 0.5 deg, the regions Kew WCVP indexes native ranges by. 369 areas, so it's the one grid written in the 16-bit variant of the format",
  },
]

const GRID_MAGIC = 'AGDG'
const GRID_VERSION = 1
const GRID_VERSION_WIDE = 2
const GRID_CODEC_ROW_RLE = 1
const GRID_CODEC_ROW_RLE_16 = 2
const GRID_HEADER_BYTES = 48
const GRID_NODATA = 255
const GRID_SAME_AS_ABOVE = 254
const GRID_NODATA_16 = 0xffff
const GRID_SAME_AS_ABOVE_16 = 0xfffe
const VARINT_MAX_SHIFT = 28

/** A categorical raster: cell (0, 0) is the south-west corner and holds `classes[cells[0]]` */
export interface ClassGrid {
  readonly cols: number
  readonly rows: number
  readonly originLon: number
  readonly originLat: number
  readonly cellDeg: number
  readonly classes: readonly string[]
  /**
   * Byte per cell in version 1, which is every climate layer, and two bytes in version 2, which
   * is the botanical-region layer: 369 areas don't fit in a byte. `at` takes an `ArrayLike`, so
   * nothing downstream of the decode has to know which it got
   */
  readonly cells: Uint8Array | Uint16Array
}

/**
 * Reads the format `scripts/fetch-static-layers.mjs` writes. Every length in the
 * header is checked against the buffer, so a truncated or mangled asset returns null cleanly
 */
export const decodeClassGrid = (buffer: ArrayBuffer): ClassGrid | null => {
  if (buffer.byteLength < GRID_HEADER_BYTES) return null
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  for (let i = 0; i < GRID_MAGIC.length; i += 1)
    if (at(bytes, i) !== GRID_MAGIC.charCodeAt(i)) return null
  const version = view.getUint8(4)
  const codec = view.getUint8(5)
  const wide = version === GRID_VERSION_WIDE && codec === GRID_CODEC_ROW_RLE_16
  if (!wide && (version !== GRID_VERSION || codec !== GRID_CODEC_ROW_RLE)) return null
  const classCount = view.getUint16(6, true)
  const cols = view.getUint32(8, true)
  const rows = view.getUint32(12, true)
  const cellDeg = view.getFloat64(32, true)
  const payloadBytes = view.getUint32(40, true)
  const tableBytes = view.getUint32(44, true)
  if (cols === 0 || rows === 0 || !(cellDeg > 0)) return null
  const tableEnd = GRID_HEADER_BYTES + tableBytes
  if (tableEnd + payloadBytes !== buffer.byteLength) return null
  const classes: string[] = []
  const decoder = new TextDecoder()
  let cursor = GRID_HEADER_BYTES
  for (let i = 0; i < classCount; i += 1) {
    const length = at(bytes, cursor)
    cursor += 1
    if (cursor + length > tableEnd) return null
    classes.push(decoder.decode(bytes.subarray(cursor, cursor + length)))
    cursor += length
  }
  if (cursor !== tableEnd) return null
  // one array type or the other from here on, chosen by the header, and the run lengths are
  // varints in both: only the width of the value they repeat differs
  const cells = wide ? new Uint16Array(cols * rows) : new Uint8Array(cols * rows)
  const sameAsAbove = wide ? GRID_SAME_AS_ABOVE_16 : GRID_SAME_AS_ABOVE
  let written = 0
  while (cursor < bytes.length) {
    let value = at(bytes, cursor)
    cursor += 1
    if (wide) {
      if (cursor >= bytes.length) return null
      value |= at(bytes, cursor) << 8
      cursor += 1
    }
    let run = 0
    let shift = 0
    for (;;) {
      if (cursor >= bytes.length || shift > VARINT_MAX_SHIFT) return null
      const byte = at(bytes, cursor)
      cursor += 1
      // `+`, because the bitwise `|=` is a 32-bit signed operation, so a crafted varint
      // could set the sign bit, make `run` negative, slip past the `written + run` bound and
      // reach `fill`, which clamps negative bounds. That decoded a hostile
      // buffer into a confidently wrong grid, where every other malformed
      // input gets null
      run += (byte & 0x7f) * 2 ** shift
      if ((byte & 0x80) === 0) break
      shift += 7
    }
    if (!Number.isSafeInteger(run) || run < 0 || written + run > cells.length) return null
    cells.fill(value, written, written + run)
    written += run
  }
  if (written !== cells.length) return null
  for (let i = cols; i < cells.length; i += 1)
    if (at(cells, i) === sameAsAbove) cells[i] = at(cells, i - cols)
  return {
    cols,
    rows,
    originLon: view.getFloat64(16, true),
    originLat: view.getFloat64(24, true),
    cellDeg,
    classes,
    cells,
  }
}

export const sampleClassGrid = (grid: ClassGrid, location: LatLon): string | null => {
  const longitude = ((((location.longitudeDeg + 180) % 360) + 360) % 360) - 180
  const col = Math.round((longitude - grid.originLon) / grid.cellDeg)
  const row = Math.round((location.latitudeDeg - grid.originLat) / grid.cellDeg)
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return null
  const value = at(grid.cells, row * grid.cols + col)
  /**
   * The sentinel is a property of the CELL WIDTH, and a grid is tested for its own width's value.
   * Testing for both meant 255 read as no-data in a 16-bit grid, where it's an ordinary class
   * index: in the shipped botanical layer that index is `PAL`, so every garden in TDWG Palestine
   * was told its region was unknown, permanently, and indistinguishably from being off the map
   */
  const nodata = grid.cells instanceof Uint16Array ? GRID_NODATA_16 : GRID_NODATA
  if (value === nodata) return null
  return grid.classes[value] ?? null
}

const gridCache = new Map<string, Promise<ClassGrid | null>>()

const fetchGrid = async (path: string): Promise<ClassGrid | null> => {
  try {
    const response = await fetch(path)
    return response.ok ? decodeClassGrid(await response.arrayBuffer()) : null
  } catch {
    return null
  }
}

const loadGrid = (path: string): Promise<ClassGrid | null> => {
  const existing = gridCache.get(path)
  if (existing !== undefined) return existing
  const created = fetchGrid(path)
  gridCache.set(path, created)
  return created
}

const sampleAt = async (path: string, location: LatLon): Promise<string | null> => {
  const grid = await loadGrid(path)
  return grid === null ? null : sampleClassGrid(grid, location)
}

export const resetStaticLayerCache = (): void => {
  gridCache.clear()
  normalsCache.clear()
}

export interface DailyNormals {
  readonly minC: Float32Array[]
  readonly maxC: Float32Array[]
  readonly meanC: Float32Array[]
  readonly precipMm: Float32Array[]
  readonly shortwaveMjM2: Float32Array[]
  readonly startYear: number
  /** Which upstream answered, since either may */
  readonly source: WeatherSourceId
  /** The IANA zone the days were aggregated in, where the upstream named one */
  readonly timezone: string | null
  /** The offset Open-Meteo applied when it answered. POWER names none */
  readonly utcOffsetSeconds: number | null
}

const NORMALS_START_YEAR = 1991
const NORMALS_END_YEAR = 2020

const normalsCache = new Map<string, Promise<DailyNormals>>()

interface DailyBody {
  readonly timezone?: string
  readonly utc_offset_seconds?: number
  readonly daily?: {
    readonly time?: readonly string[]
    readonly temperature_2m_min?: readonly (number | null)[]
    readonly temperature_2m_max?: readonly (number | null)[]
    readonly temperature_2m_mean?: readonly (number | null)[]
    readonly precipitation_sum?: readonly (number | null)[]
    readonly shortwave_radiation_sum?: readonly (number | null)[]
  }
}

const DAILY_VARIABLES =
  'temperature_2m_min,temperature_2m_max,temperature_2m_mean,precipitation_sum,shortwave_radiation_sum'

/** The same five in POWER's names. Its daily irradiance is kWh/m²/day under the RE community */
const POWER_DAILY_PARAMETERS = 'T2M_MIN,T2M_MAX,T2M,PRECTOTCORR,ALLSKY_SFC_SW_DWN'
const MJ_PER_KWH = 3.6

const readDailyNormals = (
  body: DailyBody,
  upstream: string,
  source: WeatherSourceId,
): DailyNormals => {
  const daily = body.daily ?? {}
  const time = daily.time ?? []
  const count = NORMALS_END_YEAR - NORMALS_START_YEAR + 1
  const make = (): Float32Array[] =>
    Array.from({ length: count }, () => new Float32Array(DAYS_PER_YEAR))
  const normals: DailyNormals = {
    minC: make(),
    maxC: make(),
    meanC: make(),
    precipMm: make(),
    shortwaveMjM2: make(),
    startYear: NORMALS_START_YEAR,
    source,
    timezone: typeof body.timezone === 'string' && body.timezone.length > 0 ? body.timezone : null,
    utcOffsetSeconds:
      typeof body.utc_offset_seconds === 'number' && Number.isFinite(body.utc_offset_seconds)
        ? body.utc_offset_seconds
        : null,
  }
  // Open-Meteo sends null for a missing day, and `?? 0` would turn that into a real 0 C / 0 mm
  // reading, which would produce a site simultaneously classified Koppen EF and USDA 10a with zero
  // crops recommended and no notice anywhere
  const NORMAL_SERIES_COUNT = 5
  let written = 0
  let days = 0
  const cursor = new Int32Array(count)
  for (let index = 0; index < time.length; index += 1) {
    const stamp = time[index] ?? ''
    if (stamp.slice(5, 10) === '02-29') continue
    const year = Number(stamp.slice(0, 4)) - NORMALS_START_YEAR
    // NaN fails every comparison, so an unparseable stamp passes a bare range check
    if (!Number.isFinite(year) || year < 0 || year >= count) continue
    const day = at(cursor, year)
    if (day >= DAYS_PER_YEAR) continue
    cursor[year] = day + 1
    const write = (
      target: Float32Array[],
      series: readonly (number | null)[] | undefined,
    ): void => {
      const row = target[year]
      const value = series?.[index]
      if (row === undefined) return
      if (typeof value === 'number' && Number.isFinite(value)) {
        row[day] = value
        written += 1
        return
      }
      // isolated gaps carry the previous day forward. A systematically empty series is
      // caught by the coverage check below
      row[day] = day > 0 ? at(row, day - 1) : 0
    }
    write(normals.minC, daily.temperature_2m_min)
    write(normals.maxC, daily.temperature_2m_max)
    write(normals.meanC, daily.temperature_2m_mean)
    write(normals.precipMm, daily.precipitation_sum)
    write(normals.shortwaveMjM2, daily.shortwave_radiation_sum)
    days += 1
  }
  requireCoverage({
    upstream,
    cadence: 'daily',
    subject: 'climate normals need',
    present: written,
    expected: days * NORMAL_SERIES_COUNT,
  })
  return normals
}

const fetchOpenMeteoDailyNormals = async (location: LatLon): Promise<DailyNormals> =>
  readDailyNormals(
    await fetchJson<DailyBody>(
      'open-meteo',
      '/v1/archive',
      new URLSearchParams({
        latitude: String(location.latitudeDeg),
        longitude: String(location.longitudeDeg),
        start_date: `${String(NORMALS_START_YEAR)}-01-01`,
        end_date: `${String(NORMALS_END_YEAR)}-12-31`,
        daily: DAILY_VARIABLES,
        // local days, so a night's minimum is one reading on one date, and the answer names the
        // zone it used
        timezone: 'auto',
      }),
      { ...DEFAULT_FETCH_OPTIONS, remember: true },
    ),
    'Open-Meteo',
    'open-meteo',
  )

/** POWER's daily body in the shape the Open-Meteo reader takes, so one reader serves both */
const dailyBodyFromPower = (body: PowerBody): DailyBody => {
  const parameter = body.properties?.parameter ?? {}
  const keys = Object.keys(parameter.T2M_MIN ?? {}).sort()
  const series = (name: string, scale: number): (number | null)[] =>
    keys.map((key) => {
      const value = parameter[name]?.[key]
      return typeof value === 'number' && Number.isFinite(value) && value > POWER_FILL
        ? value * scale
        : null
    })
  return {
    daily: {
      time: keys.map((key) => `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`),
      temperature_2m_min: series('T2M_MIN', 1),
      temperature_2m_max: series('T2M_MAX', 1),
      temperature_2m_mean: series('T2M', 1),
      precipitation_sum: series('PRECTOTCORR', 1),
      shortwave_radiation_sum: series('ALLSKY_SFC_SW_DWN', MJ_PER_KWH),
    },
  }
}

const fetchPowerDailyNormals = async (location: LatLon): Promise<DailyNormals> => {
  const bodies: PowerBody[] = []
  // sequential, and in the spans POWER's JSON encoding carries, as the hourly leg is fetched
  for (const [firstYear, lastYear] of powerSpans(NORMALS_START_YEAR, NORMALS_END_YEAR)) {
    bodies.push(
      await fetchJson<PowerBody>(
        'nasa-power',
        '/api/temporal/daily/point',
        new URLSearchParams({
          latitude: String(location.latitudeDeg),
          longitude: String(location.longitudeDeg),
          start: `${String(firstYear)}0101`,
          end: `${String(lastYear)}1231`,
          community: 'RE',
          parameters: POWER_DAILY_PARAMETERS,
          format: 'JSON',
        }),
        { ...DEFAULT_FETCH_OPTIONS, remember: true },
      ),
    )
  }
  return readDailyNormals(dailyBodyFromPower(mergedPowerBody(bodies)), 'NASA POWER', 'nasa-power')
}

/**
 * Open-Meteo first and NASA POWER when it refuses, the way the hourly leg falls through, so one 429
 * from a free service can't fail the whole site once the hourly weather has arrived. When both
 * refuse, the first refusal is the one raised, because it carries the wait the store schedules its
 * retry on
 */
const fetchDailyNormals = async (location: LatLon): Promise<DailyNormals> => {
  try {
    return await fetchOpenMeteoDailyNormals(location)
  } catch (error) {
    return fetchPowerDailyNormals(location).catch(() => {
      throw error
    })
  }
}

export const dailyNormalsAt = (location: LatLon): Promise<DailyNormals> => {
  const key = cacheKeyFor('open-meteo', location, 'daily-normals')
  const existing = normalsCache.get(key)
  if (existing !== undefined) return existing
  const created = fetchDailyNormals(location)
  normalsCache.set(key, created)
  // a refusal isn't an answer to keep: the store's retry would otherwise read the same
  // rejection back for the life of the page
  created.catch(() => normalsCache.delete(key))
  return created
}

const monthlyMean = (years: readonly Float32Array[], month: number): number => {
  const start = at(MONTH_START_DAY, month)
  const days = at(MONTH_LENGTH_DAYS, month)
  const values: number[] = []
  for (const year of years) {
    for (let offset = 0; offset < days; offset += 1) values.push(at(year, start + offset))
  }
  return mean(values)
}

const monthlyTotal = (years: readonly Float32Array[], month: number): number => {
  const start = at(MONTH_START_DAY, month)
  const days = at(MONTH_LENGTH_DAYS, month)
  const totals: number[] = []
  for (const year of years) {
    let total = 0
    for (let offset = 0; offset < days; offset += 1) total += at(year, start + offset)
    totals.push(total)
  }
  return mean(totals)
}

/** Broadband composite factor from Decision Record 3: DLI ~= GHI (MJ/m2/d) x 2.06 */
export const BROADBAND_UMOL_PER_J = 2.06

export const monthlyDliFromShortwave = (monthlyMeanMjM2Day: number): number =>
  monthlyMeanMjM2Day * BROADBAND_UMOL_PER_J

/**
 * Koppen-Geiger classification from monthly normals, following the criteria table of Beck et al.
 * 2018. Used only when the bundled raster is absent
 */
export const classifyKoppen = (
  monthlyMeanTempC: readonly number[],
  monthlyPrecipMm: readonly number[],
  northernHemisphere: boolean,
): string => {
  const temps = monthlyMeanTempC
  const precip = monthlyPrecipMm
  const mat = mean(temps)
  const map = sum(precip)
  const tCold = Math.min(...temps)
  const tHot = Math.max(...temps)
  const monthsAbove10 = temps.filter((value) => value >= 10).length
  const summerIndices = northernHemisphere ? [3, 4, 5, 6, 7, 8] : [9, 10, 11, 0, 1, 2]
  const winterIndices = [...Array(12).keys()].filter((index) => !summerIndices.includes(index))
  const pick = (indices: readonly number[]): number[] => indices.map((index) => at(precip, index))
  const summer = pick(summerIndices)
  const winter = pick(winterIndices)
  const pSummer = sum(summer)
  const pWinter = sum(winter)
  const threshold =
    pWinter >= 0.7 * map ? 2 * mat : pSummer >= 0.7 * map ? 2 * mat + 28 : 2 * mat + 14

  if (map < 10 * threshold) {
    const arid = map < 5 * threshold ? 'W' : 'S'
    return `B${arid}${mat >= 18 ? 'h' : 'k'}`
  }
  if (tCold >= 18) {
    const pDry = Math.min(...precip)
    if (pDry >= 60) return 'Af'
    return pDry >= 100 - map / 25 ? 'Am' : 'Aw'
  }
  if (tHot <= 10) return tHot > 0 ? 'ET' : 'EF'

  const main = tCold > 0 ? 'C' : 'D'
  const pSummerDry = Math.min(...summer)
  const pWinterDry = Math.min(...winter)
  const pSummerWet = Math.max(...summer)
  const pWinterWet = Math.max(...winter)
  const seasonality =
    pSummerDry < 40 && pSummerDry < pWinterWet / 3 ? 's' : pWinterDry < pSummerWet / 10 ? 'w' : 'f'
  const heat = tHot >= 22 ? 'a' : monthsAbove10 >= 4 ? 'b' : main === 'D' && tCold < -38 ? 'd' : 'c'
  return `${main}${seasonality}${heat}`
}

/**
 * The botanical country a garden stands in, as a TDWG level 3 code, or null off the grid.
 *
 * No fallback and no derivation, deliberately, unlike `koppenAt` below: a climate class can be
 * recomputed from weather when the raster is missing, and there's nothing to recompute a
 * region from. A garden whose region is unknown gets told its natives are unknown, which is the
 * only answer that is not a guess about where a plant belongs
 */
export const botanicalAreaAt = (location: LatLon): Promise<string | null> =>
  sampleAt(WGSRPD_GRID_PATH, location)

export const koppenAt = async (location: LatLon): Promise<string> => {
  const sampled = await sampleAt(KOPPEN_GRID_PATH, location)
  if (sampled !== null) return sampled
  const normals = await dailyNormalsAt(location)
  const temps = Array.from({ length: 12 }, (_, month) => monthlyMean(normals.meanC, month))
  const rain = Array.from({ length: 12 }, (_, month) => monthlyTotal(normals.precipMm, month))
  return classifyKoppen(temps, rain, location.latitudeDeg >= 0)
}

const USDA_ZONE_MIN_F = -60
const USDA_HALF_ZONE_F = 5

export const usdaZoneLabel = (extremeMinC: number): string => {
  const fahrenheit = extremeMinC * 1.8 + 32
  const index = Math.floor((fahrenheit - USDA_ZONE_MIN_F) / USDA_HALF_ZONE_F)
  const zone = Math.floor(index / 2) + 1
  const half = index % 2 === 0 ? 'a' : 'b'
  return `${String(Math.min(Math.max(zone, 1), 13))}${half}`
}

/** Inverse of `usdaZoneLabel`: how many 5 degF half-zones the label sits above -60 degF */
export const usdaHalfZoneIndex = (zoneLabel: string): number | null => {
  const match = /^(\d{1,2})([ab])$/.exec(zoneLabel)
  if (match === null) return null
  const zone = Number(match[1])
  return (zone - 1) * 2 + (match[2] === 'b' ? 1 : 0)
}

/**
 * A zone is defined by the lower edge of its band, so the edge is the only temperature a
 * zone label carries. Reporting the midpoint would claim a precision the label doesn't have
 */
export const usdaZoneLowerC = (zoneLabel: string): number | null => {
  const index = usdaHalfZoneIndex(zoneLabel)
  return index === null ? null : (USDA_ZONE_MIN_F + index * USDA_HALF_ZONE_F - 32) / 1.8
}

/** Mean of annual extreme minima, the statistic the USDA PHZM maps */
export const meanAnnualExtremeMinC = (yearlyDailyMin: readonly Float32Array[]): number =>
  mean(yearlyDailyMin.map((year) => Math.min(...Array.from(year))))

/**
 * Mean annual extreme minimum from thirty years of ERA5 daily minima. This is the same physical
 * quantity the PRISM grid maps, here measured from reanalysis, which is why it can stand in for the
 * grid outside its coverage. It's never a conversion of some other scheme's zone
 */
const derivedHardiness = async (location: LatLon): Promise<TemperatureHardinessRating> => {
  const normals = await dailyNormalsAt(location)
  const extreme = meanAnnualExtremeMinC(normals.minC)
  return {
    scheme: 'usda-2023',
    basis: 'weather-record',
    extremeMinTempC: extreme as Celsius,
    zoneLabel: usdaZoneLabel(extreme),
  }
}

/**
 * The bundled grid answers first where it has coverage. The Open-Meteo derivation is what
 * every existing figure was built against, so where the two land more than one half-zone
 * apart both are returned: the climate gate
 * takes the coldest rating and the site panel lists them
 */
const temperatureHardinessAt = async (
  location: LatLon,
): Promise<readonly TemperatureHardinessRating[]> => {
  const zoneLabel = await sampleAt(USDA_PHZM_GRID_PATH, location)
  const lowerC = zoneLabel === null ? null : usdaZoneLowerC(zoneLabel)
  if (zoneLabel === null || lowerC === null) return [await derivedHardiness(location)]
  const sampled: TemperatureHardinessRating = {
    scheme: 'usda-2023',
    basis: 'grid',
    extremeMinTempC: lowerC as Celsius,
    zoneLabel,
  }
  const derived = await derivedHardiness(location).catch(() => null)
  const apart =
    derived === null
      ? 0
      : Math.abs((usdaHalfZoneIndex(derived.zoneLabel) ?? 0) - (usdaHalfZoneIndex(zoneLabel) ?? 0))
  return derived !== null && apart > 1 ? [sampled, derived] : [sampled]
}

/**
 * The zone NRCan publishes, carried verbatim. The shipped polygons hold the zone label and
 * nothing else, so `indexTerms` is empty: the seven variables behind the score are named in
 * the type but no source we bundle supplies their values
 */
export const nrcanZoneAt = async (location: LatLon): Promise<CompositeHardinessRating | null> => {
  const zoneLabel = await sampleAt(NRCAN_GRID_PATH, location)
  return zoneLabel === null ? null : { scheme: 'nrcan', zoneLabel, indexTerms: [] }
}

/**
 * A Canadian site carries both, and neither is computed from the other: the temperature
 * rating is measured from ERA5 and is what the climate gate reads, the NRCan zone is the
 * published composite-index classification and informs only. No crosswalk connects them
 */
export const hardinessAt = async (location: LatLon): Promise<readonly HardinessRating[]> => {
  const [temperature, nrcan] = await Promise.all([
    temperatureHardinessAt(location),
    nrcanZoneAt(location),
  ])
  return nrcan === null ? temperature : [...temperature, nrcan]
}

export const frostNormalsAt = async (
  location: LatLon,
): Promise<readonly FrostExceedanceCurve[]> => {
  const normals = await dailyNormalsAt(location)
  return FROST_THRESHOLDS_C.map((threshold) =>
    frostExceedanceCurve(normals.minC, threshold as Celsius, location.latitudeDeg < 0),
  )
}

export const climateNormalsAt = async (location: LatLon): Promise<ClimateNormals> => {
  const normals = await dailyNormalsAt(location)
  const months = [...Array(12).keys()]
  let heatDays = 0
  for (const year of normals.maxC) {
    for (let day = 0; day < DAYS_PER_YEAR; day += 1) if (at(year, day) >= 30) heatDays += 1
  }
  return {
    monthlyMeanTempC: months.map((month) => monthlyMean(normals.meanC, month) as Celsius),
    monthlyMinTempC: months.map((month) => monthlyMean(normals.minC, month) as Celsius),
    monthlyMaxTempC: months.map((month) => monthlyMean(normals.maxC, month) as Celsius),
    monthlyPrecipMm: months.map((month) => monthlyTotal(normals.precipMm, month) as Millimeters),
    monthlyMeanDliMolM2Day: months.map((month) =>
      monthlyDliFromShortwave(monthlyMean(normals.shortwaveMjM2, month)),
    ),
    heatDaysAbove30C: heatDays / normals.maxC.length,
    normalsPeriod: NORMALS_PERIOD,
    source: normals.source,
  }
}

// a pH outside this can only be a unit or no-data error
const MIN_PLAUSIBLE_PH = 3
const MAX_PLAUSIBLE_PH = 10

export const DEFAULT_SOIL: SoilProfile = {
  phUnits: 6.5,
  textureClass: 'loam',
  drainage: 'well',
  effectiveDepthM: 1 as Meters,
  organicMatterFraction: 0.03 as Fraction,
  sourceId: 'default',
}

interface SoilGridsBody {
  readonly properties?: {
    readonly layers?: readonly {
      readonly name?: string
      readonly depths?: readonly { readonly values?: Record<string, number> }[]
    }[]
  }
}

const textureFor = (clayPct: number, sandPct: number): SoilProfile['textureClass'] => {
  if (clayPct >= 40) return 'clay'
  if (clayPct >= 27) return 'clay-loam'
  if (sandPct >= 85) return 'sand'
  if (sandPct >= 70) return 'loamy-sand'
  if (sandPct >= 50) return 'sandy-loam'
  return 'loam'
}

/** One SoilGrids request, parsed into a profile, or null where the pH is missing or implausible */
const fetchSoilProfile = async (location: LatLon): Promise<SoilProfile | null> => {
  const body = await fetchJson<SoilGridsBody>(
    'soilgrids',
    '/soilgrids/v2.0/properties/query',
    new URLSearchParams([
      ['lat', String(location.latitudeDeg)],
      ['lon', String(location.longitudeDeg)],
      ['property', 'phh2o'],
      ['property', 'clay'],
      ['property', 'sand'],
      ['property', 'soc'],
      ['depth', '0-5cm'],
      ['value', 'mean'],
    ]),
    DEFAULT_FETCH_OPTIONS,
  )
  const layers = body.properties?.layers ?? []
  // SoilGrids returns mean: null where a depth has no data, and null/scale is the number 0,
  // which silently defeats every `?? fallback` below and zeroes the pH envelope
  const read = (name: string, scale: number): number | null => {
    const mean0 = layers.find((layer) => layer.name === name)?.depths?.[0]?.values?.mean
    return typeof mean0 === 'number' && Number.isFinite(mean0) ? mean0 / scale : null
  }
  const ph = read('phh2o', 10)
  if (ph === null || ph < MIN_PLAUSIBLE_PH || ph > MAX_PLAUSIBLE_PH) return null
  return {
    phUnits: ph,
    textureClass: textureFor(read('clay', 10) ?? 20, read('sand', 10) ?? 40),
    drainage: 'well',
    effectiveDepthM: 1 as Meters,
    // soc arrives in dg/kg and is read in g/kg, where 20 is the default. Dividing by 580 turns
    // carbon into organic matter at the van Bemmelen factor of 1.724
    organicMatterFraction: ((read('soc', 10) ?? 20) / 580) as Fraction,
    sourceId: 'soilgrids',
  }
}

const KM_PER_DEGREE_LAT = 111.32

/** Rings tried in order when the point itself has no plausible reading: 3 km, then 6 km */
const SOIL_RING_KM: readonly number[] = [3, 6]

/** The points `km` north, east, south and west of `location`, in that order */
const ringPoints = (location: LatLon, km: number): readonly LatLon[] => {
  const { latitudeDeg, longitudeDeg } = location
  const latOffset = km / KM_PER_DEGREE_LAT
  const lonOffset = km / (KM_PER_DEGREE_LAT * Math.cos((latitudeDeg * Math.PI) / 180))
  return [
    { latitudeDeg: degreesLatitude(latitudeDeg + latOffset), longitudeDeg },
    { latitudeDeg, longitudeDeg: degreesLongitude(longitudeDeg + lonOffset) },
    { latitudeDeg: degreesLatitude(latitudeDeg - latOffset), longitudeDeg },
    { latitudeDeg, longitudeDeg: degreesLongitude(longitudeDeg - lonOffset) },
  ]
}

/**
 * One point's own answer, kept apart from every other point's: a profile on a plausible
 * reading, null on a plausible answer of no data, undefined where the request itself never
 * came back at all
 */
const fetchSoilPoint = async (location: LatLon): Promise<SoilProfile | null | undefined> => {
  try {
    return await fetchSoilProfile(location)
  } catch {
    return undefined
  }
}

/**
 * SoilGrids masks built-up ground, so the pH layer is null at the center of nearly every town.
 * Where the point itself has no plausible reading, a ring of four points around it is queried
 * instead, nearest ring first, and the first plausible answer going north, east, south, west
 * stands in for the point.
 *
 * A request can also fail outright: SoilGrids returned 503s and aborted connections for single
 * points all evening. That's a different thing from a plausible answer of no data, so
 * `fetchSoilPoint` catches each point on its own and one failed point never sinks a whole ring.
 * The map counts as unreachable only when every point asked, at the center and both rings,
 * never answered at all
 */
export const soilAt = async (location: LatLon): Promise<SoilProfile> => {
  const own = await fetchSoilPoint(location)
  if (own) return own
  let answered = own === null
  for (const km of SOIL_RING_KM) {
    const readings = await Promise.all(ringPoints(location, km).map(fetchSoilPoint))
    answered ||= readings.some((reading) => reading === null)
    const hit = readings.find((reading): reading is SoilProfile => Boolean(reading))
    if (hit !== undefined) return { ...hit, sampledKm: km }
  }
  return answered ? DEFAULT_SOIL : { ...DEFAULT_SOIL, unreachable: true }
}

export const staticLayerLicenses = (): readonly Licensed[] => [
  {
    sourceId: 'usda-phzm-2023',
    license: 'OSU-owned, freely redistributable, altered data must carry the disclaimer',
    attribution: `${USDA_PHZM_ATTRIBUTION}. ${USDA_PHZM_DISCLAIMER}`,
    viralLicense: false,
  },
  {
    sourceId: 'koppen-beck-2018',
    license: 'CC BY 4.0',
    attribution: KOPPEN_ATTRIBUTION,
    viralLicense: false,
  },
  {
    sourceId: 'nrcan-hardiness',
    license: 'Open Government Licence - Canada',
    attribution: NRCAN_ATTRIBUTION,
    viralLicense: false,
  },
  {
    /**
     * The WCVP layer belongs here as well as in any credit list: this function is what
     * `AttributionPanel` renders and what `docs/STATIC-LAYERS.md` names as the reason a license
     * obligation can't drift from what actually ships. A CC BY layer credited only by a
     * hand-maintained array is the drift that sentence exists to prevent
     */
    sourceId: 'govaerts2021-wcvp',
    license: 'CC BY 4.0',
    attribution: `${WCVP_ATTRIBUTION}. Regions follow ${WGSRPD_ATTRIBUTION}. ${WCVP_SCOPE_NOTE}`,
    viralLicense: false,
  },
  {
    sourceId: 'open-meteo-era5',
    license: 'CC BY 4.0',
    attribution: OPEN_METEO_ATTRIBUTION,
    viralLicense: false,
  },
  {
    sourceId: 'soilgrids',
    license: 'CC BY 4.0',
    attribution: SOILGRIDS_ATTRIBUTION,
    viralLicense: false,
  },
]
