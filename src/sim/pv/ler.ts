import { banded, interval, widenBand } from '../../types/band'
import type { Banded, UncertaintyContribution } from '../../types/band'
import type { ArrayEnergy, PvChainOptions, ReferenceSystem } from '../../types/energy'
import type { PvArray } from '../../types/pv'
import type { DegreesLatitude, Degrees, Fraction, Meters, Ratio } from '../../types/units'
import type { SolarPositionSeries, TmySeries } from '../../types/weather'
import { clamp } from '../math'
import { runAnnualChain } from './chain'

/** Sole-use fixed-tilt plants are conventionally built here; the ratio scales inversely with it */
export const REFERENCE_GROUND_COVER_RATIO = 0.4 as Fraction
export const REFERENCE_GCR_BOUNDS: readonly [number, number] = [0.35, 0.45]
export const REFERENCE_DC_AC_RATIO = 1.2 as Ratio
export const REFERENCE_MAX_TILT_DEG = 35
export const REFERENCE_MIN_TILT_DEG = 10

export const REFERENCE_DEFINITION =
  'Sole-use reference: a monoculture-equivalent fixed-tilt PV plant on the same land, using the same modules, inverter model and loss stack, at ground cover ratio 0.40, equator-facing, tilted at the site latitude clamped to 10-35 degrees, DC:AC ratio 1.20. Both systems are expressed as annual AC kWh per square metre of land, land area being module aperture divided by ground cover ratio. LER formulation after Dupraz et al. 2011'

export const referenceTiltDeg = (latitudeDeg: DegreesLatitude): Degrees =>
  clamp(Math.abs(latitudeDeg), REFERENCE_MIN_TILT_DEG, REFERENCE_MAX_TILT_DEG) as Degrees

export const referenceAzimuthDeg = (latitudeDeg: DegreesLatitude): Degrees =>
  (latitudeDeg >= 0 ? 180 : 0) as Degrees

/**
 * Same hardware, sole-use layout. Keeping the module identical is deliberate:
 * it makes the ratio isolate the agrivoltaic design decision rather than the
 * module technology, which is what Dupraz et al. 2011 compared
 */
export const referenceArray = (array: PvArray, latitudeDeg: DegreesLatitude): PvArray => ({
  ...array,
  tracker: {
    mode: 'fixed',
    tiltDeg: referenceTiltDeg(latitudeDeg),
    surfaceAzimuthDeg: referenceAzimuthDeg(latitudeDeg),
  },
  geometry: {
    ...array.geometry,
    pitchM: (array.geometry.collectorWidthM / REFERENCE_GROUND_COVER_RATIO) as Meters,
  },
})

const gcrHalfWidth = (): number => {
  const [low, high] = REFERENCE_GCR_BOUNDS
  return (REFERENCE_GROUND_COVER_RATIO / low - REFERENCE_GROUND_COVER_RATIO / high) / 2
}

export const REFERENCE_DEFINITION_CONTRIBUTION: UncertaintyContribution = {
  source: 'optical-geometry',
  halfWidthFraction: gcrHalfWidth() as Fraction,
  note: `The reference is defined at ground cover ratio ${String(REFERENCE_GROUND_COVER_RATIO)}; sole-use plants are built between ${String(REFERENCE_GCR_BOUNDS[0])} and ${String(REFERENCE_GCR_BOUNDS[1])} and the ratio scales inversely with that choice`,
}

export const ROW_SHADING_CONTRIBUTION: UncertaintyContribution = {
  source: 'optical-geometry',
  halfWidthFraction: 0.03 as Fraction,
  note: "Row-to-row shading is a pitch-averaged infinite-row derate on the beam component with no electrical mismatch or bypass-diode behaviour. The dense reference self-shades far more than a widely spaced agrivoltaic array, so it doesn't cancel between numerator and denominator",
}

const energyPerLandArea = (energies: readonly ArrayEnergy[]): number => {
  const land = energies.reduce((total, entry) => total + entry.landAreaM2, 0)
  const ac = energies.reduce((total, entry) => total + entry.annualAcKwh, 0)
  return land > 0 ? ac / land : 0
}

/**
 * The electricity partial of a plot with no panels on it: a zero band, which is what `energyRatio`
 * returns for the no-array control (no land, so a midpoint of 0, and every contribution is a
 * fraction of it). Built once here so a garden with no arrays can still be planted and its
 * combinations scored, with the electricity term saying honestly that there is none
 */
export const NO_ARRAY_ENERGY_RATIO: Banded<Fraction> = banded(
  interval(0 as Fraction, 0 as Fraction),
  0.8,
  'range',
  'optical-geometry',
  [],
)

export const energyRatioMidpoint = (
  agrivoltaic: readonly ArrayEnergy[],
  reference: readonly ArrayEnergy[],
): number => {
  const denominator = energyPerLandArea(reference)
  return denominator > 0 ? energyPerLandArea(agrivoltaic) / denominator : 0
}

const referenceOptions = (options: PvChainOptions): PvChainOptions => ({
  ...options,
  dcAcRatio: REFERENCE_DC_AC_RATIO,
})

export interface EnergyRatioResult {
  readonly ratio: Banded<Fraction>
  readonly reference: ReferenceSystem
  readonly referenceEnergies: readonly ArrayEnergy[]
}

/**
 * The electricity term of the agrivoltaic land equivalent ratio. The band is
 * built from named contributions, never asserted: the reference-system
 * definition dominates, the cell-temperature model form is measured by running
 * the chain both ways, and the shading treatment is the one term that does not
 * cancel between numerator and denominator
 */
export const energyRatio = (
  arrays: readonly PvArray[],
  agrivoltaic: readonly ArrayEnergy[],
  latitudeDeg: DegreesLatitude,
  weather: TmySeries,
  position: SolarPositionSeries,
  options: PvChainOptions,
): EnergyRatioResult => {
  const refOptions = referenceOptions(options)
  const references = arrays.map((array) =>
    runAnnualChain(referenceArray(array, latitudeDeg), weather, position, refOptions),
  )
  const midpoint = energyRatioMidpoint(agrivoltaic, references)

  const alternate: PvChainOptions = {
    ...options,
    cellTemperatureModel: options.cellTemperatureModel === 'faiman' ? 'sapm' : 'faiman',
  }
  const alternateRatio = energyRatioMidpoint(
    arrays.map((array) => runAnnualChain(array, weather, position, alternate)),
    arrays.map((array) =>
      runAnnualChain(referenceArray(array, latitudeDeg), weather, position, {
        ...alternate,
        dcAcRatio: REFERENCE_DC_AC_RATIO,
      }),
    ),
  )
  const modelSpread = midpoint > 0 ? Math.abs(alternateRatio - midpoint) / (2 * midpoint) : 0

  const cellTemperatureContribution: UncertaintyContribution = {
    source: 'optical-geometry',
    halfWidthFraction: modelSpread as Fraction,
    note: `Measured spread between the Faiman and Sandia cell-temperature models, ${(modelSpread * 200).toFixed(2)} percent of the ratio. It is small because both systems are run through the same model`,
  }

  const contributions = [
    REFERENCE_DEFINITION_CONTRIBUTION,
    ROW_SHADING_CONTRIBUTION,
    cellTemperatureContribution,
  ]
  const ratio = contributions.reduce(
    widenBand<Fraction>,
    banded(
      interval(midpoint as Fraction, midpoint as Fraction),
      0.8,
      'range',
      'optical-geometry',
      [],
    ),
  )

  return {
    ratio,
    referenceEnergies: references,
    reference: {
      groundCoverRatio: REFERENCE_GROUND_COVER_RATIO,
      tiltDeg: referenceTiltDeg(latitudeDeg),
      surfaceAzimuthDeg: referenceAzimuthDeg(latitudeDeg),
      dcAcRatio: REFERENCE_DC_AC_RATIO,
      definition: REFERENCE_DEFINITION,
      annualAcKwhPerM2Land: energyPerLandArea(references),
    },
  }
}
