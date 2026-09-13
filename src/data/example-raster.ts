import type { Extent2D, GridSpec } from '../types/geo'
import type { DliRaster, RasterQuality, TimeWindowSampling } from '../types/light'
import type { ByMonth, Meters } from '../types/units'
import { at } from './util'

/**
 * `AGDR v1`, the wire form of one baked `DliRaster`.
 *
 * A raster is 27 Float32Arrays plus two more per time window, and at the app's final cell size
 * that is tens of megabytes: far past what a first-paint asset can cost. Three things make it
 * small, and each one is a stated loss rather than a silent one.
 *
 * 1. **Per-slice quantisation to `CODE_MAX + 1` levels.** Every slice carries its own minimum and
 *    maximum and its cells become codes between them, so the round-trip error is bounded by half
 *    a step of that slice's own range. `quantisationErrorOf` measures the realised error rather
 *    than asserting it, and the generator records what it measured beside the asset.
 * 2. **A raster-order predictor.** A cell is coded against the cell to its left, and the first
 *    cell of a row against the cell above it, so a field that varies smoothly across the shade
 *    band costs a small delta per cell instead of two bytes.
 * 3. **Zigzag varints with a zero-run escape.** A non-zero delta is `zigzag(delta) + 1`, which is
 *    one byte for anything within 63 steps; a token of 0 introduces a run of unchanged cells and
 *    costs one byte plus its length. That escape is what pays for the format: thirteen of the
 *    twenty-seven slices are open-sky fields with no panel above them, uniform across the whole
 *    grid, and they collapse from a byte per cell to a handful of bytes each.
 *
 * No decompression stream is needed in the browser and the file still gzips on the way out,
 * which is the same trade `scripts/fetch-static-layers.mjs` made for the climate grids
 */
const MAGIC = 'AGDR'
const VERSION = 1
const CODEC_DELTA_VARINT = 1
const HEADER_BYTES = 64
const CODE_MAX = 4095
const VARINT_MAX_SHIFT = 28
const MONTHS = 12

/** The slices, in the order they are written. Fixed except for the window pair count */
export const sliceCountFor = (windowCount: number): number => 3 + MONTHS * 2 + windowCount * 2

export interface EncodedRasterMeta {
  readonly quality: RasterQuality
  readonly windows: readonly TimeWindowSampling[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/* --------------------------------- varint --------------------------------- */

const pushVarint = (out: number[], value: number): void => {
  let v = value >>> 0
  while (v > 0x7f) {
    out.push((v & 0x7f) | 0x80)
    v >>>= 7
  }
  out.push(v)
}

const zigzag = (value: number): number => (value << 1) ^ (value >> 31)
const unzigzag = (value: number): number => (value >>> 1) ^ -(value & 1)

/* --------------------------------- encoding -------------------------------- */

const quantise = (values: Float32Array): { codes: Uint16Array; min: number; max: number } => {
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < values.length; i += 1) {
    const v = at(values, i)
    if (!Number.isFinite(v)) continue
    if (v < min) min = v
    if (v > max) max = v
  }
  if (!Number.isFinite(min)) {
    min = 0
    max = 0
  }
  const span = max - min
  const codes = new Uint16Array(values.length)
  if (span > 0) {
    for (let i = 0; i < values.length; i += 1) {
      const v = at(values, i)
      codes[i] = Math.round(((Number.isFinite(v) ? v : min) - min) * (CODE_MAX / span))
    }
  }
  return { codes, min, max }
}

const bufferOf = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

const predictorAt = (codes: Uint16Array, index: number, cols: number): number => {
  if (index === 0) return 0
  return index % cols === 0 ? at(codes, index - cols) : at(codes, index - 1)
}

/** Every Float32Array in one raster, in the order the format writes them */
export const rasterSlices = (raster: DliRaster): readonly Float32Array[] => [
  raster.skyViewFactor,
  raster.annualUnderArrayMolM2Day,
  raster.annualOpenSkyMolM2Day,
  ...raster.monthlyUnderArrayMolM2Day,
  ...raster.monthlyOpenSkyMolM2Day,
  ...raster.windows.flatMap((window) => [window.underArrayMolM2Day, window.openSkyMolM2Day]),
]

/**
 * The largest absolute round-trip error the encoding introduces, measured by encoding and
 * decoding rather than by predicting: what the generator records beside the asset is then the
 * error a reader actually gets, quantisation and float32 storage together. Returns Infinity if
 * the pair does not round-trip at all, which no caller should ever be able to ship past
 */
export const quantisationErrorOf = (raster: DliRaster): number => {
  const back = decodeExampleRaster(bufferOf(encodeExampleRaster(raster)))
  if (back === null) return Number.POSITIVE_INFINITY
  const decoded = rasterSlices(back)
  let worst = 0
  for (const [index, slice] of rasterSlices(raster).entries()) {
    const other = decoded[index]
    if (other === undefined) return Number.POSITIVE_INFINITY
    for (let i = 0; i < slice.length; i += 1) {
      const error = Math.abs(at(other, i) - at(slice, i))
      if (error > worst) worst = error
    }
  }
  return worst
}

export const encodeExampleRaster = (raster: DliRaster): Uint8Array => {
  const { cols, rows } = raster.grid
  const cells = cols * rows
  const slices = rasterSlices(raster)
  if (slices.length !== sliceCountFor(raster.windows.length)) {
    throw new Error('raster slice count does not match its window count')
  }
  for (const slice of slices) {
    if (slice.length !== cells) throw new Error('raster slice does not match its grid')
  }

  const scales = new Float32Array(slices.length * 2)
  const payload: number[] = []
  for (const [index, slice] of slices.entries()) {
    const { codes, min, max } = quantise(slice)
    scales[index * 2] = min
    scales[index * 2 + 1] = max
    let zeros = 0
    const flushZeros = (): void => {
      if (zeros === 0) return
      pushVarint(payload, 0)
      pushVarint(payload, zeros)
      zeros = 0
    }
    for (let i = 0; i < cells; i += 1) {
      const delta = at(codes, i) - predictorAt(codes, i, cols)
      if (delta === 0) {
        zeros += 1
        continue
      }
      flushZeros()
      pushVarint(payload, zigzag(delta) + 1)
    }
    flushZeros()
  }

  const meta = new TextEncoder().encode(
    JSON.stringify({
      quality: raster.quality,
      windows: raster.windows.map((window) => ({ spec: window.spec, dayCount: window.dayCount })),
    } satisfies EncodedRasterMeta),
  )
  const scaleBytes = new Uint8Array(scales.buffer, scales.byteOffset, scales.byteLength)
  const out = new Uint8Array(HEADER_BYTES + meta.length + scaleBytes.length + payload.length)
  const view = new DataView(out.buffer)
  for (let i = 0; i < MAGIC.length; i += 1) out[i] = MAGIC.charCodeAt(i)
  view.setUint8(4, VERSION)
  view.setUint8(5, CODEC_DELTA_VARINT)
  view.setUint16(6, slices.length, true)
  view.setUint32(8, cols, true)
  view.setUint32(12, rows, true)
  view.setFloat64(16, raster.grid.extent.minXM, true)
  view.setFloat64(24, raster.grid.extent.minYM, true)
  view.setFloat64(32, raster.grid.extent.maxXM, true)
  view.setFloat64(40, raster.grid.extent.maxYM, true)
  view.setFloat64(48, raster.grid.cellSizeM, true)
  view.setUint32(56, meta.length, true)
  view.setUint32(60, payload.length, true)
  out.set(meta, HEADER_BYTES)
  out.set(scaleBytes, HEADER_BYTES + meta.length)
  out.set(Uint8Array.from(payload), HEADER_BYTES + meta.length + scaleBytes.length)
  return out
}

/* --------------------------------- decoding -------------------------------- */

const byMonthOf = (slices: readonly Float32Array[], from: number): ByMonth<Float32Array> =>
  Array.from(
    { length: MONTHS },
    (_, i) => slices[from + i] ?? new Float32Array(0),
  ) as unknown as ByMonth<Float32Array>

/**
 * Reads what `encodeExampleRaster` wrote, and returns null rather than throwing on anything it
 * cannot account for: a wrong magic, an unknown version or codec, a header whose lengths overrun
 * the buffer, a metadata block that is not the shape it claims, or a delta stream that does not
 * fill every slice exactly. A visitor whose example asset is missing or mangled gets the starting
 * plot, never a raster assembled from whatever the bytes happened to decode to
 */
export const decodeExampleRaster = (buffer: ArrayBuffer): DliRaster | null => {
  if (buffer.byteLength < HEADER_BYTES) return null
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  for (let i = 0; i < MAGIC.length; i += 1) if (at(bytes, i) !== MAGIC.charCodeAt(i)) return null
  if (view.getUint8(4) !== VERSION || view.getUint8(5) !== CODEC_DELTA_VARINT) return null
  const sliceCount = view.getUint16(6, true)
  const cols = view.getUint32(8, true)
  const rows = view.getUint32(12, true)
  const cellSizeM = view.getFloat64(48, true)
  const metaBytes = view.getUint32(56, true)
  const payloadBytes = view.getUint32(60, true)
  if (cols === 0 || rows === 0 || !(cellSizeM > 0)) return null
  const windowCount = (sliceCount - (3 + MONTHS * 2)) / 2
  if (!Number.isInteger(windowCount) || windowCount < 0) return null
  const scaleBytes = sliceCount * 8
  if (HEADER_BYTES + metaBytes + scaleBytes + payloadBytes !== buffer.byteLength) return null

  let meta: unknown
  try {
    meta = JSON.parse(
      new TextDecoder().decode(bytes.subarray(HEADER_BYTES, HEADER_BYTES + metaBytes)),
    )
  } catch {
    return null
  }
  if (!isRecord(meta) || !isRecord(meta.quality) || !Array.isArray(meta.windows)) return null
  if (meta.windows.length !== windowCount) return null

  const scaleAt = HEADER_BYTES + metaBytes
  const cells = cols * rows
  const slices: Float32Array[] = []
  let cursor = scaleAt + scaleBytes
  const readVarint = (): number | null => {
    let raw = 0
    let shift = 0
    for (;;) {
      if (cursor >= buffer.byteLength) return null
      const byte = at(bytes, cursor)
      cursor += 1
      raw |= (byte & 0x7f) << shift
      if ((byte & 0x80) === 0) return raw >>> 0
      shift += 7
      if (shift > VARINT_MAX_SHIFT) return null
    }
  }
  for (let s = 0; s < sliceCount; s += 1) {
    const min = view.getFloat32(scaleAt + s * 8, true)
    const max = view.getFloat32(scaleAt + s * 8 + 4, true)
    const span = max - min
    const codes = new Uint16Array(cells)
    const out = new Float32Array(cells)
    const write = (index: number, code: number): void => {
      codes[index] = code
      out[index] = span > 0 ? min + (code * span) / CODE_MAX : min
    }
    let i = 0
    while (i < cells) {
      const token = readVarint()
      if (token === null) return null
      if (token === 0) {
        const run = readVarint()
        if (run === null || run === 0 || i + run > cells) return null
        for (let k = 0; k < run; k += 1, i += 1) write(i, predictorAt(codes, i, cols))
        continue
      }
      const code = predictorAt(codes, i, cols) + unzigzag(token - 1)
      if (code < 0 || code > CODE_MAX) return null
      write(i, code)
      i += 1
    }
    slices.push(out)
  }
  if (cursor !== buffer.byteLength) return null

  const grid: GridSpec = {
    extent: {
      minXM: view.getFloat64(16, true),
      minYM: view.getFloat64(24, true),
      maxXM: view.getFloat64(32, true),
      maxYM: view.getFloat64(40, true),
    } as Extent2D,
    cellSizeM: cellSizeM as Meters,
    cols,
    rows,
  }
  const empty = new Float32Array(cells)
  return {
    grid,
    skyViewFactor: slices[0] ?? empty,
    annualUnderArrayMolM2Day: slices[1] ?? empty,
    annualOpenSkyMolM2Day: slices[2] ?? empty,
    monthlyUnderArrayMolM2Day: byMonthOf(slices, 3),
    monthlyOpenSkyMolM2Day: byMonthOf(slices, 3 + MONTHS),
    windows: (meta.windows as readonly TimeWindowSampling[]).map((window, w) => ({
      spec: window.spec,
      dayCount: window.dayCount,
      underArrayMolM2Day: slices[3 + MONTHS * 2 + w * 2] ?? empty,
      openSkyMolM2Day: slices[3 + MONTHS * 2 + w * 2 + 1] ?? empty,
    })),
    quality: meta.quality as unknown as RasterQuality,
  }
}
