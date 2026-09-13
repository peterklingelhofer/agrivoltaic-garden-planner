export type Rgb = readonly [number, number, number]

// Viridis control points: perceptually uniform, colour-vision safe, and legible on
// both light and dark chrome because its lightness ramp is monotonic
const VIRIDIS: readonly Rgb[] = [
  [68, 1, 84],
  [72, 40, 120],
  [62, 74, 137],
  [49, 104, 142],
  [38, 130, 142],
  [31, 158, 137],
  [53, 183, 121],
  [109, 205, 89],
  [253, 231, 37],
]

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value)

const at = (index: number): Rgb => VIRIDIS[index] ?? VIRIDIS[0] ?? [0, 0, 0]

export const viridis = (t: number): Rgb => {
  const x = clamp01(Number.isFinite(t) ? t : 0) * (VIRIDIS.length - 1)
  const i = Math.floor(x)
  const f = x - i
  const a = at(i)
  const b = at(Math.min(i + 1, VIRIDIS.length - 1))
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ]
}

export const rgbCss = ([r, g, b]: Rgb): string => `rgb(${r} ${g} ${b})`

export const viridisGradientCss = (steps = 9): string =>
  `linear-gradient(90deg, ${Array.from({ length: steps }, (_, i) =>
    rgbCss(viridis(i / (steps - 1))),
  ).join(', ')})`

export const normalise = (value: number, min: number, max: number): number =>
  max > min ? clamp01((value - min) / (max - min)) : 0

/** Steps a reader can add up in their head, which is the only reason to prefer one interval */
const NICE_STEPS = [1, 2, 2.5, 5, 10] as const

/** Enough lines to read a gradient by, few enough to read a number off each */
const CONTOUR_LINES = 8

/**
 * The interval between iso-lines, in the field's own units.
 *
 * One definition for the lines drawn on the ground and the ticks printed on the legend, for the
 * same reason `viridis` is one definition: a contour whose value is not the value beside it on
 * the legend is a decoration, and this overlay is a model output. Returns 0 for a field with no
 * range, where every line would sit on top of the last
 */
export const contourStep = (min: number, max: number): number => {
  const range = max - min
  if (!Number.isFinite(range) || range <= 0) return 0
  const target = range / CONTOUR_LINES
  const magnitude = 10 ** Math.floor(Math.log10(target))
  const step = NICE_STEPS.find((nice) => nice * magnitude >= target) ?? 10
  return step * magnitude
}

/**
 * What a fully drawn iso-line multiplies the ramp colour under it by, in linear light.
 *
 * A multiple of the ramp colour rather than a colour of its own, so a line is a darker version
 * of the value it marks. `src/scene/colour.test.ts` pins that the result is nowhere near another
 * ramp entry, so no reader can mistake a contour for a lower reading, and
 * `e2e/overlay-colour.spec.ts` looks for exactly this colour in the rendered pixels
 */
export const CONTOUR_LINE_FACTOR = 0.45

/** Every multiple of the step inside the field's range, which is what the lines are drawn at */
export const contourValues = (min: number, max: number): readonly number[] => {
  const step = contourStep(min, max)
  if (step <= 0) return []
  const values: number[] = []
  for (let n = Math.ceil(min / step); n * step <= max + step * 1e-9; n += 1) {
    const value = n * step
    if (value > min) values.push(value)
  }
  return values
}
