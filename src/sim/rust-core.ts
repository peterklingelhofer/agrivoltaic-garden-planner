/**
 * The JavaScript half of the Rust physics core.
 *
 * Deliberately takes an already-instantiated `WebAssembly.Instance` rather than loading one. The
 * two callers load it differently -- a test reads a file, a browser fetches a URL -- and putting
 * either of those in here would drag `node:fs` or `fetch` into `src/sim`, which
 * `src/sim/boundary.test.ts` exists to prevent and which would follow the module into the browser
 * bundle. So this file is arithmetic and pointers and nothing else.
 *
 * See `crates/agv-sim/src/wasm.rs` for the other side of this ABI, and `the port document` for
 * why the crate exists at all.
 */

import type { PvChainOptions } from '../types/energy'
import type { PvArray, TrackingMode } from '../types/pv'
import type { DecompositionModel } from '../types/weather'

/** Nine f64s per sample, in the field order `wasm.rs` writes them. Neither side may reorder */
export const FIELDS_PER_SAMPLE = 9

/** Ten in, four out, per transposed sample. Same rule about ordering */
export const TRANSPOSITION_INPUTS = 10
export const POA_FIELDS = 4

/** Eight in, three out, per decomposed sample. Same rule about ordering */
export const DECOMPOSITION_INPUTS = 8
export const DECOMPOSITION_OUTPUTS = 3

/**
 * The wire codes `DecompositionModel::from_code` reads, and the only place they are written down
 * on this side. A model may be appended; none may be renumbered, because the two ends of this
 * mapping are compiled separately and nothing would notice.
 */
export const DECOMPOSITION_MODEL_CODES = {
  passthrough: 0,
  dirint: 1,
  engerer2: 2,
  erbs: 3,
} as const satisfies Record<DecompositionModel, number>

export interface RustSolarSample {
  readonly geometricElevationDeg: number
  readonly apparentElevationDeg: number
  readonly zenithDeg: number
  readonly azimuthDeg: number
  readonly declinationDeg: number
  readonly hourAngleDeg: number
  readonly earthRadiusVectorAu: number
  readonly relativeAirMass: number
  readonly absoluteAirMass: number
}

export interface RustTranspositionInput {
  readonly dniWM2: number
  readonly dhiWM2: number
  readonly ghiWM2: number
  readonly zenithDeg: number
  readonly relativeAirMass: number
  readonly extraterrestrialNormalWM2: number
  readonly surfaceTiltDeg: number
  readonly surfaceAzimuthDeg: number
  readonly solarAzimuthDeg: number
  readonly groundAlbedo: number
}

export interface RustPoaComponents {
  readonly beamWM2: number
  readonly skyDiffuseWM2: number
  readonly groundReflectedWM2: number
  readonly globalWM2: number
}

/**
 * The series a decomposition reads, in the shape `src/sim/decomposition.ts` already holds it.
 *
 * `ArrayLike<number>` and not `Float32Array` so a caller may pass either the typed arrays a
 * `TmySeries` carries or plain arrays from a test, without a copy in the common case.
 */
export interface RustDecompositionSeries {
  readonly utcMillis: ArrayLike<number>
  readonly ghiWM2: ArrayLike<number>
  readonly dniWM2: ArrayLike<number>
  readonly dhiWM2: ArrayLike<number>
  readonly geometricElevationDeg: ArrayLike<number>
  readonly apparentElevationDeg: ArrayLike<number>
  readonly absoluteAirMass: ArrayLike<number>
  readonly extraterrestrialNormalWM2: ArrayLike<number>
}

/**
 * Returned as `Float32Array`s, which is lossless: the Rust narrows the beam and diffuse to single
 * precision itself, and the global is either the input unchanged or zero.
 */
export interface RustIrradianceSeries {
  readonly ghiWM2: Float32Array
  readonly dniWM2: Float32Array
  readonly dhiWM2: Float32Array
}

/** Twenty-one f64s describing one array. `wasm.rs`'s `read_array` is the other half of this */
export const ARRAY_FIELDS = 21
/** Twelve per hour: the eight of a decomposition sample, then azimuth, air, wind and snow */
export const CHAIN_HOUR_FIELDS = 12
/** Twenty-four, the last ten being the loss fractions in `PVWATTS_DEFAULT_LOSSES` order */
export const CHAIN_OPTION_FIELDS = 24
export const ARRAY_ENERGY_FIELDS = 17
/** Four corners of three coordinates */
export const PANEL_CORNER_FIELDS = 12

/**
 * The tracker mode wire codes. Appended to, never renumbered, for the reason
 * `DECOMPOSITION_MODEL_CODES` gives.
 */
export const TRACKER_MODE_CODES = {
  fixed: 0,
  'single-axis-horizontal-ns': 1,
  'single-axis-tilted': 2,
  'dual-axis': 3,
  'agro-optimised': 4,
} as const satisfies Record<TrackingMode, number>

export interface RustArrayEnergy {
  readonly moduleCount: number
  readonly apertureAreaM2: number
  readonly landAreaM2: number
  readonly groundCoverRatio: number
  readonly nameplateDcKw: number
  readonly nameplateAcKw: number
  readonly dcAcRatio: number
  readonly annualPoaKwhPerM2: number
  readonly bifacialGainFraction: number
  readonly rowShadingLossFraction: number
  readonly systemLossFraction: number
  readonly annualDcKwh: number
  readonly annualAcKwh: number
  readonly clippingLossKwh: number
  readonly clippingLossFraction: number
  readonly specificYieldKwhPerKwp: number
  readonly performanceRatio: number
}

export interface RustChainHour {
  readonly utcMillis: number
  readonly ghiWM2: number
  readonly dniWM2: number
  readonly dhiWM2: number
  readonly geometricElevationDeg: number
  readonly apparentElevationDeg: number
  readonly absoluteAirMass: number
  readonly extraterrestrialNormalWM2: number
  readonly azimuthDeg: number
  readonly dryBulbC: number
  readonly windSpeedMS: number
  /** Zero where there is no snow series: `albedoUnderSnow(a, 0)` is `a`, so the two are one case */
  readonly snowCover: number
}

export interface RustGrid {
  readonly minXM: number
  readonly minYM: number
  readonly cellSizeM: number
  readonly cols: number
  readonly rows: number
}

export interface RustObserver {
  readonly latitudeDeg: number
  readonly longitudeDeg: number
  readonly elevationM: number
  readonly pressureMb: number
  readonly temperatureC: number
}

interface CoreExports {
  readonly memory: WebAssembly.Memory
  readonly agv_alloc_f64: (count: number) => number
  readonly agv_free_f64: (pointer: number, count: number) => void
  readonly agv_spa_series: (
    times: number,
    count: number,
    latitudeDeg: number,
    longitudeDeg: number,
    elevationM: number,
    pressureMb: number,
    temperatureC: number,
    out: number,
  ) => void
  readonly agv_perez_series: (inputs: number, count: number, out: number) => void
  readonly agv_decompose_series: (
    model: number,
    count: number,
    utcOffsetHours: number,
    inputs: number,
    out: number,
  ) => void
  readonly agv_enforce_consistency_series: (count: number, inputs: number, out: number) => void
  readonly agv_annual_chain: (
    array: number,
    hours: number,
    count: number,
    options: number,
    out: number,
  ) => void
  readonly agv_panel_snapshot: (
    array: number,
    solarElevationDeg: number,
    solarAzimuthDeg: number,
    out: number,
  ) => void
  readonly agv_beam_visibility: (
    minXM: number,
    minYM: number,
    cellSizeM: number,
    cols: number,
    rows: number,
    panels: number,
    panelCount: number,
    sunX: number,
    sunY: number,
    sunZ: number,
    moduleTransmittance: number,
    subSamplesPerCell: number,
    out: number,
  ) => void
}

export interface RustCore {
  /**
   * Every field of every sample, flat, in the ABI's own order and its own buffer.
   *
   * The shape `solarPositionSeries` wants, and the reason it exists beside `spaSeries`: a year at
   * four substeps an hour is 35,040 samples, and `spaSeries` would allocate 35,040 objects to
   * hand back nine numbers each that the caller immediately copies into typed arrays and drops.
   */
  readonly spaSeriesFlat: (utcMillis: ArrayLike<number>, observer: RustObserver) => Float64Array
  readonly spaSeries: (
    utcMillis: readonly number[],
    observer: RustObserver,
  ) => readonly RustSolarSample[]
  readonly perezSeries: (samples: readonly RustTranspositionInput[]) => readonly RustPoaComponents[]
  readonly decomposeSeries: (
    series: RustDecompositionSeries,
    model: DecompositionModel,
    utcOffsetHours: number,
  ) => RustIrradianceSeries
  readonly enforceConsistencySeries: (series: RustDecompositionSeries) => RustIrradianceSeries
  readonly annualChain: (
    array: PvArray,
    hours: readonly RustChainHour[],
    options: PvChainOptions,
  ) => RustArrayEnergy
  readonly panelSnapshot: (
    array: PvArray,
    solarElevationDeg: number,
    solarAzimuthDeg: number,
  ) => Float64Array
  readonly beamVisibility: (
    grid: RustGrid,
    panelCorners: Float64Array,
    sun: { readonly x: number; readonly y: number; readonly z: number },
    moduleTransmittance: number,
    subSamplesPerCell: number,
  ) => Float32Array
}

/**
 * An array flattened into the field order `wasm.rs` reads.
 *
 * The tracker's mode-dependent fields overlap on purpose: slot 10 is the fixed tilt or the axis
 * tilt, slot 11 the surface azimuth or the axis azimuth. That mirrors the TypeScript union, where
 * the same two properties are also the ones that differ, and the Rust decodes them straight into
 * enum variants where the overlap disappears.
 */
const flattenArray = (array: PvArray): Float64Array => {
  const { geometry: g, tracker, module } = array
  const flat = new Float64Array(ARRAY_FIELDS)
  flat[0] = g.collectorWidthM
  flat[1] = g.pitchM
  flat[2] = g.rowLengthM
  flat[3] = g.rowCount
  flat[4] = g.modulesPerRow
  flat[5] = g.clearanceHeightM
  flat[6] = g.rowAzimuthDeg
  flat[7] = g.originM.xM
  flat[8] = g.originM.yM
  flat[9] = TRACKER_MODE_CODES[tracker.mode]
  flat[10] = tracker.mode === 'fixed' ? tracker.tiltDeg : 0
  flat[11] = tracker.mode === 'fixed' ? tracker.surfaceAzimuthDeg : 0
  if (tracker.mode === 'single-axis-horizontal-ns' || tracker.mode === 'single-axis-tilted') {
    flat[10] = tracker.axisTiltDeg
    flat[11] = tracker.axisAzimuthDeg
    flat[12] = tracker.maxRotationDeg
    flat[14] = tracker.backtracking ? 1 : 0
  } else if (tracker.mode === 'dual-axis') {
    flat[12] = tracker.maxRotationDeg
    flat[13] = tracker.minElevationDeg
  } else if (tracker.mode === 'agro-optimised') {
    flat[12] = tracker.maxRotationDeg
  }
  flat[15] = module.widthM
  flat[16] = module.heightM
  flat[17] = module.nameplateWp
  flat[18] = module.bifacialityFactor
  flat[19] = module.transmittanceFraction
  flat[20] = module.rearReflectance
  return flat
}

const flattenChainOptions = (options: PvChainOptions): Float64Array => {
  const flat = new Float64Array(CHAIN_OPTION_FIELDS)
  flat[0] = options.cellTemperatureModel === 'sapm' ? 1 : 0
  flat[1] = options.faiman.u0
  flat[2] = options.faiman.u1
  flat[3] = options.sapm.a
  flat[4] = options.sapm.b
  flat[5] = options.sapm.deltaTC
  flat[6] = options.gammaPdcPerC
  flat[7] = options.dcAcRatio
  flat[8] = options.inverter.nominalEfficiency
  flat[9] = options.inverter.referenceEfficiency
  flat[10] = options.bifacial ? 1 : 0
  flat[11] = options.rowShading ? 1 : 0
  flat[12] = options.groundAlbedo
  // positional by declaration order, which is why `losses.rs` carries the same list of components
  options.losses.forEach((entry, index) => {
    if (index < 10) flat[14 + index] = entry.fraction
  })
  return flat
}

const BYTES_PER_F64 = 8

/**
 * A fresh view every time, because it is invalid the moment the allocator grows linear memory.
 *
 * This is the classic wasm footgun: a `Float64Array` captured before an `agv_alloc_f64` that
 * triggers `memory.grow` points into a detached buffer, and reads come back as zeros rather than
 * as an error. Two allocations happen below, so the view is taken after both.
 */
const view = (exports: CoreExports): Float64Array => new Float64Array(exports.memory.buffer)

/**
 * The count every field of a decomposition series must agree on.
 *
 * A short field would otherwise be read as zeros through `at`, and zero is a legitimate
 * irradiance, so the mistake would arrive as a plausibly dark year rather than as an error. This
 * is the one place it can still be caught cheaply.
 */
const decompositionCount = (series: RustDecompositionSeries): number => {
  const count = series.ghiWM2.length
  const fields: readonly (readonly [string, ArrayLike<number>])[] = [
    ['utcMillis', series.utcMillis],
    ['dniWM2', series.dniWM2],
    ['dhiWM2', series.dhiWM2],
    ['geometricElevationDeg', series.geometricElevationDeg],
    ['apparentElevationDeg', series.apparentElevationDeg],
    ['absoluteAirMass', series.absoluteAirMass],
    ['extraterrestrialNormalWM2', series.extraterrestrialNormalWM2],
  ]
  for (const [name, values] of fields) {
    if (values.length !== count) {
      throw new Error(
        `rustCore: ${name} has ${String(values.length)} samples, ghiWM2 has ${String(count)}`,
      )
    }
  }
  return count
}

export const rustCore = (instance: WebAssembly.Instance): RustCore => {
  const exports = instance.exports as unknown as CoreExports

  const spaSeriesFlat = (utcMillis: ArrayLike<number>, observer: RustObserver): Float64Array => {
    const count = utcMillis.length
    if (count === 0) return new Float64Array(0)
    const outCount = count * FIELDS_PER_SAMPLE
    const timesPointer = exports.agv_alloc_f64(count)
    const outPointer = exports.agv_alloc_f64(outCount)
    try {
      view(exports).set(
        utcMillis as ArrayLike<number> & Iterable<number>,
        timesPointer / BYTES_PER_F64,
      )
      exports.agv_spa_series(
        timesPointer,
        count,
        observer.latitudeDeg,
        observer.longitudeDeg,
        observer.elevationM,
        observer.pressureMb,
        observer.temperatureC,
        outPointer,
      )
      // copied out of linear memory rather than returned as a view of it, because the very next
      // statement frees the allocation the view would point into
      return view(exports).slice(outPointer / BYTES_PER_F64, outPointer / BYTES_PER_F64 + outCount)
    } finally {
      exports.agv_free_f64(timesPointer, count)
      exports.agv_free_f64(outPointer, outCount)
    }
  }

  const spaSeries = (
    utcMillis: readonly number[],
    observer: RustObserver,
  ): readonly RustSolarSample[] => {
    const count = utcMillis.length
    if (count === 0) return []
    const flat = spaSeriesFlat(utcMillis, observer)
    return Array.from({ length: count }, (_unused, index) => {
      const at = index * FIELDS_PER_SAMPLE
      return {
        geometricElevationDeg: flat[at] ?? Number.NaN,
        apparentElevationDeg: flat[at + 1] ?? Number.NaN,
        zenithDeg: flat[at + 2] ?? Number.NaN,
        azimuthDeg: flat[at + 3] ?? Number.NaN,
        declinationDeg: flat[at + 4] ?? Number.NaN,
        hourAngleDeg: flat[at + 5] ?? Number.NaN,
        earthRadiusVectorAu: flat[at + 6] ?? Number.NaN,
        relativeAirMass: flat[at + 7] ?? Number.NaN,
        absoluteAirMass: flat[at + 8] ?? Number.NaN,
      }
    })
  }

  const perezSeries = (
    samples: readonly RustTranspositionInput[],
  ): readonly RustPoaComponents[] => {
    const count = samples.length
    if (count === 0) return []
    const inCount = count * TRANSPOSITION_INPUTS
    const outCount = count * POA_FIELDS
    const inPointer = exports.agv_alloc_f64(inCount)
    const outPointer = exports.agv_alloc_f64(outCount)
    try {
      const flatIn = new Float64Array(inCount)
      samples.forEach((sample, index) => {
        const at = index * TRANSPOSITION_INPUTS
        flatIn[at] = sample.dniWM2
        flatIn[at + 1] = sample.dhiWM2
        flatIn[at + 2] = sample.ghiWM2
        flatIn[at + 3] = sample.zenithDeg
        flatIn[at + 4] = sample.relativeAirMass
        flatIn[at + 5] = sample.extraterrestrialNormalWM2
        flatIn[at + 6] = sample.surfaceTiltDeg
        flatIn[at + 7] = sample.surfaceAzimuthDeg
        flatIn[at + 8] = sample.solarAzimuthDeg
        flatIn[at + 9] = sample.groundAlbedo
      })
      view(exports).set(flatIn, inPointer / BYTES_PER_F64)
      exports.agv_perez_series(inPointer, count, outPointer)
      const flat = view(exports).subarray(
        outPointer / BYTES_PER_F64,
        outPointer / BYTES_PER_F64 + outCount,
      )
      return Array.from({ length: count }, (_unused, index) => {
        const at = index * POA_FIELDS
        return {
          beamWM2: flat[at] ?? Number.NaN,
          skyDiffuseWM2: flat[at + 1] ?? Number.NaN,
          groundReflectedWM2: flat[at + 2] ?? Number.NaN,
          globalWM2: flat[at + 3] ?? Number.NaN,
        }
      })
    } finally {
      exports.agv_free_f64(inPointer, inCount)
      exports.agv_free_f64(outPointer, outCount)
    }
  }

  /** Both decomposition entry points share an input layout, so they share this too */
  const withDecompositionSeries = (
    series: RustDecompositionSeries,
    call: (inPointer: number, count: number, outPointer: number) => void,
  ): RustIrradianceSeries => {
    const count = decompositionCount(series)
    const empty = {
      ghiWM2: new Float32Array(0),
      dniWM2: new Float32Array(0),
      dhiWM2: new Float32Array(0),
    }
    if (count === 0) return empty
    const inCount = count * DECOMPOSITION_INPUTS
    const outCount = count * DECOMPOSITION_OUTPUTS
    const inPointer = exports.agv_alloc_f64(inCount)
    const outPointer = exports.agv_alloc_f64(outCount)
    try {
      const flatIn = new Float64Array(inCount)
      for (let index = 0; index < count; index += 1) {
        const at = index * DECOMPOSITION_INPUTS
        flatIn[at] = series.utcMillis[index] ?? Number.NaN
        flatIn[at + 1] = series.ghiWM2[index] ?? Number.NaN
        flatIn[at + 2] = series.dniWM2[index] ?? Number.NaN
        flatIn[at + 3] = series.dhiWM2[index] ?? Number.NaN
        flatIn[at + 4] = series.geometricElevationDeg[index] ?? Number.NaN
        flatIn[at + 5] = series.apparentElevationDeg[index] ?? Number.NaN
        flatIn[at + 6] = series.absoluteAirMass[index] ?? Number.NaN
        flatIn[at + 7] = series.extraterrestrialNormalWM2[index] ?? Number.NaN
      }
      view(exports).set(flatIn, inPointer / BYTES_PER_F64)
      call(inPointer, count, outPointer)
      const flat = view(exports).subarray(
        outPointer / BYTES_PER_F64,
        outPointer / BYTES_PER_F64 + outCount,
      )
      const ghiWM2 = new Float32Array(count)
      const dniWM2 = new Float32Array(count)
      const dhiWM2 = new Float32Array(count)
      for (let index = 0; index < count; index += 1) {
        const at = index * DECOMPOSITION_OUTPUTS
        ghiWM2[index] = flat[at] ?? Number.NaN
        dniWM2[index] = flat[at + 1] ?? Number.NaN
        dhiWM2[index] = flat[at + 2] ?? Number.NaN
      }
      return { ghiWM2, dniWM2, dhiWM2 }
    } finally {
      exports.agv_free_f64(inPointer, inCount)
      exports.agv_free_f64(outPointer, outCount)
    }
  }

  const decomposeSeries = (
    series: RustDecompositionSeries,
    model: DecompositionModel,
    utcOffsetHours: number,
  ): RustIrradianceSeries => {
    /*
      Refused here rather than left to the Rust, which fills the output with NaN for a code it
      does not know. That guard is still worth having, for a genuine version skew where this side
      knows a model the compiled crate does not. It cannot cover this case: a name absent from the
      map reads as `undefined`, and an `undefined` crossing into a wasm i32 parameter arrives as
      zero, which is `passthrough`. So the loudest failure the ABI can produce would have been the
      quietest wrong answer there is, a year of weather returned unsplit and unremarked
    */
    const code = DECOMPOSITION_MODEL_CODES[model] as number | undefined
    if (code === undefined) throw new Error(`rustCore: no wire code for model ${String(model)}`)
    return withDecompositionSeries(series, (inPointer, count, outPointer) => {
      exports.agv_decompose_series(code, count, utcOffsetHours, inPointer, outPointer)
    })
  }

  const enforceConsistencySeries = (series: RustDecompositionSeries): RustIrradianceSeries =>
    withDecompositionSeries(series, (inPointer, count, outPointer) => {
      exports.agv_enforce_consistency_series(count, inPointer, outPointer)
    })

  const annualChain = (
    array: PvArray,
    hours: readonly RustChainHour[],
    options: PvChainOptions,
  ): RustArrayEnergy => {
    const count = hours.length
    const arrayPointer = exports.agv_alloc_f64(ARRAY_FIELDS)
    const optionsPointer = exports.agv_alloc_f64(CHAIN_OPTION_FIELDS)
    const hoursCount = Math.max(1, count * CHAIN_HOUR_FIELDS)
    const hoursPointer = exports.agv_alloc_f64(hoursCount)
    const outPointer = exports.agv_alloc_f64(ARRAY_ENERGY_FIELDS)
    try {
      const flatHours = new Float64Array(hoursCount)
      hours.forEach((hour, index) => {
        const at = index * CHAIN_HOUR_FIELDS
        flatHours[at] = hour.utcMillis
        flatHours[at + 1] = hour.ghiWM2
        flatHours[at + 2] = hour.dniWM2
        flatHours[at + 3] = hour.dhiWM2
        flatHours[at + 4] = hour.geometricElevationDeg
        flatHours[at + 5] = hour.apparentElevationDeg
        flatHours[at + 6] = hour.absoluteAirMass
        flatHours[at + 7] = hour.extraterrestrialNormalWM2
        flatHours[at + 8] = hour.azimuthDeg
        flatHours[at + 9] = hour.dryBulbC
        flatHours[at + 10] = hour.windSpeedMS
        flatHours[at + 11] = hour.snowCover
      })
      const memory = view(exports)
      memory.set(flattenArray(array), arrayPointer / BYTES_PER_F64)
      memory.set(flattenChainOptions(options), optionsPointer / BYTES_PER_F64)
      memory.set(flatHours, hoursPointer / BYTES_PER_F64)
      exports.agv_annual_chain(arrayPointer, hoursPointer, count, optionsPointer, outPointer)
      const flat = view(exports).subarray(
        outPointer / BYTES_PER_F64,
        outPointer / BYTES_PER_F64 + ARRAY_ENERGY_FIELDS,
      )
      const read = (index: number): number => flat[index] ?? Number.NaN
      return {
        moduleCount: read(0),
        apertureAreaM2: read(1),
        landAreaM2: read(2),
        groundCoverRatio: read(3),
        nameplateDcKw: read(4),
        nameplateAcKw: read(5),
        dcAcRatio: read(6),
        annualPoaKwhPerM2: read(7),
        bifacialGainFraction: read(8),
        rowShadingLossFraction: read(9),
        systemLossFraction: read(10),
        annualDcKwh: read(11),
        annualAcKwh: read(12),
        clippingLossKwh: read(13),
        clippingLossFraction: read(14),
        specificYieldKwhPerKwp: read(15),
        performanceRatio: read(16),
      }
    } finally {
      exports.agv_free_f64(arrayPointer, ARRAY_FIELDS)
      exports.agv_free_f64(optionsPointer, CHAIN_OPTION_FIELDS)
      exports.agv_free_f64(hoursPointer, hoursCount)
      exports.agv_free_f64(outPointer, ARRAY_ENERGY_FIELDS)
    }
  }

  const panelSnapshot = (
    array: PvArray,
    solarElevationDeg: number,
    solarAzimuthDeg: number,
  ): Float64Array => {
    const panels = array.geometry.rowCount * array.geometry.modulesPerRow
    const outCount = Math.max(1, panels * PANEL_CORNER_FIELDS)
    const arrayPointer = exports.agv_alloc_f64(ARRAY_FIELDS)
    const outPointer = exports.agv_alloc_f64(outCount)
    try {
      view(exports).set(flattenArray(array), arrayPointer / BYTES_PER_F64)
      exports.agv_panel_snapshot(arrayPointer, solarElevationDeg, solarAzimuthDeg, outPointer)
      return view(exports).slice(
        outPointer / BYTES_PER_F64,
        outPointer / BYTES_PER_F64 + panels * PANEL_CORNER_FIELDS,
      )
    } finally {
      exports.agv_free_f64(arrayPointer, ARRAY_FIELDS)
      exports.agv_free_f64(outPointer, outCount)
    }
  }

  const beamVisibility = (
    grid: RustGrid,
    panelCorners: Float64Array,
    sun: { readonly x: number; readonly y: number; readonly z: number },
    moduleTransmittance: number,
    subSamplesPerCell: number,
  ): Float32Array => {
    const cells = grid.cols * grid.rows
    const panelCount = Math.floor(panelCorners.length / PANEL_CORNER_FIELDS)
    const panelsCount = Math.max(1, panelCorners.length)
    const panelsPointer = exports.agv_alloc_f64(panelsCount)
    const outPointer = exports.agv_alloc_f64(Math.max(1, cells))
    try {
      view(exports).set(panelCorners, panelsPointer / BYTES_PER_F64)
      exports.agv_beam_visibility(
        grid.minXM,
        grid.minYM,
        grid.cellSizeM,
        grid.cols,
        grid.rows,
        panelsPointer,
        panelCount,
        sun.x,
        sun.y,
        sun.z,
        moduleTransmittance,
        subSamplesPerCell,
        outPointer,
      )
      const flat = view(exports).subarray(
        outPointer / BYTES_PER_F64,
        outPointer / BYTES_PER_F64 + cells,
      )
      return Float32Array.from(flat)
    } finally {
      exports.agv_free_f64(panelsPointer, panelsCount)
      exports.agv_free_f64(outPointer, Math.max(1, cells))
    }
  }

  return {
    spaSeriesFlat,
    spaSeries,
    perezSeries,
    decomposeSeries,
    enforceConsistencySeries,
    annualChain,
    panelSnapshot,
    beamVisibility,
  }
}
