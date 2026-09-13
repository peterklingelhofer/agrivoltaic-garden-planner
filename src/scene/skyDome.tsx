/**
 * The pure half of the sky: props in, three.js objects out, nothing imported from `src/state`.
 * `SkyLight` is the other half, the part that reads `useAppStore` and turns a location and a moment
 * into the `sun` direction and `radiance` these take as props. Splitting them means this half can
 * be reused by anything outside this app, the same split `foliage.ts` and `panelGeometry.ts`
 * already have
 */

import { useEffect, useMemo, type ReactElement } from 'react'
import type { ShaderMaterial } from 'three'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { SKY, type LinearRgb } from './lighting'

const setUniform = (material: ShaderMaterial, name: string, value: unknown): void => {
  const uniform = material.uniforms[name]
  if (uniform) uniform.value = value
}

export interface DomeProps {
  readonly name: string
  readonly sun: readonly [number, number, number]
  readonly scaleM: number
  readonly sunDisc: boolean
  /** 0 clear to 1 overcast, from the record's own hour. Nothing where the model makes no claim */
  readonly cloud?: number
}

/**
 * Uniforms are written during render rather than from an effect on purpose: drei renders the
 * environment cube in a layout effect, which would otherwise capture the previous sun
 */
export const SkyDome = ({ name, sun, scaleM, sunDisc, cloud = 0 }: DomeProps): ReactElement => {
  const sky = useMemo(() => new Sky(), [])
  useEffect(
    () => () => {
      sky.geometry.dispose()
      sky.material.dispose()
    },
    [sky],
  )

  setUniform(sky.material, 'turbidity', SKY.turbidity)
  setUniform(sky.material, 'rayleigh', SKY.rayleigh)
  setUniform(sky.material, 'mieCoefficient', SKY.mieCoefficient)
  setUniform(sky.material, 'mieDirectionalG', SKY.mieDirectionalG)
  // procedural cloud shades nothing and reaches no simulation, so it's drawn only where the
  // model has made the claim: the seasons step, from the clearness index of the hour the clock
  // is on in the year the season ran (`sceneCloud`). Everywhere else it stays at zero
  setUniform(sky.material, 'cloudCoverage', cloud)
  setUniform(sky.material, 'showSunDisc', sunDisc ? 1 : 0)
  sky.material.uniforms.sunPosition?.value.set(sun[0], sun[1], sun[2])

  return <primitive object={sky} name={name} scale={scaleM} />
}

/**
 * The lower half of the environment. Three's Sky paints every downward direction at its horizon
 * radiance, which is the brightest part of the model, so a bare sky cubemap lights a garden from
 * below as hard as from above and panel shade comes out far too pale. What is actually down there
 * is ground, returning `albedo x irradiance / pi`. The sky's own contribution to that irradiance
 * is left out, which understates the bounce by the diffuse fraction, around 13% at high sun
 */
export const IblGround = ({ radiance }: { readonly radiance: LinearRgb }): ReactElement => (
  <mesh name="sky-ibl-ground" rotation={[-Math.PI / 2, 0, 0]} position={[0, -2, 0]}>
    <planeGeometry args={[400, 400]} />
    <meshBasicMaterial color={[radiance[0], radiance[1], radiance[2]]} />
  </mesh>
)
