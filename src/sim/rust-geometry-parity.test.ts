import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'bun:test'
import { arrayId } from '../types/ids'
import type { PvArray } from '../types/pv'
import type {
  Degrees,
  EpochMillis,
  Fraction,
  Meters,
  WattsPeak,
  KilowattsDc,
  KilowattsAc,
} from '../types/units'
import { derivedArrayMetrics, panelSnapshot } from './geometry'
import { rustCore, type RustCore } from './rust-core'
import { beamVisibilityRaster } from './shading'
import { sunUnitVector } from './solar'

/**
 * Two of the kernels that still have a TypeScript implementation to disagree with
 *
 * The PV chain is left out on purpose: `runAnnualChain` in `pv/chain.ts` IS `core.annualChain`, so
 * comparing them would compare the Rust to itself and pass for the wrong reason. What survives here
 * is genuine, because `geometry.ts` and `shading.ts` are still implemented twice: they sit on
 * synchronous paths in `state/derive.ts` and in the CPU reference backend, and moving those to the
 * core means crossing the boundary in tighter loops than anything measured so far.
 *
 * `interreflectionGain` in `viewfactor.ts` and `albedoUnderSnow` in `src/types/ground.ts` are
 * implemented twice as well: the TypeScript runs for the light map and the scene, the Rust
 * `interreflection_gain` and `albedo_under_snow` run inside the annual chain, and nothing here
 * compares either pair
 *
 * `shading.ts` is the one that matters most. `src/sim/gpu/webgl2.test.ts` holds the GPU shader to
 * the CPU kernel here, so if these two disagree the shader is being checked against one thing
 * while the product computes another
 */
const WASM = 'crates/agv-sim/target/wasm32-unknown-unknown/release/agv_sim.wasm'
const HAVE_WASM = existsSync(WASM)
const WASM_REQUIRED = process.env.REQUIRE_RUST_CORE === '1'

const load = async (): Promise<RustCore> => {
  const module = await WebAssembly.compile(readFileSync(WASM))
  return rustCore(await WebAssembly.instantiate(module, {}))
}

const arrayFor = (tracker: PvArray['tracker']): PvArray => {
  const geometry = {
    collectorWidthM: 2.4 as Meters,
    pitchM: 6.5 as Meters,
    rowLengthM: 12 as Meters,
    rowCount: 3,
    modulesPerRow: 6,
    clearanceHeightM: 2.6 as Meters,
    rowAzimuthDeg: 90 as Degrees,
    originM: { xM: 0 as Meters, yM: 0 as Meters },
  }
  const module = {
    widthM: 1.13 as Meters,
    heightM: 1.72 as Meters,
    nameplateWp: 430 as WattsPeak,
    bifacialityFactor: 0.7 as Fraction,
    transmittanceFraction: 0 as Fraction,
    rearReflectance: 0.05 as Fraction,
    backsheet: 'glass-glass' as const,
  }
  const base = {
    id: arrayId('parity'),
    label: 'parity',
    geometry,
    tracker,
    module,
    derived: {
      groundCoverRatio: 0 as Fraction,
      projectedGroundCoverRatio: 0 as Fraction,
      maxHeightM: 0 as Meters,
      nameplateDcKw: 0 as KilowattsDc,
      nameplateAcKw: 0 as KilowattsAc,
    },
  }
  return { ...base, derived: derivedArrayMetrics(base) }
}

const TRACKERS: readonly (readonly [string, PvArray['tracker']])[] = [
  ['fixed', { mode: 'fixed', tiltDeg: 30 as Degrees, surfaceAzimuthDeg: 180 as Degrees }],
  [
    'single-axis-horizontal-ns',
    {
      mode: 'single-axis-horizontal-ns',
      axisTiltDeg: 0 as Degrees,
      axisAzimuthDeg: 0 as Degrees,
      maxRotationDeg: 55 as Degrees,
      backtracking: true,
    },
  ],
  [
    'single-axis-tilted',
    {
      mode: 'single-axis-tilted',
      axisTiltDeg: 20 as Degrees,
      axisAzimuthDeg: 180 as Degrees,
      maxRotationDeg: 45 as Degrees,
      backtracking: false,
    },
  ],
  [
    'dual-axis',
    { mode: 'dual-axis', maxRotationDeg: 60 as Degrees, minElevationDeg: 5 as Degrees },
  ],
  [
    'agro-optimized',
    { mode: 'agro-optimized', maxRotationDeg: 50 as Degrees, targetGroundDliMolM2Day: 12 },
  ],
]

describe('the kernels that are still implemented twice', () => {
  it.skipIf(!WASM_REQUIRED)('is built, where CI said it would be', () => {
    expect(HAVE_WASM, `${WASM} is missing; run \`bun run rust:wasm\``).toBe(true)
  })

  /**
   * Panel corners, for every tracker mode, at four sun positions.
   *
   * The pose feeds both the picture and the shadows, so a disagreement here would put the panels
   * the grower sees somewhere other than the panels the light field was computed from
   */
  it.skipIf(!HAVE_WASM)('puts every panel in the same place', async () => {
    const core = await load()
    let compared = 0
    let worst = { mode: '', delta: 0 }
    for (const [label, tracker] of TRACKERS) {
      const array = arrayFor(tracker)
      for (const [elevation, azimuth] of [
        [8, 95],
        [34, 140],
        [61, 180],
        [17, 265],
      ] as const) {
        const ts = panelSnapshot(
          [array],
          0 as EpochMillis,
          elevation as Degrees,
          azimuth as Degrees,
        )
        const rs = core.panelSnapshot(array, elevation, azimuth)
        expect(ts.panels.length, label).toBe(rs.length / 12)
        ts.panels.forEach((panel, index) => {
          panel.corners.vertices.forEach((vertex, corner) => {
            for (const [offset, value] of [
              [0, vertex.xM],
              [1, vertex.yM],
              [2, vertex.zM],
            ] as const) {
              const delta = Math.abs(value - (rs[index * 12 + corner * 3 + offset] ?? Number.NaN))
              compared += 1
              if (delta > worst.delta) worst = { mode: label, delta }
            }
          })
        })
      }
    }
    expect(compared).toBeGreaterThan(1_000)
    // measured at zero: the pose is a dozen trigonometric calls and accumulates nothing
    expect(worst.delta, `worst under ${worst.mode}`).toBeLessThan(1e-12)
  })

  /**
   * The visibility kernel on its own, because it's what `src/sim/gpu/webgl2.test.ts` holds the
   * GPU shader to. If this and the TypeScript disagree, then the shader is being checked against
   * one thing and the product is computing another
   */
  it.skipIf(!HAVE_WASM)('rasterizes the same shadows', async () => {
    const core = await load()
    const array = arrayFor(TRACKERS[0]?.[1] as PvArray['tracker'])
    const grid = { minXM: -12, minYM: -12, cellSizeM: 0.5, cols: 48, rows: 48 }
    const gridSpec = {
      extent: {
        minXM: grid.minXM as Meters,
        minYM: grid.minYM as Meters,
        maxXM: (grid.minXM + grid.cols * grid.cellSizeM) as Meters,
        maxYM: (grid.minYM + grid.rows * grid.cellSizeM) as Meters,
      },
      cellSizeM: grid.cellSizeM as Meters,
      cols: grid.cols,
      rows: grid.rows,
    }

    let compared = 0
    let anyShaded = false
    for (const [elevation, azimuth] of [
      [12, 110],
      [35, 150],
      [62, 180],
      [20, 250],
    ] as const) {
      const corners = core.panelSnapshot(array, elevation, azimuth)
      const panels = Array.from({ length: corners.length / 12 }, (_unused, index) => ({
        id: `p${String(index)}`,
        corners: {
          vertices: Array.from({ length: 4 }, (_v, c) => ({
            xM: (corners[index * 12 + c * 3] ?? 0) as Meters,
            yM: (corners[index * 12 + c * 3 + 1] ?? 0) as Meters,
            zM: (corners[index * 12 + c * 3 + 2] ?? 0) as Meters,
          })),
        },
      }))
      const sun = sunUnitVector(elevation as Degrees, azimuth as Degrees)
      const ts = beamVisibilityRaster(gridSpec, panels as never, sun, 0.05 as Fraction, 3)
      const rs = core.beamVisibility(grid, corners, sun, 0.05, 3)
      expect(rs.length).toBe(ts.length)
      for (let cell = 0; cell < ts.length; cell += 1) {
        const a = ts[cell] ?? 0
        expect(rs[cell], `cell ${String(cell)} at elevation ${String(elevation)}`).toBe(a)
        compared += 1
        if (a < 0.999) anyShaded = true
      }
    }
    expect(compared).toBe(4 * 48 * 48)
    // a raster of all ones would compare equal and mean nothing
    expect(anyShaded, 'no cell was shaded, so the comparison proved nothing').toBe(true)
  })
})
