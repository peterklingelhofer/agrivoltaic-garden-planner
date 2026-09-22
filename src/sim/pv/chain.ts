import type { ArrayEnergy, PvChainOptions } from '../../types/energy'
import type { Site } from '../../types/site'
import type { PvArray } from '../../types/pv'
import { requirePhysicsCore } from '../core'
import { at } from '../math'
import type { RustChainHour } from '../rust-core'
import { DEFAULT_GROUND_COVER, groundAlbedoOf, type GroundCover } from '../../types/ground'
import type {
  Fraction,
  KilowattHours,
  KilowattsAc,
  KilowattsDc,
  KwhPerKwp,
  Ratio,
  SquareMeters,
} from '../../types/units'
import type { SolarPositionSeries, TmySeries } from '../../types/weather'
import { snowCoverSeries } from '../snow'
import { PVWATTS_GAMMA_PDC_PER_C } from './dc'
import { DEFAULT_DC_AC_RATIO, PVWATTS_INVERTER } from './inverter'
import { overrideLoss, PVWATTS_DEFAULT_LOSSES } from './losses'
import { FAIMAN_DEFAULT, SAPM_OPEN_RACK_GLASS_GLASS } from './temperature'

export { DEFAULT_DC_AC_RATIO }

export const DEFAULT_PV_CHAIN_OPTIONS: PvChainOptions = {
  cellTemperatureModel: 'faiman',
  faiman: FAIMAN_DEFAULT,
  sapm: SAPM_OPEN_RACK_GLASS_GLASS,
  gammaPdcPerC: PVWATTS_GAMMA_PDC_PER_C,
  losses: overrideLoss(
    PVWATTS_DEFAULT_LOSSES,
    'shading',
    0,
    'Shading: counted in the row-to-row shading line below',
  ),
  dcAcRatio: DEFAULT_DC_AC_RATIO,
  inverter: PVWATTS_INVERTER,
  bifacial: true,
  rowShading: true,
  groundAlbedo: groundAlbedoOf(DEFAULT_GROUND_COVER),
  snowCover: null,
}

/**
 * The chain's settings for one garden: the ground it stands on, and the part of the year that
 * ground spends white.
 *
 * Built here, common to all three call sites, in the editor's report and twice inside the design
 * search, so none of them hands `DEFAULT_PV_CHAIN_OPTIONS` to a garden that has a cover and a
 * winter. Two of them disagreeing about the ground would make a suggested layout quote a different
 * year than the same layout does once applied
 */
export const chainOptionsFor = (
  site: Site,
  weather: TmySeries,
  groundCover: GroundCover,
  base: PvChainOptions = DEFAULT_PV_CHAIN_OPTIONS,
): PvChainOptions => ({
  ...base,
  groundAlbedo: groundAlbedoOf(groundCover),
  snowCover: snowCoverSeries(site.normals, weather.utcMillis),
})

/**
 * One year of the single-node chain, computed by `crates/agv-sim`.
 *
 * Perez POA -> row shading -> rear-side gain -> cell temperature -> PVWatts DC -> loss stack ->
 * inverter with clipping, all inside `crates/agv-sim/src/pv/chain.rs`. Solar position is never
 * re-derived there either: it arrives already computed.
 *
 * The whole year crosses the boundary in one call, and that is the reason the chain moved as one
 * unit: it evaluates transposition 8,760 times, and a wasm crossing per hour would have cost far
 * more than the arithmetic it was crossing for
 */
export const runAnnualChain = (
  array: PvArray,
  weather: TmySeries,
  position: SolarPositionSeries,
  options: PvChainOptions,
): ArrayEnergy => {
  const hours = Math.min(weather.ghiWM2.length, position.count)
  const chainHours: RustChainHour[] = Array.from({ length: hours }, (_unused, i) => ({
    utcMillis: at(weather.utcMillis, i),
    ghiWM2: at(weather.ghiWM2, i),
    dniWM2: at(weather.dniWM2, i),
    dhiWM2: at(weather.dhiWM2, i),
    geometricElevationDeg: at(position.geometricElevationDeg, i),
    apparentElevationDeg: at(position.apparentElevationDeg, i),
    absoluteAirMass: at(position.absoluteAirMass, i),
    extraterrestrialNormalWM2: at(position.extraterrestrialNormalWM2, i),
    azimuthDeg: at(position.azimuthDeg, i),
    dryBulbC: at(weather.dryBulbC, i),
    windSpeedMS: at(weather.windSpeedMS, i),
    // a null snow series and an all-zero one are the same thing, since a cover of zero leaves the
    // albedo untouched, so a null series crosses as zeros
    snowCover: options.snowCover === null ? 0 : at(options.snowCover, i),
  }))

  const energy = requirePhysicsCore().annualChain(array, chainHours, options)
  return {
    arrayId: array.id,
    moduleCount: energy.moduleCount,
    apertureAreaM2: energy.apertureAreaM2 as SquareMeters,
    landAreaM2: energy.landAreaM2 as SquareMeters,
    groundCoverRatio: energy.groundCoverRatio as Fraction,
    nameplateDcKw: energy.nameplateDcKw as KilowattsDc,
    nameplateAcKw: energy.nameplateAcKw as KilowattsAc,
    dcAcRatio: energy.dcAcRatio as Ratio,
    annualPoaKwhPerM2: energy.annualPoaKwhPerM2,
    bifacialGainFraction: energy.bifacialGainFraction as Fraction,
    rowShadingLossFraction: energy.rowShadingLossFraction as Fraction,
    systemLossFraction: energy.systemLossFraction as Fraction,
    annualDcKwh: energy.annualDcKwh as KilowattHours,
    annualAcKwh: energy.annualAcKwh as KilowattHours,
    clippingLossKwh: energy.clippingLossKwh as KilowattHours,
    clippingLossFraction: energy.clippingLossFraction as Fraction,
    specificYieldKwhPerKwp: energy.specificYieldKwhPerKwp as KwhPerKwp,
    performanceRatio: energy.performanceRatio as Fraction,
  }
}
