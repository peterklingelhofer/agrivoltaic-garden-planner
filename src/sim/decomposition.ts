import type { DecompositionModel, SolarPositionSeries, TmySeries } from '../types/weather'
import { requirePhysicsCore } from './core'

/**
 * Splitting a global horizontal measurement into its beam and diffuse parts, computed by
 * `crates/agv-sim`.
 *
 * Erbs 1982, Maxwell's DISC, Perez et al.'s DIRINT over its 1,260-entry table and Engerer 2 all
 * live in `crates/agv-sim/src/decomposition.rs`, held to pvlib's published output by
 * `crates/agv-sim/tests/pvlib_decomposition.rs`. The DIRINT table lives there too, in
 * `crates/agv-sim/src/dirint_tables.rs`
 */

/**
 * Which model the available data and the timestep permit.
 *
 * **The one thing in this file deliberately implemented in both languages.** It is a policy branch
 * with no numerics in it: DIRINT reads a neighbor on each side to estimate how fast the sky is
 * changing, which is a statement about hours, and below an hour Engerer 2 takes over. Routing three
 * comparisons through a wasm call would be absurd, and a native program built on the crate would
 * make this choice for itself anyway. `crates/agv-sim/tests/pvlib_decomposition.rs` pins the Rust
 * copy to the same three cases this one encodes
 */
export const selectDecompositionModel = (
  hasDniAndDhi: boolean,
  timestepMinutes: number,
): DecompositionModel =>
  hasDniAndDhi ? 'passthrough' : timestepMinutes >= 60 ? 'dirint' : 'engerer2'

const cloneSeries = (series: TmySeries, overrides: Partial<TmySeries>): TmySeries => ({
  ...series,
  utcMillis: new Float64Array(series.utcMillis),
  ghiWM2: new Float32Array(series.ghiWM2),
  dniWM2: new Float32Array(series.dniWM2),
  dhiWM2: new Float32Array(series.dhiWM2),
  dryBulbC: new Float32Array(series.dryBulbC),
  dewPointC: new Float32Array(series.dewPointC),
  windSpeedMS: new Float32Array(series.windSpeedMS),
  pressureMb: new Float32Array(series.pressureMb),
  ...overrides,
})

export const decompose = (
  series: TmySeries,
  position: SolarPositionSeries,
  model: DecompositionModel,
): TmySeries => {
  const split = requirePhysicsCore().decomposeSeries(
    {
      utcMillis: series.utcMillis,
      ghiWM2: series.ghiWM2,
      dniWM2: series.dniWM2,
      dhiWM2: series.dhiWM2,
      geometricElevationDeg: position.geometricElevationDeg,
      apparentElevationDeg: position.apparentElevationDeg,
      absoluteAirMass: position.absoluteAirMass,
      extraterrestrialNormalWM2: position.extraterrestrialNormalWM2,
    },
    model,
    series.utcOffsetHours,
  )
  // the split arrays are fresh `Float32Array`s of the right length and nothing else holds them,
  // so this copies once and no buffer is shared with wasm linear memory
  return cloneSeries(series, {
    decomposition: model,
    ghiWM2: split.ghiWM2,
    dniWM2: split.dniWM2,
    dhiWM2: split.dhiWM2,
  })
}
