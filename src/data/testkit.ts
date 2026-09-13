import type { EpochMillis } from '../types/units'
import { HOURS_PER_TMY, type MeasuredYear, type TmySeries } from '../types/weather'

export interface SyntheticYearOptions {
  /** The calendar year the timestamps are laid on */
  readonly year?: number
  /** Annual mean temperature, C */
  readonly meanC?: number
  /** Half the swing between midwinter and midsummer means, C */
  readonly seasonalC?: number
  /** Half the swing between the night minimum and the afternoon maximum, C */
  readonly diurnalC?: number
  /** Rain in every hour, mm. `undefined` leaves the series without a rain column at all */
  readonly rainMmPerHour?: number
  /** Whether the series carries dew point and wind, which decides the ET method */
  readonly humid?: boolean
  readonly latitudeDeg?: number
}

/**
 * A year of weather with a real diurnal swing, a real seasonal swing, a dew point and wind.
 *
 * A synthetic year with no diurnal term gives `dailyWeatherFromTmy` a day whose maximum is its
 * minimum, so Hargreaves-Samani has nothing to work on and reference evapotranspiration comes out
 * at a seventh of the real figure. A fixture that can't make a bed thirsty can't test anything
 * about water, which is what this one is for
 */
export const syntheticYear = (options: SyntheticYearOptions = {}): TmySeries => {
  const year = options.year ?? 2021
  const meanC = options.meanC ?? 9
  const seasonalC = options.seasonalC ?? 13
  const diurnalC = options.diurnalC ?? 6
  const humid = options.humid ?? true
  const latitudeDeg = options.latitudeDeg ?? 42.37
  const start = Date.UTC(year, 0, 1)
  const utcMillis = new Float64Array(HOURS_PER_TMY)
  const ghiWM2 = new Float32Array(HOURS_PER_TMY)
  const dniWM2 = new Float32Array(HOURS_PER_TMY)
  const dhiWM2 = new Float32Array(HOURS_PER_TMY)
  const dryBulbC = new Float32Array(HOURS_PER_TMY)
  const dewPointC = new Float32Array(HOURS_PER_TMY)
  const windSpeedMS = new Float32Array(HOURS_PER_TMY)
  const latitude = (latitudeDeg * Math.PI) / 180
  for (let hour = 0; hour < HOURS_PER_TMY; hour += 1) {
    utcMillis[hour] = start + hour * 3_600_000
    const hourOfDay = hour % 24
    const dayOfYear = Math.floor(hour / 24)
    const declination = ((23.44 * Math.PI) / 180) * Math.sin((2 * Math.PI * (dayOfYear - 80)) / 365)
    const sinElevation =
      Math.sin(latitude) * Math.sin(declination) +
      Math.cos(latitude) * Math.cos(declination) * Math.cos(((hourOfDay - 12) * 15 * Math.PI) / 180)
    const cosZenith = Math.max(0, sinElevation)
    const ghi = cosZenith > 0 ? 1000 * cosZenith * Math.exp(-0.09 / cosZenith) : 0
    ghiWM2[hour] = ghi
    dniWM2[hour] = ghi * 0.8
    dhiWM2[hour] = ghi * 0.2
    // coldest in late January, warmest in late July, minimum before dawn, maximum mid-afternoon
    const seasonal = -Math.cos((2 * Math.PI * (dayOfYear - 20)) / 365)
    const diurnal = -Math.cos((2 * Math.PI * (hourOfDay - 4)) / 24)
    const temperature = meanC + seasonalC * seasonal + diurnalC * diurnal
    dryBulbC[hour] = temperature
    dewPointC[hour] = humid ? temperature - 4 : 0
    windSpeedMS[hour] = humid ? 2 : 0
  }
  const series: TmySeries = {
    source: 'open-meteo',
    decomposition: 'passthrough',
    utcOffsetHours: -5,
    startUtcMillis: start as EpochMillis,
    utcMillis,
    ghiWM2,
    dniWM2,
    dhiWM2,
    dryBulbC,
    dewPointC,
    windSpeedMS,
    pressureMb: new Float32Array(HOURS_PER_TMY).fill(1013.25),
    provenance: {
      datasetLabel: `synthetic year ${String(year)}`,
      yearsCovered: [year],
      license: 'CC0',
      attribution: 'synthetic',
      retrievedUtcMillis: start as EpochMillis,
      isTypicalMeteorologicalYear: false,
    },
  }
  return options.rainMmPerHour === undefined
    ? series
    : { ...series, precipMm: new Float32Array(HOURS_PER_TMY).fill(options.rainMmPerHour) }
}

export const measuredYearFixture = (options: SyntheticYearOptions = {}): MeasuredYear => {
  const weather = syntheticYear(options)
  return { year: options.year ?? 2021, weather }
}
