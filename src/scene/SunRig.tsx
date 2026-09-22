import { useFrame, useThree } from '@react-three/fiber'
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactElement,
  type RefObject,
} from 'react'
import { Vector3, type DirectionalLight } from 'three'
import { CSM } from 'three/examples/jsm/csm/CSM.js'
import { attempt } from '../state/safe'
import { sceneCloud, scenePlot, useAppStore } from '../state/store'
import { sunAt } from '../state/sun'
import { cascadeShadowRadius, keyLight, penumbraWidthM } from './lighting'
import { occluderHeightM } from './sceneMath'
import type { RenderQuality } from './quality'
import type { EpochMillis } from '../types/units'

export interface SunRigProps {
  readonly atUtcMillis: EpochMillis
  readonly castShadows: boolean
  readonly quality: RenderQuality
  readonly cascades?: RefObject<CSM | null>
}

const tuneShadow = (
  light: DirectionalLight,
  extentM: number,
  shadowMapSize: number,
  penumbraM: number,
): void => {
  const texelM = extentM / shadowMapSize
  const radius = cascadeShadowRadius(extentM, shadowMapSize, penumbraM)
  light.shadow.radius = radius
  // a wide kernel reaches across the surface it is shading, so the offset scales with it
  light.shadow.normalBias = texelM * radius * 1.5
}

export const SunRig = ({
  atUtcMillis,
  castShadows,
  quality,
  // aliased to end in Ref: react-hooks/immutability reads a write to `.current` as a prop
  // mutation unless the local name says it is a ref
  cascades: cascadesRef,
}: SunRigProps): ReactElement => {
  const location = useAppStore((s) => s.location)
  const plot = useAppStore(scenePlot)
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)
  const size = useThree((s) => s.size)
  const csmRef = useRef<CSM | null>(null)
  const keyRef = useRef<DirectionalLight | null>(null)

  const sun = useMemo(() => sunAt(location, atUtcMillis), [location, atUtcMillis])
  // the beam under the hour's measured cloud: the sky dome carries the diffuse look of it, and
  // the key light carries the direct share it took, which is the larger of the two
  const cloud = useAppStore(sceneCloud)
  const { colour, intensity } = useMemo(() => {
    const clear = keyLight(sun.elevationDeg)
    return { colour: clear.colour, intensity: clear.intensity * (1 - cloud) }
  }, [sun.elevationDeg, cloud])

  const penumbraM = penumbraWidthM(occluderHeightM(plot), sun.elevationDeg)

  /**
   * Cascaded shadow maps are the garden-scale requirement; when the example module cannot be
   * constructed the rig degrades to a single directional light. The scene keeps working.
   *
   * Built in an effect and NOT in a `useMemo`, because `new CSM({ parent: scene })` adds its
   * cascade lights to the scene in its constructor. A memo factory is not allowed to do that:
   * React runs it twice per render under StrictMode to surface exactly this, so the scene ended
   * up with two full sets of cascade lights and only the second was ever disposed. Eight
   * directional shadow maps then put the fragment shader over MAX_TEXTURE_IMAGE_UNITS, which is
   * 16 on Apple Silicon, and every MeshStandardMaterial in the garden failed to link: the scene
   * painted once and then showed bare ground. Construction and disposal have to be the same
   * effect's two halves.
   *
   * Whether it succeeded is not React state either. Setting state from an effect body is what
   * `react-hooks/set-state-in-effect` exists to stop, and there is nothing to render from it:
   * the fallback light is handed the beam in the frame callback below, off the same ref the
   * cascades are read from, so the two can never disagree about which one is lighting the scene
   */
  useLayoutEffect(() => {
    if (!castShadows) return
    const built = attempt(() => {
      const csm = new CSM({
        camera,
        parent: scene,
        cascades: quality.cascades,
        maxFar: quality.shadowMaxFarM,
        mode: 'practical',
        shadowMapSize: quality.shadowMapSize,
        // small, because normalBias carries the slope term and a large constant
        // offset is what detaches a shadow from the thing casting it
        shadowBias: -0.0002,
        // a garden is tens of metres deep, not the kilometres the default assumes,
        // and the depth precision follows directly from that range
        lightNear: 1,
        lightFar: 200,
        lightMargin: 60,
        lightDirection: new Vector3(-1, -1, -1).normalize(),
        lightIntensity: 1,
      })
      csm.fade = true
      csm.updateFrustums()
      return csm
    })
    const active = built.ok ? built.value : null
    csmRef.current = active
    if (cascadesRef) cascadesRef.current = active
    return () => {
      csmRef.current = null
      if (cascadesRef) cascadesRef.current = null
      if (!active) return
      attempt(() => {
        active.remove()
      })
      attempt(() => {
        active.dispose()
      })
    }
  }, [castShadows, camera, scene, quality, cascadesRef])

  // Cascade extents come from the camera's projection, so a resize invalidates them
  useEffect(() => {
    void size
    attempt(() => csmRef.current?.updateFrustums())
  }, [size])

  useFrame(() => {
    const csm = csmRef.current
    const key = keyRef.current
    if (key !== null) {
      // exactly one of the two lights carries the beam, and this is the only place that decides
      key.intensity = csm === null ? intensity : 0
      key.castShadow = castShadows && csm === null
    }
    if (!csm) return
    csm.lightDirection.set(-sun.x, -sun.y, -sun.z).normalize()
    for (const light of csm.lights) {
      // the whole irradiance goes in the colour: the shader multiplies colour by intensity, and
      // CSM fixes intensity at construction, so this is the one term left to write per frame
      light.color.setRGB(colour[0] * intensity, colour[1] * intensity, colour[2] * intensity)
      const shadowCamera = light.shadow.camera
      tuneShadow(light, shadowCamera.right - shadowCamera.left, quality.shadowMapSize, penumbraM)
    }
    attempt(() => csm.update())
  })

  const fallbackExtentM = 80

  return (
    <group
      name="sun-rig"
      userData={{
        sunSource: sun.source,
        elevationDeg: sun.elevationDeg,
        azimuthDeg: sun.azimuthDeg,
        intensity,
        penumbraM,
        tier: quality.tier,
      }}
    >
      <directionalLight
        ref={keyRef}
        name="sun-key"
        position={[sun.x * 60, Math.max(sun.y, 0.02) * 60, sun.z * 60]}
        color={[colour[0], colour[1], colour[2]]}
        intensity={intensity}
        shadow-mapSize-width={quality.shadowMapSize}
        shadow-mapSize-height={quality.shadowMapSize}
        shadow-camera-left={-fallbackExtentM / 2}
        shadow-camera-right={fallbackExtentM / 2}
        shadow-camera-top={fallbackExtentM / 2}
        shadow-camera-bottom={-fallbackExtentM / 2}
        shadow-camera-far={200}
        shadow-bias={-0.0002}
        shadow-radius={cascadeShadowRadius(fallbackExtentM, quality.shadowMapSize, penumbraM)}
        shadow-normalBias={
          (fallbackExtentM / quality.shadowMapSize) *
          cascadeShadowRadius(fallbackExtentM, quality.shadowMapSize, penumbraM) *
          1.5
        }
      />
    </group>
  )
}
