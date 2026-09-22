/// <reference types="node" />
// the shipped grids are binary and live in `public/`, which Vite doesn't transform, so
// there's no `?raw` route to their bytes. Reading them from disk is the only way a test
// can prove the decoder handles the file that actually deploys
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { vi } from '../../test/vi'
import { isTemperatureHardiness } from '../types/site'

const fetchJson = vi.fn()

/* captured before the mock is installed, so the spread carries the real module */
const actualHttp = await import('./http')
mock.module('./http', () => ({ ...actualHttp, fetchJson }))

const {
  botanicalAreaAt,
  decodeClassGrid,
  hardinessAt,
  KOPPEN_GRID_PATH,
  koppenAt,
  NRCAN_ATTRIBUTION,
  NRCAN_GRID_PATH,
  WGSRPD_GRID_PATH,
  NRCAN_SCHEME_NOTE,
  nrcanZoneAt,
  resetStaticLayerCache,
  sampleClassGrid,
  STATIC_LAYERS_TO_FETCH,
  staticLayerLicenses,
  usdaHalfZoneIndex,
  usdaZoneLabel,
  usdaZoneLowerC,
  USDA_PHZM_DISCLAIMER,
  USDA_PHZM_GRID_PATH,
} = await import('./static-layers')

interface Manifest {
  readonly layers: readonly {
    readonly path: string
    readonly probes: readonly {
      readonly site: string
      readonly source: string | null
      readonly shipped: string | null
      readonly published?: string
      // the botanical layer alone records where it probed, because its source is vector and the
      // test re-asks the question at that point
      readonly latitudeDeg?: number
      readonly longitudeDeg?: number
    }[]
  }[]
}

const dataUrl = (name: string): URL => new URL(`../../public/data/${name}`, import.meta.url)

const asset = (name: string): ArrayBuffer => {
  const file = readFileSync(dataUrl(name))
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer
}

const MANIFEST = JSON.parse(readFileSync(dataUrl('manifest.json'), 'utf8')) as Manifest

const KOPPEN = asset('koppen-beck-2018.grid')
const PHZM = asset('usda-phzm-2023.grid')
const WGSRPD = asset('wgsrpd-level3.grid')

/** The fixed header every grid starts with, so a hand-built one can be laid out here */
const GRID_HEADER = 48
const NRCAN = asset('nrcan-hardiness.grid')

const serve = (bodies: Readonly<Record<string, ArrayBuffer>>): void => {
  globalThis.fetch = vi.fn((input: unknown) => {
    const body = bodies[String(input)]
    return Promise.resolve(
      body === undefined
        ? ({ ok: false } as Response)
        : ({ ok: true, arrayBuffer: () => Promise.resolve(body) } as unknown as Response),
    )
  }) as unknown as typeof fetch
}

const BUNDLED = {
  [KOPPEN_GRID_PATH]: KOPPEN,
  [USDA_PHZM_GRID_PATH]: PHZM,
  [NRCAN_GRID_PATH]: NRCAN,
  [WGSRPD_GRID_PATH]: WGSRPD,
}

const DAYS_PER_YEAR = 365
const YEARS = 30

/** The shape Open-Meteo returns, held at one value so the derived extreme minimum is that value */
const dailyBody = (celsius: number): unknown => {
  const time: string[] = []
  for (let year = 1991; year <= 2020; year += 1)
    for (let day = 1; day <= DAYS_PER_YEAR; day += 1)
      time.push(`${String(year)}-01-${String(day).padStart(2, '0')}`)
  const series = Array.from({ length: YEARS * DAYS_PER_YEAR }, () => celsius)
  return {
    daily: {
      time,
      temperature_2m_min: series,
      temperature_2m_max: series,
      temperature_2m_mean: series,
      precipitation_sum: series.map(() => 3),
      shortwave_radiation_sum: series.map(() => 12),
    },
  }
}

const at = (latitudeDeg: number, longitudeDeg: number): Parameters<typeof koppenAt>[0] =>
  ({ latitudeDeg, longitudeDeg }) as Parameters<typeof koppenAt>[0]

const SITES = {
  amherst: at(42.3732, -72.5199),
  davis: at(38.5449, -121.7405),
  denver: at(39.7392, -104.9903),
  miami: at(25.7617, -80.1918),
  internationalFalls: at(48.6023, -93.4108),
  tucson: at(32.2226, -110.9747),
  berlin: at(52.52, 13.405),
  nairobi: at(-1.2864, 36.8172),
}

/** Zones read from NRCan's own map service, which is what the shipped grid has to reproduce */
const CANADA = {
  toronto: at(43.6532, -79.3832),
  vancouver: at(49.2827, -123.1207),
  winnipeg: at(49.8951, -97.1384),
  whitehorse: at(60.7212, -135.0568),
  montreal: at(45.5019, -73.5674),
  halifax: at(44.6488, -63.5752),
  iqaluit: at(63.7467, -68.517),
}

beforeEach(() => {
  fetchJson.mockReset()
  fetchJson.mockRejectedValue(new Error('upstream unavailable'))
  resetStaticLayerCache()
  serve(BUNDLED)
})

describe('the bundled Koppen grid', () => {
  it.each([
    ['Amherst, Massachusetts', SITES.amherst, 'Dfa'],
    ['Davis, California', SITES.davis, 'Csa'],
    ['Denver, Colorado', SITES.denver, 'BSk'],
    ['Miami, Florida', SITES.miami, 'Am'],
    ['International Falls, Minnesota', SITES.internationalFalls, 'Dfb'],
    ['Tucson, Arizona', SITES.tucson, 'BWh'],
    ['Berlin, Germany', SITES.berlin, 'Dfb'],
    ['Nairobi, Kenya', SITES.nairobi, 'Cfb'],
  ])('classifies %s as %s without touching the upstream', async (_name, site, code) => {
    await expect(koppenAt(site)).resolves.toBe(code)
    expect(fetchJson).not.toHaveBeenCalled()
  })

  it('reads the same code at a point as the 1 km source the grid aggregates', () => {
    const grid = decodeClassGrid(KOPPEN)
    const layer = MANIFEST.layers.find((entry) => entry.path.endsWith('koppen-beck-2018.grid'))
    expect(grid).not.toBeNull()
    expect(layer?.probes.length).toBeGreaterThan(0)
    for (const probe of layer?.probes ?? []) expect(probe.shipped).toBe(probe.source)
  })
})

/**
 * The one grid written in the 16-bit variant of the format, because 369 botanical countries don't
 * fit in the byte per cell every climate layer uses. Worth its own test for exactly that
 * reason: `decodeClassGrid` grew a second branch to read it, and a bug in that branch would
 * silently mis-file every plant's native range
 */
describe('the bundled botanical region grid', () => {
  it.each([
    ['Amherst, Massachusetts', SITES.amherst, 'MAS'],
    ['Davis, California', SITES.davis, 'CAL'],
    ['Denver, Colorado', SITES.denver, 'COL'],
    ['Berlin, Germany', SITES.berlin, 'GER'],
    ['Nairobi, Kenya', SITES.nairobi, 'KEN'],
  ])('places %s in %s', async (_name, site, area) => {
    await expect(botanicalAreaAt(site)).resolves.toBe(area)
  })

  it('reads as many areas as the scheme has, through the wide branch of the decoder', () => {
    const grid = decodeClassGrid(WGSRPD)
    expect(grid).not.toBeNull()
    // the scheme's level 3 has 369 areas, which is the whole reason for the second branch
    expect(grid?.classes.length).toBe(369)
    expect(grid?.cells).toBeInstanceOf(Uint16Array)
  })

  /**
   * The high indices, spot-checked by sample.
   *
   * An assertion that the largest index exceeds 254 would prove nothing: that is `classes.length -
   * 1`, true of any array that long. A sampler that tested for BOTH sentinels regardless of cell
   * width would read 255 as no-data in a 16-bit grid, and 255 is `PAL`, so every garden in TDWG
   * Palestine would be told its region was unknown. So this samples a real coordinate inside the
   * area that sits on the byte boundary
   */
  it('reaches an area whose class index is past what a byte could hold', async () => {
    const grid = decodeClassGrid(WGSRPD)
    expect(grid?.classes[255]).toBe('PAL')
    await expect(botanicalAreaAt(at(31.78, 35.22))).resolves.toBe('PAL')
    // and its neighbor on the other side of the boundary
    expect(grid?.classes[254]).toBe('PAK')
    await expect(botanicalAreaAt(at(33.6, 73.05))).resolves.toBe('PAK')
  })

  it('answers null out at sea rather than guessing at the nearest land', async () => {
    // the middle of the North Atlantic, which belongs to no botanical country
    await expect(botanicalAreaAt(at(35, -40))).resolves.toBeNull()
  })

  /**
   * The same probe check the other three layers have.
   *
   * `source` is computed by `scripts/fetch-plant-traits.mjs` from the published polygons by
   * point-in-polygon, with no raster anywhere in it, so agreeing with it here is the scan
   * conversion and the decoder both being right about a place. This is precisely what would have
   * caught the 255 sentinel by itself, which is why the probe set is required to keep
   * containing an area whose class index needs the wide format and a point that is on no land
   * at all
   */
  it('answers what the published polygons say at every probe, through the real decoder', async () => {
    const layer = MANIFEST.layers.find((entry) => entry.path.endsWith('wgsrpd-level3.grid'))
    const probes = layer?.probes ?? []
    expect(probes.length).toBeGreaterThan(0)
    expect(probes.map((probe) => probe.source)).toContain('PAL')
    expect(probes.map((probe) => probe.source)).toContain(null)
    for (const probe of probes) {
      const { latitudeDeg, longitudeDeg } = probe
      if (latitudeDeg === undefined || longitudeDeg === undefined)
        throw new Error(`${probe.site} carries no coordinates to probe`)
      expect(probe.shipped, probe.site).toBe(probe.source)
      await expect(botanicalAreaAt(at(latitudeDeg, longitudeDeg))).resolves.toBe(probe.source)
    }
  })
})

describe('the bundled USDA hardiness grid', () => {
  it.each([
    ['Amherst, Massachusetts', SITES.amherst, '6a'],
    ['Davis, California', SITES.davis, '9b'],
    ['Denver, Colorado', SITES.denver, '6a'],
    ['Miami, Florida', SITES.miami, '11a'],
    ['International Falls, Minnesota', SITES.internationalFalls, '3b'],
    ['Tucson, Arizona', SITES.tucson, '9b'],
  ])('rates %s as zone %s', async (_name, site, zone) => {
    const ratings = await hardinessAt(site)
    expect(ratings[0]?.zoneLabel).toBe(zone)
    expect(ratings[0]?.scheme).toBe('usda-2023')
    expect(ratings[0]).toMatchObject({ basis: 'grid' })
  })

  it('carries the lower edge of the band, which is the only temperature the label defines', async () => {
    const [rating] = await hardinessAt(SITES.amherst)
    expect(rating?.extremeMinTempC).toBeCloseTo((-10 - 32) / 1.8, 6)
    expect(usdaZoneLabel(rating?.extremeMinTempC ?? 0)).toBe('6a')
  })

  it('has no coverage outside the lower 48 and derives there instead', async () => {
    fetchJson.mockResolvedValue(dailyBody(-14))
    const [rating] = await hardinessAt(SITES.berlin)
    expect(rating?.zoneLabel).toBe(usdaZoneLabel(-14))
    // and says so, since the label on screen must not claim the map
    expect(rating).toMatchObject({ basis: 'weather-record' })
  })

  it('matches the 800 m source at every probe the generator recorded', () => {
    const layer = MANIFEST.layers.find((entry) => entry.path.endsWith('usda-phzm-2023.grid'))
    expect(layer?.probes.length).toBeGreaterThan(0)
    for (const probe of layer?.probes ?? []) expect(probe.shipped).toBe(probe.source)
  })

  it('round-trips every zone label it can return through the label math', () => {
    const grid = decodeClassGrid(PHZM)
    expect(grid?.classes.length).toBeGreaterThan(0)
    for (const label of grid?.classes ?? []) {
      const lower = usdaZoneLowerC(label)
      expect(lower).not.toBeNull()
      expect(usdaZoneLabel(lower ?? 0)).toBe(label)
    }
  })
})

describe('the bundled NRCan hardiness grid', () => {
  it.each([
    ['Toronto, Ontario', CANADA.toronto, '7a'],
    ['Vancouver, British Columbia', CANADA.vancouver, '9a'],
    ['Winnipeg, Manitoba', CANADA.winnipeg, '3b'],
    ['Whitehorse, Yukon', CANADA.whitehorse, '1b'],
    ['Montreal, Quebec', CANADA.montreal, '5b'],
    ['Halifax, Nova Scotia', CANADA.halifax, '6b'],
    ['Iqaluit, Nunavut', CANADA.iqaluit, '0a'],
  ])('reads the zone NRCan publishes for %s', async (_name, site, zone) => {
    const rating = await nrcanZoneAt(site)
    expect(rating?.zoneLabel).toBe(zone)
    expect(rating?.scheme).toBe('nrcan')
    // the whole point of the union: no winter minimum was invented to fill a required field
    expect(rating?.extremeMinTempC).toBeUndefined()
    expect(rating?.indexTerms).toEqual([])
    expect(fetchJson).not.toHaveBeenCalled()
  })

  it('matches both the polygons and the published service at every probe', () => {
    const layer = MANIFEST.layers.find((entry) => entry.path.endsWith('nrcan-hardiness.grid'))
    expect(layer?.probes.length).toBeGreaterThan(0)
    for (const probe of layer?.probes ?? []) {
      expect(probe.shipped).toBe(probe.source)
      expect(probe.shipped).toBe(probe.published)
    }
  })

  it('covers Canada only, so no US site picks up a Canadian zone', async () => {
    for (const site of [SITES.amherst, SITES.internationalFalls, SITES.davis, SITES.berlin])
      await expect(nrcanZoneAt(site)).resolves.toBeNull()
  })
})

describe('a Canadian site', () => {
  it('carries a measured temperature rating and the published zone, neither derived from the other', async () => {
    fetchJson.mockResolvedValue(dailyBody(-24))
    const ratings = await hardinessAt(CANADA.toronto)
    expect(ratings.map((rating) => rating.scheme)).toEqual(['usda-2023', 'nrcan'])
    // measured from thirty years of daily minima, which is what USDA maps
    expect(ratings[0]?.extremeMinTempC).toBeCloseTo(-24, 6)
    expect(ratings[0]?.zoneLabel).toBe(usdaZoneLabel(-24))
    expect(ratings[1]?.zoneLabel).toBe('7a')
    expect(ratings[1]?.extremeMinTempC).toBeUndefined()
  })

  it('keeps the two independent: the same zone sits beside whatever the reanalysis measures', async () => {
    for (const celsius of [-30, -12]) {
      resetStaticLayerCache()
      serve(BUNDLED)
      fetchJson.mockResolvedValue(dailyBody(celsius))
      const ratings = await hardinessAt(CANADA.toronto)
      expect(ratings[1]?.zoneLabel).toBe('7a')
      expect(ratings[0]?.zoneLabel).toBe(usdaZoneLabel(celsius))
    }
  })

  it('is unaffected in the US, where the sampled band is still the only rating', async () => {
    const ratings = await hardinessAt(SITES.amherst)
    expect(ratings).toHaveLength(1)
    expect(ratings[0]?.scheme).toBe('usda-2023')
  })
})

describe('a sampled band the reanalysis disagrees with', () => {
  it('reports both rather than letting one silently replace the other', async () => {
    // -40 C derives zone 3a where the 2023 map reads 6a: six half-zones apart
    fetchJson.mockResolvedValue(dailyBody(-40))
    const ratings = await hardinessAt(SITES.amherst)
    expect(ratings.map((rating) => rating.zoneLabel)).toEqual(['6a', '3a'])
    // the climate gate takes the coldest rating, so disagreement never loosens the gate
    expect(
      Math.min(...ratings.filter(isTemperatureHardiness).map((rating) => rating.extremeMinTempC)),
    ).toBeCloseTo(-40, 6)
  })

  it('reports one rating when the two land in the same band', async () => {
    fetchJson.mockResolvedValue(dailyBody((-8 - 32) / 1.8))
    const ratings = await hardinessAt(SITES.amherst)
    expect(ratings).toHaveLength(1)
    expect(ratings[0]?.zoneLabel).toBe('6a')
  })

  it('reports one rating when the two are a single half-zone apart', async () => {
    fetchJson.mockResolvedValue(dailyBody((-12 - 32) / 1.8))
    const ratings = await hardinessAt(SITES.amherst)
    expect(ratings).toHaveLength(1)
  })

  it('keeps the sampled band when the upstream is unreachable', async () => {
    const ratings = await hardinessAt(SITES.amherst)
    expect(ratings).toHaveLength(1)
    expect(ratings[0]?.zoneLabel).toBe('6a')
  })
})

describe('an absent, truncated or corrupt asset', () => {
  const derives = async (bodies: Readonly<Record<string, ArrayBuffer>>): Promise<void> => {
    resetStaticLayerCache()
    serve(bodies)
    fetchJson.mockResolvedValue(dailyBody(-14))
    await expect(koppenAt(SITES.amherst)).resolves.toMatch(/^[ABCDE]/)
    const [rating] = await hardinessAt(SITES.amherst)
    expect(rating?.zoneLabel).toBe(usdaZoneLabel(-14))
    // a Canadian site keeps its measured rating and simply loses the zone it can't read
    await expect(nrcanZoneAt(CANADA.toronto)).resolves.toBeNull()
    const canadian = await hardinessAt(CANADA.toronto)
    expect(canadian.map((entry) => entry.scheme)).toEqual(['usda-2023'])
  }

  it('derives when nothing is deployed', async () => {
    await derives({})
  })

  it('derives when the download stopped part way', async () => {
    await derives({
      [KOPPEN_GRID_PATH]: KOPPEN.slice(0, Math.floor(KOPPEN.byteLength / 2)),
      [USDA_PHZM_GRID_PATH]: PHZM.slice(0, Math.floor(PHZM.byteLength / 2)),
      [NRCAN_GRID_PATH]: NRCAN.slice(0, Math.floor(NRCAN.byteLength / 2)),
    })
  })

  it("derives when the bytes aren't a grid at all", async () => {
    const junk = new TextEncoder().encode('<!doctype html><title>404</title>')
    await derives({
      [KOPPEN_GRID_PATH]: junk.buffer as ArrayBuffer,
      [USDA_PHZM_GRID_PATH]: junk.buffer as ArrayBuffer,
      [NRCAN_GRID_PATH]: junk.buffer as ArrayBuffer,
    })
  })

  it('never throws out of the decoder, whatever the bytes are', () => {
    const flip = (offset: number): ArrayBuffer => {
      const copy = new Uint8Array(PHZM.slice(0))
      copy[offset] = (copy[offset] ?? 0) ^ 0xff
      return copy.buffer as ArrayBuffer
    }
    expect(decodeClassGrid(new ArrayBuffer(0))).toBeNull()
    expect(decodeClassGrid(new ArrayBuffer(64))).toBeNull()
    // magic, version, codec, the two dimensions, the two section lengths, the class table
    for (const offset of [0, 4, 5, 8, 12, 40, 44, 48])
      expect(decodeClassGrid(flip(offset))).toBeNull()
    // a payload byte can still decode, but it must not throw and must not resize the grid
    const mangled = decodeClassGrid(flip(PHZM.byteLength - 2))
    expect(mangled === null || mangled.cells.length === mangled.cols * mangled.rows).toBe(true)
  })

  /**
   * A run length is a varint. If it were accumulated with `|=`, which is a 32-bit SIGNED operation,
   * a crafted fifth byte would set the sign bit, `run` would go negative, `written + run` would
   * sail under the bound meant to catch it, and `TypedArray.fill` clamps negative bounds without
   * throwing. The result would be a fully populated grid of an attacker's chosen class, where every
   * other malformed input gets null, and for the botanical layer a wrong answer is a claim about
   * where a plant grows wild
   */
  it('refuses a run length crafted to go negative rather than decoding it', () => {
    const table = [3, 0x42, 0x42, 0x42]
    const payload = [0x00, 0x80, 0x80, 0x80, 0x80, 0x08]
    const buffer = new ArrayBuffer(GRID_HEADER + table.length + payload.length)
    const view = new DataView(buffer)
    const bytes = new Uint8Array(buffer)
    for (let i = 0; i < 4; i += 1) bytes[i] = 'AGDG'.charCodeAt(i)
    view.setUint8(4, 1)
    view.setUint8(5, 1)
    view.setUint16(6, 1, true)
    view.setUint32(8, 4, true)
    view.setUint32(12, 3, true)
    view.setFloat64(16, -180, true)
    view.setFloat64(24, -90, true)
    view.setFloat64(32, 1, true)
    view.setUint32(40, payload.length, true)
    view.setUint32(44, table.length, true)
    bytes.set(table, GRID_HEADER)
    bytes.set(payload, GRID_HEADER + table.length)
    expect(decodeClassGrid(buffer)).toBeNull()
  })

  it('samples nothing outside the grid rather than wrapping to the far edge', () => {
    const grid = decodeClassGrid(PHZM)
    expect(grid).not.toBeNull()
    if (grid === null) return
    expect(sampleClassGrid(grid, at(0, 0))).toBeNull()
    expect(sampleClassGrid(grid, at(42.3732, -72.5199 + 360))).toBe('6a')
  })
})

describe('the license obligations of what ships', () => {
  it('names every shipped layer in the license surface', () => {
    const sourceIds = staticLayerLicenses().map((entry) => entry.sourceId)
    expect(sourceIds).toContain('usda-phzm-2023')
    expect(sourceIds).toContain('koppen-beck-2018')
    expect(sourceIds).toContain('nrcan-hardiness')
  })

  it('carries the attribution the Open Government Licence Canada requires', () => {
    const nrcan = staticLayerLicenses().find((entry) => entry.sourceId === 'nrcan-hardiness')
    expect(nrcan?.license).toBe('Open Government Licence - Canada')
    expect(nrcan?.attribution).toBe(NRCAN_ATTRIBUTION)
    expect(NRCAN_ATTRIBUTION).toMatch(/Contains information licensed under the Open Government/)
  })

  it('carries the PRISM disclaimer, which altering the data makes mandatory', () => {
    const usda = staticLayerLicenses().find((entry) => entry.sourceId === 'usda-phzm-2023')
    expect(usda?.attribution).toContain('USDA-ARS')
    expect(usda?.attribution).toContain(USDA_PHZM_DISCLAIMER)
    expect(USDA_PHZM_DISCLAIMER).toMatch(/not the official USDA Plant Hardiness Zone Map/)
  })

  it('keeps the requirement list pointing at the files the loader actually reads', () => {
    const declared = STATIC_LAYERS_TO_FETCH.map((entry) => entry.path)
    expect(declared).toContain(`public${KOPPEN_GRID_PATH}`)
    expect(declared).toContain(`public${USDA_PHZM_GRID_PATH}`)
    expect(declared).toContain(`public${NRCAN_GRID_PATH}`)
  })

  it('still records that the Canadian scheme is never crosswalked, now that it ships', () => {
    const nrcan = STATIC_LAYERS_TO_FETCH.find((entry) => entry.path.includes('nrcan'))
    expect(nrcan?.note).toMatch(/crosswalk/)
    expect(NRCAN_SCHEME_NOTE).toMatch(/doesn't convert to a USDA zone/)
    expect(NRCAN_SCHEME_NOTE).toMatch(/isn't a winter minimum temperature/)
  })
})

describe('the USDA half-zone math', () => {
  it('inverts the label back to the index the label was built from', () => {
    for (let index = 0; index < 26; index += 1) {
      const label = usdaZoneLabel((-60 + index * 5 - 32) / 1.8)
      expect(usdaHalfZoneIndex(label)).toBe(index)
    }
  })

  it('refuses a label that is not a zone', () => {
    for (const label of ['', '6', 'a', '6c', 'zone 6a', '6a ']) {
      expect(usdaHalfZoneIndex(label)).toBeNull()
      expect(usdaZoneLowerC(label)).toBeNull()
    }
  })
})
