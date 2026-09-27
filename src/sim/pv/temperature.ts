import type { FaimanCoefficients, SapmThermalCoefficients } from '../../types/energy'

/**
 * IEC 61853-2 free-standing defaults, the values pvlib ships as
 * `temperature.faiman(u0=25.0, u1=6.84)`
 */
export const FAIMAN_DEFAULT: FaimanCoefficients = { u0: 25.0, u1: 6.84 }

/** Sandia/King module-temperature coefficients, pvlib `sapm` open_rack_glass_glass */
export const SAPM_OPEN_RACK_GLASS_GLASS: SapmThermalCoefficients = {
  a: -3.47,
  b: -0.0594,
  deltaTC: 3,
}
