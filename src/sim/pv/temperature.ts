import type {
  CellTemperatureModel,
  FaimanCoefficients,
  SapmThermalCoefficients,
} from '../../types/energy'
import type { Celsius, MetersPerSecond, WattsPerM2 } from '../../types/units'

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

export const SAPM_CLOSE_MOUNT_GLASS_GLASS: SapmThermalCoefficients = {
  a: -2.98,
  b: -0.0471,
  deltaTC: 1,
}

export const SAPM_OPEN_RACK_GLASS_POLYMER: SapmThermalCoefficients = {
  a: -3.56,
  b: -0.075,
  deltaTC: 3,
}

const STC_IRRADIANCE_W_M2 = 1000

// T_module = T_air + G_poa / (u0 + u1 * v_wind)
export const faimanCellTemperature = (
  poaWM2: WattsPerM2,
  airTempC: Celsius,
  windSpeedMS: MetersPerSecond,
  coefficients: FaimanCoefficients = FAIMAN_DEFAULT,
): Celsius =>
  (airTempC +
    poaWM2 /
      Math.max(coefficients.u0 + coefficients.u1 * Math.max(windSpeedMS, 0), 1e-6)) as Celsius

// T_module = G_poa * exp(a + b * v_wind) + T_air
export const sapmModuleTemperature = (
  poaWM2: WattsPerM2,
  airTempC: Celsius,
  windSpeedMS: MetersPerSecond,
  coefficients: SapmThermalCoefficients,
): Celsius =>
  (poaWM2 * Math.exp(coefficients.a + coefficients.b * Math.max(windSpeedMS, 0)) +
    airTempC) as Celsius

// T_cell = T_module + (G_poa / 1000) * dT
export const sapmCellTemperature = (
  poaWM2: WattsPerM2,
  airTempC: Celsius,
  windSpeedMS: MetersPerSecond,
  coefficients: SapmThermalCoefficients = SAPM_OPEN_RACK_GLASS_GLASS,
): Celsius =>
  (sapmModuleTemperature(poaWM2, airTempC, windSpeedMS, coefficients) +
    (poaWM2 / STC_IRRADIANCE_W_M2) * coefficients.deltaTC) as Celsius

export const cellTemperature = (
  model: CellTemperatureModel,
  poaWM2: WattsPerM2,
  airTempC: Celsius,
  windSpeedMS: MetersPerSecond,
  faiman: FaimanCoefficients,
  sapm: SapmThermalCoefficients,
): Celsius =>
  model === 'sapm'
    ? sapmCellTemperature(poaWM2, airTempC, windSpeedMS, sapm)
    : faimanCellTemperature(poaWM2, airTempC, windSpeedMS, faiman)
