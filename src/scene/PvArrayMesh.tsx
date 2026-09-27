import { Instance, Instances } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useCallback, useMemo, type ReactElement } from 'react'
import { BackSide, DoubleSide, Vector2 } from 'three'
import { arrayLayout } from '../state/derive'
import { scenePlot, useAppStore } from '../state/store'
import { sunAt } from '../state/sun'
import type { ArrayId } from '../types/ids'
import {
  aluminiumSurface,
  galvanisedSurface,
  laminateSurface,
  MODULE_REAR_ROUGHNESS,
  moduleRearAlbedo,
  tintedBy,
} from './materials'
import {
  laminateGeometry,
  moduleFrameGeometry,
  postGeometry,
  torqueTubeGeometry,
} from './panelGeometry'
import { moduleQuaternion } from './sceneMath'
import { useArrayDrag } from './useGroundDrag'
import { useRenderQuality } from './useRenderQuality'

export interface PvArrayMeshProps {
  readonly arrayId: ArrayId
  readonly showTrackerRotation: boolean
}

/**
 * Glass over silicon. A metal's reflectance barely rises towards the horizon, and an array seen
 * down a row is almost entirely grazing reflection of the sky. So the laminate is one smooth
 * dielectric at the index of soda-lime glass: Schlick carries its reflectance from four percent
 * face-on to near total at the limb, and what it reflects is the same Preetham field that lights
 * everything else. One layer, not two: the cell stack is behind the glass and does not get a
 * specular of its own. The anisotropy is faint and runs along the cell rows, which is the direction
 * the stringing and the rolled glass both leave a sheen in
 */
const GLASS = {
  roughness: 1,
  metalness: 0,
  ior: 1.5,
  specularIntensity: 1,
  anisotropy: 0.3,
  anisotropyRotation: Math.PI / 2,
} as const

export const PvArrayMesh = ({
  arrayId,
  showTrackerRotation,
}: PvArrayMeshProps): ReactElement | null => {
  const array = useAppStore((s) => scenePlot(s)?.arrays.find((a) => a.id === arrayId) ?? null)
  const location = useAppStore((s) => s.location)
  const timeUtcMillis = useAppStore((s) => s.timeUtcMillis)
  const selected = useAppStore((s) => s.selectedArrayId === arrayId)
  const selectArray = useAppStore((s) => s.selectArray)
  const setHovered = useAppStore((s) => s.setHovered)
  const quality = useRenderQuality()
  const drag = useArrayDrag(arrayId)

  const sun = useMemo(() => sunAt(location, timeUtcMillis), [location, timeUtcMillis])
  const layout = useMemo(
    () =>
      array
        ? arrayLayout(
            array,
            showTrackerRotation ? sun.elevationDeg : 45,
            showTrackerRotation ? sun.azimuthDeg : 180,
          )
        : null,
    [array, showTrackerRotation, sun.elevationDeg, sun.azimuthDeg],
  )

  const onClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation()
      selectArray(arrayId)
    },
    [arrayId, selectArray],
  )

  const onPointerOver = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation()
      setHovered({ kind: 'array', arrayId })
    },
    [arrayId, setHovered],
  )

  const size = quality.surfaceTextureSize
  const laminate = useMemo(() => laminateSurface(size), [size])
  const aluminium = useMemo(() => aluminiumSurface(size), [size])
  const steel = useMemo(() => galvanisedSurface(size), [size])
  const frameNormalScale = useMemo(() => new Vector2(0.6, 0.6), [])
  const steelNormalScale = useMemo(() => new Vector2(0.8, 0.8), [])
  // the posts and the torque tubes share one galvanised finish
  const steelMaterial = {
    map: steel.map,
    normalMap: steel.normalMap,
    normalScale: steelNormalScale,
    roughnessMap: steel.ormMap,
    metalnessMap: steel.ormMap,
    roughness: 1,
    metalness: 1,
  }
  const glassNormalScale = useMemo(() => new Vector2(0.25, 0.25), [])
  // half strength on a metal: the frame's own reflectance is high, and a full-strength tint on
  // top of it clips the red channel and never reads as selected
  const tint = tintedBy(1, selected, 0.55)

  if (!array || !layout) return null

  const rear = moduleRearAlbedo(array.module)

  const { widthM, heightM } = array.module
  const frame = moduleFrameGeometry(widthM, heightM)
  const laminateMesh = laminateGeometry(widthM, heightM)
  const quaternion = moduleQuaternion(
    layout.orientation.tiltDeg,
    layout.orientation.surfaceAzimuthDeg,
  )
  const spanM = Math.min(array.geometry.rowLengthM, array.geometry.modulesPerRow * widthM)
  const postHeight = Math.max(0.4, array.geometry.clearanceHeightM)

  return (
    <group
      name={`array-${arrayId}`}
      onClick={onClick}
      onPointerOver={onPointerOver}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      userData={{
        testid: `scene-array-${arrayId}`,
        gcr: array.derived.groundCoverRatio,
        tiltDeg: layout.orientation.tiltDeg,
        surfaceAzimuthDeg: layout.orientation.surfaceAzimuthDeg,
        glass: quality.glassClearcoat ? 'clearcoat' : 'standard',
      }}
    >
      <Instances name={`array-${arrayId}-frames`} geometry={frame} limit={2048} castShadow>
        <meshStandardMaterial
          color={[tint[0], tint[1], tint[2]]}
          map={aluminium.map}
          normalMap={aluminium.normalMap}
          normalScale={frameNormalScale}
          roughnessMap={aluminium.ormMap}
          metalnessMap={aluminium.ormMap}
          roughness={1}
          metalness={1}
        />
        {layout.modules.map((m) => (
          <Instance
            key={`frame-${m.key}`}
            position={[...m.position]}
            quaternion={[...quaternion]}
          />
        ))}
      </Instances>
      <Instances
        name={`array-${arrayId}-laminates`}
        geometry={laminateMesh}
        limit={2048}
        castShadow
      >
        {/*
          The laminate is a zero-thickness plane, and three defaults `shadowSide` to the
          opposite of `side`, so the depth pass culled the very faces pointed at the sun and
          every module cast nothing but its frame outline. On a tool about panel shade that is
          the picture contradicting the simulation, which shades the full module footprint
        */}
        {quality.glassClearcoat ? (
          <meshPhysicalMaterial
            map={laminate.map}
            normalMap={laminate.normalMap}
            normalScale={glassNormalScale}
            roughnessMap={laminate.ormMap}
            shadowSide={DoubleSide}
            {...GLASS}
          />
        ) : (
          <meshStandardMaterial
            map={laminate.map}
            normalMap={laminate.normalMap}
            normalScale={glassNormalScale}
            roughnessMap={laminate.ormMap}
            roughness={1}
            metalness={0}
            shadowSide={DoubleSide}
          />
        )}
        {layout.modules.map((m) => (
          <Instance
            key={`laminate-${m.key}`}
            position={[...m.position]}
            quaternion={[...quaternion]}
          />
        ))}
      </Instances>
      {/*
        The same plane again, back faces only, so a module seen from underneath or from behind a
        row is a module. It is not a hole with a frame around it. Two instance sets over one
        geometry: a plane's front and back are never the
        same pixel from any camera, so this adds a draw call and no overdraw, and it leaves the
        glass in front untouched. It does not cast: the laminate above already casts the whole
        module through its `shadowSide`, and a second caster at the same depth would only pay for
        the same shadow twice
      */}
      <Instances name={`array-${arrayId}-backsheets`} geometry={laminateMesh} limit={2048}>
        <meshStandardMaterial
          color={[rear, rear, rear]}
          roughness={MODULE_REAR_ROUGHNESS}
          metalness={0}
          side={BackSide}
        />
        {layout.modules.map((m) => (
          <Instance
            key={`backsheet-${m.key}`}
            position={[...m.position]}
            quaternion={[...quaternion]}
          />
        ))}
      </Instances>
      <Instances
        name={`array-${arrayId}-posts`}
        geometry={postGeometry(postHeight)}
        limit={512}
        castShadow
      >
        <meshStandardMaterial {...steelMaterial} />
        {layout.posts.map((p) => (
          <Instance key={`post-${p.join(':')}`} position={[...p]} />
        ))}
      </Instances>
      <Instances
        name={`array-${arrayId}-tubes`}
        geometry={torqueTubeGeometry(spanM)}
        limit={64}
        castShadow
      >
        <meshStandardMaterial {...steelMaterial} />
        {layout.torqueTubes.map((p) => (
          <Instance
            key={`tube-${p.join(':')}`}
            position={[...p]}
            rotation={[0, -((array.geometry.rowAzimuthDeg * Math.PI) / 180) + Math.PI / 2, 0]}
          />
        ))}
      </Instances>
    </group>
  )
}
