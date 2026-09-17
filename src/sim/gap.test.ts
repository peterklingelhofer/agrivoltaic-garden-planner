/**
 * The coarse driver against the whole bake, term by term.
 *
 * `testkit.ts` carries a second light model: infinite-row closed forms rather than the shipped
 * pipeline's polygon projection onto a raster. This is the test that holds the two together, and
 * it's the only place three things are checked at all:
 *
 * 1. **The driver against a real annual bake**, and the approximation's error shrinking as the
 *    array grows, which is the entire claim an infinite-row model makes.
 * 2. **The app's own patch grids against unbiased Monte Carlo**, on the app's own intersection
 *    routine, so a bias in the quadrature can't hide behind the geometry.
 * 3. **The two horizontal axes, crossed**, which is the shape of the bug of 2026-09-01.
 *
 * The bake is opened up rather than run through `runSimulation`, purely so the beam and the
 * diffuse can be read apart: the driver approximates them in two completely different ways, so
 * "the shading model is wrong" names two suspects at once, and only the CPU backend's separate
 * `beamWhPerM2` and `diffuseWhPerM2` accumulators can tell them apart.
 *
 * The window measured is strictly INTERIOR. A box `rowCount * pitch` deep is a third open ground
 * for two rows, so averaging over it would flatter the bake and manufacture most of the apparent
 * convergence. This insets the panel bounding box, so every cell measured has rows on both sides of
 * it, which is the only region an infinite-row model claims anything about
 */
import { describe, expect, it } from 'bun:test'
import type { UnitVec3 } from '../types/geo'
import type { PanelPolygon } from '../types/pv'
import type { Degrees, EpochMillis, Fraction, Meters } from '../types/units'
import { createCpuReferenceBackend, monteCarloSkyViewFactor } from './cpu'
import { decompose, selectDecompositionModel } from './decomposition'
import { gridForExtent, panelSnapshot, sceneExtent } from './geometry'
import { at, sinDeg } from './math'
import { beamVisibilityRaster } from './shading'
import { solarPositionSeries, sunUnitVector } from './solar'
import {
  annualFromMonthly,
  cumulativeSkySet,
  DEFAULT_SUN_BINNING_DEG,
  skyPatchGrid,
} from './skydome'
import { ARRAY, buildArray, buildYear, createCoarseLight, OBSERVER } from './testkit'
import { molPerM2FromWhPerM2 } from './units'

const PAR_FRACTION = 0.45 as Fraction
const DAYS_PER_YEAR = 365
/**
 * Coarse, and that is what makes this affordable in the application suite rather than in a
 * throwaway of its own. Cost is linear in cell count, so these cells are sixteen times cheaper
 * than the 0.5 m ones the prototype used, and the driver-against-bake gap barely moves with cell
 * size: measured -5.5% / -5.1% / -5.1% at 2 m / 1 m / 0.5 m on the smallest array below
 */
const CELL_SIZE_M = 2 as Meters

const rawWeather = buildYear()
const position = solarPositionSeries(rawWeather.utcMillis, OBSERVER, 'nrel-spa')
const weather = decompose(rawWeather, position, selectDecompositionModel(false, 60))
const coarse = createCoarseLight(weather, position)

const toDli = (whPerM2: number): number =>
  molPerM2FromWhPerM2(whPerM2, PAR_FRACTION) / DAYS_PER_YEAR

/** The bounding box of the panels themselves, which is the only region the driver speaks for */
const panelBounds = (panels: readonly PanelPolygon[]) => {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const panel of panels) {
    for (const corner of panel.corners.vertices) {
      minX = Math.min(minX, corner.xM)
      maxX = Math.max(maxX, corner.xM)
      minY = Math.min(minY, corner.yM)
      maxY = Math.max(maxY, corner.yM)
    }
  }
  return { minX, maxX, minY, maxY }
}

interface Baked {
  readonly beamDli: number
  readonly diffuseDli: number
  readonly totalDli: number
  readonly skyViewFactor: number
  readonly cells: number
}

/** The peak-elevation hour, which is the pose `panelSnapshot` is asked for */
const peakHour = (): number => {
  let peak = 0
  for (let i = 1; i < position.count; i += 1) {
    if (at(position.geometricElevationDeg, i) > at(position.geometricElevationDeg, peak)) peak = i
  }
  return peak
}

const snapshotFor = (array: ReturnType<typeof buildArray>) => {
  const peak = peakHour()
  return panelSnapshot(
    [array],
    at(weather.utcMillis, peak) as EpochMillis,
    at(position.geometricElevationDeg, peak) as Degrees,
    at(position.azimuthDeg, peak) as Degrees,
  )
}

/**
 * The pipeline, opened up, so the beam and the diffuse can be read apart.
 *
 * `insetM` is the margin cut from every side of the panel bounding box. It has to be generous in
 * the row direction: a row of finite length stops casting a shadow well before its end, because
 * the shadow slides along the row as the sun moves east to west, and an infinite-row model has no
 * idea that happens
 */
const bake = async (
  rowCount: number,
  modulesPerRow: number,
  insetM: number,
  rowAzimuthDeg?: number,
): Promise<Baked> => {
  const array = buildArray(rowCount, modulesPerRow, rowAzimuthDeg)
  const binning = { substepsPerHour: 1, binningDeg: DEFAULT_SUN_BINNING_DEG as Degrees }
  const skies = cumulativeSkySet(weather, position, 'tregenza-mf1', binning)
  const sky = annualFromMonthly(skies.monthly)

  const extent = sceneExtent([array], [], 5 as Meters)
  const grid = gridForExtent(extent, CELL_SIZE_M)
  const snapshot = snapshotFor(array)

  const backend = createCpuReferenceBackend()
  const result = await backend.accumulate(
    {
      grid,
      sky,
      monthlySkies: [],
      windowSkies: [],
      leafOnMonths: null,
      passesPerFrame: 40,
      frameBudgetMs: 8,
      panels: snapshot.panels,
      beamPanels: null,
    },
    () => {},
  )
  backend.dispose()

  const bounds = panelBounds(snapshot.panels)
  let beam = 0
  let diffuse = 0
  let svf = 0
  let cells = 0
  for (let row = 0; row < grid.rows; row += 1) {
    const y = grid.extent.minYM + (row + 0.5) * grid.cellSizeM
    if (y < bounds.minY + insetM || y > bounds.maxY - insetM) continue
    for (let col = 0; col < grid.cols; col += 1) {
      const x = grid.extent.minXM + (col + 0.5) * grid.cellSizeM
      if (x < bounds.minX + insetM || x > bounds.maxX - insetM) continue
      const cell = row * grid.cols + col
      beam += at(result.beamWhPerM2, cell)
      diffuse += at(result.diffuseWhPerM2, cell)
      svf += at(result.skyViewFactor, cell)
      cells += 1
    }
  }
  expect(
    cells,
    'the interior window is empty; the inset is too large for this array',
  ).toBeGreaterThan(0)
  return {
    beamDli: toDli(beam / cells),
    diffuseDli: toDli(diffuse / cells),
    totalDli: toDli((beam + diffuse) / cells),
    skyViewFactor: svf / cells,
    cells,
  }
}

describe('the coarse driver against the full raster bake', () => {
  // three bakes: 0.3 s, 1.1 s and 4.2 s measured here, 5.5 s together, which is over the
  // runner's 5 s default and nowhere near this bound
  it('converges on it, term by term, as the rows multiply', async () => {
    const tile = coarse.forTile(ARRAY)

    /*
      Measured 2026-09-04 at 2 m cells, interior cells only, mol/m2/day, driver against bake:
        9 x 18, inset 3     360 cells   total 12.56 (-5.5%)   svf 0.686 (-5.4%)   0.3 s
        15 x 30, inset 8    897 cells   total 11.91 (-0.4%)   svf 0.658 (-1.3%)   1.1 s
        21 x 40, inset 14   1431 cells  total 11.68 (+1.6%)   svf 0.648 (+0.3%)   4.1 s
      Nothing is logged. Under vitest a table printed from a worker raced the reporter's
      teardown and failed the whole suite with every test green, which is the flake that moved
      this repository to `bun test`. The discipline is kept because a test that prints is a test
      nobody reads, now that the race is gone
    */
    const gaps: number[] = []
    for (const [rows, cols, inset] of [
      [9, 18, 3],
      [15, 30, 8],
      [21, 40, 14],
    ] as const) {
      const baked = await bake(rows, cols, inset)
      gaps.push((tile.annualDliMolM2Day - baked.totalDli) / baked.totalDli)
    }

    expect(tile.beamDliMolM2Day + tile.diffuseDliMolM2Day).toBeCloseTo(tile.annualDliMolM2Day, 6)
    // the whole claim of an infinite-row approximation, stated so it can fail: the gap has to
    // shrink as the array grows, and it has to end up small. Measured -5.5%, -0.4%, +1.6% at these
    // 2 m cells and -5.1%, -0.4%, +1.1% for the same arrays at 0.5 m, so cell size moves the gap by
    // half a percent at most
    const [small, , large] = gaps
    expect(small).toBeDefined()
    expect(large).toBeDefined()
    expect(Math.abs(large ?? 1), "the driver didn't converge on the bake").toBeLessThan(
      Math.abs(small ?? 0),
    )
    expect(Math.abs(large ?? 1), "the driver doesn't agree with the bake").toBeLessThan(0.03)
  }, 30_000)
})

/**
 * Which of the two sky view factors is right.
 *
 * When the driver and the bake first disagreed, three quarters of the whole gap was one number:
 * the driver read 0.649 where the bake's raster read 0.833. Only one of them can be right, and an
 * independent 2D calculation of an infinite row array puts the true mean at 0.6495, which is the
 * driver's answer to within 0.1%. That pointed at the bake, so this looks at the bake.
 *
 * Three estimators, ONE ground point, ONE array, and the same `beamVisibilityRaster` doing every
 * intersection. The geometry is therefore identical by construction and can't explain a
 * disagreement. The only thing that differs is how the hemisphere is sampled:
 *
 * - **Tregenza mf1, 145 patches**, one ray at each patch center. It's the coarser of the two domes
 *   the bake supports, and only tests use it.
 * - **Reinhart mf2, 577 patches**, the same scheme four times finer. This is what `FINAL_OPTIONS`
 *   uses, so it's not a hypothetical.
 * - **Monte Carlo**, cosine-weighted, from `monteCarloSkyViewFactor` in `cpu.ts`, which is
 *   unbiased by construction and is used by nothing on a user path.
 *
 * All three agree, and they agree with the exact 2D integral for the same point. So the sky
 * weighting, the intersection routine and both quadratures are sound, and the only thing that was
 * ever wrong was the array they were being asked about
 */
describe('the sky view factor, arbitrated', () => {
  it('agrees between quadratures, or the bake has a bias', async () => {
    // the fixture's own azimuth, which is the correct one: measuring a quadrature on an array
    // that shades nothing would measure nothing
    const { panels } = snapshotFor(buildArray(21, 20))

    // one cell, at the center of the array, as far from every edge as the array allows
    const cell = 0.5 as Meters
    const grid = {
      extent: {
        minXM: -0.25 as Meters,
        minYM: -0.25 as Meters,
        maxXM: 0.25 as Meters,
        maxYM: 0.25 as Meters,
      },
      cellSizeM: cell,
      cols: 1,
      rows: 1,
    }
    const visible = (x: number, y: number, z: number): number =>
      z <= 1e-6
        ? 0
        : at(beamVisibilityRaster(grid, panels, { x, y, z } as UnitVec3, 0 as Fraction, 1), 0)

    const byPatches = (subdivision: 'tregenza-mf1' | 'reinhart-mf2'): number => {
      let svf = 0
      for (const patch of skyPatchGrid(subdivision)) {
        if (patch.altitudeDeg <= 0) continue
        const dir = sunUnitVector(patch.altitudeDeg, patch.azimuthDeg)
        // cos(zenith) x solid angle over pi, the weight `cpu.ts` uses, so a clear sky gives 1
        svf +=
          visible(dir.x, dir.y, dir.z) *
          ((sinDeg(patch.altitudeDeg) * patch.solidAngleSr) / Math.PI)
      }
      return svf
    }

    const tregenza = byPatches('tregenza-mf1')
    const reinhart = byPatches('reinhart-mf2')
    const mc = monteCarloSkyViewFactor((x, y, z) => visible(x, y, z), 20_000, 12_345)

    // Measured 2026-09-04, one ground point at the center of a 21 x 20 array, one intersection
    // routine: Tregenza mf1 0.6019 (what the bake reports), Reinhart mf2 0.5931, Monte Carlo
    // 0.5980 +/- 0.0069 (unbiased). 21 rows is odd, so the center of the array is directly UNDER
    // a row, and the number to compare against is the closed form's value there rather than its
    // mean over the pitch: the exact 2D integral gives 0.5910 under a row and 0.6495 averaged
    // across one, and the driver uses the mean because a tile is a patch of ground

    // the claim: `FINAL_OPTIONS` uses Reinhart mf2, and a 577-patch quadrature of this geometry
    // must land on the unbiased estimate, because both are estimating one number
    expect(
      Math.abs(reinhart - mc.svf),
      `Reinhart mf2 ${reinhart.toFixed(4)} against Monte Carlo ${mc.svf.toFixed(4)}`,
    ).toBeLessThan(4 * mc.standardError + 0.005)

    // mf1 lands there too, so the coarse settings aren't paying for a coarser dome here
    expect(Math.abs(tregenza - mc.svf)).toBeLessThan(4 * mc.standardError + 0.005)

    // the closed form is the same number, at the same place, from completely different
    // arithmetic. Not identical, and it shouldn't be: these rows are 40 m long and the point is
    // 20 m from either end, so a little low sky gets in past them that an infinite row would
    // have blocked. That excess can only have one sign
    const EXACT_2D_UNDER_A_ROW = 0.591
    expect(
      mc.svf,
      'less sky than infinitely long rows would leave, which is impossible',
    ).toBeGreaterThan(EXACT_2D_UNDER_A_ROW - 2 * mc.standardError)
    expect(mc.svf, 'far more sky than the closed form allows for finite row ends').toBeLessThan(
      EXACT_2D_UNDER_A_ROW + 0.03,
    )
  })
})

/**
 * The same array, built so that it can exist.
 *
 * The comparison above spent a day reporting that the driver read 25% dark. It didn't:
 * `panelSnapshot` was stepping a fixed array's rows perpendicular to the way its modules face,
 * which left the rows standing shoulder to shoulder, shading almost nothing and hiding almost no
 * sky. That was fixed on 2026-09-01 in `geometry.ts` and `crates/agv-sim/src/geometry.rs`
 * together, and `shading.test.ts` couldn't have caught it: its fixture set `rowAzimuthDeg` equal
 * to the surface azimuth, which is the one array shape the old code got right.
 *
 * So this bakes the fixture as written, where `rowAzimuthDeg` 90 means rows running east-west
 * across a southward facing, and then bakes it again with the two axes crossed, which is the
 * shape the bug used to produce. The driver's answer is the same in both, because it only ever
 * reads the surface azimuth, so the driver is the fixed point and the bake is what moves.
 *
 * The first row is the claim: a coarse per-tile driver reproduces the full raster bake. The
 * second is what a crossed pair of axes costs, kept because it's the size of the bug
 */
describe('the gap, now that the geometry is fixed', () => {
  // two bakes of the middle array rather than the largest, because this block pays for the
  // geometry and not for the convergence: 1.1 s each, 2.2 s together
  it('is gone on the fixture as written, and returns if the axes are crossed', async () => {
    const tile = coarse.forTile(ARRAY)

    // rowAzimuth 90 is rows across the facing direction, which is correct. 180 is rows along
    // it, the incoherent shape of the bug, whose signature is a sky view factor of 0.840 against
    // the closed form's 0.649 where the coherent bake measures 1.3% (2026-09-04, 15 x 30, 2 m)
    for (const rowAz of [90, 180] as const) {
      const baked = await bake(15, 30, 8, rowAz)
      const sky = baked.skyViewFactor / tile.skyViewFactor - 1
      if (rowAz === 180) {
        // and the fixture has to be able to tell the axes apart, or this test is the one in
        // `shading.test.ts` whose fixture was the bug's blind spot
        expect(sky, 'crossing the axes no longer changes the sky').toBeGreaterThan(0.15)
        continue
      }
      if (rowAz === 90) {
        // the claim, stated so it can fail: a coherent array's sky view factor is the one the
        // closed form computes, and the exact 2D value for this configuration is 0.6495
        expect(
          Math.abs(baked.skyViewFactor - tile.skyViewFactor) / tile.skyViewFactor,
          'the coherent bake still disagrees with the closed form about the sky',
        ).toBeLessThan(0.08)
      }
    }
  }, 30_000)
})
