/**
 * Rebuilds the bundled climate grids in `public/data` from their upstream sources.
 *
 *   node --max-old-space-size=12288 scripts/fetch-static-layers.mjs [--validate]
 *
 * Downloads are cached under `node_modules/.cache/static-layers` so a rerun is cheap.
 * `--validate` additionally rebuilds the full-resolution reference rasters and measures
 * the agreement the shipped cell size actually achieves; it needs about 12 GB of heap
 * and several minutes, and its output is written into the manifest.
 *
 * See docs/STATIC-LAYERS.md for the size-versus-fidelity decision these numbers drove
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { writeManifest } from './lib/manifest.mjs'
import { unzip } from './lib/zip.mjs'

const ROOT = new URL('../', import.meta.url)
const CACHE = new URL('node_modules/.cache/static-layers/', ROOT)
const OUT = new URL('public/data/', ROOT)
const RETRIEVED = new Date().toISOString().slice(0, 10)

const args = new Set(process.argv.slice(2))
const validate = args.has('--validate')

// ---------------------------------------------------------------- acquisition

const cached = async (name, url) => {
  const file = new URL(name, CACHE)
  try {
    return readFileSync(file)
  } catch {
    console.log(`downloading ${url}`)
    const response = await fetch(url)
    if (!response.ok) throw new Error(`${url} returned ${String(response.status)}`)
    const body = Buffer.from(await response.arrayBuffer())
    mkdirSync(CACHE, { recursive: true })
    writeFileSync(file, body)
    return body
  }
}

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')

// ---------------------------------------------------------------------- TIFF

const PACKBITS = 32773

const unpackBits = (src, out) => {
  let i = 0
  let o = 0
  while (i < src.length && o < out.length) {
    const n = src.readInt8(i)
    i += 1
    if (n >= 0) {
      src.copy(out, o, i, i + n + 1)
      i += n + 1
      o += n + 1
    } else if (n !== -128) {
      out.fill(src[i], o, o + 1 - n)
      i += 1
      o += 1 - n
    }
  }
}

/**
 * Enough of TIFF to read the single-band tiled 8-bit PackBits GeoTIFFs Beck et al.
 * publish. Tiles decode lazily so a probe against the 933-megapixel 1 km raster
 * touches one tile
 */
const openTiff = (buffer) => {
  if (buffer.toString('latin1', 0, 2) !== 'II') throw new Error('expected a little-endian TIFF')
  const tags = new Map()
  let cursor = buffer.readUInt32LE(4)
  const entries = buffer.readUInt16LE(cursor)
  cursor += 2
  for (let i = 0; i < entries; i += 1) {
    const base = cursor + i * 12
    const type = buffer.readUInt16LE(base + 2)
    const count = buffer.readUInt32LE(base + 4)
    const width = type === 3 ? 2 : type === 4 ? 4 : type === 12 ? 8 : 1
    const start = count * width <= 4 ? base + 8 : buffer.readUInt32LE(base + 8)
    const read = (k) => {
      const at = start + k * width
      if (type === 3) return buffer.readUInt16LE(at)
      if (type === 4) return buffer.readUInt32LE(at)
      if (type === 12) return buffer.readDoubleLE(at)
      return buffer[at]
    }
    tags.set(
      buffer.readUInt16LE(base),
      Array.from({ length: count }, (_, k) => read(k)),
    )
  }
  const one = (tag) => tags.get(tag)?.[0]
  if (one(258) !== 8) throw new Error('expected 8 bits per sample')
  if (one(259) !== PACKBITS) throw new Error('expected PackBits compression')
  const width = one(256)
  const height = one(257)
  const tileWidth = one(322)
  const tileHeight = one(323)
  const offsets = tags.get(324)
  const lengths = tags.get(325)
  const across = Math.ceil(width / tileWidth)
  const scale = tags.get(33550)
  const tie = tags.get(33922)
  const tiles = new Map()
  const tileAt = (index) => {
    const hit = tiles.get(index)
    if (hit !== undefined) return hit
    const tile = Buffer.alloc(tileWidth * tileHeight)
    unpackBits(buffer.subarray(offsets[index], offsets[index] + lengths[index]), tile)
    // a row-major sweep of the 1 km raster revisits one band of tiles, so bounding the
    // cache at two bands keeps a whole-raster scan off the 933 MB it would otherwise hold
    if (tiles.size > across * 2) tiles.clear()
    tiles.set(index, tile)
    return tile
  }
  return {
    width,
    height,
    /** west edge, north edge and cell size in degrees, from the GeoTIFF model tags */
    westDeg: tie[3],
    northDeg: tie[4],
    cellDeg: scale[0],
    at: (x, y) => {
      const tile = tileAt(Math.floor(y / tileHeight) * across + Math.floor(x / tileWidth))
      return tile[(y % tileHeight) * tileWidth + (x % tileWidth)]
    },
    pixels: () => {
      const out = new Uint8Array(width * height)
      for (let index = 0; index < offsets.length; index += 1) {
        const tile = tileAt(index)
        const x0 = (index % across) * tileWidth
        const y0 = Math.floor(index / across) * tileHeight
        for (let ty = 0; ty < tileHeight; ty += 1) {
          const y = y0 + ty
          if (y >= height) break
          const span = Math.min(tileWidth, width - x0)
          out.set(tile.subarray(ty * tileWidth, ty * tileWidth + span), y * width + x0)
        }
        tiles.delete(index)
      }
      return out
    },
  }
}

// --------------------------------------------------------------- grid format

const MAGIC = 'AGDG'
const VERSION = 1
const CODEC_ROW_RLE = 1
const HEADER_BYTES = 48
const NODATA = 255
const SAME_AS_ABOVE = 254
const MAX_CLASSES = 254

/**
 * Row-predicted varint run-length coding. A cell equal to the cell below it in the
 * previous row becomes a sentinel, so vertically uniform bands collapse to one run;
 * the horizontal runs a plain RLE would find survive unchanged
 */
const encodePayload = (cells, cols) => {
  const predicted = new Uint8Array(cells.length)
  predicted.set(cells.subarray(0, cols))
  for (let i = cols; i < cells.length; i += 1)
    predicted[i] = cells[i] === cells[i - cols] ? SAME_AS_ABOVE : cells[i]
  const out = []
  let run = 1
  for (let i = 1; i <= predicted.length; i += 1) {
    if (i < predicted.length && predicted[i] === predicted[i - 1]) {
      run += 1
      continue
    }
    out.push(predicted[i - 1])
    let v = run
    while (v > 0x7f) {
      out.push((v & 0x7f) | 0x80)
      v >>>= 7
    }
    out.push(v)
    run = 1
  }
  return Buffer.from(out)
}

const encodeGrid = ({ classes, cells, cols, rows, originLon, originLat, cellDeg }) => {
  if (classes.length > MAX_CLASSES) throw new Error(`too many classes: ${String(classes.length)}`)
  const table = Buffer.concat(
    classes.map((name) => {
      const utf8 = Buffer.from(name, 'utf8')
      return Buffer.concat([Buffer.of(utf8.length), utf8])
    }),
  )
  const payload = encodePayload(cells, cols)
  const header = Buffer.alloc(HEADER_BYTES)
  header.write(MAGIC, 0, 'latin1')
  header.writeUInt8(VERSION, 4)
  header.writeUInt8(CODEC_ROW_RLE, 5)
  header.writeUInt16LE(classes.length, 6)
  header.writeUInt32LE(cols, 8)
  header.writeUInt32LE(rows, 12)
  header.writeDoubleLE(originLon, 16)
  header.writeDoubleLE(originLat, 24)
  header.writeDoubleLE(cellDeg, 32)
  header.writeUInt32LE(payload.length, 40)
  header.writeUInt32LE(table.length, 44)
  return Buffer.concat([header, table, payload])
}

const sampleGrid = (grid, latitudeDeg, longitudeDeg) => {
  const lon = ((((longitudeDeg + 180) % 360) + 360) % 360) - 180
  const col = Math.round((lon - grid.originLon) / grid.cellDeg)
  const row = Math.round((latitudeDeg - grid.originLat) / grid.cellDeg)
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return null
  const value = grid.cells[row * grid.cols + col]
  return value === NODATA ? null : grid.classes[value]
}

// -------------------------------------------------------------------- Koppen

const KOPPEN_CLASSES = [
  'Af',
  'Am',
  'Aw',
  'BWh',
  'BWk',
  'BSh',
  'BSk',
  'Csa',
  'Csb',
  'Csc',
  'Cwa',
  'Cwb',
  'Cwc',
  'Cfa',
  'Cfb',
  'Cfc',
  'Dsa',
  'Dsb',
  'Dsc',
  'Dsd',
  'Dwa',
  'Dwb',
  'Dwc',
  'Dwd',
  'Dfa',
  'Dfb',
  'Dfc',
  'Dfd',
  'ET',
  'EF',
]

const BECK_ZIP = 'https://ndownloader.figshare.com/files/12407516'
const BECK_COARSE = 'Beck_KG_V1_present_0p083.tif'
const BECK_FINE = 'Beck_KG_V1_present_0p0083.tif'

/** Beck's rasters are north-up; the grid format is south-up so a row index maps to latitude */
const gridFromTiff = (tiff) => {
  const pixels = tiff.pixels()
  const cells = new Uint8Array(pixels.length)
  for (let row = 0; row < tiff.height; row += 1) {
    const source = (tiff.height - 1 - row) * tiff.width
    for (let col = 0; col < tiff.width; col += 1) {
      const value = pixels[source + col]
      cells[row * tiff.width + col] = value === 0 ? NODATA : value - 1
    }
  }
  return {
    classes: KOPPEN_CLASSES,
    cells,
    cols: tiff.width,
    rows: tiff.height,
    originLon: tiff.westDeg + tiff.cellDeg / 2,
    originLat: tiff.northDeg - tiff.height * tiff.cellDeg + tiff.cellDeg / 2,
    cellDeg: tiff.cellDeg,
  }
}

const koppenAtTiff = (tiff, latitudeDeg, longitudeDeg) => {
  const col = Math.floor((longitudeDeg - tiff.westDeg) / tiff.cellDeg)
  const row = Math.floor((tiff.northDeg - latitudeDeg) / tiff.cellDeg)
  if (col < 0 || row < 0 || col >= tiff.width || row >= tiff.height) return null
  const value = tiff.at(col, row)
  return value === 0 ? null : KOPPEN_CLASSES[value - 1]
}

// ----------------------------------------------------------- USDA hardiness

const PHZM_ZIP = 'https://prism.oregonstate.edu/phzm/data/2023/phzm_us_grid_2023.zip'
const PHZM_BIL = 'phzm_us_grid_2023.bil'
const PHZM_HDR = 'phzm_us_grid_2023.hdr'
const PHZM_TERMS = 'phzm_terms_of_use.txt'
const PHZM_CELL_DEG = 0.02

/**
 * The mean annual extreme minimum temperature ships as an ESRI BIL: a plain-text header
 * and a float32 raster, with ULXMAP and ULYMAP giving the centre of the north-west cell
 */
const readBil = (header, body) => {
  const fields = new Map(
    header
      .toString('utf8')
      .split(/\r?\n/)
      .filter((line) => line.trim() !== '')
      .map((line) => line.trim().split(/\s+/))
      .map(([key, value]) => [key.toUpperCase(), value]),
  )
  const number = (key) => Number(fields.get(key))
  if (fields.get('BYTEORDER') !== 'I') throw new Error('expected a little-endian BIL')
  if (fields.get('PIXELTYPE') !== 'FLOAT' || number('NBITS') !== 32)
    throw new Error('expected a 32-bit float BIL')
  const cols = number('NCOLS')
  const rows = number('NROWS')
  const cellDeg = number('XDIM')
  const nodata = number('NODATA')
  return {
    cols,
    rows,
    cellDeg,
    northDeg: number('ULYMAP'),
    westDeg: number('ULXMAP'),
    at: (col, row) => {
      const value = body.readFloatLE((row * cols + col) * 4)
      return value === nodata || value < -999 ? null : value
    },
  }
}

const FAHRENHEIT_PER_HALF_ZONE = 5
const USDA_ZONE_MIN_F = -60
const MAX_USDA_ZONE = 13

/** The published zone definition: 5 degF half-zones counted up from -60 degF */
const usdaHalfZoneIndex = (fahrenheit) =>
  Math.floor((fahrenheit - USDA_ZONE_MIN_F) / FAHRENHEIT_PER_HALF_ZONE)

const usdaZoneLabel = (index) => {
  const zone = Math.min(Math.max(Math.floor(index / 2) + 1, 1), MAX_USDA_ZONE)
  return `${String(zone)}${index % 2 === 0 ? 'a' : 'b'}`
}

const phzmZoneAt = (bil, latitudeDeg, longitudeDeg) => {
  const col = Math.round((longitudeDeg - bil.westDeg) / bil.cellDeg)
  const row = Math.round((bil.northDeg - latitudeDeg) / bil.cellDeg)
  if (col < 0 || row < 0 || col >= bil.cols || row >= bil.rows) return null
  const fahrenheit = bil.at(col, row)
  return fahrenheit === null ? null : usdaZoneLabel(usdaHalfZoneIndex(fahrenheit))
}

/**
 * Nearest-neighbour resample to the shipped cell size, then the published half-zone
 * classification. Binning after sampling, never averaging across a zone boundary
 */
const gridFromBil = (bil, cellDeg) => {
  const originLon = bil.westDeg
  const originLat = bil.northDeg - (bil.rows - 1) * bil.cellDeg
  const cols = Math.ceil((bil.cols * bil.cellDeg) / cellDeg)
  const rows = Math.ceil((bil.rows * bil.cellDeg) / cellDeg)
  const cells = new Uint8Array(cols * rows).fill(NODATA)
  const seen = new Set()
  const indices = new Int32Array(cols * rows).fill(-1)
  for (let row = 0; row < rows; row += 1) {
    const sourceRow = Math.round((bil.northDeg - (originLat + row * cellDeg)) / bil.cellDeg)
    if (sourceRow < 0 || sourceRow >= bil.rows) continue
    for (let col = 0; col < cols; col += 1) {
      const sourceCol = Math.round((originLon + col * cellDeg - bil.westDeg) / bil.cellDeg)
      if (sourceCol < 0 || sourceCol >= bil.cols) continue
      const fahrenheit = bil.at(sourceCol, sourceRow)
      if (fahrenheit === null) continue
      const index = usdaHalfZoneIndex(fahrenheit)
      seen.add(index)
      indices[row * cols + col] = index
    }
  }
  const ordered = [...seen].sort((a, b) => a - b)
  const rank = new Map(ordered.map((index, position) => [index, position]))
  for (let i = 0; i < indices.length; i += 1) if (indices[i] >= 0) cells[i] = rank.get(indices[i])
  return {
    classes: ordered.map(usdaZoneLabel),
    cells,
    cols,
    rows,
    originLon,
    originLat,
    cellDeg,
  }
}

// ---------------------------------------------------------- NRCan hardiness

const NRCAN_ZIP =
  'https://ftp.maps.canada.ca/pub/nrcan_rncan/Geographical-maps_Carte-geographique/Plant-Hardiness-Zones_Zones-rusticite/Shapefiles/PlantHardinessZones_SHP_EN.zip'
const NRCAN_SHP = 'plantHardinessZones_EN.shp'
const NRCAN_DBF = 'plantHardinessZones_EN.dbf'
const NRCAN_ZONE_FIELD = 'ph_zone'
const NRCAN_CELL_DEG = 0.05
/** odd, so the subcell centres are symmetric about the output cell centre */
const NRCAN_SUBCELLS = 5
const NRCAN_REFERENCE_DEG = 0.005
const SHAPE_TYPE_POLYGON = 5

/** One column out of a dBASE III table, which is all the zone attribute needs */
const readDbfColumn = (buffer, wanted) => {
  const records = buffer.readUInt32LE(4)
  const headerBytes = buffer.readUInt16LE(8)
  const recordBytes = buffer.readUInt16LE(10)
  const fields = []
  for (let offset = 32; buffer[offset] !== 0x0d; offset += 32)
    fields.push({
      name: buffer.toString('utf8', offset, offset + 11).replace(/\0.*$/, ''),
      length: buffer[offset + 16],
    })
  if (!fields.some((field) => field.name === wanted))
    throw new Error(`dBASE column missing: ${wanted}`)
  return Array.from({ length: records }, (_, index) => {
    let cursor = headerBytes + index * recordBytes + 1
    let value = null
    for (const field of fields) {
      if (field.name === wanted) value = buffer.toString('utf8', cursor, cursor + field.length)
      cursor += field.length
    }
    return value.trim()
  })
}

/** Enough of the ESRI shapefile to read the polygon records; parts are rings, x then y */
const readPolygonShapefile = (buffer) => {
  const out = []
  let cursor = 100
  while (cursor + 8 <= buffer.length) {
    const body = cursor + 8
    cursor = body + buffer.readInt32BE(cursor + 4) * 2
    if (buffer.readInt32LE(body) !== SHAPE_TYPE_POLYGON) continue
    const partCount = buffer.readInt32LE(body + 36)
    const pointCount = buffer.readInt32LE(body + 40)
    const partsAt = body + 44
    const pointsAt = partsAt + partCount * 4
    const starts = Array.from({ length: partCount }, (_, i) => buffer.readInt32LE(partsAt + i * 4))
    const rings = starts.map((from, index) => {
      const to = index + 1 < partCount ? starts[index + 1] : pointCount
      const ring = new Float64Array((to - from) * 2)
      for (let i = 0; i < ring.length; i += 1)
        ring[i] = buffer.readDoubleLE(pointsAt + (from * 2 + i) * 8)
      return ring
    })
    out.push(rings)
  }
  return out
}

/**
 * Inverse of the Lambert conformal conic the shapefile is projected in (EPSG:3978,
 * NAD83 Canada Atlas Lambert, GRS80), Snyder's ellipsoidal two-standard-parallel form.
 * Unprojecting the vertices once lets the raster be built in the lon/lat frame the app
 * samples in, so there is one resampling step
 */
const GRS80_A = 6378137
const GRS80_F = 1 / 298.257222101
const GRS80_E = Math.sqrt(GRS80_F * (2 - GRS80_F))
const DEG = Math.PI / 180
const LCC_LAT0 = 49 * DEG
const LCC_LON0 = -95 * DEG
const LCC_SP1 = 49 * DEG
const LCC_SP2 = 77 * DEG
const LCC_LATITUDE_ITERATIONS = 12

const lccM = (lat) => Math.cos(lat) / Math.sqrt(1 - GRS80_E ** 2 * Math.sin(lat) ** 2)
const lccT = (lat) =>
  Math.tan(Math.PI / 4 - lat / 2) /
  ((1 - GRS80_E * Math.sin(lat)) / (1 + GRS80_E * Math.sin(lat))) ** (GRS80_E / 2)
const LCC_N = Math.log(lccM(LCC_SP1) / lccM(LCC_SP2)) / Math.log(lccT(LCC_SP1) / lccT(LCC_SP2))
const LCC_F = lccM(LCC_SP1) / (LCC_N * lccT(LCC_SP1) ** LCC_N)
const LCC_RHO0 = GRS80_A * LCC_F * lccT(LCC_LAT0) ** LCC_N

const lccInverse = (x, y) => {
  const sign = Math.sign(LCC_N)
  const north = LCC_RHO0 - y
  const rho = sign * Math.hypot(x, north)
  const t = (rho / (GRS80_A * LCC_F)) ** (1 / LCC_N)
  let lat = Math.PI / 2 - 2 * Math.atan(t)
  for (let i = 0; i < LCC_LATITUDE_ITERATIONS; i += 1)
    lat =
      Math.PI / 2 -
      2 *
        Math.atan(
          t * ((1 - GRS80_E * Math.sin(lat)) / (1 + GRS80_E * Math.sin(lat))) ** (GRS80_E / 2),
        )
  return [(Math.atan2(sign * x, sign * north) / LCC_N + LCC_LON0) / DEG, lat / DEG]
}

const nrcanFeatures = (shp, dbf) => {
  const zones = readDbfColumn(dbf, NRCAN_ZONE_FIELD)
  const polygons = readPolygonShapefile(shp)
  if (polygons.length !== zones.length)
    throw new Error(`${String(polygons.length)} polygons for ${String(zones.length)} zone rows`)
  const bounds = { minLon: 180, minLat: 90, maxLon: -180, maxLat: -90 }
  const features = polygons.map((rings, index) => ({
    zone: zones[index],
    rings: rings.map((ring) => {
      const out = new Float64Array(ring.length)
      for (let i = 0; i < ring.length; i += 2) {
        const [lon, lat] = lccInverse(ring[i], ring[i + 1])
        out[i] = lon
        out[i + 1] = lat
        bounds.minLon = Math.min(bounds.minLon, lon)
        bounds.maxLon = Math.max(bounds.maxLon, lon)
        bounds.minLat = Math.min(bounds.minLat, lat)
        bounds.maxLat = Math.max(bounds.maxLat, lat)
      }
      return out
    }),
  }))
  return { features, bounds }
}

/** Even-odd crossing count over every ring of the feature, which is how a shapefile marks holes */
const inFeature = (feature, lon, lat) => {
  let inside = false
  for (const ring of feature.rings) {
    const points = ring.length / 2
    for (let i = 0, j = points - 1; i < points; j = i, i += 1) {
      const latI = ring[i * 2 + 1]
      const latJ = ring[j * 2 + 1]
      if (latI > lat === latJ > lat) continue
      const lonI = ring[i * 2]
      const lonJ = ring[j * 2]
      if (lon < lonI + ((lat - latI) * (lonJ - lonI)) / (latJ - latI)) inside = !inside
    }
  }
  return inside
}

const nrcanZoneAtPoint = (features, latitudeDeg, longitudeDeg) =>
  features.find((feature) => inFeature(feature, longitudeDeg, latitudeDeg))?.zone ?? null

/** Scan conversion of the rings, one feature at a time, with the same even-odd rule */
const scanConvert = (features, bounds, cellDeg) => {
  const originLon = Math.floor(bounds.minLon / cellDeg) * cellDeg
  const originLat = Math.floor(bounds.minLat / cellDeg) * cellDeg
  const cols = Math.ceil((bounds.maxLon - originLon) / cellDeg) + 1
  const rows = Math.ceil((bounds.maxLat - originLat) / cellDeg) + 1
  const cells = new Uint8Array(cols * rows).fill(NODATA)
  features.forEach((feature, value) => {
    const byRow = new Map()
    for (const ring of feature.rings) {
      const points = ring.length / 2
      for (let i = 0, j = points - 1; i < points; j = i, i += 1) {
        const latJ = ring[j * 2 + 1]
        const latI = ring[i * 2 + 1]
        const from = Math.max(0, Math.ceil((Math.min(latJ, latI) - originLat) / cellDeg))
        const to = Math.min(rows - 1, Math.floor((Math.max(latJ, latI) - originLat) / cellDeg))
        for (let row = from; row <= to; row += 1) {
          let edges = byRow.get(row)
          if (edges === undefined) {
            edges = []
            byRow.set(row, edges)
          }
          edges.push(ring[j * 2], latJ, ring[i * 2], latI)
        }
      }
    }
    for (const [row, edges] of byRow) {
      const lat = originLat + row * cellDeg
      const crossings = []
      for (let k = 0; k < edges.length; k += 4) {
        if (edges[k + 1] > lat === edges[k + 3] > lat) continue
        crossings.push(
          edges[k] +
            ((lat - edges[k + 1]) * (edges[k + 2] - edges[k])) / (edges[k + 3] - edges[k + 1]),
        )
      }
      crossings.sort((a, b) => a - b)
      for (let k = 0; k + 1 < crossings.length; k += 2) {
        const from = Math.max(0, Math.ceil((crossings[k] - originLon) / cellDeg))
        const to = Math.min(cols - 1, Math.floor((crossings[k + 1] - originLon) / cellDeg))
        if (to >= from) cells.fill(value, row * cols + from, row * cols + to + 1)
      }
    }
  })
  return { cells, cols, rows, originLon, originLat, cellDeg }
}

/**
 * Supersample, then take the class covering the cell centre; where the centre is uncovered,
 * the majority class but only if the cell is at least half covered. Plain nearest-centre
 * loses coastal cities whose centre lands in water, and plain majority-of-covered bleeds
 * Canadian zones across the border onto US sites. This rule does neither
 */
const downsampleMajority = (fine, factor, classes) => {
  const cols = Math.ceil(fine.cols / factor)
  const rows = Math.ceil(fine.rows / factor)
  const cells = new Uint8Array(cols * rows).fill(NODATA)
  const tally = new Uint16Array(classes.length)
  const half = (factor - 1) / 2
  for (let row = 0; row < rows; row += 1)
    for (let col = 0; col < cols; col += 1) {
      tally.fill(0)
      let best = NODATA
      let bestCount = 0
      let covered = 0
      let centre = NODATA
      for (let dy = -half; dy <= half; dy += 1) {
        const y = row * factor + half + dy
        if (y < 0 || y >= fine.rows) continue
        for (let dx = -half; dx <= half; dx += 1) {
          const x = col * factor + half + dx
          if (x < 0 || x >= fine.cols) continue
          const value = fine.cells[y * fine.cols + x]
          if (value === NODATA) continue
          if (dx === 0 && dy === 0) centre = value
          covered += 1
          tally[value] += 1
          if (tally[value] > bestCount) {
            bestCount = tally[value]
            best = value
          }
        }
      }
      cells[row * cols + col] =
        centre !== NODATA ? centre : covered * 2 >= factor * factor ? best : NODATA
    }
  return {
    classes,
    cells,
    cols,
    rows,
    originLon: fine.originLon + half * fine.cellDeg,
    originLat: fine.originLat + half * fine.cellDeg,
    cellDeg: fine.cellDeg * factor,
  }
}

/**
 * What NRCan's own map service answers at these points, read from
 * `.../PlantHardiness_en/MapServer/0/query`. Recorded, so the build stays
 * offline-reproducible; it is the published value the shipped grid is judged against
 */
const NRCAN_PROBES = [
  { name: 'Toronto, Ontario', latitudeDeg: 43.6532, longitudeDeg: -79.3832, published: '7a' },
  {
    name: 'Vancouver, British Columbia',
    latitudeDeg: 49.2827,
    longitudeDeg: -123.1207,
    published: '9a',
  },
  { name: 'Winnipeg, Manitoba', latitudeDeg: 49.8951, longitudeDeg: -97.1384, published: '3b' },
  { name: 'Whitehorse, Yukon', latitudeDeg: 60.7212, longitudeDeg: -135.0568, published: '1b' },
  { name: 'Montreal, Quebec', latitudeDeg: 45.5019, longitudeDeg: -73.5674, published: '5b' },
  { name: 'Halifax, Nova Scotia', latitudeDeg: 44.6488, longitudeDeg: -63.5752, published: '6b' },
  { name: 'Calgary, Alberta', latitudeDeg: 51.0447, longitudeDeg: -114.0719, published: '4a' },
  { name: 'Saskatoon, Saskatchewan', latitudeDeg: 52.1332, longitudeDeg: -106.67, published: '3a' },
  { name: 'Ottawa, Ontario', latitudeDeg: 45.4215, longitudeDeg: -75.6972, published: '5b' },
  { name: 'Quebec City, Quebec', latitudeDeg: 46.8139, longitudeDeg: -71.208, published: '5a' },
  {
    name: "St John's, Newfoundland",
    latitudeDeg: 47.5615,
    longitudeDeg: -52.7126,
    published: '6a',
  },
  { name: 'Iqaluit, Nunavut', latitudeDeg: 63.7467, longitudeDeg: -68.517, published: '0a' },
  {
    name: 'Yellowknife, Northwest Territories',
    latitudeDeg: 62.454,
    longitudeDeg: -114.3718,
    published: '1b',
  },
  {
    name: 'Fredericton, New Brunswick',
    latitudeDeg: 45.9636,
    longitudeDeg: -66.6431,
    published: '5a',
  },
  {
    name: 'Charlottetown, Prince Edward Island',
    latitudeDeg: 46.2382,
    longitudeDeg: -63.1311,
    published: '5b',
  },
]

// ----------------------------------------------------------------- validation

/**
 * Probe sites with independently published classifications, plus two southern-hemisphere and two
 * high-latitude sites
 */
const PROBES = [
  { name: 'Amherst, Massachusetts', latitudeDeg: 42.3732, longitudeDeg: -72.5199 },
  { name: 'Davis, California', latitudeDeg: 38.5449, longitudeDeg: -121.7405 },
  { name: 'Denver, Colorado', latitudeDeg: 39.7392, longitudeDeg: -104.9903 },
  { name: 'Miami, Florida', latitudeDeg: 25.7617, longitudeDeg: -80.1918 },
  { name: 'International Falls, Minnesota', latitudeDeg: 48.6023, longitudeDeg: -93.4108 },
  { name: 'Tucson, Arizona', latitudeDeg: 32.2226, longitudeDeg: -110.9747 },
  { name: 'Berlin, Germany', latitudeDeg: 52.52, longitudeDeg: 13.405 },
  { name: 'Reykjavik, Iceland', latitudeDeg: 64.1466, longitudeDeg: -21.9426 },
  { name: 'Nairobi, Kenya', latitudeDeg: -1.2864, longitudeDeg: 36.8172 },
  { name: 'Christchurch, New Zealand', latitudeDeg: -43.5321, longitudeDeg: 172.6362 },
]

/** Every third source cell in each direction, which is a ninth of the reference raster */
const agreement = ({ shippedAt, sourceAt, cols, rows, lonLatOf, adjacent }) => {
  let compared = 0
  let exact = 0
  let neighbouring = 0
  for (let row = 0; row < rows; row += 3)
    for (let col = 0; col < cols; col += 3) {
      const source = sourceAt(col, row)
      if (source === null) continue
      compared += 1
      const shipped = shippedAt(...lonLatOf(col, row))
      if (shipped === source) exact += 1
      else if (shipped !== null && adjacent(shipped, source)) neighbouring += 1
    }
  const pct = (n) => Number(((n / compared) * 100).toFixed(2))
  return {
    comparedPoints: compared,
    exactPercent: pct(exact),
    adjacentClassPercent: pct(neighbouring),
    otherPercent: pct(compared - exact - neighbouring),
  }
}

// ------------------------------------------------------------------- pipeline

const write = (name, buffer) => {
  mkdirSync(OUT, { recursive: true })
  writeFileSync(new URL(name, OUT), buffer)
  return {
    bytes: buffer.length,
    gzipBytes: gzipSync(buffer, { level: 9 }).length,
    sha256: sha256(buffer),
  }
}

const buildKoppen = async () => {
  const zip = await cached('Beck_KG_V1.zip', BECK_ZIP)
  const entries = unzip(zip, [BECK_COARSE, BECK_FINE])
  const coarse = openTiff(entries.get(BECK_COARSE))
  const fine = openTiff(entries.get(BECK_FINE))
  const grid = gridFromTiff(coarse)
  const file = write('koppen-beck-2018.grid', encodeGrid(grid))
  const probes = PROBES.map((site) => ({
    site: site.name,
    source: koppenAtTiff(fine, site.latitudeDeg, site.longitudeDeg),
    shipped: sampleGrid(grid, site.latitudeDeg, site.longitudeDeg),
  }))
  const sourceAgreement = !validate
    ? null
    : agreement({
        shippedAt: (lat, lon) => sampleGrid(grid, lat, lon),
        sourceAt: (col, row) => {
          const value = fine.at(col, row)
          return value === 0 ? null : KOPPEN_CLASSES[value - 1]
        },
        cols: fine.width,
        rows: fine.height,
        lonLatOf: (col, row) => [
          fine.northDeg - (row + 0.5) * fine.cellDeg,
          fine.westDeg + (col + 0.5) * fine.cellDeg,
        ],
        // a disagreement inside one Koppen major group is a different reading of the same climate
        adjacent: (a, b) => a[0] === b[0],
      })
  return {
    path: 'public/data/koppen-beck-2018.grid',
    citekey: 'beck2018-koppen',
    licence: 'CC BY 4.0',
    attribution: 'Beck et al. 2018, Koppen-Geiger 1 km',
    source: {
      landing:
        'https://figshare.com/articles/dataset/Present_and_future_K_ppen-Geiger_climate_classification_maps_at_1-km_resolution/6396959',
      doi: '10.6084/m9.figshare.6396959',
      download: BECK_ZIP,
      entry: BECK_COARSE,
      retrieved: RETRIEVED,
      sha256: sha256(zip),
    },
    processing: [
      `read ${BECK_COARSE}, the 5 arcmin (0.0833 deg) present-day classification Beck et al. publish alongside the 1 km raster`,
      'no resampling: the shipped cells are the published 5 arcmin cells, flipped to south-up',
      'class 0 (ocean and no data) becomes the no-data sentinel; classes 1-30 keep the published legend order',
      'row-predicted varint run-length coding, see docs/STATIC-LAYERS.md',
    ],
    resolution: {
      shippedCellDeg: grid.cellDeg,
      sourceCellDeg: fine.cellDeg,
      note: 'the 1 km raster is 933 megapixels and cannot be bundled; the published 5 arcmin aggregate is what ships',
    },
    grid: { cols: grid.cols, rows: grid.rows },
    file,
    probes,
    sourceAgreement,
  }
}

const buildHardiness = async () => {
  const zip = await cached('phzm_us_grid_2023.zip', PHZM_ZIP)
  const entries = unzip(zip, [PHZM_BIL, PHZM_HDR, PHZM_TERMS])
  const bil = readBil(entries.get(PHZM_HDR), entries.get(PHZM_BIL))
  const grid = gridFromBil(bil, PHZM_CELL_DEG)
  const file = write('usda-phzm-2023.grid', encodeGrid(grid))
  const probes = PROBES.map((site) => ({
    site: site.name,
    source: phzmZoneAt(bil, site.latitudeDeg, site.longitudeDeg),
    shipped: sampleGrid(grid, site.latitudeDeg, site.longitudeDeg),
  }))
  const rank = new Map(grid.classes.map((zone, index) => [zone, index]))
  const sourceAgreement = !validate
    ? null
    : agreement({
        shippedAt: (lat, lon) => sampleGrid(grid, lat, lon),
        sourceAt: (col, row) => {
          const fahrenheit = bil.at(col, row)
          return fahrenheit === null ? null : usdaZoneLabel(usdaHalfZoneIndex(fahrenheit))
        },
        cols: bil.cols,
        rows: bil.rows,
        lonLatOf: (col, row) => [bil.northDeg - row * bil.cellDeg, bil.westDeg + col * bil.cellDeg],
        // half-zone bands are ordered, so a boundary that moved lands in the neighbouring band
        adjacent: (a, b) => Math.abs(rank.get(a) - rank.get(b)) === 1,
      })
  return {
    path: 'public/data/usda-phzm-2023.grid',
    citekey: 'usda-phzm-2023',
    licence: 'OSU retains ownership; free reproduction and redistribution under the terms below',
    attribution: 'USDA-ARS and Oregon State University PRISM Climate Group',
    licenceConditions: entries.get(PHZM_TERMS).toString('utf8').trim(),
    disclaimerRequired: true,
    source: {
      landing: 'https://prism.oregonstate.edu/phzm/',
      download: PHZM_ZIP,
      entry: PHZM_BIL,
      mirror:
        'https://agdatacommons.nal.usda.gov/articles/dataset/2023_USDA_Plant_Hardiness_Zone_Map_Mean_Annual_Extreme_Low_Temperature_Rasters/25343293',
      retrieved: RETRIEVED,
      sha256: sha256(zip),
    },
    processing: [
      `read ${PHZM_BIL}, the 30 arcsec (800 m) 1991-2020 mean annual extreme minimum temperature in degF`,
      `nearest-neighbour resample of the cell centres to ${String(PHZM_CELL_DEG)} deg`,
      'classify each resampled value into the published 5 degF half-zones counted from -60 degF',
      'row-predicted varint run-length coding, see docs/STATIC-LAYERS.md',
    ],
    resolution: {
      shippedCellDeg: PHZM_CELL_DEG,
      sourceCellDeg: bil.cellDeg,
      note: 'CONUS only. Alaska, Hawaii and Puerto Rico are separate PRISM grids and are not bundled, so those sites fall through to the Open-Meteo derivation',
    },
    grid: { cols: grid.cols, rows: grid.rows, classes: grid.classes },
    file,
    probes,
    sourceAgreement,
  }
}

const buildNrcan = async () => {
  const zip = await cached('PlantHardinessZones_SHP_EN.zip', NRCAN_ZIP)
  const entries = unzip(zip, [NRCAN_SHP, NRCAN_DBF])
  const { features, bounds } = nrcanFeatures(entries.get(NRCAN_SHP), entries.get(NRCAN_DBF))
  const classes = features.map((feature) => feature.zone)
  const grid = downsampleMajority(
    scanConvert(features, bounds, NRCAN_CELL_DEG / NRCAN_SUBCELLS),
    NRCAN_SUBCELLS,
    classes,
  )
  const file = write('nrcan-hardiness.grid', encodeGrid(grid))
  const probes = NRCAN_PROBES.map((site) => ({
    site: site.name,
    published: site.published,
    source: nrcanZoneAtPoint(features, site.latitudeDeg, site.longitudeDeg),
    shipped: sampleGrid(grid, site.latitudeDeg, site.longitudeDeg),
  }))
  const rank = new Map(classes.map((zone, index) => [zone, index]))
  const sourceAgreement = !validate
    ? null
    : (() => {
        const reference = scanConvert(features, bounds, NRCAN_REFERENCE_DEG)
        return agreement({
          shippedAt: (lat, lon) => sampleGrid(grid, lat, lon),
          sourceAt: (col, row) => {
            const value = reference.cells[row * reference.cols + col]
            return value === NODATA ? null : classes[value]
          },
          cols: reference.cols,
          rows: reference.rows,
          lonLatOf: (col, row) => [
            reference.originLat + row * reference.cellDeg,
            reference.originLon + col * reference.cellDeg,
          ],
          // the zones are an ordered ladder, so a boundary that moved lands in the next rung
          adjacent: (a, b) => Math.abs(rank.get(a) - rank.get(b)) === 1,
        })
      })()
  return {
    path: 'public/data/nrcan-hardiness.grid',
    citekey: 'mckenney2025-canada-zones',
    licence: 'Open Government Licence - Canada',
    attribution:
      'Contains information licensed under the Open Government Licence - Canada: Plant Hardiness Zones of Canada, Natural Resources Canada',
    scheme: 'nrcan',
    schemeNote:
      'a composite index of seven climate variables (Ouellet and Sherk 1967, reinterpolated by McKenney et al.), not a winter minimum temperature. No temperature is derivable from a zone label and none is recorded here',
    source: {
      landing: 'https://open.canada.ca/data/en/dataset/adda404d-93e4-48e9-b6bf-5d1d3952ff22',
      download: NRCAN_ZIP,
      entry: NRCAN_SHP,
      service:
        'https://maps-cartes.services.geo.ca/server_serveur/rest/services/NRCan/PlantHardiness_en/MapServer/0',
      retrieved: RETRIEVED,
      sha256: sha256(zip),
    },
    processing: [
      `read ${NRCAN_SHP}, the 4th edition 1991-2020 zone polygons, and the ${NRCAN_ZONE_FIELD} column of ${NRCAN_DBF}`,
      'unproject every vertex from EPSG:3978 Lambert conformal conic to lon/lat, so the raster is built in the frame the app samples',
      `scan-convert the rings at ${String(NRCAN_CELL_DEG / NRCAN_SUBCELLS)} deg, then take each ${String(NRCAN_CELL_DEG)} deg cell from its centre subcell, or from the majority of its ${String(NRCAN_SUBCELLS ** 2)} subcells when the centre is uncovered and the cell is at least half covered`,
      'row-predicted varint run-length coding, see docs/STATIC-LAYERS.md',
    ],
    resolution: {
      shippedCellDeg: NRCAN_CELL_DEG,
      referenceCellDeg: NRCAN_REFERENCE_DEG,
      note: 'the source is vector, so there is no native cell size; agreement is measured against a 0.005 deg rasterisation of the same polygons',
    },
    grid: { cols: grid.cols, rows: grid.rows, classes },
    file,
    probes,
    sourceAgreement,
  }
}

const NOT_SHIPPED = [
  {
    layer: 'OPHZ, Oregon PRISM Hardiness Zones',
    source: 'https://github.com/kgjenkins/ophz',
    licence: 'Open Data Commons PDDL v1.0',
    reason:
      'OPHZ is traced from the 2012 USDA map image, not the 2023 one its own README links, and the shipped scheme is usda-2023. Amherst MA reads 5b from OPHZ and 6a from the 2023 PRISM grid, so bundling it would have labelled 2012 zones as 2023. The official 2023 PRISM raster ships instead',
  },
]

// merged into the existing file, because `scripts/fetch-plant-traits.mjs` keeps its own layer in
// the same file and rebuilding these three costs a gigabyte of upstream rasters
const manifest = writeManifest(new URL('manifest.json', OUT), {
  generator: 'scripts/fetch-static-layers.mjs',
  generatedAt: RETRIEVED,
  format: 'AGDG v1, see docs/STATIC-LAYERS.md',
  validated: validate,
  notShipped: NOT_SHIPPED,
  layers: [await buildKoppen(), await buildHardiness(), await buildNrcan()],
})

// this run's layers only: the manifest also carries the botanical grid, which another script owns
for (const layer of manifest.layers.filter(
  (entry) => entry.generator === 'scripts/fetch-static-layers.mjs',
)) {
  console.log(
    `${layer.path}  ${(layer.file.bytes / 1e3).toFixed(0)} kB on disk, ${(layer.file.gzipBytes / 1e3).toFixed(0)} kB gzipped, ${String(layer.grid.cols)}x${String(layer.grid.rows)} cells`,
  )
  for (const probe of layer.probes)
    console.log(
      `  ${probe.site}: source ${probe.source}, shipped ${probe.shipped}${probe.published === undefined ? '' : `, published ${probe.published}`}`,
    )
  if (layer.sourceAgreement !== null) console.log(' ', JSON.stringify(layer.sourceAgreement))
}
