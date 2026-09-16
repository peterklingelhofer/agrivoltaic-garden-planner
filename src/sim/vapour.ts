// FAO-56's saturation vapour pressure, shared by the water balance (src/data/water.ts) and the
// Growing Season Index (src/sim/phenology.ts), which both need it off a plain air temperature
export const saturationVapourPressureKpa = (tempC: number): number =>
  0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3))
