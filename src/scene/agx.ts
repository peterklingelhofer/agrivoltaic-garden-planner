/**
 * three's AgX, forwards and backwards, so a screenshot can be read as scene radiance.
 *
 * Nothing in the app imports this: it is the instrument, kept beside the pipeline it measures,
 * separate from the test that uses it, because a measurement of the shipped tone curve has to
 * move whenever the shipped tone curve does.
 *
 * The renderer's output is display-referred: every pixel has been through the tone curve in
 * `three/src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js` and the sRGB
 * transfer function after it. A claim about how bright shaded ground is *relative to sunlit
 * ground* is a claim about linear scene radiance, so the only way to make it from pixels is to
 * undo both. Everything below is transcribed from that chunk, and `agx.test.ts` pins the round
 * trip: a value that survives forward-then-inverse is a value this inverse has not invented.
 *
 * GLSL `mat3` takes columns; the rows here are those columns transposed
 */

export type Rgb3 = readonly [number, number, number]
type Mat3 = readonly [Rgb3, Rgb3, Rgb3]

const LINEAR_SRGB_TO_LINEAR_REC2020: Mat3 = [
  [0.6274, 0.3293, 0.0433],
  [0.0691, 0.9195, 0.0113],
  [0.0164, 0.088, 0.8956],
]

const AGX_INSET: Mat3 = [
  [0.856627153315983, 0.0951212405381588, 0.0482516061458583],
  [0.137318972929847, 0.761241990602591, 0.101439036467562],
  [0.11189821299995, 0.0767994186031903, 0.811302368396859],
]

const AGX_OUTSET: Mat3 = [
  [1.1271005818144368, -0.11060664309660323, -0.016493938717834573],
  [-0.1413297634984383, 1.157823702216272, -0.016493938717834257],
  [-0.14132976349843826, -0.11060664309660294, 1.2519364065950405],
]

const AGX_MIN_EV = -12.47393
const AGX_MAX_EV = 4.026069

const apply = (m: Mat3, v: Rgb3): Rgb3 => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
]

export const inverse3 = (m: Mat3): Mat3 => {
  const [[a, b, c], [d, e, f], [g, h, i]] = m
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
  return [
    [(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det],
    [(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det],
    [(d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det],
  ]
}

const REC2020_TO_SRGB = inverse3(LINEAR_SRGB_TO_LINEAR_REC2020)
const INSET_INVERSE = inverse3(AGX_INSET)
const OUTSET_INVERSE = inverse3(AGX_OUTSET)

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

const contrast = (x: number): number => {
  const x2 = x * x
  const x4 = x2 * x2
  return (
    15.5 * x4 * x2 -
    40.14 * x4 * x +
    31.96 * x4 -
    6.868 * x2 * x +
    0.4298 * x2 +
    0.1191 * x -
    0.00232
  )
}

/** The sigmoid is monotone on [0, 1], so bisection inverts it to float precision in 40 steps */
const contrastInverse = (y: number): number => {
  let low = 0
  let high = 1
  for (let step = 0; step < 40; step += 1) {
    const mid = (low + high) / 2
    if (contrast(mid) < y) low = mid
    else high = mid
  }
  return (low + high) / 2
}

export const agxForward = (linear: Rgb3, exposure: number): Rgb3 => {
  const exposed: Rgb3 = [linear[0] * exposure, linear[1] * exposure, linear[2] * exposure]
  const inset = apply(AGX_INSET, apply(LINEAR_SRGB_TO_LINEAR_REC2020, exposed))
  const encoded = inset.map((channel) =>
    clamp01((Math.log2(Math.max(channel, 1e-10)) - AGX_MIN_EV) / (AGX_MAX_EV - AGX_MIN_EV)),
  ) as unknown as Rgb3
  const sigmoid = encoded.map(contrast) as unknown as Rgb3
  const outset = apply(AGX_OUTSET, sigmoid).map(
    (channel) => Math.max(0, channel) ** 2.2,
  ) as unknown as Rgb3
  return apply(REC2020_TO_SRGB, outset).map(clamp01) as unknown as Rgb3
}

export const agxInverse = (display: Rgb3, exposure: number): Rgb3 => {
  const rec2020 = apply(LINEAR_SRGB_TO_LINEAR_REC2020, display).map(
    (channel) => Math.max(0, channel) ** (1 / 2.2),
  ) as unknown as Rgb3
  const sigmoid = apply(OUTSET_INVERSE, rec2020)
  const encoded = sigmoid.map(contrastInverse) as unknown as Rgb3
  const inset = encoded.map(
    (channel) => 2 ** (channel * (AGX_MAX_EV - AGX_MIN_EV) + AGX_MIN_EV),
  ) as unknown as Rgb3
  const linear = apply(REC2020_TO_SRGB, apply(INSET_INVERSE, inset))
  return [linear[0] / exposure, linear[1] / exposure, linear[2] / exposure]
}

export const srgbDecode = (byte: number): number => {
  const c = byte / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** Rec. 709 luminance, which is the luminance of the linear-sRGB working space */
export const luminance = ([r, g, b]: Rgb3): number => 0.2126 * r + 0.7152 * g + 0.0722 * b

/** Scene-referred luminance of one screenshot pixel */
export const sceneLuminance = (
  pixel: readonly [number, number, number],
  exposure: number,
): number =>
  luminance(
    agxInverse([srgbDecode(pixel[0]), srgbDecode(pixel[1]), srgbDecode(pixel[2])], exposure),
  )
