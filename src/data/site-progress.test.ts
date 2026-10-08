import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { vi } from '../../test/vi'
import { siteFixture, tmyFixture } from '../recommend/testkit'
import type { LatLon } from '../types/geo'
import type { WeatherRecord } from '../types/weather'
import type { SitePart } from './site'
import type { DailyNormals } from './static-layers'

/**
 * The lookup tells its caller as each group of requests lands, so a notice can name the one still
 * out. Every request is held here until the test lets it go, which is the only way to see a group
 * report before the lookup as a whole has answered
 */

/* captured before the mocks are installed, so the spreads and the stand-ins carry the real ones */
const actualLayers = await import('./static-layers')
const actualTmy = await import('./tmy')
const real = {
  koppenAt: actualLayers.koppenAt,
  botanicalAreaAt: actualLayers.botanicalAreaAt,
  hardinessAt: actualLayers.hardinessAt,
  frostNormalsAt: actualLayers.frostNormalsAt,
  climateNormalsAt: actualLayers.climateNormalsAt,
  dailyNormalsAt: actualLayers.dailyNormalsAt,
  soilAt: actualLayers.soilAt,
  fetchWeather: actualTmy.fetchWeather,
}

/**
 * Each stand-in calls the real function except while a test of this file is running. A module mock
 * outlives its file when several share a process, and a later file that reads the real layers
 * would otherwise be handed requests nobody answers
 */
const koppenAt = vi.fn(real.koppenAt)
const botanicalAreaAt = vi.fn(real.botanicalAreaAt)
const hardinessAt = vi.fn(real.hardinessAt)
const frostNormalsAt = vi.fn(real.frostNormalsAt)
const climateNormalsAt = vi.fn(real.climateNormalsAt)
const dailyNormalsAt = vi.fn(real.dailyNormalsAt)
const soilAt = vi.fn(real.soilAt)
const fetchWeather = vi.fn(real.fetchWeather)

mock.module('./static-layers', () => ({
  ...actualLayers,
  koppenAt,
  botanicalAreaAt,
  hardinessAt,
  frostNormalsAt,
  climateNormalsAt,
  dailyNormalsAt,
  soilAt,
}))
mock.module('./tmy', () => ({ ...actualTmy, fetchWeather }))

const { resolveSite } = await import('./site')

const LOCATION = { latitudeDeg: 42.37, longitudeDeg: -72.52 } as LatLon

const fixture = siteFixture()

const DAILY: DailyNormals = {
  minC: [],
  maxC: [],
  meanC: [],
  precipMm: [],
  shortwaveMjM2: [],
  startYear: 1991,
  source: 'open-meteo',
  timezone: 'America/New_York',
  utcOffsetSeconds: -18_000,
}

const WEATHER: WeatherRecord = { typical: tmyFixture(), years: [], elevationM: 50 }

interface Held<T> {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
  readonly reject: (error: Error) => void
}

const held = <T>(): Held<T> => {
  let resolve: (value: T) => void = () => undefined
  let reject: (error: Error) => void = () => undefined
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const makeRequests = () => ({
  koppen: held<string>(),
  botanical: held<string | null>(),
  hardiness: held<typeof fixture.hardiness>(),
  frostNormals: held<typeof fixture.frost>(),
  climateNormals: held<typeof fixture.normals>(),
  daily: held<DailyNormals>(),
  soil: held<typeof fixture.soil>(),
  weather: held<WeatherRecord>(),
})

let requests = makeRequests()

type RequestName = keyof ReturnType<typeof makeRequests>

/** The six requests that the frost dates are read from */
const FROST: readonly RequestName[] = [
  'koppen',
  'botanical',
  'hardiness',
  'frostNormals',
  'climateNormals',
  'daily',
]

const answer: Readonly<Record<RequestName, () => void>> = {
  koppen: () => requests.koppen.resolve(fixture.koppenCode),
  botanical: () => requests.botanical.resolve(fixture.botanicalArea),
  hardiness: () => requests.hardiness.resolve(fixture.hardiness),
  frostNormals: () => requests.frostNormals.resolve(fixture.frost),
  climateNormals: () => requests.climateNormals.resolve(fixture.normals),
  daily: () => requests.daily.resolve(DAILY),
  soil: () => requests.soil.resolve(fixture.soil),
  weather: () => requests.weather.resolve(WEATHER),
}

/** Lets the named requests go, then lets everything waiting on them run */
const release = async (...names: readonly RequestName[]): Promise<void> => {
  for (const name of names) answer[name]()
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

/** Hands every request to the test, or gives them back to the real functions */
const holdRequests = (holding: boolean): void => {
  koppenAt.mockImplementation(holding ? () => requests.koppen.promise : real.koppenAt)
  botanicalAreaAt.mockImplementation(
    holding ? () => requests.botanical.promise : real.botanicalAreaAt,
  )
  hardinessAt.mockImplementation(holding ? () => requests.hardiness.promise : real.hardinessAt)
  frostNormalsAt.mockImplementation(
    holding ? () => requests.frostNormals.promise : real.frostNormalsAt,
  )
  climateNormalsAt.mockImplementation(
    holding ? () => requests.climateNormals.promise : real.climateNormalsAt,
  )
  dailyNormalsAt.mockImplementation(holding ? () => requests.daily.promise : real.dailyNormalsAt)
  soilAt.mockImplementation(holding ? () => requests.soil.promise : real.soilAt)
  fetchWeather.mockImplementation(holding ? () => requests.weather.promise : real.fetchWeather)
}

beforeEach(() => {
  requests = makeRequests()
  holdRequests(true)
})

afterEach(() => {
  holdRequests(false)
})

describe('resolveSite tells its caller as each part lands', () => {
  it('reports a part once, when the last request of its group has landed', async () => {
    const reported: SitePart[] = []
    const lookup = resolveSite(LOCATION, 'Amherst', null, null, (part) => {
      reported.push(part)
    })
    expect(reported).toEqual([])

    await release('weather')
    expect(reported).toEqual(['weather'])

    // five of the six frost requests are in, and the part waits on the sixth
    await release(...FROST.slice(0, 5))
    expect(reported).toEqual(['weather'])
    await release('daily')
    expect(reported).toEqual(['weather', 'frost'])

    await release('soil')
    await lookup
    expect(reported).toEqual(['weather', 'frost', 'soil'])
  })

  it('reports the parts in the order they land, whatever order they were asked in', async () => {
    const reported: SitePart[] = []
    const lookup = resolveSite(LOCATION, 'Amherst', null, null, (part) => {
      reported.push(part)
    })
    await release('soil')
    await release(...FROST)
    await release('weather')
    await lookup
    expect(reported).toEqual(['soil', 'frost', 'weather'])
  })

  /** One request from each group, and the part its failure takes down with it */
  const FAILURES = [
    ['weather', 'weather'],
    ['soil', 'soil'],
    ['hardiness', 'frost'],
  ] as const

  for (const [failing, part] of FAILURES) {
    it(`still fails the whole lookup when the ${failing} request fails, and never reports ${part}`, async () => {
      const reported: SitePart[] = []
      const lookup = resolveSite(LOCATION, 'Amherst', null, null, (landed) => {
        reported.push(landed)
      })
      // the rejection is taken here as it happens, so none is left unhandled
      const outcome = lookup.then(
        () => 'landed',
        (error: unknown) => (error instanceof Error ? error.message : 'not an error'),
      )
      requests[failing].reject(new Error(`the ${failing} request failed`))
      await release()
      expect(await outcome).toBe(`the ${failing} request failed`)
      expect(reported).not.toContain(part)
    })
  }
})
