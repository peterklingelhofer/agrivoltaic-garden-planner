import { describe, expect, it } from 'bun:test'
import type { GridSpec } from '../types/geo'
import type { DliRaster, RasterQuality } from '../types/light'
import type { ByMonth, Fraction, Meters } from '../types/units'
import {
  decodeExampleRaster,
  encodeExampleRaster,
  quantisationErrorOf,
  rasterSlices,
  sliceCountFor,
} from './example-raster'
import { at } from './util'

const COLS = 24
const ROWS = 18
const CELLS = COLS * ROWS

const grid: GridSpec = {
  extent: { minXM: -6 as Meters, minYM: -4.5 as Meters, maxXM: 6 as Meters, maxYM: 4.5 as Meters },
  cellSizeM: 0.5 as Meters,
  cols: COLS,
  rows: ROWS,
}

const quality: RasterQuality = {
  subdivision: 'tregenza-mf1',
  sunDirectionCount: 1255,
  substepsPerHour: 2,
  parFraction: 0.45 as Fraction,
  photonConversionUmolPerJ: 4.57,
  interreflectionApplied: true,
  seasonalParHalfWidthFraction: 0.1 as Fraction,
}

/** A shade band across the rows, which is the shape the real field has and the one the predictor pays for */
const band = (peak: number, phase: number): Float32Array => {
  const out = new Float32Array(CELLS)
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      out[row * COLS + col] = peak * (0.4 + 0.6 * Math.abs(Math.sin((row + phase) / 3)))
    }
  }
  return out
}

const byMonth = <T>(make: (month: number) => T): ByMonth<T> =>
  Array.from({ length: 12 }, (_, month) => make(month)) as unknown as ByMonth<T>

const raster = (): DliRaster => ({
  grid,
  skyViewFactor: band(1, 0),
  annualUnderArrayMolM2Day: band(38, 1),
  annualOpenSkyMolM2Day: new Float32Array(CELLS).fill(41.7),
  monthlyUnderArrayMolM2Day: byMonth((month) => band(12 + month * 3, month)),
  monthlyOpenSkyMolM2Day: byMonth((month) => new Float32Array(CELLS).fill(14 + month * 3)),
  windows: [],
  quality,
})

const bufferOf = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

describe('the example raster codec', () => {
  it('round-trips every slice, the grid and the quality record', () => {
    const source = raster()
    const decoded = decodeExampleRaster(bufferOf(encodeExampleRaster(source)))
    expect(decoded).not.toBeNull()
    expect(decoded?.grid).toEqual(grid)
    expect(decoded?.quality).toEqual(quality)
    expect(rasterSlices(decoded as DliRaster)).toHaveLength(sliceCountFor(0))

    const worst = quantisationErrorOf(source)
    for (const [index, slice] of rasterSlices(source).entries()) {
      const back = rasterSlices(decoded as DliRaster)[index] as Float32Array
      for (let i = 0; i < slice.length; i += 1) {
        expect(Math.abs(at(back, i) - at(slice, i))).toBeLessThanOrEqual(worst + 1e-9)
      }
    }
  })

  /**
   * The whole justification for a lossy encoding. `contourStep` draws iso-lines every
   * 5 mol/m2/day on a field of this range, and the legend prints its ticks at the same
   * interval, so the error has to be far below one line for the picture to keep its meaning
   */
  it('rounds by far less than the interval the overlay draws contours at', () => {
    expect(quantisationErrorOf(raster())).toBeLessThan(0.05)
  })

  it('carries the windows a final-quality bake adds', () => {
    const source = raster()
    const withWindow: DliRaster = {
      ...source,
      windows: [
        {
          spec: { key: 'ma-gsh', label: 'Growing season hours', basis: 'local-clock', clauses: [] },
          dayCount: 214,
          underArrayMolM2Day: band(30, 2),
          openSkyMolM2Day: new Float32Array(CELLS).fill(36),
        },
      ],
    }
    const decoded = decodeExampleRaster(bufferOf(encodeExampleRaster(withWindow)))
    expect(decoded?.windows).toHaveLength(1)
    expect(decoded?.windows[0]?.spec.key).toBe('ma-gsh')
    expect(decoded?.windows[0]?.dayCount).toBe(214)
    expect(rasterSlices(decoded as DliRaster)).toHaveLength(sliceCountFor(1))
  })

  it('collapses a slice with no variation to almost nothing', () => {
    const flat: DliRaster = {
      ...raster(),
      skyViewFactor: new Float32Array(CELLS).fill(1),
      annualUnderArrayMolM2Day: new Float32Array(CELLS).fill(20),
      monthlyUnderArrayMolM2Day: byMonth(() => new Float32Array(CELLS).fill(20)),
    }
    // 27 uniform slices over 432 cells each: a byte per cell would be 11 664
    expect(encodeExampleRaster(flat).length).toBeLessThan(1_000)
  })

  describe('refuses rather than guesses', () => {
    const encoded = (): Uint8Array => encodeExampleRaster(raster())

    it('a buffer that is too short to hold a header', () => {
      expect(decodeExampleRaster(new ArrayBuffer(8))).toBeNull()
    })

    it('a wrong magic number', () => {
      const bytes = encoded()
      bytes[0] = 0
      expect(decodeExampleRaster(bufferOf(bytes))).toBeNull()
    })

    it('a version or codec it does not know', () => {
      const version = encoded()
      version[4] = 9
      expect(decodeExampleRaster(bufferOf(version))).toBeNull()
      const codec = encoded()
      codec[5] = 9
      expect(decodeExampleRaster(bufferOf(codec))).toBeNull()
    })

    it('a truncated payload', () => {
      const bytes = encoded()
      expect(decodeExampleRaster(bufferOf(bytes.subarray(0, bytes.length - 40)))).toBeNull()
    })

    it('a payload with bytes left over', () => {
      const bytes = encoded()
      const padded = new Uint8Array(bytes.length + 4)
      padded.set(bytes)
      expect(decodeExampleRaster(bufferOf(padded))).toBeNull()
    })

    /** Single-byte corruption anywhere in the stream, which is the case a checksum-free format has to survive */
    it('a corrupt delta stream, at every byte offset tried', () => {
      const bytes = encoded()
      let refused = 0
      let readBack = 0
      for (let offset = 64; offset < bytes.length; offset += 97) {
        const mangled = Uint8Array.from(bytes)
        mangled[offset] = (at(mangled, offset) + 137) & 0xff
        const decoded = decodeExampleRaster(bufferOf(mangled))
        if (decoded === null) refused += 1
        else readBack += 1
      }
      // a mangled varint either overruns the stream or lands out of the code range; what must
      // never happen is a throw, and what does happen is recorded rather than asserted away
      expect(refused + readBack).toBeGreaterThan(10)
      expect(refused).toBeGreaterThan(0)
    })
  })
})
