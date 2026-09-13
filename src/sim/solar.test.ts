import { describe, expect, it } from 'bun:test'
import type { DegreesLatitude, DegreesLongitude } from '../types/units'
import type { Celsius, Degrees, EpochMillis, Meters, Millibars } from '../types/units'
import {
  kastenYoungAirMass,
  pressureFromElevation,
  profileAngle,
  solarPositionSeries,
  spaPosition,
  sunUnitVector,
  type SpaObserver,
} from './solar'
import type { Radians } from '../types/units'

const observer = (
  lat: number,
  lon: number,
  elevationM: number,
  pressureMb = 1013.25,
): SpaObserver => ({
  location: { latitudeDeg: lat as DegreesLatitude, longitudeDeg: lon as DegreesLongitude },
  elevationM: elevationM as Meters,
  pressureMb: pressureMb as Millibars,
  temperatureC: 12 as Celsius,
})

// NREL/TP-560-34302 rev. Jan 2008, Appendix A.5 worked example
const NREL_EXAMPLE = {
  utcMillis: Date.UTC(2003, 9, 17, 19, 30, 30) as EpochMillis,
  observer: {
    location: {
      latitudeDeg: 39.742476 as DegreesLatitude,
      longitudeDeg: -105.1786 as DegreesLongitude,
    },
    elevationM: 1830.14 as Meters,
    pressureMb: 820 as Millibars,
    temperatureC: 11 as Celsius,
  } satisfies SpaObserver,
  julianDay: 2452930.312847,
  earthRadiusVectorAu: 0.9965422974,
  topocentricDeclinationDeg: -9.316179,
  topocentricHourAngleDeg: 11.10629,
  geometricElevationDeg: 39.872046,
  apparentElevationDeg: 39.888378,
  zenithDeg: 50.111622,
  azimuthDeg: 194.340241,
}

// pvlib.solarposition.spa_python, delta_t from the same Espenak & Meeus polynomial.
// pvlib's `elevation`/`zenith` are geometric; `apparent_elevation` carries the refraction term
const PVLIB_SITES = [
  {
    label: 'Reykjavik',
    lat: 64.1466,
    lon: -21.9426,
    elev: 10,
    iso: '2021-06-21T12:00:00Z',
    azimuth: 149.338090798,
    geometric: 46.702267686,
    apparent: 46.71809583,
  },
  {
    label: 'Berlin',
    lat: 52.52,
    lon: 13.405,
    elev: 34,
    iso: '2021-06-21T12:00:00Z',
    azimuth: 203.723049224,
    geometric: 59.285656574,
    apparent: 59.295613499,
  },
  {
    label: 'Berlin winter',
    lat: 52.52,
    lon: 13.405,
    elev: 34,
    iso: '2021-12-21T09:30:00Z',
    azimuth: 157.982910573,
    geometric: 11.293283001,
    apparent: 11.373175461,
  },
  {
    label: 'Davis',
    lat: 38.5449,
    lon: -121.7405,
    elev: 16,
    iso: '2021-12-21T09:30:00Z',
    azimuth: 56.275317591,
    geometric: -66.452193476,
    apparent: -66.452193476,
  },
  {
    label: 'Delhi',
    lat: 28.6139,
    lon: 77.209,
    elev: 216,
    iso: '2021-06-21T12:00:00Z',
    azimuth: 285.544831875,
    geometric: 22.031291424,
    apparent: 22.071316133,
  },
  {
    label: 'Delhi winter',
    lat: 28.6139,
    lon: 77.209,
    elev: 216,
    iso: '2021-12-21T09:30:00Z',
    azimuth: 220.840757224,
    geometric: 25.139617362,
    apparent: 25.17425344,
  },
  {
    label: 'Nairobi',
    lat: -1.2921,
    lon: 36.8219,
    elev: 1795,
    iso: '2021-06-21T12:00:00Z',
    azimuth: 307.296058711,
    geometric: 46.861904311,
    apparent: 46.87458614,
  },
  {
    label: 'Nairobi summer',
    lat: -1.2921,
    lon: 36.8219,
    elev: 1795,
    iso: '2021-12-21T09:30:00Z',
    azimuth: 179.504172108,
    geometric: 67.853068803,
    apparent: 67.858576558,
  },
  {
    label: 'Christchurch',
    lat: -43.5321,
    lon: 172.6362,
    elev: 20,
    iso: '2021-12-21T09:30:00Z',
    azimuth: 220.937995844,
    geometric: -11.620362385,
    apparent: -11.620362385,
  },
]

describe('NREL SPA', () => {
  it('reproduces the NREL/TP-560-34302 worked example to better than 0.001 deg', () => {
    const sample = spaPosition(NREL_EXAMPLE.utcMillis, NREL_EXAMPLE.observer)
    expect(Math.abs(sample.zenithDeg - NREL_EXAMPLE.zenithDeg)).toBeLessThan(0.001)
    expect(Math.abs(sample.azimuthDeg - NREL_EXAMPLE.azimuthDeg)).toBeLessThan(0.001)
    expect(
      Math.abs(sample.geometricElevationDeg - NREL_EXAMPLE.geometricElevationDeg),
    ).toBeLessThan(0.001)
    expect(Math.abs(sample.apparentElevationDeg - NREL_EXAMPLE.apparentElevationDeg)).toBeLessThan(
      0.001,
    )
    expect(Math.abs(sample.declinationDeg - NREL_EXAMPLE.topocentricDeclinationDeg)).toBeLessThan(
      0.001,
    )
    expect(Math.abs(sample.hourAngleDeg - NREL_EXAMPLE.topocentricHourAngleDeg)).toBeLessThan(0.001)
    expect(Math.abs(sample.earthRadiusVectorAu - NREL_EXAMPLE.earthRadiusVectorAu)).toBeLessThan(
      1e-7,
    )
  })

  it.each(PVLIB_SITES)('matches pvlib spa_python at $label to better than 0.001 deg', (site) => {
    const millis = Date.parse(site.iso) as EpochMillis
    const sample = spaPosition(
      millis,
      observer(site.lat, site.lon, site.elev, pressureFromElevation(site.elev as Meters)),
    )
    expect(Math.abs(90 - sample.geometricElevationDeg - (90 - site.geometric))).toBeLessThan(0.001)
    expect(Math.abs(sample.azimuthDeg - site.azimuth)).toBeLessThan(0.001)
    expect(Math.abs(sample.geometricElevationDeg - site.geometric)).toBeLessThan(0.001)
    expect(Math.abs(sample.apparentElevationDeg - site.apparent)).toBeLessThan(0.001)
  })

  it('keeps geometric and refracted elevation separate near the horizon', () => {
    const millis = Date.parse('2021-12-21T09:30:00Z') as EpochMillis
    const sample = spaPosition(millis, observer(52.52, 13.405, 34))
    expect(sample.apparentElevationDeg).toBeGreaterThan(sample.geometricElevationDeg)
    expect(sample.zenithDeg).toBeCloseTo(90 - sample.apparentElevationDeg, 12)
  })

  it('bakes a series into Float32Arrays', () => {
    const millis = Float64Array.from([
      Date.parse('2021-06-21T06:00:00Z'),
      Date.parse('2021-06-21T12:00:00Z'),
      Date.parse('2021-06-21T18:00:00Z'),
    ])
    const series = solarPositionSeries(millis, observer(52.52, 13.405, 34), 'nrel-spa')
    expect(series.count).toBe(3)
    expect(series.azimuthDeg[0]).toBeLessThan(series.azimuthDeg[1] ?? 0)
    expect(series.extraterrestrialNormalWM2[1]).toBeGreaterThan(1300)
  })

  it('agrees with the Michalsky fast path to better than 0.02 deg', () => {
    const millis = Date.parse('2021-06-21T12:00:00Z') as EpochMillis
    const site = observer(52.52, 13.405, 34)
    const spa = spaPosition(millis, site)
    const michalsky = solarPositionSeries(Float64Array.from([millis]), site, 'michalsky')
    expect(Math.abs((michalsky.azimuthDeg[0] ?? 0) - spa.azimuthDeg)).toBeLessThan(0.02)
    expect(
      Math.abs((michalsky.geometricElevationDeg[0] ?? 0) - spa.geometricElevationDeg),
    ).toBeLessThan(0.02)
  })

  it('rejects unimplemented algorithms rather than returning wrong physics', () => {
    expect(() => solarPositionSeries(new Float64Array(1), observer(0, 0, 0), 'psa')).toThrow()
    expect(() => solarPositionSeries(new Float64Array(1), observer(0, 0, 0), 'grena3')).toThrow()
  })
})

describe('solar helpers', () => {
  it('matches Kasten & Young 1989 relative air mass', () => {
    expect(kastenYoungAirMass(40 as Degrees, 1013.25 as Millibars).relative).toBeCloseTo(
      1.3042235409,
      6,
    )
    expect(kastenYoungAirMass(70 as Degrees, 1013.25 as Millibars).relative).toBeCloseTo(
      2.9031466488,
      6,
    )
    expect(kastenYoungAirMass(20 as Degrees, 1013.25 as Millibars).relative).toBeCloseTo(
      1.0636999871,
      6,
    )
  })

  it('scales air mass by station pressure', () => {
    const am = kastenYoungAirMass(40 as Degrees, 820 as Millibars)
    expect(am.absolute / am.relative).toBeCloseTo(820 / 1013.25, 12)
  })

  it('places the sun vector in the ENU frame', () => {
    const east = sunUnitVector(0 as Degrees, 90 as Degrees)
    expect(east.x).toBeCloseTo(1, 12)
    expect(east.y).toBeCloseTo(0, 12)
    const zenith = sunUnitVector(90 as Degrees, 0 as Degrees)
    expect(zenith.z).toBeCloseTo(1, 12)
    const south = sunUnitVector(0 as Degrees, 180 as Degrees)
    expect(south.y).toBeCloseTo(-1, 12)
  })

  it('records which side of the row the sun is on', () => {
    const south = profileAngle(0.5 as Radians, Math.PI as Radians, Math.PI as Radians)
    expect(south.side).toBe(1)
    expect(south.psiRad).toBeCloseTo(0.5, 12)
    const north = profileAngle(0.5 as Radians, 0 as Radians, Math.PI as Radians)
    expect(north.side).toBe(-1)
    const alongAxis = profileAngle(0.5 as Radians, (Math.PI / 2) as Radians, Math.PI as Radians)
    expect(alongAxis.side).toBe(0)
    expect(alongAxis.psiRad).toBeCloseTo(Math.PI / 2, 12)
  })

  it('derives barometric pressure from elevation', () => {
    expect(pressureFromElevation(0 as Meters)).toBeCloseTo(1013.25, 6)
    expect(pressureFromElevation(1830.14 as Meters)).toBeLessThan(830)
  })
})
