import { Environment } from '@react-three/drei'
import { memo, useMemo, type ReactElement } from 'react'
import { sceneCloud, sceneGroundAlbedo, useAppStore } from '../state/store'
import { sunAt } from '../state/sun'
import { beamIrradiance, type LinearRgb } from './lighting'
import { SceneBoundary } from './SceneBoundary'
import { IblGround, SkyDome } from './skyDome'
import type { RenderQuality } from './quality'
import type { EpochMillis } from '../types/units'

export interface SkyLightProps {
  readonly atUtcMillis: EpochMillis
  readonly quality: RenderQuality
}

/**
 * Sky background and the image-based ambient it casts, from one Preetham radiance field.
 *
 * There's no ambient or hemisphere term: shaded ground is lit by the sky itself, which is why
 * it reads blue rather than gray. The disc is switched off in the cube because the key light in
 * `SunRig` already carries exactly that irradiance, and a 0.5 deg disc doesn't survive a
 * 128 px cube face anyway
 */
export const SkyLight = memo(({ atUtcMillis, quality }: SkyLightProps): ReactElement => {
  const location = useAppStore((s) => s.location)
  // the albedo the ground is DRAWN with, snow included, so the bounce and the picture are two
  // readings of one surface rather than two numbers that happen to be near each other
  const albedo = useAppStore(sceneGroundAlbedo)
  const cloud = useAppStore(sceneCloud)
  const sun = useMemo(() => sunAt(location, atUtcMillis), [location, atUtcMillis])
  const direction = useMemo<readonly [number, number, number]>(
    () => [sun.x, sun.y, sun.z],
    [sun.x, sun.y, sun.z],
  )
  const groundRadiance = useMemo<LinearRgb>(() => {
    const cosine = Math.max(0, sun.y)
    const [r, g, b] = beamIrradiance(sun.elevationDeg)
    return [
      (albedo * r * cosine) / Math.PI,
      (albedo * g * cosine) / Math.PI,
      (albedo * b * cosine) / Math.PI,
    ]
  }, [albedo, sun.y, sun.elevationDeg])

  return (
    <group name="sky-light" userData={{ elevationDeg: sun.elevationDeg, sunSource: sun.source }}>
      <SkyDome name="sky-dome" sun={direction} scaleM={4000} sunDisc cloud={cloud} />
      {/* the ambient is worth more than the background, but not at the price of it */}
      <SceneBoundary label="sky-ibl">
        <Environment frames={1} resolution={quality.environmentResolution} near={0.5} far={20000}>
          <SkyDome name="sky-ibl" sun={direction} scaleM={100} sunDisc={false} cloud={cloud} />
          <IblGround radiance={groundRadiance} />
        </Environment>
      </SceneBoundary>
    </group>
  )
})

SkyLight.displayName = 'SkyLight'
