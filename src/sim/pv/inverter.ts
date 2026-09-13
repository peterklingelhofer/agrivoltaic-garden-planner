import type { InverterModel } from '../../types/energy'
import type { Fraction, KilowattsAc, KilowattsDc, Ratio } from '../../types/units'

/**
 * Agrivoltaic layouts are routinely oversized against the inverter. This is where clipping starts
 */
export const DEFAULT_DC_AC_RATIO = 1.2 as Ratio

/** PVWatts v5 inverter defaults: 96% nominal against a 96.37% reference curve */
export const PVWATTS_INVERTER: InverterModel = {
  nominalEfficiency: 0.96 as Fraction,
  referenceEfficiency: 0.9637 as Fraction,
}

export interface InverterOutput {
  readonly acKw: number
  /** AC power the inverter couldn't pass because it was already at its rating */
  readonly clippedKw: number
}

/**
 * PVWatts v5 inverter curve, eta = (eta_nom / eta_ref) * (-0.0162 z - 0.0059 / z + 0.9858)
 * with z the DC loading fraction, then hard-limited at the AC rating. The limit
 * is the whole point at agrivoltaic DC:AC ratios, so it's never optional
 */
export const pvwattsAc = (
  dcKw: number,
  inverterDcRatingKw: number,
  inverter: InverterModel = PVWATTS_INVERTER,
): InverterOutput => {
  const acRatingKw = inverter.nominalEfficiency * inverterDcRatingKw
  if (dcKw <= 0 || inverterDcRatingKw <= 0) return { acKw: 0, clippedKw: 0 }
  const zeta = dcKw / inverterDcRatingKw
  const efficiency =
    (inverter.nominalEfficiency / inverter.referenceEfficiency) *
    (-0.0162 * zeta - 0.0059 / zeta + 0.9858)
  const unlimitedKw = Math.max(0, efficiency * dcKw)
  const acKw = Math.min(acRatingKw, unlimitedKw)
  return { acKw, clippedKw: unlimitedKw - acKw }
}

/** AC nameplate follows from the DC nameplate and the chosen DC:AC ratio */
export const inverterAcRatingKw = (nameplateDcKw: number, dcAcRatio: number): number =>
  dcAcRatio > 0 ? nameplateDcKw / dcAcRatio : 0

/**
 * The branded AC nameplate. Every AC figure in the product comes through here, so a DC quantity can
 * never be relabeled as AC
 */
export const nameplateAcKw = (
  nameplateDcKw: KilowattsDc,
  dcAcRatio: Ratio = DEFAULT_DC_AC_RATIO,
): KilowattsAc => inverterAcRatingKw(nameplateDcKw, dcAcRatio) as KilowattsAc

export const inverterDcRatingKw = (
  nameplateDcKw: number,
  dcAcRatio: number,
  inverter: InverterModel = PVWATTS_INVERTER,
): number => inverterAcRatingKw(nameplateDcKw, dcAcRatio) / inverter.nominalEfficiency
