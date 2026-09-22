import { useThree, type ThreeEvent } from '@react-three/fiber'
import { useCallback, useMemo, type ReactElement } from 'react'
import { Vector2, Vector3 } from 'three'
import { distanceToPolygonM, fromSceneXZ, polygonOf, vec2 } from '../state/geom'
import { sceneGroundAlbedo, scenePlot, sceneSnowCover, useAppStore } from '../state/store'
import type { Bed } from '../types/garden'
import { DEFAULT_GROUND_COVER } from '../types/ground'
import { useImageryTexture } from './imagery'
import { groundSurface, surfaceGain } from './materials'
import { GROUND_SIZE_M, groundPoint } from './sceneMath'
import { useRenderQuality } from './useRenderQuality'

/** Edge of one tile in meters. Small enough to hold a blade of grass, large enough not to moire */
const TILE_M = 2.5

/** Half the 48px touch target mobile guidelines ask for: the radius a finger's tap forgives */
const FINGER_PX = 24

/**
 * Reused for every bed-corner projection in a touch press, so the search allocates nothing
 * per vertex
 */
const scratchProjection = new Vector3()

/**
 * The cover the grower chose, drawn as that cover: turf, stone, straw, chips or bare soil, from
 * `groundSurface`. Each tile is authored near its cover's albedo and `surfaceGain` is the neutral
 * multiplier that carries it to the exact figure the model uses, so changing the cover in the
 * design panel changes how bright the ground renders by exactly the amount it changes the
 * bounce in `SkyLight`.
 *
 * Under satellite imagery the map is a photograph of this ground and no tint can be honest about
 * it, so the imagery is shown as it arrived and only the relief and roughness are ours
 */
export const Ground = (): ReactElement => {
  const mode = useAppStore((s) => s.mode)
  const imageryEnabled = useAppStore((s) => s.imageryEnabled)
  const location = useAppStore((s) => s.location)
  // two separate numbers: see `sceneSnowCover`. The albedo is shared with `SkyLight`
  const snowCover = useAppStore(sceneSnowCover)
  const groundAlbedo = useAppStore(sceneGroundAlbedo)
  const cover = useAppStore((s) => scenePlot(s)?.groundCover ?? DEFAULT_GROUND_COVER)
  // the beds a touch's near-miss can land on. See `onPointerDown`
  const plot = useAppStore(scenePlot)
  const pushDraftVertex = useAppStore((s) => s.pushDraftVertex)
  const undoDraftVertex = useAppStore((s) => s.undoDraftVertex)
  const commitDraft = useAppStore((s) => s.commitDraft)
  const selectBed = useAppStore((s) => s.selectBed)
  const selectArray = useAppStore((s) => s.selectArray)
  const selectObstruction = useAppStore((s) => s.selectObstruction)
  const setHovered = useAppStore((s) => s.setHovered)
  const dragging = useAppStore((s) => s.dragging)
  const texture = useImageryTexture(location, imageryEnabled)
  const quality = useRenderQuality()
  // the canvas's own pixel size, so a tap and each bed's projected corners share one pixel space
  const size = useThree((s) => s.size)

  const surface = useMemo(
    () => groundSurface(quality.surfaceTextureSize * 2, cover),
    [cover, quality.surfaceTextureSize],
  )
  const repeat = useMemo(() => {
    const tiles = GROUND_SIZE_M / TILE_M
    for (const map of [surface.map, surface.normalMap, surface.ormMap]) map.repeat.set(tiles, tiles)
    return tiles
  }, [surface])
  const normalScale = useMemo(() => new Vector2(1, 1), [])

  // the backdrop of the whole scene, so it's also what says "nothing is under the pointer"
  const clearHover = useCallback(() => {
    setHovered(null)
  }, [setHovered])

  const onPointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      /*
        A press that belongs to a handle isn't a press on the ground.
        The vertex handles and a Move-mode drag on a bed are r3f meshes that stop their own
        press, and both raise this flag for as long as they hold the pointer, so a press that
        reaches here mid-drag is left alone. See `AppState.dragging`
      */
      if (dragging) return
      if (mode === 'select' || mode === 'move') {
        /*
          A tap aimed at a bed on a small touch screen lands on the ground beside it as often
          as on the bed itself, so a miss this close still means the bed. The pointer that
          pressed decides this, more specific than the `pointer: coarse` media query `coarsePointer`
          reads, because it's this finger's tap that missed and a mouse plugged into a tablet
          aims as exactly as any mouse
        */
        if (event.nativeEvent?.pointerType === 'touch') {
          /*
            A finger's miss is measured on the screen because a tap's ray can travel well
            past its target before it hits anything: a bed's own label floats above it with
            no raycast surface, so a tap aimed at the label reaches the ground behind the
            bed, where only the screen distance still reads as a near miss
          */
          const px = ((event.pointer.x + 1) / 2) * size.width
          const py = ((1 - event.pointer.y) / 2) * size.height
          const camera = event.camera
          let nearest: Bed | null = null
          let nearestDistancePx = Infinity
          for (const bed of plot?.beds ?? []) {
            const topY = Math.max(0.02, bed.raisedHeightM)
            const exterior = bed.footprint.exterior
            // a corner behind the camera projects to a false position in front of it, so a
            // bed the camera has turned away from is left out of the search entirely
            const behindCamera = exterior.some((p) => {
              scratchProjection.set(p.xM, topY, -p.yM).applyMatrix4(camera.matrixWorldInverse)
              return scratchProjection.z > 0
            })
            if (behindCamera) continue
            const screenRing = exterior.map((p) => {
              scratchProjection.set(p.xM, topY, -p.yM).project(camera)
              return vec2(
                ((scratchProjection.x + 1) / 2) * size.width,
                ((1 - scratchProjection.y) / 2) * size.height,
              )
            })
            // distanceToPolygonM is unit-free: pixels stand in for the plot meters it usually gets
            const distancePx = distanceToPolygonM(polygonOf(screenRing), px, py)
            if (distancePx < nearestDistancePx) {
              nearest = bed
              nearestDistancePx = distancePx
            }
          }
          if (nearest !== null && nearestDistancePx <= FINGER_PX) {
            selectBed(nearest.id)
            return
          }
        }
        selectBed(null)
        selectArray(null)
        selectObstruction(null)
        return
      }
      event.stopPropagation()
      const [x, z] = groundPoint(event)
      pushDraftVertex(fromSceneXZ(x, z))
    },
    [dragging, mode, plot, pushDraftVertex, selectArray, selectBed, selectObstruction, size],
  )

  /**
   * Double-click to close the shape, which is what every drawing tool does.
   *
   * The undo isn't a nicety. A double-click is two whole click cycles, so `onPointerDown` above
   * has already pushed the last corner TWICE by the time this runs, and committing here without
   * dropping one would raise a bed with a zero-length edge in it. `commitDraft` refuses a draft
   * under three vertices, so a double-click before the shape exists costs nothing
   */
  const onDoubleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      if (mode === 'select') return
      event.stopPropagation()
      undoDraftVertex()
      commitDraft()
    },
    [mode, undoDraftVertex, commitDraft],
  )

  /**
   * Snow is drawn as the surface it is: brighter, and much less rough than bare soil, so the low
   * winter sun rakes across it. The tile underneath is unchanged, which is what keeps the relief
   * reading as ground with snow lying on it
   */
  const tint = surfaceGain(surface, groundAlbedo)
  const roughness = 1 - 0.45 * snowCover

  return (
    <mesh
      name="ground"
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      onPointerOver={clearHover}
      userData={{
        testid: 'scene-ground',
        renderedAlbedo: texture ? null : groundAlbedo,
        snowCover,
        repeat,
      }}
    >
      <planeGeometry args={[GROUND_SIZE_M, GROUND_SIZE_M]} />
      <meshStandardMaterial
        color={texture ? '#ffffff' : [tint, tint, tint]}
        map={texture ?? surface.map}
        normalMap={surface.normalMap}
        normalScale={normalScale}
        roughnessMap={surface.ormMap}
        roughness={roughness}
        metalness={0}
      />
    </mesh>
  )
}
