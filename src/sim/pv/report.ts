import type { ArrayEnergy, PvChainOptions, PvEnergyReport } from '../../types/energy'
import type { PvArray } from '../../types/pv'
import type { Site } from '../../types/site'
import type {
  Fraction,
  KilowattHours,
  KilowattsAc,
  KilowattsDc,
  KwhPerKwp,
  Ratio,
  SquareMeters,
} from '../../types/units'
import type { TmySeries } from '../../types/weather'
import { observerFor, solarPositionSeries } from '../solar'
import { DEFAULT_PV_CHAIN_OPTIONS, runAnnualChain } from './chain'
import { energyRatio } from './ler'
import { PV_CHAIN_PROVENANCE } from './provenance'

const sum = (energies: readonly ArrayEnergy[], pick: (entry: ArrayEnergy) => number): number =>
  energies.reduce((total, entry) => total + pick(entry), 0)

/** Fractions are per-array, so the plot figure is weighted by DC nameplate, never averaged flat */
const weighted = (
  energies: readonly ArrayEnergy[],
  pick: (entry: ArrayEnergy) => number,
): Fraction => {
  const nameplate = sum(energies, (entry) => entry.nameplateDcKw)
  return (
    nameplate > 0 ? sum(energies, (entry) => pick(entry) * entry.nameplateDcKw) / nameplate : 0
  ) as Fraction
}

export const pvEnergyReport = (
  site: Site,
  arrays: readonly PvArray[],
  weather: TmySeries,
  options: PvChainOptions = DEFAULT_PV_CHAIN_OPTIONS,
): PvEnergyReport => {
  const observer = observerFor(site)
  const position = solarPositionSeries(weather.utcMillis, observer, 'nrel-spa')
  const energies = arrays.map((array) => runAnnualChain(array, weather, position, options))

  const dcKw = sum(energies, (entry) => entry.nameplateDcKw)
  const acKw = sum(energies, (entry) => entry.nameplateAcKw)
  const acKwh = sum(energies, (entry) => entry.annualAcKwh)
  const clippedKwh = sum(energies, (entry) => entry.clippingLossKwh)
  const landAreaM2 = sum(energies, (entry) => entry.landAreaM2)
  const { ratio, reference } = energyRatio(
    arrays,
    energies,
    site.location.latitudeDeg,
    weather,
    position,
    options,
  )

  return {
    arrays: energies,
    nameplateDcKw: dcKw as KilowattsDc,
    nameplateAcKw: acKw as KilowattsAc,
    dcAcRatio: (acKw > 0 ? dcKw / acKw : 0) as Ratio,
    annualAcKwh: acKwh as KilowattHours,
    clippingLossKwh: clippedKwh as KilowattHours,
    clippingLossFraction: (acKwh + clippedKwh > 0
      ? clippedKwh / (acKwh + clippedKwh)
      : 0) as Fraction,
    losses: options.losses,
    systemLossFraction: weighted(energies, (entry) => entry.systemLossFraction),
    rowShadingLossFraction: weighted(energies, (entry) => entry.rowShadingLossFraction),
    bifacialGainFraction: weighted(energies, (entry) => entry.bifacialGainFraction),
    specificYieldKwhPerKwp: (dcKw > 0 ? acKwh / dcKw : 0) as KwhPerKwp,
    annualAcKwhPerM2Land: landAreaM2 > 0 ? acKwh / landAreaM2 : 0,
    landAreaM2: landAreaM2 as SquareMeters,
    reference,
    energyRatio: ratio,
    provenance: PV_CHAIN_PROVENANCE,
  }
}
