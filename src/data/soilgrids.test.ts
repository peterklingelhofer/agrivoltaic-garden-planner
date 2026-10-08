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

  // SoilGrids masks built-up ground, so a town centroid is null. The ring finds the reading, one
  // point at a time: call 1 is the point, and north, east, south and west follow in that order
  it('answers from north of the point when the point itself has none', async () => {
    let call = 0
    fetchJson.mockImplementation(async () => {
      call += 1
      return call === 2 ? body(65) : body(null)
    })
    const soil = await soilAt(LOCATION)
    expect(soil.phUnits).toBe(6.5)
    expect(soil.sourceId).toBe('soilgrids')
    expect(soil.sampledKm).toBe(3)
    expect(fetchJson.mock.calls.length).toBe(2)
  })

  it('goes on to east when north has no data, and takes the first reading it finds', async () => {
    let call = 0
    fetchJson.mockImplementation(async () => {
      call += 1
      // south (call 4) would answer with another pH, so a walk that went on would show
      if (call === 3) return body(65)
      if (call === 4) return body(72)
      return body(null)
    })
    const soil = await soilAt(LOCATION)
    expect(soil.phUnits).toBe(6.5)
    expect(soil.sampledKm).toBe(3)
    expect(fetchJson.mock.calls.length).toBe(3)
  })

  it('reaches south and west, the fourth and fifth calls, when the points before have no data', async () => {
    for (const answering of [4, 5]) {
      fetchJson.mockReset()
      let call = 0
      fetchJson.mockImplementation(async () => {
        call += 1
        return call === answering ? body(65) : body(null)
      })
      const soil = await soilAt(LOCATION)
      expect(soil.sampledKm, `call ${String(answering)}`).toBe(3)
      expect(fetchJson.mock.calls.length, `call ${String(answering)}`).toBe(answering)
    }
  })

  it('falls back to the plain DEFAULT_SOIL when the whole ring has no data', async () => {
    fetchJson.mockResolvedValue(body(null))
    const soil = await soilAt(LOCATION)
    expect(soil).toStrictEqual(DEFAULT_SOIL)
    expect(soil.unreachable).toBeUndefined()
    // the point and the ring of four, which is as many as ISRIC's 5 calls a minute leaves room for
    expect(fetchJson.mock.calls.length).toBe(5)
  })

  it('samples the ring about 3 km from the point', async () => {
    fetchJson.mockResolvedValue(body(null))
    await soilAt(LOCATION)
    const north = fetchJson.mock.calls[1]?.[2] as URLSearchParams
    const latOffset = Number(north.get('lat')) - LOCATION.latitudeDeg
    expect(Math.abs(latOffset - 0.02695)).toBeLessThan(0.001)
  })

  // the map answered at the point, and then a request on the ring got no answer. A host that just
  // failed is no likelier to answer the next call, and each call is another wait, so the walk
  // stops there with the points after it never asked. They would have answered, so a walk that
  // went on would show. A point before it that answered no data moves the walk on
  it('stops at the first ring point that gets no answer, and says the map was out of reach', async () => {
    for (const failing of [2, 3, 4, 5]) {
      fetchJson.mockReset()
      let call = 0
      fetchJson.mockImplementation(async () => {
        call += 1
        if (call === failing) throw new Error('503')
        return call < failing ? body(null) : body(65)
      })
      const soil = await soilAt(LOCATION)
      expect(soil, `call ${String(failing)}`).toStrictEqual({ ...DEFAULT_SOIL, unreachable: true })
      expect(fetchJson.mock.calls.length, `call ${String(failing)}`).toBe(failing)
    }
  })

  // a host that just failed the point is no likelier to answer four more calls, and each of them
  // is another wait. The later calls here would answer, so a ring that was asked would show
  it("says the map wasn't reached after one call when the point's request fails", async () => {
    let call = 0
    fetchJson.mockImplementation(async () => {
      call += 1
      if (call === 1) throw new Error('network down')
      return body(65)
    })
    const soil = await soilAt(LOCATION)
    expect(soil).toStrictEqual({ ...DEFAULT_SOIL, unreachable: true })
    expect(soil.sourceId).toBe('default')
    expect(fetchJson.mock.calls.length).toBe(1)
  })
})
