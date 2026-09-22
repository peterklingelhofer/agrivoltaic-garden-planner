/**
 * The DLI overlay's surface.
 *
 * Baking `viridis` into an RGBA texture would let the sampler interpolate between cell colors in
 * the linear working space, so most pixels on screen would be a linear blend of two ramp entries: a
 * color the legend doesn't contain. This overlay uploads the *field*, interpolates the value, and
 * looks the color up afterward from a 256-entry ramp sampled `NearestFilter`. Every pixel is
 * therefore exactly one of 256 ramp colors, and the thing being interpolated between cells is the
 * quantity, which is the only thing there is any basis for interpolating.
 *
 * The iso-lines are drawn from the same field at a `contourStep` from `state/colormap.ts`, the
 * one the legend prints its ticks from. They're a graticule over a continuous surface, the way
 * a contour is on a map: each line is a real value of the field and the legend names it.
 *
 * `colorspace_fragment` and no tone mapping, which is the invariant this overlay has always
 * held: the ramp is perceptually uniform in sRGB, so it reaches the display encoded and
 * unaltered, and `e2e/overlay-color.spec.ts` reads the rendered pixels back to prove it
 */

import {
  BufferAttribute,
  type BufferGeometry,
  DataTexture,
  DataUtils,
  HalfFloatType,
  LinearFilter,
  NearestFilter,
  RedFormat,
  RGBAFormat,
  SRGBColorSpace,
  type IUniform,
} from 'three'
import { CONTOUR_LINE_FACTOR, contourStep, viridis } from '../state/colormap'
import type { Extent2D, GridSpec } from '../types/geo'

const RAMP_STEPS = 256

let ramp: DataTexture | null = null

/** The ramp as the GPU reads it: one texel per step, no filtering, so no color is invented */
export const viridisRamp = (): DataTexture => {
  if (ramp) return ramp
  const data = new Uint8Array(RAMP_STEPS * 4)
  for (let i = 0; i < RAMP_STEPS; i += 1) {
    const [r, g, b] = viridis(i / (RAMP_STEPS - 1))
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = 255
  }
  const texture = new DataTexture(data, RAMP_STEPS, 1, RGBAFormat)
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  // sRGB, because that is the space viridis is uniform in and the space the legend is written in
  texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  ramp = texture
  return texture
}

/**
 * The field itself, normalized to the legend's range. Half float here, because the
 * iso-lines are drawn from this value and 256 levels across the range would step them. It's
 * also filterable in core WebGL2, which a 32-bit float texture isn't
 */
export const fieldTexture = (
  values: Float32Array,
  grid: GridSpec,
  min: number,
  max: number,
): DataTexture => {
  const span = max > min ? max - min : 1
  const data = new Uint16Array(grid.cols * grid.rows)
  for (let i = 0; i < data.length; i += 1) {
    const value = values[i]
    // absent stays absent: an unmodeled cell is drawn at the bottom of the ramp, never at 0.5
    const t = value === undefined || !Number.isFinite(value) ? 0 : (value - min) / span
    data[i] = DataUtils.toHalfFloat(t < 0 ? 0 : t > 1 ? 1 : t)
  }
  const texture = new DataTexture(data, grid.cols, grid.rows, RedFormat, HalfFloatType)
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  texture.needsUpdate = true
  return texture
}

/**
 * Where a point on the ground reads in the field texture: 0 to 1 across the raster's extent.
 * Outside it there is no reading, and the fragment shader draws nothing there
 */
export const fieldUv = (xM: number, yM: number, extent: Extent2D): readonly [number, number] => [
  (xM - extent.minXM) / (extent.maxXM - extent.minXM),
  (yM - extent.minYM) / (extent.maxYM - extent.minYM),
]

/**
 * The overlay's outline, drawn in plot meters, with each vertex's texture coordinate taken from
 * where it stands: `ShapeGeometry` writes the raw x and y as UVs
 */
export const fieldUvsOnto = (geometry: BufferGeometry, extent: Extent2D): BufferGeometry => {
  const position = geometry.getAttribute('position')
  const uv = new Float32Array(position.count * 2)
  for (let i = 0; i < position.count; i += 1) {
    const [u, v] = fieldUv(position.getX(i), position.getY(i), extent)
    uv[i * 2] = u
    uv[i * 2 + 1] = v
  }
  geometry.setAttribute('uv', new BufferAttribute(uv, 2))
  return geometry
}

export interface OverlayUniforms {
  readonly [name: string]: IUniform<unknown>
  readonly field: IUniform<DataTexture | null>
  readonly ramp: IUniform<DataTexture>
  readonly opacity: IUniform<number>
  /** Contour intervals across the ramp, and where value zero sits in them */
  readonly contourScale: IUniform<number>
  readonly contourOffset: IUniform<number>
}

export const overlayUniforms = (): OverlayUniforms => ({
  field: { value: null },
  ramp: { value: viridisRamp() },
  opacity: { value: 1 },
  contourScale: { value: 0 },
  contourOffset: { value: 0 },
})

export interface ContourUniforms {
  readonly contourScale: number
  readonly contourOffset: number
}

/** The field's normalized coordinate expressed in contour intervals: `t * scale + offset` */
export const contourUniforms = (min: number, max: number): ContourUniforms => {
  const step = contourStep(min, max)
  return step > 0
    ? { contourScale: (max - min) / step, contourOffset: min / step }
    : { contourScale: 0, contourOffset: 0 }
}

/** Intervals per pixel at which the 2.7 px line is as wide as the gap to the next one */
const LINES_MERGE_AT = 0.35

/** A GLSL float literal, which a whole number isn't */
const glsl = (value: number): string => (Number.isInteger(value) ? `${value}.0` : String(value))

export const OVERLAY_VERTEX = /* glsl */ `
varying vec2 vFieldUv;
void main() {
  vFieldUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`

/**
 * `fwidth` gives the line a constant width on screen, so it stays one
 * line from any camera distance, and never thickens into a band when the overlay is far away.
 *
 * It also says when there's no line to draw. Where the field is steep or the ground is raked
 * away from the camera, a pixel spans more than one interval and the lines land closer together
 * than they are wide: what reaches the screen then isn't eight iso-lines but a uniform darkening
 * of the reading, which is the overlay lying about its own value. `LINES_MERGE_AT` fades them out
 * before that happens, so a contour is either legible or absent and the surface under it is the
 * color the legend gives
 */
export const OVERLAY_FRAGMENT = /* glsl */ `
uniform sampler2D field;
uniform sampler2D ramp;
uniform float opacity;
uniform float contourScale;
uniform float contourOffset;
varying vec2 vFieldUv;

void main() {
  // ground the raster never covered has no reading to show
  if ( any( lessThan( vFieldUv, vec2( 0.0 ) ) ) || any( greaterThan( vFieldUv, vec2( 1.0 ) ) ) ) discard;
  float t = clamp( texture2D( field, vFieldUv ).r, 0.0, 1.0 );
  vec3 color = texture2D( ramp, vec2( t, 0.5 ) ).rgb;
  if ( contourScale > 0.0 ) {
    float steps = t * contourScale + contourOffset;
    float width = max( fwidth( steps ), 1e-6 );
    float distanceToLine = abs( steps - floor( steps + 0.5 ) ) / width;
    float resolved = 1.0 - smoothstep( ${glsl(LINES_MERGE_AT / 2)}, ${glsl(LINES_MERGE_AT)}, width );
    float line = ( 1.0 - smoothstep( 0.35, 1.35, distanceToLine ) ) * resolved;
    color = mix( color, color * ${glsl(CONTOUR_LINE_FACTOR)}, line );
  }
  gl_FragColor = vec4( color, opacity );
  #include <colorspace_fragment>
}`
