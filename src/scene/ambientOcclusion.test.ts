import { describe, expect, it } from 'bun:test'
import {
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type WebGLProgramParametersWithUniforms,
} from 'three'
import {
  enrolInSkyOcclusion,
  occludable,
  occlusionRadiusM,
  patchSkyOcclusion,
  SKY_OCCLUSION,
} from './ambientOcclusion'
import { enrolInCascades, type CascadeEnroller } from './cascades'
import { applyWind, WIND_TIME } from './foliage'

/** The two chunks the patch keys off, in the order `meshphysical_frag` has them */
const LIT_FRAGMENT = [
  'void main() {',
  '#include <lights_fragment_end>',
  '#include <aomap_fragment>',
  'vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;',
].join('\n')

const shader = (fragmentShader: string): WebGLProgramParametersWithUniforms =>
  ({
    uniforms: {},
    vertexShader: 'void main() {\n#include <begin_vertex>\n}',
    fragmentShader,
  }) as unknown as WebGLProgramParametersWithUniforms

const csmLike = (): CascadeEnroller => ({
  setupMaterial(material) {
    material.onBeforeCompile = (compiled) => {
      compiled.uniforms.CSM_cascades = { value: [] }
    }
  },
})

describe('the sky occlusion patch', () => {
  it('multiplies the indirect term and leaves every direct one alone', () => {
    const patched = patchSkyOcclusion(LIT_FRAGMENT)
    expect(patched).toContain('reflectedLight.indirectDiffuse *= skyOcclusion')
    expect(patched).not.toContain('reflectedLight.directDiffuse *=')
    // after the chunk that accumulates the light, before the chunk that sums it
    expect(patched.indexOf('skyVisibility')).toBeGreaterThan(
      patched.indexOf('#include <lights_fragment_end>'),
    )
    expect(patched.indexOf('skyVisibility')).toBeLessThan(patched.indexOf('vec3 totalDiffuse'))
  })

  /**
   * The diffuse half shipped first and left panel glass and wet soil reflecting a hemisphere
   * they cannot see. What occludes the rest is three's own treatment from `aomap_fragment`,
   * copied rather than authored, so this pins the copy: the same function, the same guards
   */
  it('occludes every indirect term the way three occludes them for an aoMap', () => {
    const patched = patchSkyOcclusion(LIT_FRAGMENT)
    expect(patched).toContain(
      'reflectedLight.indirectSpecular *= computeSpecularOcclusion( skyDotNV, skyOcclusion, material.roughness )',
    )
    expect(patched).toContain('clearcoatSpecularIndirect *= skyOcclusion')
    expect(patched).toContain('sheenSpecularIndirect *= skyOcclusion')
    // guarded exactly as three guards them, or a material without the feature fails to compile
    expect(patched).toContain('#if defined( USE_CLEARCOAT )')
    expect(patched).toContain('#if defined( USE_SHEEN )')
    expect(patched).toContain('#if defined( USE_ENVMAP ) && defined( STANDARD )')
    // one occlusion factor, so the diffuse and the specular cannot drift apart
    expect(patched).toContain('float skyOcclusion = mix( 1.0, skyVisibility, aoStrength )')
  })

  it('declares what it samples', () => {
    const patched = patchSkyOcclusion(LIT_FRAGMENT)
    for (const uniform of ['sampler2D aoMapScreen', 'float aoStrength', 'vec2 aoResolution'])
      expect(patched).toContain(`uniform ${uniform}`)
  })

  it('leaves an unlit shader alone, having no indirect term to occlude', () => {
    const unlit = 'void main() { gl_FragColor = vec4( 1.0 ); }'
    expect(patchSkyOcclusion(unlit)).toBe(unlit)
  })

  it('is applied to lit materials and not to the overlay kind', () => {
    expect(occludable(new MeshStandardMaterial())).toBe(true)
    expect(occludable(new MeshPhysicalMaterial())).toBe(true)
    expect(occludable(new MeshBasicMaterial())).toBe(false)
  })
})

describe('enrolling a material', () => {
  it('binds the one shared uniform set, so the pass writes the map in one place', () => {
    const material = new MeshStandardMaterial()
    enrolInSkyOcclusion(material)
    const compiled = shader(LIT_FRAGMENT)
    material.onBeforeCompile(compiled, null as never)
    expect(compiled.uniforms.aoMapScreen).toBe(SKY_OCCLUSION.aoMapScreen)
    expect(compiled.uniforms.aoStrength).toBe(SKY_OCCLUSION.aoStrength)
  })

  /**
   * three keys its program cache on the defines and not on the body of `onBeforeCompile`, so
   * without a define of its own a patched material is handed the cached program of an unpatched
   * one of the same type and the occlusion silently never compiles in
   */
  it('changes the program cache key, which is what makes the patch reach the GPU', () => {
    const material = new MeshStandardMaterial()
    const before = material.version
    enrolInSkyOcclusion(material)
    expect(material.defines?.SCENE_SKY_OCCLUSION).toBeDefined()
    expect(material.version).toBeGreaterThan(before)
  })

  it('composes with the wind and the cascades in either order', () => {
    for (const order of ['occlusion first', 'cascades first'] as const) {
      const material = applyWind(new MeshStandardMaterial())
      if (order === 'occlusion first') {
        enrolInSkyOcclusion(material)
        enrolInCascades(csmLike(), material)
      } else {
        enrolInCascades(csmLike(), material)
        enrolInSkyOcclusion(material)
      }
      const compiled = shader(LIT_FRAGMENT)
      material.onBeforeCompile(compiled, null as never)
      expect(compiled.vertexShader, order).toContain('transformed.x +=')
      expect(compiled.uniforms.uWindTime, order).toBe(WIND_TIME)
      expect(compiled.uniforms.CSM_cascades, order).toBeDefined()
      expect(compiled.fragmentShader, order).toContain('skyVisibility')
    }
  })
})

describe('the horizon search radius', () => {
  /**
   * The bound is derived rather than tuned, so the test is the derivation: at the radius it
   * returns, the sky it cannot reach is a tenth of what an occluder at that height could block
   */
  it('misses a tenth of the cosine-weighted sky and no more', () => {
    for (const height of [2.5, 3.2, 4]) {
      const radius = occlusionRadiusM(height)
      expect((height * height) / (height * height + radius * radius)).toBeCloseTo(0.1, 6)
    }
  })

  it('never searches so far that the samples spread thin, nor so near it sees no canopy', () => {
    expect(occlusionRadiusM(0.2)).toBe(3)
    expect(occlusionRadiusM(40)).toBe(16)
  })
})
