const NORMALS_START_YEAR = 1991
const NORMALS_END_YEAR = 2020
const TMY_YEAR = 2024

const isLeap = (year: number): boolean => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)

const pad = (value: number): string => String(value).padStart(2, '0')

const round = (value: number, places = 1): number => Number(value.toFixed(places))

/** Deterministic clear-sky GHI so the bake produces a non-degenerate raster */
const clearSkyGhi = (dayOfYear: number, localHour: number, latitudeDeg: number): number => {
  const declination = ((23.44 * Math.PI) / 180) * Math.sin((2 * Math.PI * (dayOfYear - 81)) / 365)
  const hourAngle = ((localHour - 12) * 15 * Math.PI) / 180
  const latitude = (latitudeDeg * Math.PI) / 180
  const sinAltitude =
    Math.sin(latitude) * Math.sin(declination) +
    Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle)
  return sinAltitude <= 0 ? 0 : 950 * sinAltitude
}

const seasonalTemp = (dayOfYear: number): number =>
  11 + 13 * Math.sin((2 * Math.PI * (dayOfYear - 110)) / 365)

const NORMALS_YEAR_COUNT = NORMALS_END_YEAR - NORMALS_START_YEAR + 1

/** How far a cold year sits below a mild one in this synthetic record */
export const YEAR_ANOMALY_SPAN_C = 7

/**
 * A frost exceedance curve is a quantile over the years of the record, so a
 * fixture that repeats one identical year collapses every percentile onto the
 * same date and no frost dial can ever move a sow date. This is a deterministic
 * anomaly applied to the daily minimum only: `(index * 7) % 30` is a
 * permutation of the years, so the record carries neither a warming trend nor
 * randomness, and the evenly spaced offsets sum to zero, leaving the 30 year
 * means that hardiness and Koppen read where they were
 */
export const yearAnomalyC = (year: number): number => {
  const index = ((year - NORMALS_START_YEAR) * 7) % NORMALS_YEAR_COUNT
  return YEAR_ANOMALY_SPAN_C * (index / (NORMALS_YEAR_COUNT - 1) - 0.5)
}

interface DayStamp {
  readonly stamp: string
  readonly dayOfYear: number
}

const daysOf = (year: number): readonly DayStamp[] => {
  const lengths = [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  const out: DayStamp[] = []
  let dayOfYear = 1
  for (let month = 0; month < 12; month += 1) {
    for (let day = 1; day <= (lengths[month] ?? 30); day += 1) {
      out.push({ stamp: `${String(year)}-${pad(month + 1)}-${pad(day)}`, dayOfYear })
      dayOfYear += 1
    }
  }
  return out
}

export const dailyNormalsBody = (latitudeDeg: number, longitudeDeg: number): unknown => {
  const time: string[] = []
  const min: number[] = []
  const max: number[] = []
  const meanC: number[] = []
  const precip: number[] = []
  const shortwave: number[] = []
  const offsetHours = longitudeDeg / 15
  for (let year = NORMALS_START_YEAR; year <= NORMALS_END_YEAR; year += 1) {
    for (const day of daysOf(year)) {
      const base = seasonalTemp(day.dayOfYear)
      let mj = 0
      for (let hour = 0; hour < 24; hour += 1) {
        mj += clearSkyGhi(day.dayOfYear, hour + offsetHours - offsetHours, latitudeDeg) * 0.0036
      }
      time.push(day.stamp)
      min.push(round(base - 6 + yearAnomalyC(year)))
      max.push(round(base + 7))
      meanC.push(round(base))
      precip.push(2.5)
      shortwave.push(round(mj * 0.75, 2))
    }
  }
  return {
    daily: {
      time,
      temperature_2m_min: min,
      temperature_2m_max: max,
      temperature_2m_mean: meanC,
      precipitation_sum: precip,
      shortwave_radiation_sum: shortwave,
    },
  }
}

export const hourlyArchiveBody = (latitudeDeg: number, longitudeDeg: number): unknown => {
  const time: string[] = []
  const ghi: number[] = []
  const dni: number[] = []
  const dhi: number[] = []
  const temperature: number[] = []
  const dewPoint: number[] = []
  const wind: number[] = []
  const windDirection: number[] = []
  const pressure: number[] = []
  const offsetHours = longitudeDeg / 15
  for (const day of daysOf(TMY_YEAR)) {
    if (day.stamp.slice(5) === '02-29') continue
    for (let hour = 0; hour < 24; hour += 1) {
      const global = clearSkyGhi(day.dayOfYear, hour + offsetHours, latitudeDeg)
      const base = seasonalTemp(day.dayOfYear)
      time.push(`${day.stamp}T${pad(hour)}:00`)
      ghi.push(round(global))
      dni.push(round(global * 0.82))
      dhi.push(round(global * 0.18))
      temperature.push(round(base + 4 * Math.sin((2 * Math.PI * (hour - 9)) / 24)))
      dewPoint.push(round(base - 5))
      wind.push(2.5)
      // a westerly that swings through the day, so the rain field gets a directed rose to place
      // the drip strips by, the way a real archive answer does
      windDirection.push(round(250 + 40 * Math.sin((2 * Math.PI * hour) / 24)))
      pressure.push(1013.2)
    }
  }
  return {
    hourly: {
      time,
      shortwave_radiation: ghi,
      direct_normal_irradiance: dni,
      diffuse_radiation: dhi,
      temperature_2m: temperature,
      dew_point_2m: dewPoint,
      wind_speed_10m: wind,
      wind_direction_10m: windDirection,
      surface_pressure: pressure,
    },
  }
}

export const elevationBody = (elevationM: number): unknown => ({
  results: [{ elevation: elevationM }],
})

export const soilBody = (): unknown => ({
  properties: {
    layers: [
      { name: 'phh2o', depths: [{ values: { mean: 64 } }] },
      { name: 'clay', depths: [{ values: { mean: 220 } }] },
      { name: 'sand', depths: [{ values: { mean: 380 } }] },
      { name: 'soc', depths: [{ values: { mean: 24000 } }] },
    ],
  },
})

/**
 * Degraded upstreams, the shapes that reach production. SoilGrids answers `mean: null` at a no-data
 * depth, and `null / 10` is 0, so a reader that divides first puts every crop outside a pH 0
 * envelope and empties the whole recommendation list with nothing on screen to say why
 */
export const soilBodyWith = (mean: number | null): unknown => ({
  properties: {
    layers: [
      { name: 'phh2o', depths: [{ values: { mean } }] },
      { name: 'clay', depths: [{ values: { mean } }] },
      { name: 'sand', depths: [{ values: { mean } }] },
      { name: 'soc', depths: [{ values: { mean } }] },
    ],
  },
})

export const emptySoilBody = (): unknown => ({ properties: { layers: [] } })

/** Open-Meteo reports `null` for a variable it has no value for on a given day */
export const nulledDailyNormalsBody = (latitudeDeg: number, longitudeDeg: number): unknown => {
  const full = dailyNormalsBody(latitudeDeg, longitudeDeg) as {
    daily: Record<string, readonly unknown[]>
  }
  const nulls = full.daily.time?.map(() => null) ?? []
  return {
    daily: {
      time: full.daily.time,
      temperature_2m_min: nulls,
      temperature_2m_max: nulls,
      temperature_2m_mean: nulls,
      precipitation_sum: nulls,
      shortwave_radiation_sum: nulls,
    },
  }
}

/** A truncated response: the timestamps are all there and the values stop early */
export const truncatedDailyNormalsBody = (latitudeDeg: number, longitudeDeg: number): unknown => {
  const full = dailyNormalsBody(latitudeDeg, longitudeDeg) as {
    daily: Record<string, readonly unknown[]>
  }
  const keep = <T>(series: readonly T[] | undefined): readonly T[] =>
    (series ?? []).slice(0, Math.floor((series ?? []).length / 4))
  return {
    daily: {
      time: full.daily.time,
      temperature_2m_min: keep(full.daily.temperature_2m_min),
      temperature_2m_max: keep(full.daily.temperature_2m_max),
      temperature_2m_mean: keep(full.daily.temperature_2m_mean),
      precipitation_sum: keep(full.daily.precipitation_sum),
      shortwave_radiation_sum: keep(full.daily.shortwave_radiation_sum),
    },
  }
}

export const emptyElevationBody = (): unknown => ({ results: [] })

export const geocodeBody = (label: string, latitudeDeg: number, longitudeDeg: number): unknown => [
  {
    display_name: label,
    lat: String(latitudeDeg),
    lon: String(longitudeDeg),
    address: { country_code: 'us' },
  },
]
