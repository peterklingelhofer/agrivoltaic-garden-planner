import type { Degrees, Fraction, WattsPerM2 } from '../types/units'
import { requirePhysicsCore } from './core'

/**
 * Plane-of-array irradiance, computed by `crates/agv-sim`.
 *
 * The Perez 1990 implementation, the isotropic and Hay & Davies models beside it and the
 * eight-bin coefficient lookup all live in `crates/agv-sim/src/transposition.rs` now. What is
 * left here is the type the rest of the application speaks and a batched call, and it is batched
 * because that is the only shape worth crossing a wasm boundary for: the annual chain asks this
 * question 8,760 times and one crossing per hour would cost more than the arithmetic.
 *
 * `runAnnualChain` no longer calls this at all; it hands the whole year to the core in one go.
 * This remains for callers that want transposition on its own.
 */
export interface TranspositionInput {
  readonly dniWM2: WattsPerM2
  readonly dhiWM2: WattsPerM2
  readonly ghiWM2: WattsPerM2
  readonly zenithDeg: Degrees
  /**
   * Kasten-Young at sea-level pressure, NOT pressure-corrected.
   *
   * Perez 1990 is fitted against this one and pvlib's `perez` documents the same. The
   * pressure-corrected air mass on a solar position sample is what DISC and DIRINT want, and the
   * two are not interchangeable: `docs/VALIDATION.md` section 1 measures what swapping them cost.
   */
  readonly relativeAirMass: number
  readonly extraterrestrialNormalWM2: WattsPerM2
  readonly surfaceTiltDeg: Degrees
  readonly surfaceAzimuthDeg: Degrees
  readonly solarAzimuthDeg: Degrees
  readonly groundAlbedo: Fraction
}

export interface PoaComponents {
  readonly beamWM2: WattsPerM2
  readonly skyDiffuseWM2: WattsPerM2
  readonly groundReflectedWM2: WattsPerM2
  readonly globalWM2: WattsPerM2
}

export const perezTransposition1990Series = (
  samples: readonly TranspositionInput[],
): readonly PoaComponents[] => requirePhysicsCore().perezSeries(samples) as readonly PoaComponents[]

/** One sample, for the callers that have one. A series of length one; there is no cheaper route */
export const perezTransposition1990 = (input: TranspositionInput): PoaComponents => {
  const [only] = perezTransposition1990Series([input])
  if (only === undefined) throw new Error('perezTransposition1990: the core returned no sample')
  return only
}
