import { describe, expect, it } from 'bun:test'
import { vi } from '../../test/vi'
import { MeshStandardMaterial, type Material, type WebGLProgramParametersWithUniforms } from 'three'
import { enrolInCascades, type CascadeEnroller } from './cascades'
import { applyWind, WIND_TIME } from './foliage'

/** What `CSM.setupMaterial` does, reduced to the two behaviours enrolment has to survive */
const csmLike = (): CascadeEnroller => ({
  setupMaterial(material: Material) {
    material.defines = { ...material.defines, CSM_CASCADES: 4 }
    material.onBeforeCompile = (shader) => {
      shader.uniforms.CSM_cascades = { value: [] }
    }
  },
})

const shader = (): WebGLProgramParametersWithUniforms =>
  ({
    uniforms: {},
    vertexShader: 'void main() {\n#include <begin_vertex>\n}',
    fragmentShader: '',
  }) as unknown as WebGLProgramParametersWithUniforms

describe('enrolling a material in the cascades', () => {
  it('forces the recompile the cascade defines need', () => {
    const material = new MeshStandardMaterial()
    const before = material.version
    enrolInCascades(csmLike(), material)
    expect(material.defines?.CSM_CASCADES).toBe(4)
    expect(material.version).toBeGreaterThan(before)
  })

  it('keeps the material own shader patch, which setupMaterial would otherwise assign over', () => {
    const material = applyWind(new MeshStandardMaterial())
    enrolInCascades(csmLike(), material)
    const compiled = shader()
    material.onBeforeCompile(compiled, null as never)
    expect(compiled.vertexShader).toContain('transformed.x +=')
    expect(compiled.uniforms.uWindTime).toBe(WIND_TIME)
    expect(compiled.uniforms.CSM_cascades).toBeDefined()
  })

  /** The self-test: without the chaining, this is what the wind would silently become */
  it('is a silent failure to get wrong, which is what makes the check worth having', () => {
    const material = applyWind(new MeshStandardMaterial())
    csmLike().setupMaterial(material)
    const compiled = shader()
    material.onBeforeCompile(compiled, null as never)
    expect(compiled.vertexShader).not.toContain('transformed.x +=')
  })

  it('leaves a material with no patch of its own working exactly as before', () => {
    const material = new MeshStandardMaterial()
    const spy = vi.fn()
    material.onBeforeCompile = spy
    enrolInCascades(csmLike(), material)
    const compiled = shader()
    material.onBeforeCompile(compiled, null as never)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(compiled.uniforms.CSM_cascades).toBeDefined()
  })
})
