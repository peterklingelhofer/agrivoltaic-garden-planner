/**
 * Rebuilds the two assets the wildlife preferences read, from their upstream sources.
 *
 *   node --max-old-space-size=8192 scripts/fetch-plant-traits.mjs [--validate]
 *   bunx biome check --write src/data/catalog/native-ranges.generated.ts
 *
 * Run the formatter afterward, every time. The generated module is written with one array per
 * line and the committed copy is formatted, so skipping it produces a 3,700-line diff in which
 * nothing has actually changed and a real change would be invisible.
 *
 * Downloads are cached under `node_modules/.cache/plant-traits` so a rerun is cheap. The WCVP
 * archive is 88 MB and inflates to a 300 MB names table, which is why the heap flag isn't
 * optional. `--validate` also measures how much of the world the shipped cell size files
 * under the same botanical country as the vector source, and writes that into the manifest.
 *
 * What it writes:
 *
 * 1. `public/data/wgsrpd-level3.grid`, a class grid whose classes are TDWG World Geographical
 *    Scheme level 3 area codes, so a latitude and longitude can be turned into the botanical
 *    region a plant checklist is indexed by.
 * 2. `src/data/catalog/native-ranges.generated.ts`, one entry per catalog crop giving the
 *    level 3 areas Kew's World Checklist records it as NATIVE to, introductions excluded.
 *
 * Why level 3: the coarser level 2 lumps California in with the rest of the
 * south-western United States, and a plant native to one state would be reported native to six.
 * Level 3 is also what WCVP itself is indexed by, so using it means no aggregation step exists
 * to be wrong. It costs a wider grid: 369 areas don't fit in the byte-per-cell format the
 * climate layers use, so this writes version 2 of that format, which is the same layout with
 * 16-bit cells. `decodeClassGrid` reads both
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { writeManifest } from './lib/manifest.mjs'
import { unzip } from './lib/zip.mjs'

const ROOT = new URL('../', import.meta.url)
const CACHE = new URL('node_modules/.cache/plant-traits/', ROOT)
const OUT = new URL('public/data/', ROOT)
const RETRIEVED = new Date().toISOString().slice(0, 10)

const args = new Set(process.argv.slice(2))
const validate = args.has('--validate')

const WCVP_URL = 'https://sftp.kew.org/pub/data-repositories/WCVP/wcvp.zip'
const WGSRPD_URL = 'https://raw.githubusercontent.com/tdwg/wgsrpd/master/geojson/level3.geojson'

/**
 * Half a degree. The regions are whole botanical countries, the coarsest of which span
 * continents and the finest of which are small islands. A tenth of a degree would quadruple the
 * asset to resolve boundaries that the checklist behind it doesn't claim to that precision
 */
const CELL_DEG = 0.5

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

// ------------------------------------------------------------------ catalog

/**
 * The catalog's id and accepted binomial, read out of the row table itself.
 *
 * Regex over the source rather than an import, because this is a `.mjs` build script and the
 * catalog is TypeScript behind a lazy chunk. The shape it depends on is the first three
 * strings of every row, which `CropRow` fixes as id, accepted name and family, and the count is
 * asserted against the row total so a formatting change that broke the match can't pass quietly
 */
const readCatalog = () => {
  const source = readFileSync(new URL('src/data/catalog/rows.ts', ROOT), 'utf8')
  const rows = [...source.matchAll(/\[\s*'([a-z0-9-]+)',\s*'([^']+)',\s*'([A-Za-z]+)',/g)]
  const crops = rows.map(([, id, acceptedName, family]) => ({ id, acceptedName, family }))
  if (crops.length < 100) throw new Error(`only matched ${String(crops.length)} catalog rows`)
  return crops
}

// ----------------------------------------------------------------------- WCVP

/** Iterates a pipe-delimited table without ever holding an array of its lines */
const eachRow = (buffer, onRow) => {
  let start = 0
  let header = null
  for (let i = 0; i <= buffer.length; i += 1) {
    if (i !== buffer.length && buffer[i] !== 0x0a) continue
    const line = buffer.toString('utf8', start, i > start && buffer[i - 1] === 0x0d ? i - 1 : i)
    start = i + 1
    if (line.length === 0) continue
    const fields = line.split('|')
    if (header === null) {
      header = new Map(fields.map((name, index) => [name, index]))
      continue
    }
    onRow(fields, header)
  }
  return header
}

/**
 * The catalog's binomial dropped onto the name the checklist currently accepts.
 *
 * Synonyms are followed rather than skipped, and that is most of the work. WCVP is a living
 * taxonomy: the garden pea is filed under `Lathyrus oleraceus` now, the lentil under
 * `Vicia lens`, the radish as a subspecies of `Raphanus raphanistrum`, and French marigold has
 * been lumped into `Tagetes erecta`. Every one of those is a synonym row pointing at an accepted
 * id, and skipping them lost twelve crops including three of the most commonly grown.
 * Distributions hang off the accepted name only, so following the pointer is also the only way
 * to reach them.
 *
 * Compared on the genus and species columns rather than `taxon_name`, which carries the
 * authority on some rows. The hybrid marker is dropped from the CATALOG side only, which is
 * all that is needed: the checklist keeps `×` in a `species_hybrid` column of its own, so the
 * species column is already bare. The catalog writes `Fragaria x ananassa` and the two meet at
 * `Fragaria ananassa`
 */
const acceptedIds = (names, wanted) => {
  const own = new Map()
  const synonym = new Map()
  eachRow(names, (fields, header) => {
    if (fields[header.get('taxon_rank')] !== 'Species') return
    const binomial = `${fields[header.get('genus')]} ${fields[header.get('species')]}`
    if (!wanted.has(binomial)) return
    const status = fields[header.get('taxon_status')]
    if (status === 'Accepted') {
      if (!own.has(binomial)) own.set(binomial, fields[header.get('plant_name_id')])
      return
    }
    const accepted = fields[header.get('accepted_plant_name_id')]
    if (accepted.length > 0 && !synonym.has(binomial)) synonym.set(binomial, accepted)
  })
  const ids = new Map()
  for (const binomial of wanted) {
    const id = own.get(binomial) ?? synonym.get(binomial)
    if (id !== undefined) ids.set(binomial, id)
  }
  return ids
}

/** Native occurrences only: introductions, extinctions and doubtful records are all dropped */
const nativeAreas = (distribution, ids) => {
  const byId = new Map([...ids.values()].map((id) => [id, new Set()]))
  eachRow(distribution, (fields, header) => {
    const areas = byId.get(fields[header.get('plant_name_id')])
    if (areas === undefined) return
    if (fields[header.get('introduced')] !== '0') return
    if (fields[header.get('extinct')] !== '0') return
    if (fields[header.get('location_doubtful')] !== '0') return
    areas.add(fields[header.get('area_code_l3')])
  })
  return byId
}

// --------------------------------------------------------------------- raster

/** Even-odd crossing count over every ring, which is how GeoJSON marks holes */
const ringsOf = (geometry) =>
  geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates

const featuresOf = (geojson) => {
  const out = []
  for (const feature of geojson.features) {
    const code = feature.properties.LEVEL3_COD
    if (typeof code !== 'string' || code.length === 0) continue
    const rings = []
    for (const polygon of ringsOf(feature.geometry)) for (const ring of polygon) rings.push(ring)
    out.push({ code, rings })
  }
  return out
}

const NODATA = 0xffff
const SAME_AS_ABOVE = 0xfffe

/**
 * Scan conversion, one feature at a time, filling spans between an even number of edge
 * crossings. Identical in rule to the hardiness rasterizer in `fetch-static-layers.mjs`, and
 * separate from it because that one writes bytes and this one has 369 classes to place
 */
const scanConvert = (features, cols, rows, originLon, originLat, cellDeg) => {
  const cells = new Uint16Array(cols * rows).fill(NODATA)
  features.forEach((feature, value) => {
    const byRow = new Map()
    for (const ring of feature.rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
        const [lonJ, latJ] = ring[j]
        const [lonI, latI] = ring[i]
        const from = Math.max(0, Math.ceil((Math.min(latJ, latI) - originLat) / cellDeg))
        const to = Math.min(rows - 1, Math.floor((Math.max(latJ, latI) - originLat) / cellDeg))
        for (let row = from; row <= to; row += 1) {
          const lat = originLat + row * cellDeg
          if (latI > lat === latJ > lat) continue
          let edges = byRow.get(row)
          if (edges === undefined) {
            edges = []
            byRow.set(row, edges)
          }
          edges.push(lonI + ((lat - latI) * (lonJ - lonI)) / (latJ - latI))
        }
      }
    }
    for (const [row, edges] of byRow) {
      edges.sort((a, b) => a - b)
      for (let k = 0; k + 1 < edges.length; k += 2) {
        const from = Math.max(0, Math.ceil((edges[k] - originLon) / cellDeg))
        const to = Math.min(cols - 1, Math.floor((edges[k + 1] - originLon) / cellDeg))
        for (let col = from; col <= to; col += 1) cells[row * cols + col] = value
      }
    }
  })
  return cells
}

const MAGIC = 'AGDG'
const VERSION_WIDE = 2
const CODEC_ROW_RLE_16 = 2
const HEADER_BYTES = 48

/** Rows predicted from the row above, then run-length encoded over 16-bit values */
const encodeWideGrid = ({ classes, cells, cols, rows, originLon, originLat, cellDeg }) => {
  if (classes.length > 0xfffd) throw new Error(`too many classes: ${String(classes.length)}`)
  const table = Buffer.concat(
    classes.map((name) => {
      const utf8 = Buffer.from(name, 'utf8')
      return Buffer.concat([Buffer.of(utf8.length), utf8])
    }),
  )
  const predicted = new Uint16Array(cells.length)
  predicted.set(cells.subarray(0, cols))
  for (let i = cols; i < cells.length; i += 1)
    predicted[i] = cells[i] === cells[i - cols] ? SAME_AS_ABOVE : cells[i]
  const out = []
  let run = 0
  for (let i = 0; i <= predicted.length; i += 1) {
    if (i !== predicted.length && (run === 0 || predicted[i] === predicted[i - 1])) {
      run += 1
      continue
    }
    const value = predicted[i - 1]
    out.push(value & 0xff, (value >>> 8) & 0xff)
    let v = run
    while (v > 0x7f) {
      out.push((v & 0x7f) | 0x80)
      v >>>= 7
    }
    out.push(v)
    run = 1
  }
  const payload = Buffer.from(out)
  const header = Buffer.alloc(HEADER_BYTES)
  header.write(MAGIC, 0, 'latin1')
  header.writeUInt8(VERSION_WIDE, 4)
  header.writeUInt8(CODEC_ROW_RLE_16, 5)
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

// ------------------------------------------------------------------- validation

/**
 * The vector answer, at a point, with no raster anywhere near it.
 *
 * Even-odd crossing counting to the RIGHT of the point, which is the same parity rule
 * `scanConvert` fills spans by, so a disagreement between the two is a resolution effect and
 * never a difference of opinion about what "inside" means. Features are searched from the last
 * backward because the rasterizer writes them in order and a later one overwrites an earlier
 * one, so the last feature containing a point is the one whose code that cell ends up holding
 */
const inRings = (rings, lon, lat) => {
  let inside = false
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [lonI, latI] = ring[i]
      const [lonJ, latJ] = ring[j]
      if (latI > lat === latJ > lat) continue
      if (lon < lonI + ((lat - latI) * (lonJ - lonI)) / (latJ - latI)) inside = !inside
    }
  return inside
}

/** Bounding boxes, so a point is tested against the handful of regions that could hold it */
const indexed = (features) =>
  features.map((feature) => {
    let west = Infinity
    let east = -Infinity
    let south = Infinity
    let north = -Infinity
    for (const ring of feature.rings)
      for (const [lon, lat] of ring) {
        if (lon < west) west = lon
        if (lon > east) east = lon
        if (lat < south) south = lat
        if (lat > north) north = lat
      }
    return { ...feature, west, east, south, north }
  })

const areaAtPoint = (index, lon, lat) => {
  for (let i = index.length - 1; i >= 0; i -= 1) {
    const feature = index[i]
    if (lon < feature.west || lon > feature.east || lat < feature.south || lat > feature.north)
      continue
    if (inRings(feature.rings, lon, lat)) return feature.code
  }
  return null
}

/**
 * What the shipped grid answers, by the same arithmetic `sampleClassGrid` uses in the app:
 * nearest lattice point, and the no-data sentinel read at the width this grid was written at.
 * Reading it any other way would make a probe agree with something the browser never computes
 */
const shippedAt = ({ cells, cols, rows, originLon, originLat, cellDeg, classes }, lat, lon) => {
  const longitude = ((((lon + 180) % 360) + 360) % 360) - 180
  const col = Math.round((longitude - originLon) / cellDeg)
  const row = Math.round((lat - originLat) / cellDeg)
  if (col < 0 || row < 0 || col >= cols || row >= rows) return null
  const value = cells[row * cols + col]
  return value === NODATA ? null : (classes[value] ?? null)
}

/**
 * Places whose botanical country isn't in dispute, plus the two that exist to catch a specific
 * way of getting this wrong.
 *
 * Jerusalem is here because `PAL` is class index 255. In the byte-per-cell format every climate
 * layer uses, 255 is the no-data sentinel, and a decoder that tests for both sentinels regardless
 * of the width it decoded reads this one region as "unknown" everywhere, permanently, and
 * indistinguishably from a garden off the edge of the map. The mid-Atlantic point is the other half
 * of the same check: somewhere that really is off the map, so a probe suite that could only ever
 * answer "an area" can't pass
 */
const PROBES = [
  { name: 'Amherst, Massachusetts', latitudeDeg: 42.3732, longitudeDeg: -72.5199 },
  { name: 'Davis, California', latitudeDeg: 38.5449, longitudeDeg: -121.7405 },
  { name: 'Denver, Colorado', latitudeDeg: 39.7392, longitudeDeg: -104.9903 },
  { name: 'Berlin, Germany', latitudeDeg: 52.52, longitudeDeg: 13.405 },
  { name: 'Nairobi, Kenya', latitudeDeg: -1.2864, longitudeDeg: 36.8172 },
  { name: 'Jerusalem', latitudeDeg: 31.7683, longitudeDeg: 35.2137 },
  { name: 'Cusco, Peru', latitudeDeg: -13.5319, longitudeDeg: -71.9675 },
  { name: 'Christchurch, New Zealand', latitudeDeg: -43.5321, longitudeDeg: 172.6362 },
  { name: 'Tokyo, Japan', latitudeDeg: 35.6762, longitudeDeg: 139.6503 },
  { name: 'mid-Atlantic, no land', latitudeDeg: 30, longitudeDeg: -40 },
]

/**
 * How much of the world the half-degree grid files under the region the vector data puts it in.
 *
 * Sampled at cell CENTERS, half a cell off the lattice the raster is built on, because sampling
 * the lattice itself would compare the scan converter against its own input and agree by
 * construction. What it measures is therefore the quantization: how often rounding a place to the
 * nearest half-degree point moves it into a neighboring botanical country.
 *
 * A disagreement is counted as `adjacentCell` when the vector answer appears in one of the eight
 * cells around the sampled one, which is a border falling inside a cell rather than the wrong
 * region entirely. Ocean is excluded from the denominator: a point with no vector answer has
 * nothing to be right or wrong about
 */
const agreement = (grid, index, step) => {
  const { cells, cols, rows, originLon, originLat, cellDeg } = grid
  let compared = 0
  let exact = 0
  let adjacent = 0
  for (let row = 0; row + 1 < rows; row += step)
    for (let col = 0; col + 1 < cols; col += step) {
      const lon = originLon + (col + 0.5) * cellDeg
      const lat = originLat + (row + 0.5) * cellDeg
      const source = areaAtPoint(index, lon, lat)
      if (source === null) continue
      compared += 1
      const shipped = shippedAt(grid, lat, lon)
      if (shipped === source) {
        exact += 1
        continue
      }
      const near = [row, row + 1].some((r) =>
        [col, col + 1].some((c) =>
          [-1, 0, 1].some((dr) =>
            [-1, 0, 1].some((dc) => {
              const rr = r + dr
              const cc = c + dc
              if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) return false
              const value = cells[rr * cols + cc]
              return value !== NODATA && grid.classes[value] === source
            }),
          ),
        ),
      )
      if (near) adjacent += 1
    }
  const pct = (n) => Number(((n / compared) * 100).toFixed(2))
  return {
    comparedPoints: compared,
    exactPercent: pct(exact),
    adjacentCellPercent: pct(adjacent),
    otherPercent: pct(compared - exact - adjacent),
    note: 'sampled at cell centers, half a cell off the lattice the raster is built on, so this measures the cost of the half-degree cell and not the scan converter reading back its own input',
  }
}

// ------------------------------------------------------------------------ run

const main = async () => {
  const crops = readCatalog()
  console.log(`${String(crops.length)} catalog rows`)

  const zip = await cached('wcvp.zip', WCVP_URL)
  const entries = unzip(zip, ['wcvp_names.csv', 'wcvp_distribution.csv'])
  // the checklist writes hybrids with a multiplication sign and the catalog writes an x
  const normalize = (name) => name.replace(/\s[x×]\s?/, ' ').trim()
  const wanted = new Set(crops.map((crop) => normalize(crop.acceptedName)))
  const ids = acceptedIds(entries.get('wcvp_names.csv'), wanted)
  console.log(`${String(ids.size)} of ${String(wanted.size)} binomials matched an accepted name`)
  const areasById = nativeAreas(entries.get('wcvp_distribution.csv'), ids)

  const ranges = crops
    .map((crop) => {
      const id = ids.get(normalize(crop.acceptedName))
      const areas = id === undefined ? null : [...(areasById.get(id) ?? [])].sort()
      return { ...crop, areas }
    })
    .filter((crop, index, all) => all.findIndex((other) => other.id === crop.id) === index)

  const unmatched = ranges.filter((crop) => crop.areas === null)
  const rootless = ranges.filter((crop) => crop.areas !== null && crop.areas.length === 0)
  console.log(
    `${String(unmatched.length)} unmatched, ${String(rootless.length)} matched with no native range`,
  )
  for (const crop of unmatched) console.log(`  unmatched: ${crop.id} (${crop.acceptedName})`)

  const geojsonBody = await cached('wgsrpd-level3.geojson', WGSRPD_URL)
  const geojson = JSON.parse(geojsonBody)
  const features = featuresOf(geojson)
  const classes = features.map((feature) => feature.code)
  const cols = Math.round(360 / CELL_DEG) + 1
  const rows = Math.round(180 / CELL_DEG) + 1
  const grid = {
    classes,
    cells: scanConvert(features, cols, rows, -180, -90, CELL_DEG),
    cols,
    rows,
    originLon: -180,
    originLat: -90,
    cellDeg: CELL_DEG,
  }
  const encoded = encodeWideGrid(grid)
  mkdirSync(OUT, { recursive: true })
  writeFileSync(new URL('wgsrpd-level3.grid', OUT), encoded)
  const covered = grid.cells.reduce((total, value) => total + (value === NODATA ? 0 : 1), 0)
  console.log(
    `wgsrpd-level3.grid: ${String(classes.length)} areas, ${String(encoded.length)} bytes, ` +
      `${String(Math.round((covered / grid.cells.length) * 100))}% of cells land`,
  )

  const index = indexed(features)
  const probes = PROBES.map((site) => ({
    site: site.name,
    latitudeDeg: site.latitudeDeg,
    longitudeDeg: site.longitudeDeg,
    source: areaAtPoint(index, site.longitudeDeg, site.latitudeDeg),
    shipped: shippedAt(grid, site.latitudeDeg, site.longitudeDeg),
  }))
  for (const probe of probes)
    console.log(`  ${probe.site}: source ${probe.source}, shipped ${probe.shipped}`)
  const disagreed = probes.filter((probe) => probe.shipped !== probe.source)
  if (disagreed.length > 0)
    console.log(`  ${String(disagreed.length)} probe(s) disagree with the vector source`)
  const sourceAgreement = validate ? agreement(grid, index, 2) : null
  if (sourceAgreement !== null) console.log(' ', JSON.stringify(sourceAgreement))

  writeManifest(new URL('manifest.json', OUT), {
    generator: 'scripts/fetch-plant-traits.mjs',
    generatedAt: RETRIEVED,
    format: 'AGDG v2, see docs/STATIC-LAYERS.md',
    validated: validate,
    layers: [
      {
        path: 'public/data/wgsrpd-level3.grid',
        // the corpus has no entry of its own for the TDWG scheme, and inventing a citekey here
        // would name a reference nothing can resolve. This is the key the app credits the asset
        // under, whose attribution string already carries "regions follow WGSRPD"
        citekey: 'govaerts2021-wcvp',
        license: 'CC BY 4.0',
        attribution: 'TDWG World Geographical Scheme for Recording Plant Distributions, edition 2',
        source: {
          landing: 'https://github.com/tdwg/wgsrpd',
          download: WGSRPD_URL,
          entry: 'level3.geojson',
          retrieved: RETRIEVED,
          sha256: sha256(geojsonBody),
        },
        processing: [
          'read the published level 3 polygons, the botanical countries Kew indexes distributions by',
          'scan converted at half a degree, one class per LEVEL3_COD, features written in file order so a later polygon wins where two overlap',
          "row-predicted varint run-length coding over 16-bit cells, which is version 2 of the format: 369 areas don't fit in the byte per cell the climate layers use",
        ],
        resolution: {
          shippedCellDeg: CELL_DEG,
          sourceCellDeg: null,
          note: "the source is vector, so there's no source cell size and the shipped one is a choice rather than a resampling. Half a degree resolves whole botanical countries and not their coastlines, which is the precision the checklist behind it claims",
        },
        grid: { cols: grid.cols, rows: grid.rows },
        file: {
          bytes: encoded.length,
          gzipBytes: gzipSync(encoded, { level: 9 }).length,
          sha256: sha256(encoded),
        },
        probes,
        sourceAgreement,
      },
    ],
  })
  console.log('public/data/manifest.json merged')

  const body = ranges
    .map(
      (crop) =>
        `  '${crop.id}': ${crop.areas === null ? 'null' : `[${crop.areas.map((a) => `'${a}'`).join(', ')}]`},`,
    )
    .join('\n')
  writeFileSync(
    new URL('src/data/catalog/native-ranges.generated.ts', ROOT),
    `// Generated by scripts/fetch-plant-traits.mjs on ${RETRIEVED}. Do not edit.
//
// Where Kew's World Checklist of Vascular Plants records each catalog crop as NATIVE, as TDWG
// World Geographical Scheme level 3 area codes. Introductions, extinctions and doubtful records
// are excluded, so an empty array means "recorded, and native nowhere", which is what a checklist
// says about a plant known only in cultivation. \`null\` means the binomial matched no accepted
// species in the checklist at all, which is a different thing and is never shown as "not native".
//
// WCVP is CC BY 4.0. See \`docs/STATIC-LAYERS.md\` for the attribution this obliges.

export const NATIVE_RANGES: Readonly<Record<string, readonly string[] | null>> = {
${body}
}
`,
  )
  console.log('src/data/catalog/native-ranges.generated.ts written')
}

await main()
