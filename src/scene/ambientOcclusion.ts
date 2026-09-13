/**
 * Ambient occlusion, applied to the sky term and to nothing else.
 *
 * The gap this closes was measured in pass 1, not felt: shaded ground sat at 0.168 of sunlit in
 * linear luminance while the sky model's own diffuse-to-global ratio is 0.126, because an
 * environment map hands every point the whole hemisphere no matter what is above it. The
 * quantity missing there is the sky view factor, the same one `src/sim` computes per cell for
 * the overlay's `sky-view-factor` channel, and a ground-truth AO integral is an estimate of
 * exactly it. So the AO multiplies `indirectDiffuse` and leaves the direct beam alone: whether
 * the sun reaches a point is a shadow test and the cascades already answer it. A screen-space
 * AO composited over the finished frame, which is how it's usually wired, would instead darken
 * sunlit ground beside every post by occlusion the geometry doesn't cast.
 *
 * `aoStrength` rather than a define, so switching the effect off is a uniform write and not a
 * shader recompile. `SCENE_SKY_OCCLUSION` is a define regardless, because three's program cache
 * is keyed on defines and not on the body of `onBeforeCompile`: without it, an unpatched
 * material of the same type would hand its cached program to a patched one
 */

import { DataTexture, RedFormat, Vector2, type IUniform, type Material, type Texture } from 'three'

export interface SkyOcclusionUniforms {
  readonly aoMapScreen: IUniform<Texture>
  readonly aoStrength: IUniform<number>
  readonly aoResolution: IUniform<Vector2>
}

/** Sampled until the first AO pass has run, and whenever the effect is off */
export const unoccludedTexture = (): DataTexture => {
  const texture = new DataTexture(new Uint8Array([255]), 1, 1, RedFormat)
  texture.needsUpdate = true
  return texture
}

/**
 * One shared uniform object, bound into every lit material rather than copied into each, so the
 * pass that computes the occlusion writes it in one place. `foliage.ts` shares the wind clock
 * the same way
 */
export const SKY_OCCLUSION: SkyOcclusionUniforms = {
  aoMapScreen: { value: unoccludedTexture() },
  aoStrength: { value: 0 },
  aoResolution: { value: new Vector2(1, 1) },
}

const DECLARATION = /* glsl */ `
uniform sampler2D aoMapScreen;
uniform float aoStrength;
uniform vec2 aoResolution;
void main() {`

/**
 * Every indirect term. Occluding the diffuse half alone would leave panel
 * glass and wet soil reflecting a whole hemisphere they can't see. This is the other half.
 *
 * The specular line is what three's own `aomap_fragment` does
 * when a material carries an aoMap, down to the guards: `computeSpecularOcclusion` is the
 * horizon-based term already defined in `lights_physical_pars_fragment`, and clearcoat and sheen
 * take the occlusion directly the same way. Copying three's treatment rather than authoring one
 * keeps a single definition of what occlusion means to a physical material, which is the same
 * reason the diffuse half multiplies `indirectDiffuse` and nothing else
 */
const APPLICATION = /* glsl */ `#include <aomap_fragment>
  float skyVisibility = texture2D( aoMapScreen, gl_FragCoord.xy / aoResolution ).r;
  float skyOcclusion = mix( 1.0, skyVisibility, aoStrength );
  reflectedLight.indirectDiffuse *= skyOcclusion;
  #if defined( USE_CLEARCOAT )
    clearcoatSpecularIndirect *= skyOcclusion;
  #endif
  #if defined( USE_SHEEN )
    sheenSpecularIndirect *= skyOcclusion;
  #endif
  #if defined( USE_ENVMAP ) && defined( STANDARD )
    float skyDotNV = saturate( dot( geometryNormal, geometryViewDir ) );
    reflectedLight.indirectSpecular *= computeSpecularOcclusion( skyDotNV, skyOcclusion, material.roughness );
  #endif`

/** No-op on a shader with no indirect term to occlude, which is what unlit materials are */
export const patchSkyOcclusion = (fragmentShader: string): string =>
  fragmentShader.includes('#include <aomap_fragment>')
    ? fragmentShader
        .replace('void main() {', DECLARATION)
        .replace('#include <aomap_fragment>', APPLICATION)
    : fragmentShader

export const occludable = (material: Material): boolean =>
  (material as { isMeshStandardMaterial?: boolean }).isMeshStandardMaterial === true

/**
 * Chains rather than assigns, for the reason written up in `cascades.ts`: the foliage wind and
 * the cascade light loop are both installed this way and the last writer would win
 */
export const enrollInSkyOcclusion = (material: Material): void => {
  const own = material.onBeforeCompile
  material.onBeforeCompile = function chained(shader, renderer) {
    own.call(this, shader, renderer)
    shader.uniforms.aoMapScreen = SKY_OCCLUSION.aoMapScreen
    shader.uniforms.aoStrength = SKY_OCCLUSION.aoStrength
    shader.uniforms.aoResolution = SKY_OCCLUSION.aoResolution
    shader.fragmentShader = patchSkyOcclusion(shader.fragmentShader)
  }
  material.defines = { ...material.defines, SCENE_SKY_OCCLUSION: '' }
  material.needsUpdate = true
}

/** Fraction of the cosine-weighted hemisphere the search is allowed to miss */
const HORIZON_TOLERANCE = 0.1

/**
 * How far the horizon search reaches, in meters, from how much sky it is allowed to miss.
 *
 * An occluder of height `h` at horizontal distance `d` sits at elevation `atan(h / d)`, and the
 * cosine-weighted share of the hemisphere below an elevation is `sin^2` of it. Stopping the
 * search at `d` therefore leaves out at most `h^2 / (h^2 + d^2)` of the sky a canopy at that
 * height could block, and solving that for a tenth gives three times the height. Past there the
 * samples spread too thin to stay quiet and the estimate gets worse rather than better, which
 * the pass-3 measurements show: at six times the height it recovers less occlusion, not more.
 *
 * What the bound leaves out is sky near the horizon, so this AO under-estimates occlusion and
 * never over-estimates it. Measured against the analytic view factor of the default array, an
 * infinite strip 3.5 m wide at 3.2 m clearance blocking 0.48 of the cosine-weighted hemisphere,
 * the pass recovers 0.37 of it
 */
export const occlusionRadiusM = (occluderHeightM: number): number =>
  Math.min(
    16,
    Math.max(3, occluderHeightM / Math.sqrt(HORIZON_TOLERANCE / (1 - HORIZON_TOLERANCE))),
  )
