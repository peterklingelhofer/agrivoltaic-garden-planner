// This directory is framework-free: no imports of three or react, ever

export const DEG_TO_RAD = Math.PI / 180
export const RAD_TO_DEG = 180 / Math.PI

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

export function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI
}

export function normaliseDegrees(value: number): number {
  const wrapped = value % 360
  return wrapped < 0 ? wrapped + 360 : wrapped
}

export const sinDeg = (value: number): number => Math.sin(value * DEG_TO_RAD)
export const cosDeg = (value: number): number => Math.cos(value * DEG_TO_RAD)
export const tanDeg = (value: number): number => Math.tan(value * DEG_TO_RAD)

export const at = (values: ArrayLike<number>, index: number): number => values[index] ?? 0

export function sum(values: ArrayLike<number>): number {
  let total = 0
  for (let i = 0; i < values.length; i += 1) total += at(values, i)
  return total
}

export function mean(values: ArrayLike<number>): number {
  return values.length === 0 ? 0 : sum(values) / values.length
}
