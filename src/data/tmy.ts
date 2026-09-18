import type { LatLon } from '../types/geo'
import type { EpochMillis } from '../types/units'
import type {
  DecompositionModel,
  MeasuredYear,
  TmySeries,
  WeatherProvenance,
  WeatherRecord,
  WeatherSourceId,
} from '../types/weather'
import { HOURS_PER_TMY } from '../types/weather'
import { utcOffsetHoursFor } from './geocode'
import { DEFAULT_FETCH_OPTIONS, fetchJson, fetchText } from './http'
import {
  at,
  DAYS_PER_YEAR,
  HOURS_PER_DAY,
  MONTH_LENGTH_DAYS,
  MONTH_START_DAY,
  requireCoverage,
} from './util'

export interface TmyRequest {
  readonly location: LatLon
  readonly source: WeatherSourceId
  readonly signal: AbortSignal | null
}

export interface RawTmyPayload {
  readonly source: WeatherSourceId
  readonly body: unknown
}

/** Years of reanalysis pulled before typical-month selection. A TMY is required, never one year */
export const TMY_YEAR_COUNT = 10

export const TMY_END_YEAR = 2024

export const OPEN_METEO_ATTRIBUTION = 'Open-Meteo ERA5 reanalysis, CC BY 4.0'
export const NASA_POWER_ATTRIBUTION = 'NASA POWER, NASA Langley Research Center'
export const PVGIS_ATTRIBUTION = 'PVGIS v5.3, European Commission Joint Research Centre'
export const NSRDB_ATTRIBUTION = 'NREL NSRDB'

const HOURLY_VARIABLES = [
  'shortwave_radiation',
  'direct_normal_irradiance',
  'diffuse_radiation',
  'temperature_2m',
  'dew_point_2m',
  'wind_speed_10m',
  'surface_pressure',
  // rain, so a measured year can be a dry one: the typical year's balance runs on the
  // thirty-year normals, a simulated season runs on what actually fell (Decision Record 14)
  'precipitation',
].join(',')

const years = (): readonly number[] =>
  Array.from({ length: TMY_YEAR_COUNT }, (_, index) => TMY_END_YEAR - TMY_YEAR_COUNT + 1 + index)

export const preferredSourceFor = (location: LatLon): WeatherSourceId => {
  const { latitudeDeg } = location
  return latitudeDeg > 85 || latitudeDeg < -85 ? 'nasa-power' : 'open-meteo'
}

export const fetchOpenMeteoTmy = async (request: TmyRequest): Promise<RawTmyPayload> => {
  const span = years()
  const body = await fetchJson<unknown>(
    'open-meteo',
    '/v1/archive',
    new URLSearchParams({
      latitude: String(request.location.latitudeDeg),
      longitude: String(request.location.longitudeDeg),
      start_date: `${String(span[0] ?? TMY_END_YEAR)}-01-01`,
      end_date: `${String(TMY_END_YEAR)}-12-31`,
      hourly: HOURLY_VARIABLES,
      windspeed_unit: 'ms',
      timezone: 'UTC',
    }),
    { ...DEFAULT_FETCH_OPTIONS, signal: request.signal, remember: true },
  )
  return { source: 'open-meteo', body }
}

/**
 * How many years of hourly data POWER will encode as JSON in one answer.
 *
 * This is a measured boundary. Asked for the whole ten-year window in one request, POWER answers
 * `422` with "please shorten your requested time extent for a JSON formatted data request", so
 * `fetchNasaPowerTmy` could NEVER succeed that way, either as the fallback it is at an ordinary
 * site or as the PREFERRED source it is beyond 85 degrees of latitude, where nothing else is
 * reached first.
 *
 * Probed at Bergen, Singapore and Tromso, with the seven parameters then requested below, and the
 * boundary is the same at all three, so it is a property of the encoding and not of the site:
 *
 * | extent | answer |
 * |---|---|
 * | 2021-2024, four years | 200 |
 * | 2020-2024, five years | 422 |
 * | 2015-2024, ten years, as CSV | 200 |
 *
 * The window is therefore fetched in chunks and stitched back together, rather than shortened.
 * Ten years is what makes this a climatology instead of a sample, and a source quietly carrying a
 * different span from every other source would be exactly the kind of unlabelled difference the
 * provenance rules here exist to prevent. CSV would take it in one request and is the other
 * honest fix; it costs a second parser for one upstream, where this costs two extra requests
 */
const POWER_MAX_YEARS_PER_REQUEST = 4

/** The requested window as [firstYear, lastYear] spans no longer than POWER will encode */
export const powerSpans = (
  firstYear: number,
  lastYear: number,
): readonly (readonly [number, number])[] => {
  const spans: (readonly [number, number])[] = []
  for (let first = firstYear; first <= lastYear; first += POWER_MAX_YEARS_PER_REQUEST) {
    spans.push([first, Math.min(first + POWER_MAX_YEARS_PER_REQUEST - 1, lastYear)])
  }
  return spans
}

/**
 * The chunks put back together as the one body `fromNasaPower` already reads. POWER keys every
 * reading by `YYYYMMDDHH` under its parameter name, so the chunks share no keys and a shallow
 * merge per parameter is the whole join; the parser sorts the keys itself, so the order the
 * chunks arrive in does not matter
 */
export const mergedPowerBody = (bodies: readonly PowerBody[]): PowerBody => {
  const parameter: Record<string, Record<string, number>> = {}
  for (const body of bodies)
    for (const [name, series] of Object.entries(body.properties?.parameter ?? {}))
      parameter[name] = { ...(parameter[name] ?? {}), ...series }
  return { properties: { parameter } }
}

export const fetchNasaPowerTmy = async (request: TmyRequest): Promise<RawTmyPayload> => {
  const bodies: PowerBody[] = []
  // sequential, because `MIN_INTERVAL_MS` paces this upstream and three requests fired at once
  // would be three requests arriving at once
  for (const [firstYear, lastYear] of powerSpans(TMY_END_YEAR - TMY_YEAR_COUNT + 1, TMY_END_YEAR)) {
    bodies.push(
      await fetchJson<PowerBody>(
        'nasa-power',
        '/api/temporal/hourly/point',
        new URLSearchParams({
          latitude: String(request.location.latitudeDeg),
          longitude: String(request.location.longitudeDeg),
          start: `${String(firstYear)}0101`,
          end: `${String(lastYear)}1231`,
          /*
            RE and not AG, because the community decides the UNITS and the decoder below reads
            irradiance as W/m². Measured against the live API for one July day at Amherst: under
            AG, ALLSKY_SFC_SW_DWN comes back in "MJ/hr" (2.34 at noon); under RE the same hour is
            "Wh/m^2" (649.85). Read as W/m², the AG figure is a sun 280 times too weak, and that
            is what ran two seasons of the example garden at 0 kWh from three rows of panels on
            2026-09-03, after one Open-Meteo 429 sent the lookup down this fallback
          */
          community: 'RE',
          parameters:
            'ALLSKY_SFC_SW_DWN,ALLSKY_SFC_SW_DNI,ALLSKY_SFC_SW_DIFF,T2M,T2MDEW,WS10M,PS,PRECTOTCORR',
          format: 'JSON',
          'time-standard': 'UTC',
        }),
        { ...DEFAULT_FETCH_OPTIONS, signal: request.signal, remember: true },
      ),
    )
  }
  return { source: 'nasa-power', body: mergedPowerBody(bodies) }
}

export const fetchPvgisTmy = async (request: TmyRequest): Promise<RawTmyPayload> => {
  const body = await fetchJson<unknown>(
    'pvgis',
    '/api/v5_3/tmy',
    new URLSearchParams({
      lat: String(request.location.latitudeDeg),
      lon: String(request.location.longitudeDeg),
      outputformat: 'json',
    }),
    { ...DEFAULT_FETCH_OPTIONS, signal: request.signal },
  )
  return { source: 'pvgis-sarah3', body }
}

export const fetchNsrdbTmy = async (request: TmyRequest): Promise<RawTmyPayload> => {
  const body = await fetchText(
    'nsrdb',
    '/api/nsrdb/v2/solar/nsrdb-GOES-tmy-v4-0-0-download.csv',
    new URLSearchParams({
      wkt: `POINT(${String(request.location.longitudeDeg)} ${String(request.location.latitudeDeg)})`,
      names: 'tmy',
      interval: '60',
      utc: 'true',
    }),
    { ...DEFAULT_FETCH_OPTIONS, signal: request.signal },
  )
  return { source: 'nsrdb-psm3', body }
}

export const parseUploadedTmy = (csv: string): RawTmyPayload => ({
  source: 'user-upload',
  body: csv,
})

interface Columns {
  readonly ghi: Float32Array
  readonly dni: Float32Array
  readonly dhi: Float32Array
  readonly dryBulb: Float32Array
  readonly dewPoint: Float32Array
  readonly wind: Float32Array
  readonly pressure: Float32Array
  /** Rain in the hour, mm. All zero where the source carries none; `Stacked.precipPresent` says */
  readonly precip: Float32Array
}

/** The years a source answered with, one column set each, and whether rain was among them */
interface Stacked {
  readonly years: Map<number, Columns>
  readonly precipPresent: boolean
}

const emptyColumns = (length: number): Columns => ({
  ghi: new Float32Array(length),
  dni: new Float32Array(length),
  dhi: new Float32Array(length),
  dryBulb: new Float32Array(length),
  dewPoint: new Float32Array(length),
  wind: new Float32Array(length),
  pressure: new Float32Array(length).fill(1013.25),
  precip: new Float32Array(length),
})

const COLUMN_KEYS: readonly (keyof Columns)[] = [
  'ghi',
  'dni',
  'dhi',
  'dryBulb',
  'dewPoint',
  'wind',
  'pressure',
  'precip',
]

const isLeap = (year: number): boolean => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)

/**
 * Finkelstein-Schafer statistic: the mean absolute difference between the
 * candidate month's empirical CDF and the long-term CDF of the same month
 */
const finkelsteinSchafer = (candidate: readonly number[], longTerm: readonly number[]): number => {
  if (candidate.length === 0 || longTerm.length === 0) return Number.POSITIVE_INFINITY
  const sorted = [...longTerm].sort((a, b) => a - b)
  const cdf = (value: number): number => {
    let low = 0
    let high = sorted.length
    while (low < high) {
      const mid = (low + high) >> 1
      if ((sorted[mid] ?? 0) <= value) low = mid + 1
      else high = mid
    }
    return low / sorted.length
  }
  const candidateSorted = [...candidate].sort((a, b) => a - b)
  let total = 0
  for (let index = 0; index < candidateSorted.length; index += 1) {
    total += Math.abs((index + 1) / candidateSorted.length - cdf(candidateSorted[index] ?? 0))
  }
  return total / candidateSorted.length
}

const FS_WEIGHTS = { ghi: 0.5, dryBulb: 0.3, dewPoint: 0.1, wind: 0.1 } as const

/**
 * Sandia-style typical-meteorological-year assembly: pick, for each calendar
 * month, the year whose weighted Finkelstein-Schafer score is lowest
 */
export const assembleTypicalYear = (
  perYear: ReadonlyMap<number, Columns>,
): { readonly columns: Columns; readonly chosenYears: readonly number[] } => {
  const out = emptyColumns(HOURS_PER_TMY)
  const chosen: number[] = []
  for (let month = 1; month <= 12; month += 1) {
    const startDay = at(MONTH_START_DAY, month - 1)
    const days = at(MONTH_LENGTH_DAYS, month - 1)
    const startHour = startDay * HOURS_PER_DAY
    const hours = days * HOURS_PER_DAY
    const pooled = {
      ghi: [] as number[],
      dryBulb: [] as number[],
      dewPoint: [] as number[],
      wind: [] as number[],
    }
    const slices = new Map<number, Record<keyof typeof pooled, number[]>>()
    for (const [year, columns] of perYear) {
      const slice = {
        ghi: [] as number[],
        dryBulb: [] as number[],
        dewPoint: [] as number[],
        wind: [] as number[],
      }
      for (let offset = 0; offset < hours; offset += 1) {
        const index = startHour + offset
        slice.ghi.push(at(columns.ghi, index))
        slice.dryBulb.push(at(columns.dryBulb, index))
        slice.dewPoint.push(at(columns.dewPoint, index))
        slice.wind.push(at(columns.wind, index))
      }
      slices.set(year, slice)
      pooled.ghi.push(...slice.ghi)
      pooled.dryBulb.push(...slice.dryBulb)
      pooled.dewPoint.push(...slice.dewPoint)
      pooled.wind.push(...slice.wind)
    }
    let bestYear = -1
    let bestScore = Number.POSITIVE_INFINITY
    for (const [year, slice] of slices) {
      const score =
        FS_WEIGHTS.ghi * finkelsteinSchafer(slice.ghi, pooled.ghi) +
        FS_WEIGHTS.dryBulb * finkelsteinSchafer(slice.dryBulb, pooled.dryBulb) +
        FS_WEIGHTS.dewPoint * finkelsteinSchafer(slice.dewPoint, pooled.dewPoint) +
        FS_WEIGHTS.wind * finkelsteinSchafer(slice.wind, pooled.wind)
      if (score < bestScore) {
        bestScore = score
        bestYear = year
      }
    }
    const winner = perYear.get(bestYear)
    if (winner !== undefined) {
      for (const key of COLUMN_KEYS) {
        out[key].set(winner[key].subarray(startHour, startHour + hours), startHour)
      }
      chosen.push(bestYear)
    }
  }
  return { columns: out, chosenYears: chosen }
}

/** Drops 29 February so every calendar year is 8760 h on the same day grid */
const stackByYear = (
  timestamps: readonly string[],
  read: (index: number) => Record<keyof Columns, number>,
): Map<number, Columns> => {
  const stacked = new Map<number, Columns>()
  const cursor = new Map<number, number>()
  for (let index = 0; index < timestamps.length; index += 1) {
    const stamp = timestamps[index] ?? ''
    const year = Number(stamp.slice(0, 4))
    if (!Number.isFinite(year)) continue
    if (stamp.slice(5, 10) === '02-29') continue
    const columns = stacked.get(year) ?? emptyColumns(HOURS_PER_TMY)
    stacked.set(year, columns)
    const position = cursor.get(year) ?? 0
    if (position >= HOURS_PER_TMY) continue
    const values = read(index)
    for (const key of COLUMN_KEYS) columns[key][position] = values[key]
    cursor.set(year, position + 1)
  }
  for (const [year, count] of cursor) {
    const expected = isLeap(year) ? HOURS_PER_TMY : HOURS_PER_TMY
    if (count < expected * 0.95) stacked.delete(year)
  }
  return stacked
}

interface OpenMeteoBody {
  readonly hourly?: {
    readonly time?: readonly string[]
    readonly shortwave_radiation?: readonly (number | null)[]
    readonly direct_normal_irradiance?: readonly (number | null)[]
    readonly diffuse_radiation?: readonly (number | null)[]
    readonly temperature_2m?: readonly (number | null)[]
    readonly dew_point_2m?: readonly (number | null)[]
    readonly wind_speed_10m?: readonly (number | null)[]
    readonly surface_pressure?: readonly (number | null)[]
    readonly precipitation?: readonly (number | null)[]
  }
}

const numberOf = (raw: unknown): number | null => {
  if (typeof raw !== 'number' && (typeof raw !== 'string' || raw.trim().length === 0)) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

/**
 * Irradiance and dry-bulb temperature are the two series with no honest substitute:
 * absent components fall back to Erbs decomposition, absent humidity and wind to
 * Hargreaves-Samani, absent pressure to the standard atmosphere. So only these two
 * are counted, and a response that does not carry them is refused rather than read
 * as a real 0 W/m2, 0 C year the way the daily normals once were
 */
const TMY_SUBJECT = 'a typical meteorological year needs'

const countPresent = (series: readonly unknown[] | undefined, length: number): number => {
  let present = 0
  for (let index = 0; index < length; index += 1) {
    if (numberOf(series?.[index]) !== null) present += 1
  }
  return present
}

const numberAt = (series: readonly (number | null)[] | undefined, index: number): number =>
  series?.[index] ?? 0

const fromOpenMeteo = (body: OpenMeteoBody): Stacked => {
  const hourly = body.hourly ?? {}
  const time = hourly.time ?? []
  const required = [hourly.shortwave_radiation, hourly.temperature_2m]
  requireCoverage({
    upstream: 'Open-Meteo',
    cadence: 'hourly',
    subject: TMY_SUBJECT,
    present: required.reduce((total, series) => total + countPresent(series, time.length), 0),
    expected: time.length * required.length,
  })
  return {
    years: stackByYear(time, (index) => ({
      ghi: numberAt(hourly.shortwave_radiation, index),
      dni: numberAt(hourly.direct_normal_irradiance, index),
      dhi: numberAt(hourly.diffuse_radiation, index),
      dryBulb: numberAt(hourly.temperature_2m, index),
      dewPoint: numberAt(hourly.dew_point_2m, index),
      wind: numberAt(hourly.wind_speed_10m, index),
      pressure: numberAt(hourly.surface_pressure, index) || 1013.25,
      precip: numberAt(hourly.precipitation, index),
    })),
    // a dry decade is all zeros and still present; only an unanswered column is absent
    precipPresent: countPresent(hourly.precipitation, time.length) > 0,
  }
}

export interface PowerBody {
  readonly properties?: { readonly parameter?: Record<string, Record<string, number>> }
}

/** POWER's no-data marker, in the hourly and the daily product alike */
export const POWER_FILL = -999

const fromNasaPower = (body: PowerBody): Stacked => {
  const parameters = body.properties?.parameter ?? {}
  const keys = Object.keys(parameters.T2M ?? {}).sort()
  // -999 is POWER's no-data marker, so a filled cell is an absent reading, not a real 0
  const value = (name: string, key: string): number => {
    const raw = numberOf(parameters[name]?.[key])
    return raw === null || raw <= POWER_FILL ? 0 : raw
  }
  const required = ['ALLSKY_SFC_SW_DWN', 'T2M']
  requireCoverage({
    upstream: 'NASA POWER',
    cadence: 'hourly',
    subject: TMY_SUBJECT,
    present: required.reduce(
      (total, name) =>
        total +
        keys.filter((key) => (numberOf(parameters[name]?.[key]) ?? POWER_FILL) > POWER_FILL).length,
      0,
    ),
    expected: keys.length * required.length,
  })
  const timestamps = keys.map(
    (key) => `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}T${key.slice(8, 10)}:00`,
  )
  return {
    years: stackByYear(timestamps, (index) => {
      const key = keys[index] ?? ''
      return {
        ghi: value('ALLSKY_SFC_SW_DWN', key),
        dni: value('ALLSKY_SFC_SW_DNI', key),
        dhi: value('ALLSKY_SFC_SW_DIFF', key),
        dryBulb: value('T2M', key),
        dewPoint: value('T2MDEW', key),
        wind: value('WS10M', key),
        pressure: value('PS', key) * 10 || 1013.25,
        // labelled "mm/day" in the hourly product, but the 24 hourly values of a day SUM to the
        // daily product's figure (measured 2026-09-12 at Melbourne, -37.77 144.96, 2019-06-01:
        // hourly sum 0.59, daily 0.58), so each is the millimetres that fell in its hour. An
        // earlier division by 24 here, from a measurement that read the label, left a Melbourne
        // garden with 24 mm of rain in its driest year against 737 mm in its typical one
        precip: value('PRECTOTCORR', key),
      }
    }),
    precipPresent: keys.some(
      (key) => (numberOf(parameters.PRECTOTCORR?.[key]) ?? POWER_FILL) > POWER_FILL,
    ),
  }
}

interface PvgisBody {
  readonly inputs?: {
    readonly meteo_data?: { readonly radiation_db?: unknown }
  }
  readonly outputs?: {
    readonly tmy_hourly?: readonly Record<string, number | string>[]
  }
  readonly meta?: unknown
}

const fromPvgis = (body: PvgisBody): Columns => {
  const rows = body.outputs?.tmy_hourly ?? []
  const columns = emptyColumns(HOURS_PER_TMY)
  const hours = Math.min(rows.length, HOURS_PER_TMY)
  let present = 0
  for (let index = 0; index < hours; index += 1) {
    const row = rows[index] ?? {}
    const read = (key: string): number => numberOf(row[key]) ?? 0
    const ghi = numberOf(row['G(h)'])
    const dryBulb = numberOf(row.T2m)
    if (ghi !== null) present += 1
    if (dryBulb !== null) present += 1
    columns.ghi[index] = ghi ?? 0
    columns.dni[index] = read('Gb(n)')
    columns.dhi[index] = read('Gd(h)')
    columns.dryBulb[index] = dryBulb ?? 0
    columns.wind[index] = read('WS10m')
    columns.pressure[index] = read('SP') / 100 || 1013.25
    columns.dewPoint[index] = (dryBulb ?? 0) - (100 - read('RH')) / 5
  }
  requireCoverage({
    upstream: 'PVGIS',
    cadence: 'hourly',
    subject: TMY_SUBJECT,
    present,
    expected: hours * 2,
  })
  return columns
}

const CSV_ALIASES: Readonly<Record<keyof Columns, readonly string[]>> = {
  ghi: ['ghi', 'g(h)', 'allsky_sfc_sw_dwn', 'shortwave_radiation'],
  dni: ['dni', 'gb(n)', 'allsky_sfc_sw_dni', 'direct_normal_irradiance'],
  dhi: ['dhi', 'gd(h)', 'allsky_sfc_sw_diff', 'diffuse_radiation'],
  dryBulb: ['temperature', 'temperature_2m', 't2m', 'dry bulb temperature', 'drybulb'],
  dewPoint: ['dew point', 'dew_point_2m', 't2mdew', 'dewpoint'],
  wind: ['wind speed', 'wind_speed_10m', 'ws10m', 'windspeed'],
  pressure: ['pressure', 'surface_pressure', 'sp', 'ps'],
  // read where a CSV carries it, but never reported as present: a typical-year CSV holds one
  // assembled year, and one year of rain is a sample rather than the record a season is drawn from
  precip: ['precipitation', 'prectotcorr', 'rain'],
}

export const csvHasNoIrradiance = (upstream: string): Error =>
  new Error(
    `${upstream} carries no recognisable global horizontal irradiance column, so there is no typical meteorological year to read from it`,
  )

export const parseCsvColumns = (csv: string, upstream = 'The TMY CSV'): Columns => {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0)
  const headerIndex = lines.findIndex((line) =>
    /ghi|shortwave|allsky_sfc_sw_dwn|g\(h\)/i.test(line),
  )
  const columns = emptyColumns(HOURS_PER_TMY)
  // an all-zero year is a fabricated one: refuse the file rather than return the empty columns
  if (headerIndex < 0) throw csvHasNoIrradiance(upstream)
  const header = (lines[headerIndex] ?? '').split(',').map((cell) => cell.trim().toLowerCase())
  const indexOf = (key: keyof Columns): number =>
    header.findIndex((cell) =>
      (CSV_ALIASES[key] as readonly string[]).some(
        (alias) => cell === alias || cell.startsWith(alias),
      ),
    )
  const positions = Object.fromEntries(COLUMN_KEYS.map((key) => [key, indexOf(key)])) as Record<
    keyof Columns,
    number
  >
  let rows = 0
  let present = 0
  for (let row = 0; row < HOURS_PER_TMY && headerIndex + 1 + row < lines.length; row += 1) {
    const cells = (lines[headerIndex + 1 + row] ?? '').split(',')
    for (const key of COLUMN_KEYS) {
      const position = positions[key]
      if (position < 0) continue
      const value = numberOf(cells[position])
      if (value !== null) columns[key][row] = value
      if (key === 'ghi' || key === 'dryBulb') present += value === null ? 0 : 1
    }
    rows += 1
  }
  requireCoverage({
    upstream,
    cadence: 'hourly',
    subject: TMY_SUBJECT,
    present,
    expected: rows * 2,
  })
  return columns
}

const provenanceFor = (
  source: WeatherSourceId,
  yearsCovered: readonly number[],
  typical: boolean,
): WeatherProvenance => {
  const table: Readonly<
    Record<
      WeatherSourceId,
      { label: string; measured: string; licence: string; attribution: string }
    >
  > = {
    'open-meteo': {
      label: 'Open-Meteo ERA5 typical meteorological year',
      measured: 'Open-Meteo ERA5 reanalysis, the calendar year',
      licence: 'CC BY 4.0',
      attribution: OPEN_METEO_ATTRIBUTION,
    },
    'nasa-power': {
      label: 'NASA POWER hourly typical meteorological year',
      measured: 'NASA POWER hourly record, the calendar year',
      licence: 'Public domain (US Government work)',
      attribution: NASA_POWER_ATTRIBUTION,
    },
    'pvgis-sarah3': {
      label: 'PVGIS v5.3 TMY',
      measured: 'PVGIS v5.3, the calendar year',
      licence: 'PVGIS terms of use, non-AJAX access only',
      attribution: PVGIS_ATTRIBUTION,
    },
    'nsrdb-psm3': {
      label: 'NREL NSRDB GOES TMY',
      measured: 'NREL NSRDB GOES, the calendar year',
      licence: 'NREL data policy',
      attribution: NSRDB_ATTRIBUTION,
    },
    'user-upload': {
      label: 'User-supplied TMY CSV',
      measured: 'User-supplied CSV, the calendar year',
      licence: 'unknown',
      attribution: 'User upload',
    },
  }
  const entry = table[source]
  return {
    // a measured year names itself, because a series that could pass for the typical one is
    // exactly the unlabelled difference Decision Record 4 exists to prevent
    datasetLabel: typical ? entry.label : `${entry.measured} ${String(yearsCovered[0] ?? '')}`,
    yearsCovered,
    licence: entry.licence,
    attribution: entry.attribution,
    retrievedUtcMillis: Date.now() as EpochMillis,
    isTypicalMeteorologicalYear: typical,
  }
}

const componentsPresent = (columns: Columns): boolean => {
  for (let index = 0; index < columns.ghi.length; index += 1) {
    if (at(columns.dni, index) > 0 || at(columns.dhi, index) > 0) return true
  }
  return false
}

interface PackOptions {
  /** The calendar year the timestamps are laid on: the end of the window for a typical year */
  readonly baseYear: number
  readonly typical: boolean
  readonly precipPresent: boolean
}

const pack = (
  source: WeatherSourceId,
  columns: Columns,
  yearsCovered: readonly number[],
  utcOffsetHours: number,
  options: PackOptions,
): TmySeries => {
  const startUtcMillis = Date.UTC(options.baseYear, 0, 1) as EpochMillis
  const utcMillis = new Float64Array(HOURS_PER_TMY)
  for (let hour = 0; hour < HOURS_PER_TMY; hour += 1) {
    utcMillis[hour] = startUtcMillis + hour * 3_600_000
  }
  const decomposition: DecompositionModel = componentsPresent(columns) ? 'passthrough' : 'erbs'
  return {
    source,
    decomposition,
    utcOffsetHours,
    startUtcMillis,
    utcMillis,
    ghiWM2: columns.ghi,
    dniWM2: columns.dni,
    dhiWM2: columns.dhi,
    dryBulbC: columns.dryBulb,
    dewPointC: columns.dewPoint,
    windSpeedMS: columns.wind,
    pressureMb: columns.pressure,
    ...(options.precipPresent ? { precipMm: columns.precip } : {}),
    provenance: provenanceFor(source, yearsCovered, options.typical),
  }
}

const TYPICAL_PACK = { baseYear: TMY_END_YEAR, typical: true } as const

/**
 * The typical year, and every measured year it was assembled from.
 *
 * `assembleTypicalYear` used to be the only reader of the stack and the other nine years were
 * dropped on the floor. They are the site's own record of how much a year can differ from the
 * typical one, which is the one thing a typical year cannot say, and a season simulation draws
 * its drought from them rather than from a dial (Decision Record 14). Sources that ship a
 * typical year and nothing else hand back an empty list, which the simulation says out loud
 */
export const normaliseWeather = (payload: RawTmyPayload, location: LatLon): WeatherRecord => {
  // the longitude's whole-hour guess; `resolveSite` stamps the zone the normals name over it
  const utcOffsetHours = utcOffsetHoursFor(location)
  if (payload.source === 'open-meteo' || payload.source === 'nasa-power') {
    const stacked =
      payload.source === 'open-meteo'
        ? fromOpenMeteo(payload.body as OpenMeteoBody)
        : fromNasaPower(payload.body as PowerBody)
    const { columns, chosenYears } = assembleTypicalYear(stacked.years)
    const precipPresent = stacked.precipPresent
    const typical = pack(payload.source, columns, chosenYears, utcOffsetHours, {
      ...TYPICAL_PACK,
      precipPresent,
    })
    const years: MeasuredYear[] = [...stacked.years.entries()]
      .sort(([a], [b]) => a - b)
      .map(([year, yearColumns]) => ({
        year,
        weather: pack(payload.source, yearColumns, [year], utcOffsetHours, {
          baseYear: year,
          typical: false,
          precipPresent,
        }),
      }))
    return { typical, years }
  }
  const single = { ...TYPICAL_PACK, precipPresent: false }
  if (payload.source === 'pvgis-sarah3') {
    const body = payload.body as PvgisBody
    const typical = pack(payload.source, fromPvgis(body), [], utcOffsetHours, single)
    // PVGIS picks its radiation database by the place, SARAH-3 on the Meteosat disk and ERA5
    // elsewhere (Amherst answers PVGIS-ERA5), and names the choice, so the label carries it
    const database = body.inputs?.meteo_data?.radiation_db
    const provenance =
      typeof database === 'string' && database !== ''
        ? {
            ...typical.provenance,
            datasetLabel: `${typical.provenance.datasetLabel} (${database})`,
          }
        : typical.provenance
    return { typical: { ...typical, provenance }, years: [] }
  }
  const label = payload.source === 'nsrdb-psm3' ? 'NSRDB' : 'The uploaded CSV'
  const columns = parseCsvColumns(String(payload.body), label)
  return { typical: pack(payload.source, columns, [], utcOffsetHours, single), years: [] }
}

export const normaliseTmy = (payload: RawTmyPayload, location: LatLon): TmySeries =>
  normaliseWeather(payload, location).typical

/**
 * The bounds a year of weather on this planet stays inside, and the sentence for one that does
 * not. Null where the record is plausible.
 *
 * Exists because the fallback chain below swallows a source's failure and moves on, which is
 * right for a timeout and was catastrophic for a unit: one Open-Meteo 429 on 2026-09-03 sent the
 * lookup to NASA POWER, whose hourly irradiance under the AG community is MJ/hr, and the app ran
 * two persona visits' seasons on a sun 280 times too weak, 0 kWh from three rows of panels and
 * 24 metres of rain in the driest year, without a word. A source whose year cannot have happened
 * is a source that failed, and it falls through to the next like any other failure.
 *
 * The floor is a third of the darkest inhabited place's annual sum (Tromsø, about 750 kWh/m²)
 * and the ceiling is above the Atacama's; rain stops above Mawsynram's 11,871 mm. Wide on
 * purpose: these catch a wrong unit, not a wet year
 */
export const implausibleWeather = (record: WeatherRecord): string | null => {
  const series = [record.typical, ...record.years.map((entry) => entry.weather)]
  for (const weather of series) {
    const label = weather.provenance.datasetLabel
    let ghiWh = 0
    for (const value of weather.ghiWM2) ghiWh += value
    const ghiKwh = ghiWh / 1000
    if (ghiKwh < MIN_ANNUAL_GHI_KWH_M2 || ghiKwh > MAX_ANNUAL_GHI_KWH_M2) {
      return `${label}: ${String(Math.round(ghiKwh))} kWh/m² of sun in the year, which no place on Earth gets`
    }
    if (weather.precipMm !== undefined) {
      let rain = 0
      for (const value of weather.precipMm) rain += value
      if (rain > MAX_ANNUAL_RAIN_MM) {
        return `${label}: ${String(Math.round(rain))} mm of rain in the year, which no place on Earth gets`
      }
    }
  }
  return null
}

export const MIN_ANNUAL_GHI_KWH_M2 = 250
export const MAX_ANNUAL_GHI_KWH_M2 = 3000
export const MAX_ANNUAL_RAIN_MM = 13_000

export const fetchWeather = async (request: TmyRequest): Promise<WeatherRecord> => {
  const fetchers: Readonly<Record<WeatherSourceId, (r: TmyRequest) => Promise<RawTmyPayload>>> = {
    'open-meteo': fetchOpenMeteoTmy,
    'nasa-power': fetchNasaPowerTmy,
    'pvgis-sarah3': fetchPvgisTmy,
    'nsrdb-psm3': fetchNsrdbTmy,
    'user-upload': () => Promise.reject(new Error('user-upload requires parseUploadedTmy')),
  }
  /*
    PVGIS ahead of NASA POWER, measured: PVGIS answers its whole typical year in about 4 s
    (Amherst, 1.27 MB) where POWER's hourly endpoint is three sequential four-year chunks at up
    to 12 s each. The cost is a typical year with no measured years behind it, which the season
    simulation says out loud. The Set keeps a polar site, whose preferred source is POWER, from
    asking it a second time
  */
  const order = [
    ...new Set<WeatherSourceId>([request.source, 'pvgis-sarah3', 'nasa-power', 'nsrdb-psm3']),
  ]
  let lastError: unknown = null
  for (const source of order) {
    if (source === 'user-upload') continue
    try {
      const record = normaliseWeather(
        await fetchers[source]({ ...request, source }),
        request.location,
      )
      const why = implausibleWeather(record)
      if (why !== null)
        throw new Error(`${source} answered a year that cannot have happened (${why})`)
      return record
    } catch (error) {
      if (request.signal?.aborted === true) throw error
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('no TMY source available')
}

export const fetchTmy = async (request: TmyRequest): Promise<TmySeries> =>
  (await fetchWeather(request)).typical

export const dayCount = DAYS_PER_YEAR
