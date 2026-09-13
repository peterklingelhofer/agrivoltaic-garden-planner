import type { ModuleSpec } from '../../types/pv'
import type { Degrees, Fraction, WattsPerM2 } from '../../types/units'
import { cosDeg } from '../math'
import { interreflectionGain, rearSidePoa } from '../viewfactor'

/**
 * Rear-side irradiance for the single-node chain, reusing the existing rear POA
 * and inter-reflection terms rather than a second bifacial model.
 *
 * The rear plane sits at 180 - tilt, so its view factor to the sky is
 * (1 - cos tilt) / 2 and the remainder is its view of the ground. Ground
 * irradiance is taken pitch-averaged at the unshaded fraction 1 - GCR, which is
 * the infinite-row approximation Marion et al. 2017 formalises.
 *
 * CAVEAT: the inter-reflection term's published 3-8% magnitude for white
 * backsheets is UNVERIFIABLE per the verification document. The two-surface radiosity
 * formula is valid theory, but no PV paper states that range, so the gain here
 * is a modelled quantity and not a sourced one. With the glass-glass default
 * rear reflectance of 0.05 it moves the answer by well under 1%
 */
export const rearPoaWM2 = (
  ghiWM2: WattsPerM2,
  tiltDeg: Degrees,
  groundAlbedo: Fraction,
  groundCoverRatio: Fraction,
  moduleSpec: ModuleSpec,
): WattsPerM2 => {
  if (moduleSpec.bifacialityFactor <= 0 || ghiWM2 <= 0) return 0 as WattsPerM2
  const groundSkyViewFactor = Math.max(0, 1 - groundCoverRatio) as Fraction
  const rearSkyViewFactor = ((1 - cosDeg(tiltDeg)) / 2) as Fraction
  const groundIrradiance =
    ghiWM2 *
    groundSkyViewFactor *
    interreflectionGain(groundSkyViewFactor, groundAlbedo, moduleSpec.rearReflectance)
  return rearSidePoa(
    Float32Array.of(groundIrradiance),
    groundAlbedo,
    rearSkyViewFactor,
    moduleSpec.bifacialityFactor,
  )
}
