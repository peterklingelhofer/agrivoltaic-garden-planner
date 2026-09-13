import { Line } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, type ReactElement } from 'react'
import { ExtrudeGeometry, ShapeGeometry, Vector2 } from 'three'
import { arrayLayout } from '../state/derive'
import { EMPTY_LIST } from '../state/slices'
import { scenePlot, useAppStore } from '../state/store'
import { DEFAULT_GROUND_COVER, groundAlbedoOf } from '../types/ground'
import type { BedId } from '../types/ids'
import type { PvArray } from '../types/pv'
import { subtractPosts } from './csg'
import {
  bedSoilRoughness,
  bedWetness,
  driedBy,
  soilSurface,
  soilTint,
  surfaceGain,
  timberSurface,
  TIMBER_ALBEDO,
  tintedBy,
} from './materials'
import { bedCutters, bedShape, bedThirst } from './sceneMath'
import { useBedDrag } from './useGroundDrag'
import { useRenderQuality } from './useRenderQuality'
import type { Surface } from './textures'

export interface BedMeshProps {
  readonly bedId: BedId
  readonly selected: boolean
}

/**
 * `ExtrudeGeometry` and `ShapeGeometry` both emit world UVs in metres, so a tile is a metre and
 * nothing has to be scaled per bed. That is also why a bed can be any shape and the boards still
 * run the right way round it
 */
const tile = (surface: Surface, metres: number): Surface => {
  for (const map of [surface.map, surface.normalMap, surface.ormMap]) {
    map.repeat.set(1 / metres, 1 / metres)
  }
  return surface
}

export const BedMesh = ({ bedId, selected }: BedMeshProps): ReactElement | null => {
  const bed = useAppStore((s) => scenePlot(s)?.beds.find((b) => b.id === bedId) ?? null)
  const arrays = useAppStore((s) => scenePlot(s)?.arrays ?? (EMPTY_LIST as readonly PvArray[]))
  const groundAlbedo = useAppStore((s) =>
    groundAlbedoOf(scenePlot(s)?.groundCover ?? DEFAULT_GROUND_COVER),
  )
  const selectBed = useAppStore((s) => s.selectBed)
  const dragging = useAppStore((s) => s.dragging)
  const carrying = useAppStore((s) => s.carrying)
  const dropOnBed = useAppStore((s) => s.dropOnBed)
  const setHovered = useAppStore((s) => s.setHovered)
  // the last season's report, a stored object and so a stable thing to select; the soil reads from
  // it how thirsty this bed was (Decision Record 14.5)
  const lastReport = useAppStore((s) => s.simulation.reports[s.simulation.reports.length - 1])
  const sweeping = useAppStore((s) => s.sweeping)
  const thirst = sweeping ? 0 : bedThirst(lastReport, bedId as string)
  const quality = useRenderQuality()
  // in Move mode a press on the bed picks it up; every other mode leaves the press to the camera
  const drag = useBedDrag(bedId)

  const posts = useMemo(
    () => arrays.flatMap((array) => arrayLayout(array, 45, 180).posts),
    [arrays],
  )

  // Walls and soil cap are separate single-material meshes: a grouped multi-material mesh
  // does not survive a CSG rewrite and breaks raycasting
  const geometry = useMemo(() => {
    if (!bed) return null
    const shape = bedShape(bed.footprint)
    const walls = new ExtrudeGeometry(shape, {
      depth: Math.max(0.02, bed.raisedHeightM),
      bevelEnabled: false,
    })
    const cutters = bedCutters(bed, posts)
    const cut = cutters.length > 0 ? subtractPosts(walls, cutters) : walls
    // `subtractPosts` clones `walls` before it cuts, so once it hands back a different object
    // the extrusion it cloned from is spent and has to be freed here; when there is nothing to
    // cut, or the CSG evaluation fails, `cut` is `walls` itself and must survive
    if (cut !== walls) walls.dispose()
    return { walls: cut, soil: new ShapeGeometry(shape) }
  }, [bed, posts])

  // Runs whenever `geometry` is replaced or this mesh unmounts: both `walls` and `soil` are
  // owned solely by this memo, never shared with a later one, so disposing them here can't
  // double-free
  useEffect(() => {
    return () => {
      geometry?.walls.dispose()
      geometry?.soil.dispose()
    }
  }, [geometry])

  const timber = useMemo(
    () => tile(timberSurface(quality.surfaceTextureSize), 1),
    [quality.surfaceTextureSize],
  )
  const soil = useMemo(
    () => tile(soilSurface(quality.surfaceTextureSize), 0.7),
    [quality.surfaceTextureSize],
  )
  const normalScale = useMemo(() => new Vector2(1, 1), [])

  const onClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      // a handle owns this press, and the bed under it is the thing being moved: see `Ground`
      if (dragging) return
      event.stopPropagation()
      selectBed(bedId)
    },
    [bedId, dragging, selectBed],
  )

  /**
   * `stopPropagation` matters here: r3f delivers a pointer event to every mesh the ray crosses,
   * so without it the ground behind the bed clears the hover the bed just set
   */
  const onPointerOver = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation()
      setHovered({ kind: 'bed', bedId })
    },
    [bedId, setHovered],
  )

  /**
   * A crop let go over this bed.
   *
   * The camera cannot be in the way here, which is worth stating because it looks as though it
   * should be: dragging in this scene orbits, and dragging a crop onto it plainly must not. It
   * does not, and not because anything suppresses it -- the drag STARTS on a button in the
   * sidebar, so `OrbitControls` never sees the pointerdown that would begin an orbit, and by the
   * time the pointer crosses the canvas it is already carrying something. The two gestures are
   * told apart by where they began rather than by a mode
   */
  const onPointerUp = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (carrying === null) return
      event.stopPropagation()
      dropOnBed(bedId)
    },
    [bedId, carrying, dropOnBed],
  )

  if (!bed || !geometry) return null

  const wet = bedWetness(bed.irrigation)
  const top = Math.max(0.02, bed.raisedHeightM)
  // the selected bed's edge, drawn as a line: the tint on its boards was not enough for a
  // gardener to tell which of three beds the sidebar was talking about
  const outline = selected
    ? [...bed.footprint.exterior, bed.footprint.exterior[0]].flatMap((point) =>
        point === undefined ? [] : [[point.xM, top + 0.03, -point.yM] as [number, number, number]],
      )
    : null

  return (
    <group
      name={`bed-${bedId}`}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      userData={{
        testid: `scene-bed-${bedId}`,
        areaM2: bed.areaM2,
        wetness: wet,
        irrigation: bed.irrigation.method,
      }}
    >
      <mesh
        name={`bed-${bedId}-solid`}
        geometry={geometry.walls}
        rotation={[-Math.PI / 2, 0, 0]}
        castShadow
        receiveShadow
        onClick={onClick}
        onPointerOver={onPointerOver}
        onPointerUp={onPointerUp}
      >
        <meshStandardMaterial
          color={tintedBy(surfaceGain(timber, TIMBER_ALBEDO), selected)}
          map={timber.map}
          normalMap={timber.normalMap}
          normalScale={normalScale}
          roughnessMap={timber.ormMap}
          roughness={1}
          metalness={0}
        />
      </mesh>
      {/*
        Wetness is the bed's own irrigation read back as a surface, not a mood: the same water
        that lowers the balance's soil evaporation is the water that darkens the soil and gives
        it a specular sheen. Subsurface drip therefore shows nothing, which is correct
      */}
      <mesh
        name={`bed-${bedId}-soil`}
        geometry={geometry.soil}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, Math.max(0.02, bed.raisedHeightM) + 0.002, 0]}
        receiveShadow
        onClick={onClick}
        onPointerOver={onPointerOver}
        onPointerUp={onPointerUp}
      >
        <meshPhysicalMaterial
          color={driedBy(tintedBy(soilTint(soil, bed, groundAlbedo), selected), thirst)}
          map={soil.map}
          normalMap={soil.normalMap}
          normalScale={normalScale}
          roughnessMap={soil.ormMap}
          roughness={bedSoilRoughness(bed)}
          metalness={0}
          clearcoat={quality.glassClearcoat ? wet * 0.7 : 0}
          clearcoatRoughness={0.35}
        />
      </mesh>
      {outline === null ? null : (
        <Line
          name={`bed-${bedId}-outline`}
          points={outline}
          color="#ffffff"
          lineWidth={3}
          depthTest={false}
        />
      )}
    </group>
  )
}
