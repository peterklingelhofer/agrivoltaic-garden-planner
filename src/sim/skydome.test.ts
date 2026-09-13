import { describe, expect, it } from 'bun:test'
import type {
  Degrees,
  DegreesLatitude,
  DegreesLongitude,
  EpochMillis,
  Meters,
  Millibars,
} from '../types/units'
import type { Celsius } from '../types/units'
import type { TmySeries } from '../types/weather'
import { at, sinDeg } from './math'
import {
  binSunDirections,
  cumulativeSky,
  monthlyCumulativeSky,
  parWeightedSky,
  perezSkyRadianceDistribution1993,
  REINHART_MF2_PATCH_COUNT,
  skyPatchGrid,
  TREGENZA_PATCH_COUNT,
} from './skydome'
import { pressureFromElevation, solarPositionSeries } from './solar'
import type { Fraction } from '../types/units'

const HOURS = 24 * 14

const buildWeather = (): TmySeries => {
  const utcMillis = new Float64Array(HOURS)
  const ghiWM2 = new Float32Array(HOURS)
  const dniWM2 = new Float32Array(HOURS)
  const dhiWM2 = new Float32Array(HOURS)
  const start = Date.UTC(2021, 5, 1)
  for (let i = 0; i < HOURS; i += 1) {
    utcMillis[i] = start + i * 3_600_000
    const hourOfDay = i % 24
    const daylight = Math.max(0, Math.sin((Math.PI * (hourOfDay - 5)) / 14))
    ghiWM2[i] = 900 * daylight
    dniWM2[i] = 700 * daylight
    dhiWM2[i] = 200 * daylight
  }
  return {
    source: 'open-meteo',
    decomposition: 'passthrough',
    utcOffsetHours: 0,
    startUtcMillis: start as EpochMillis,
    utcMillis,
    ghiWM2,
    dniWM2,
    dhiWM2,
    dryBulbC: new Float32Array(HOURS),
    dewPointC: new Float32Array(HOURS),
    windSpeedMS: new Float32Array(HOURS),
    pressureMb: new Float32Array(HOURS).fill(1013.25),
    provenance: {
      datasetLabel: 'synthetic',
      yearsCovered: [2021],
      licence: 'CC0',
      attribution: 'test',
      retrievedUtcMillis: start as EpochMillis,
      isTypicalMeteorologicalYear: true,
    },
  }
}

const observer = {
  location: { latitudeDeg: 42.37 as DegreesLatitude, longitudeDeg: -71.11 as DegreesLongitude },
  elevationM: 20 as Meters,
  pressureMb: pressureFromElevation(20 as Meters) as Millibars,
  temperatureC: 18 as Celsius,
}

const substepped = (utcMillis: Float64Array, steps: number): Float64Array => {
  const out = new Float64Array(utcMillis.length * steps)
  for (let h = 0; h < utcMillis.length; h += 1) {
    for (let k = 0; k < steps; k += 1)
      out[h * steps + k] = at(utcMillis, h) + (k * 3_600_000) / steps
  }
  return out
}

describe('sky patch grids', () => {
  it('produces the Tregenza and Reinhart patch counts fixed by the Decision Record', () => {
    expect(skyPatchGrid('tregenza-mf1')).toHaveLength(TREGENZA_PATCH_COUNT)
    expect(skyPatchGrid('reinhart-mf2')).toHaveLength(REINHART_MF2_PATCH_COUNT)
  })

  it.each(['tregenza-mf1', 'reinhart-mf2'] as const)('%s tiles the hemisphere', (subdivision) => {
    const patches = skyPatchGrid(subdivision)
    const solidAngle = patches.reduce((total, patch) => total + patch.solidAngleSr, 0)
    expect(solidAngle).toBeCloseTo(2 * Math.PI, 6)
    // sum of cos(zenith) x solid angle over a full hemisphere is pi, so an unobstructed SVF is 1
    const projected = patches.reduce(
      (total, patch) => total + sinDeg(patch.altitudeDeg) * patch.solidAngleSr,
      0,
    )
    expect(projected / Math.PI).toBeCloseTo(1, 9)
  })
})

describe('Perez 1993 sky radiance', () => {
  it('integrates back to DHI over the dome', () => {
    const patches = skyPatchGrid('reinhart-mf2')
    const radiance = perezSkyRadianceDistribution1993(
      patches,
      180,
      700,
      35 as Degrees,
      170 as Degrees,
    )
    const horizontal = patches.reduce(
      (total, patch, i) => total + at(radiance, i) * sinDeg(patch.altitudeDeg) * patch.solidAngleSr,
      0,
    )
    expect(horizontal).toBeCloseTo(180, 3)
  })

  it('concentrates radiance near the sun under a clear sky', () => {
    const patches = skyPatchGrid('reinhart-mf2')
    const clear = perezSkyRadianceDistribution1993(patches, 80, 900, 30 as Degrees, 180 as Degrees)
    const overcast = perezSkyRadianceDistribution1993(
      patches,
      300,
      0,
      30 as Degrees,
      180 as Degrees,
    )
    const angleToSun = (index: number): number => {
      const patch = patches[index]
      if (patch === undefined) return Infinity
      return (
        Math.abs(patch.altitudeDeg - 60) + Math.abs(((patch.azimuthDeg - 180 + 540) % 360) - 180)
      )
    }
    let nearSun = 0
    let opposite = 0
    for (let i = 1; i < patches.length; i += 1) {
      if (angleToSun(i) < angleToSun(nearSun)) nearSun = i
      if (angleToSun(i) > angleToSun(opposite)) opposite = i
    }
    const clearRatio = at(clear, nearSun) / at(clear, opposite)
    const overcastRatio = at(overcast, nearSun) / at(overcast, opposite)
    expect(clearRatio).toBeGreaterThan(overcastRatio)
    expect(clearRatio).toBeGreaterThan(2)
  })

  it('returns zeros when there is no diffuse light', () => {
    const patches = skyPatchGrid('tregenza-mf1')
    const radiance = perezSkyRadianceDistribution1993(patches, 0, 0, 40 as Degrees, 180 as Degrees)
    expect([...radiance].every((value) => value === 0)).toBe(true)
  })
})

describe('sun direction binning', () => {
  const weather = buildWeather()
  const options = { substepsPerHour: 4, binningDeg: 2 as Degrees }
  const position = solarPositionSeries(substepped(weather.utcMillis, 4), observer, 'nrel-spa')

  it('dedupes sub-hourly samples onto a 2 deg grid and keeps unit directions', () => {
    const bins = binSunDirections(weather, position, options)
    expect(bins.length).toBeGreaterThan(20)
    expect(bins.length).toBeLessThan(HOURS * 4)
    for (const bin of bins) {
      expect(Math.hypot(bin.x, bin.y, bin.z)).toBeCloseTo(1, 6)
      expect(bin.z).toBeGreaterThan(0)
    }
  })

  it('conserves total beam energy across the bins', () => {
    const bins = binSunDirections(weather, position, options)
    const binned = bins.reduce((total, bin) => total + bin.beamWeightWhPerM2, 0)
    let expected = 0
    for (let i = 0; i < position.count; i += 1) {
      if (at(position.geometricElevationDeg, i) > 0) {
        expected += at(weather.dniWM2, Math.floor(i / 4)) / 4
      }
    }
    expect(binned).toBeCloseTo(expected, 3)
  })
})

describe('cumulative sky', () => {
  const weather = buildWeather()
  const options = { substepsPerHour: 4, binningDeg: 2 as Degrees }
  const position = solarPositionSeries(substepped(weather.utcMillis, 4), observer, 'nrel-spa')

  it('accumulates patch radiance in Wh/m2 per unit visibility', () => {
    const sky = cumulativeSky(weather, position, 'reinhart-mf2', options)
    expect(sky.patches).toHaveLength(REINHART_MF2_PATCH_COUNT)
    const total = sky.patches.reduce((sum, patch) => sum + patch.cumulativeRadianceWhPerM2, 0)
    let expectedDhi = 0
    for (let h = 0; h < weather.utcMillis.length; h += 1) {
      if (at(position.apparentElevationDeg, h * 4) > 0) expectedDhi += at(weather.dhiWM2, h)
    }
    expect(total).toBeCloseTo(expectedDhi, 1)
  })

  it('keeps the monthly skies index-aligned with the annual sky and summing to it', () => {
    const sky = cumulativeSky(weather, position, 'tregenza-mf1', options)
    const monthly = monthlyCumulativeSky(weather, position, 'tregenza-mf1', options)
    expect(monthly).toHaveLength(12)
    for (const month of monthly) {
      expect(month.patches).toHaveLength(sky.patches.length)
      expect(month.sunDirections).toHaveLength(sky.sunDirections.length)
    }
    for (let i = 0; i < sky.patches.length; i += 1) {
      const summed = monthly.reduce(
        (total, month) => total + (month.patches[i]?.cumulativeRadianceWhPerM2 ?? 0),
        0,
      )
      expect(summed).toBeCloseTo(sky.patches[i]?.cumulativeRadianceWhPerM2 ?? 0, 6)
    }
    for (let j = 0; j < sky.sunDirections.length; j += 1) {
      const summed = monthly.reduce(
        (total, month) => total + (month.sunDirections[j]?.beamWeightWhPerM2 ?? 0),
        0,
      )
      expect(summed).toBeCloseTo(sky.sunDirections[j]?.beamWeightWhPerM2 ?? 0, 6)
    }
  })

  it('scales linearly under the PAR fraction', () => {
    const sky = cumulativeSky(weather, position, 'tregenza-mf1', options)
    const par = parWeightedSky(sky, 0.45 as Fraction)
    expect(par.patches[10]?.cumulativeRadianceWhPerM2).toBeCloseTo(
      (sky.patches[10]?.cumulativeRadianceWhPerM2 ?? 0) * 0.45,
      9,
    )
    expect(par.sunDirections[0]?.beamWeightWhPerM2).toBeCloseTo(
      (sky.sunDirections[0]?.beamWeightWhPerM2 ?? 0) * 0.45,
      9,
    )
  })
})
