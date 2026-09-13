import type { Celsius, WattsPerM2 } from '../../types/units'

/** PVWatts v5 default temperature coefficient of power for crystalline silicon, per degree C */
export const PVWATTS_GAMMA_PDC_PER_C = -0.0047

export const PVWATTS_REFERENCE_TEMP_C = 25 as Celsius

const STC_IRRADIANCE_W_M2 = 1000

/**
 * PVWatts v5 DC model: Pdc = (G_poa / 1000) * Pdc0 * (1 + gamma * (Tcell - 25)).
 * Pdc0 is the array DC nameplate, so the result is in the same unit
 */
export const pvwattsDc = (
  poaWM2: WattsPerM2,
  cellTempC: Celsius,
  nameplateDc: number,
  gammaPdcPerC: number,
): number =>
  poaWM2 <= 0
    ? 0
    : Math.max(
        0,
        (poaWM2 / STC_IRRADIANCE_W_M2) *
          nameplateDc *
          (1 + gammaPdcPerC * (cellTempC - PVWATTS_REFERENCE_TEMP_C)),
      )
