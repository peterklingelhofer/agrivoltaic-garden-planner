import type { ThreeEvent } from '@react-three/fiber'
import { useCallback, useMemo, type ReactElement } from 'react'
import { Vector2 } from 'three'
import { fromSceneXZ } from '../state/geom'
import { sceneGroundAlbedo, scenePlot, sceneSnowCover, useAppStore } from '../state/store'
import { DEFAULT_GROUND_COVER } from '../types/ground'
import { useImageryTexture } from './imagery'
import { groundSurface, surfaceGain } from './materials'
import { GROUND_SIZE_M, groundPoint } from './sceneMath'
import { useRenderQuality } from './useRenderQuality'

/** Edge of one tile in metres. Small enough to hold a blade of grass, large enough not to moire */
const TILE_M = 2.5

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
  // two numbers, not one object: see `sceneSnowCover`. The albedo is shared with `SkyLight`
  const snowCover = useAppStore(sceneSnowCover)
  const groundAlbedo = useAppStore(sceneGroundAlbedo)
  const cover = useAppStore((s) => scenePlot(s)?.groundCover ?? DEFAULT_GROUND_COVER)
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

  // the backdrop of the whole scene, so it is also what says "nothing is under the pointer"
  const clearHover = useCallback(() => {
    setHovered(null)
  }, [setHovered])

  const onPointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      /*
        A press that belongs to a handle is not a press on the ground.
        The vertex handles and a Move-mode drag on a bed are r3f meshes that stop their own
        press, and both raise this flag for as long as they hold the pointer, so a press that
        reaches here mid-drag is left alone. See `AppState.dragging`
      */
      if (dragging) return
      if (mode === 'select' || mode === 'move') {
        selectBed(null)
        selectArray(null)
        selectObstruction(null)
        return
      }
      event.stopPropagation()
      const [x, z] = groundPoint(event)
      pushDraftVertex(fromSceneXZ(x, z))
    },
    [dragging, mode, pushDraftVertex, selectArray, selectBed, selectObstruction],
  )

  /**
   * Double-click to close the shape, which is what every drawing tool does.
   *
   * The undo is not a nicety. A double-click is two whole click cycles, so `onPointerDown` above
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
   * reading as ground with snow lying on it rather than as a flat white plane
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
