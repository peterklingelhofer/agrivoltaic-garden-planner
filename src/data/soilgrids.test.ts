import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { vi } from '../../test/vi'

const fetchJson = vi.fn()

/* captured before the mock is installed, so the spread carries the real module */
const actualHttp = await import('./http')
mock.module('./http', () => ({ ...actualHttp, fetchJson }))

const { DEFAULT_SOIL, soilAt } = await import('./static-layers')

const LOCATION = { latitudeDeg: 42.37, longitudeDeg: -72.52 } as Parameters<typeof soilAt>[0]

const body = (mean: number | null) => ({
  properties: {
    layers: [
      { name: 'phh2o', depths: [{ values: { mean } }] },
      { name: 'clay', depths: [{ values: { mean } }] },
      { name: 'sand', depths: [{ values: { mean } }] },
    ],
  },
})

describe('soilAt', () => {
  beforeEach(() => fetchJson.mockReset())

  // null/10 is 0, so a no-data depth read as a number would yield pH 0 and exclude every crop
  it('falls back when SoilGrids reports mean null', async () => {
    fetchJson.mockResolvedValue(body(null))
    await expect(soilAt(LOCATION)).resolves.toStrictEqual(DEFAULT_SOIL)
  })

  it('falls back on an implausible pH rather than trusting it', async () => {
    fetchJson.mockResolvedValue(body(0))
    await expect(soilAt(LOCATION)).resolves.toStrictEqual(DEFAULT_SOIL)
  })

  it('reads a real value and scales it', async () => {
    fetchJson.mockResolvedValue(body(65))
    const soil = await soilAt(LOCATION)
    expect(soil.phUnits).toBe(6.5)
    expect(soil.sourceId).toBe('soilgrids')
  })

  it('falls back when the layer is absent entirely', async () => {
    fetchJson.mockResolvedValue({ properties: { layers: [] } })
    await expect(soilAt(LOCATION)).resolves.toStrictEqual(DEFAULT_SOIL)
  })

  it('asks SoilGrids for all four properties under the repeated key', async () => {
    fetchJson.mockResolvedValue(body(65))
    await soilAt(LOCATION)
    const params = fetchJson.mock.calls[0]?.[2] as URLSearchParams
    expect(params.getAll('property')).toEqual(['phh2o', 'clay', 'sand', 'soc'])
  })

  it('reads texture from the clay and sand layers', async () => {
    fetchJson.mockResolvedValue({
      properties: {
        layers: [
          { name: 'phh2o', depths: [{ values: { mean: 65 } }] },
          { name: 'clay', depths: [{ values: { mean: 450 } }] },
          { name: 'sand', depths: [{ values: { mean: 200 } }] },
        ],
      },
    })
    const soil = await soilAt(LOCATION)
    expect(soil.textureClass).toBe('clay')
  })

  it('reads organic matter from soc, which arrives in decigrams per kilogram', async () => {
    fetchJson.mockResolvedValue({
      properties: {
        layers: [
          { name: 'phh2o', depths: [{ values: { mean: 65 } }] },
          { name: 'soc', depths: [{ values: { mean: 1086 } }] },
        ],
      },
    })
    const soil = await soilAt(LOCATION)
    expect(soil.organicMatterFraction).toBeCloseTo(108.6 / 580, 6)
  })

  it('makes one request and carries no sampledKm when the point itself answers', async () => {
    fetchJson.mockResolvedValue(body(65))
    const soil = await soilAt(LOCATION)
    expect(fetchJson.mock.calls.length).toBe(1)
    expect(soil.sampledKm).toBeUndefined()
  })

  // SoilGrids masks built-up ground, so a town centroid is null; the ring finds the reading
  it('answers from the 3 km ring, north/east/south/west, when the point itself has none', async () => {
    let call = 0
    fetchJson.mockImplementation(async () => {
      call += 1
      // call 1 is the point; the ring's north, east, south and west follow in that order
      return call === 4 ? body(65) : body(null)
    })
    const soil = await soilAt(LOCATION)
    expect(soil.phUnits).toBe(6.5)
    expect(soil.sourceId).toBe('soilgrids')
    expect(soil.sampledKm).toBe(3)
    expect(fetchJson.mock.calls.length).toBe(5)
  })

  it('falls back to DEFAULT_SOIL after trying both rings and finding nothing plausible', async () => {
    fetchJson.mockResolvedValue(body(null))
    await expect(soilAt(LOCATION)).resolves.toStrictEqual(DEFAULT_SOIL)
    expect(fetchJson.mock.calls.length).toBe(9)
  })

  it('samples the ring about 3 km from the point', async () => {
    fetchJson.mockResolvedValue(body(null))
    await soilAt(LOCATION)
    const north = fetchJson.mock.calls[1]?.[2] as URLSearchParams
    const latOffset = Number(north.get('lat')) - LOCATION.latitudeDeg
    expect(Math.abs(latOffset - 0.02695)).toBeLessThan(0.001)
  })
})
