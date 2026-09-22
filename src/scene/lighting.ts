/**
 * Scene radiometry, in one unit system.
 *
 * The Preetham sky is the only emitter: the visible background, the image-based ambient and
 * the key light are three readouts of one radiance field, so there is no separate "ambient"
 * dial to drift out of agreement with the sky the user is looking at. Values here are the
 * linear, scene-referred units `three/examples/jsm/objects/Sky.js` emits before tone mapping,
 * and `TONE_MAPPING_EXPOSURE` is the single place they are mapped to the display.
 *
 * `beamIrradiance` ports the sun-disc path of that shader and is pinned against it in
 * `lighting.test.ts`. It is the only part that has to run on the CPU: the sky's diffuse
 * contribution reaches the scene as a real cubemap rendered from the same shader, so it needs
 * no CPU model and no calibration constant.
 */

import { AgXToneMapping, SRGBColorSpace } from 'three'

export type LinearRgb = readonly [number, number, number]

/**
 * Turbidity 4 is a clear rural atmosphere. `rayleigh` is a multiplier on the true Rayleigh
 * coefficient, set from the observable measurement: at 1 this
 * model returns a diffuse-to-global ratio of 5-6% at high sun against a measured clear-sky
 * 10-15%, which renders panel shade almost black. At 2 the ratio is 13% at 60 deg elevation
 */
export const SKY = {
  turbidity: 4,
  rayleigh: 2,
  mieCoefficient: 0.005,
  mieDirectionalG: 0.8,
} as const

const TOTAL_RAYLEIGH: LinearRgb = [
  5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5,
]
const MIE_CONST: LinearRgb = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14]
const CUTOFF_ANGLE = 1.6110731556870734
const STEEPNESS = 1.5
const SUN_ENERGY = 1000
const RAYLEIGH_ZENITH_M = 8.4e3
const MIE_ZENITH_M = 1.25e3
const SKY_SCALE = 0.04
const DISC_RADIANCE_GAIN = 19000

/** cos of the half-angle of the disc the Sky shader actually paints */
const SUN_DISC_COS = 0.9999566769464484
/** sr, the solid angle of that disc: the sun the render shows, not the one in the almanac */
export const SUN_DISC_STERADIAN = 2 * Math.PI * (1 - SUN_DISC_COS)

const DEG = Math.PI / 180
const clamp = (value: number, low: number, high: number): number =>
  value < low ? low : value > high ? high : value

// `totalMie` in the shader's vertex stage; turbidity and mieCoefficient are constant here.
// The leading factor is transcribed from the shader and stays at its written precision: it sits
// close to Math.LOG10E, and substituting that would silently change the model
// biome-ignore lint/suspicious/noApproximativeNumericConstant: transcribed from Sky.js
const MIE_SCALE = 0.434 * (0.2 * SKY.turbidity * 10e-18) * SKY.mieCoefficient
const TOTAL_MIE: LinearRgb = [
  MIE_SCALE * MIE_CONST[0],
  MIE_SCALE * MIE_CONST[1],
  MIE_SCALE * MIE_CONST[2],
]

/**
 * The shader's `sunfade` reads `sunPosition.y / 450000`, so it saturates at 1 for any unit
 * sun vector and the Rayleigh coefficient reduces to the uniform. `SkyLight` only ever feeds
 * it a unit vector, which is what makes that reduction safe
 */
const sunEnergy = (sinElevation: number): number =>
  SUN_ENERGY *
  Math.max(0, 1 - Math.exp(-((CUTOFF_ANGLE - Math.acos(clamp(sinElevation, -1, 1))) / STEEPNESS)))

/** Rayleigh plus Mie extinction along the path to a direction `sinElevation` above the horizon */
const extinction = (sinElevation: number, channel: 0 | 1 | 2): number => {
  const zenithAngle = Math.acos(Math.max(0, sinElevation))
  const path = 1 / (Math.cos(zenithAngle) + 0.15 * (93.885 - zenithAngle / DEG) ** -1.253)
  return Math.exp(
    -(
      TOTAL_RAYLEIGH[channel] * SKY.rayleigh * RAYLEIGH_ZENITH_M * path +
      TOTAL_MIE[channel] * MIE_ZENITH_M * path
    ),
  )
}

/**
 * Irradiance the sky's own sun disc delivers, in the sky's units. Defining the key light this
 * way keeps one radiometry: swapping the directional light for the
 * disc left switched on in the environment map would not change how bright the scene is
 */
export const beamIrradiance = (elevationDeg: number): LinearRgb => {
  const sinElevation = Math.sin(elevationDeg * DEG)
  const gain = sunEnergy(sinElevation) * DISC_RADIANCE_GAIN * SKY_SCALE * SUN_DISC_STERADIAN
  return [
    gain * extinction(sinElevation, 0),
    gain * extinction(sinElevation, 1),
    gain * extinction(sinElevation, 2),
  ]
}

/**
 * The colour the ground fades into where it runs out, which is the sky at the horizon.
 *
 * The ground is a 240 m plane, and without this it ends in a hard line against the sky, the one
 * thing in this scene that reads as unfinished. This is a rendering convenience and reaches no
 * simulation: nothing is measured through it and the light the physics integrates never sees it. It
 * is derived from the same Preetham extinction the sky dome is drawn with, so it warms as the sun
 * drops and the ground still meets a sky of its own colour at six in the evening.
 *
 * Normalised to unit peak and lifted towards white, because the horizon is the longest path
 * through the air the sky has and so the haziest part of it
 */
export const HORIZON_HAZE = 0.55

export const horizonColour = (sunElevationDeg: number): LinearRgb => {
  const sinElevation = Math.sin(Math.max(0, sunElevationDeg) * DEG)
  const scattered: LinearRgb = [
    extinction(sinElevation, 0),
    extinction(sinElevation, 1),
    extinction(sinElevation, 2),
  ]
  const peak = Math.max(...scattered)
  if (peak <= 0) return [0.05, 0.06, 0.08]
  const hazed = scattered.map((channel) => {
    const unit = channel / peak
    return unit + (1 - unit) * HORIZON_HAZE
  })
  return [hazed[0] ?? 1, hazed[1] ?? 1, hazed[2] ?? 1]
}

export interface KeyLight {
  /** Unit-peak chromaticity, in the linear-sRGB working space three's lights already use */
  readonly colour: LinearRgb
  readonly intensity: number
}

/** Splits the beam into the colour and scalar `DirectionalLight` multiplies back together */
export const keyLight = (elevationDeg: number): KeyLight => {
  const [r, g, b] = beamIrradiance(elevationDeg)
  const intensity = Math.max(r, g, b)
  return {
    colour: intensity > 0 ? [r / intensity, g / intensity, b / intensity] : [1, 1, 1],
    intensity,
  }
}

/**
 * Exposure. A 0.18-reflectance Lambertian surface normal to the beam at 60 deg solar elevation
 * renders at a relative luminance of sRGB 118, which is middle grey. This is a luminance
 * target: the beam is not neutral, so that surface renders 125,117,104 at 60 deg
 * and warmer still as the sun drops, which is the point. Fixed, never adapted, so running the
 * scrubber down to the horizon darkens the picture: that is the product's subject, not a fault
 */
export const TONE_MAPPING_EXPOSURE = 0.0315

/**
 * The renderer's colour pipeline, in one place so a test can pin it.
 *
 * AgX over ACES, decided by measurement. Against this scene, at the exposure that puts
 * middle grey at 118 for each: panel shade at 8-25% of open irradiance spans 40 output codes
 * under AgX against 34 under ACES, and across the eight stops below middle grey AgX holds 1.7x
 * the code density, which is the range this whole product is about. AgX also reaches flat white
 * 0.8 EV later, so the sky keeps its gradient without bleaching out, and it rotates the warm
 * scene colours far less: 4.7 deg on the selection amber and 7.5 deg on foliage against ACES's
 * 12.2 and 11.8 deg, a drift that runs towards the top of the viridis ramp the overlay uses.
 * ACES is better only on the deep blue-purple end, where the scene has little chroma anyway.
 *
 * `outputColorSpace` is set explicitly here: r3f's default happens to match,
 * and the overlay's correctness depends on it, so it should not be a default that can move
 */
export const RENDERER_SETTINGS = {
  antialias: true,
  /*
   * `preserveDrawingBuffer` is deliberately NOT set here, having been tried and removed.
   *
   * It guards against the compositor showing a buffer WebGL does not guarantee, which is a real
   * hazard for a surface drawing on demand, and a grid that flickers after a camera drag looks like
   * that fault. That flicker comes from drei's `infiniteGrid`: see the note beside the grid in
   * `GardenScene`. Setting this forbids driver optimisations and holds another framebuffer of
   * memory, so it is not worth carrying
   */
  toneMapping: AgXToneMapping,
  toneMappingExposure: TONE_MAPPING_EXPOSURE,
  outputColorSpace: SRGBColorSpace,
} as const

/** The sun is 0.533 deg limb to limb; the figure is the full angle, so it is not doubled */
export const SUN_ANGULAR_DIAMETER_DEG = 0.533

/**
 * Ground-plane penumbra cast by an occluder `heightM` above it, from `docs/00-DECISIONS.md`
 * section 3: `h tan(0.533 deg)` normal to the beam, divided by `sin^2` of the elevation for the
 * grazing stretch along the ground. 3.72 cm at 4 m under an overhead sun, 14.9 cm at 30 deg
 */
export const penumbraWidthM = (heightM: number, elevationDeg: number): number => {
  const sinElevation = Math.sin(clamp(elevationDeg, 3, 90) * DEG)
  return (heightM * Math.tan(SUN_ANGULAR_DIAMETER_DEG * DEG)) / (sinElevation * sinElevation)
}

/** Nine PCF taps spread wider than this stop reading as a gradient and start banding */
const MAX_SHADOW_RADIUS_TEXELS = 4

/**
 * Softens a cascade to the penumbra the geometry actually casts, in that cascade's texels.
 * A cascade whose texel is already coarser than the penumbra clamps to one: the physics is
 * below its resolution there, and blurring past it would invent softness the sun cannot make
 */
export const cascadeShadowRadius = (
  extentM: number,
  shadowMapSize: number,
  penumbraM: number,
): number => clamp(penumbraM / (2 * (extentM / shadowMapSize)), 1, MAX_SHADOW_RADIUS_TEXELS)
