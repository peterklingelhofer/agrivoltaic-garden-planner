import { Line } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, type ReactElement } from 'react'
import {
  CylinderGeometry,
  DataTexture,
  ExtrudeGeometry,
  MeshDepthMaterial,
  NearestFilter,
  RepeatWrapping,
  RGBADepthPacking,
  RGBAFormat,
} from 'three'
import { leafOnMonthsFor } from '../sim/obstruction'
import { requestCardScroll } from '../state/card-scroll'
import { centroidOf } from '../state/geom'
import { scenePlot, useAppStore } from '../state/store'
import type { Tree } from '../types/garden'
import type { ObstructionId } from '../types/ids'
import type { EpochMillis, Fraction } from '../types/units'
import { tintedBy } from './materials'
import { VertexHandles } from './PlotBoundary'
import { bedShape } from './sceneMath'
import type { Rgb } from './textures'
import { moveObstructionCorner, useObstructionDrag } from './useGroundDrag'

export interface TreeMeshProps {
  readonly obstructionId: ObstructionId
  readonly selected: boolean
}

const TRUNK_RADIUS_M = 0.15
/** Bark: a plain, untextured brown, close to `materials.ts`'s sawn-softwood reflectance */
const TRUNK_BROWN: Rgb = [0.13, 0.08, 0.05]
/** A dark leafy green, near the reflectance the ground's turf palette authors grass at */
const CROWN_GREEN: Rgb = [0.09, 0.22, 0.05]

/** Meters one tile of the stippled shadow covers, small enough to read as leaf-sized gaps */
const DITHER_TILE_M = 0.4
const DITHER_SIZE = 8
const ditherCache = new Map<string, DataTexture>()

// the same small scatter hash `sceneMath.ts` seeds for plants, reseeded here for its own ranking
const ditherHash = (x: number, y: number): number => {
  let h = Math.imul(x + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(y + 0x27d4eb2f, 0xc2b2ae35)
  h = Math.imul(h ^ (h >>> 15), 1 | h)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/**
 * A shadow map casts all or nothing, so a crown's density is drawn as a stipple. Not a
 * flat block: each texel of this tile is fully opaque or fully clear, tiled over the crown by
 * `RepeatWrapping`, and the share left opaque is `coveredShare`. Cached per share so two trees
 * losing the same fraction of light to their crown draw the same tile, without paying for it
 * twice
 */
const ditherTexture = (coveredShare: number): DataTexture => {
  const key = coveredShare.toFixed(2)
  const hit = ditherCache.get(key)
  if (hit) return hit
  const data = new Uint8Array(DITHER_SIZE * DITHER_SIZE * 4)
  for (let y = 0; y < DITHER_SIZE; y += 1) {
    for (let x = 0; x < DITHER_SIZE; x += 1) {
      // alphaMap reads the green channel. Every channel carries the same value here so it reads
      // right whichever one the shader samples
      const covered = ditherHash(x, y) < coveredShare ? 255 : 0
      const i = (x + y * DITHER_SIZE) * 4
      data[i] = covered
      data[i + 1] = covered
      data[i + 2] = covered
      data[i + 3] = covered
    }
  }
  const texture = new DataTexture(data, DITHER_SIZE, DITHER_SIZE, RGBAFormat)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.repeat.set(1 / DITHER_TILE_M, 1 / DITHER_TILE_M)
  texture.needsUpdate = true
  ditherCache.set(key, texture)
  return texture
}

/**
 * The transmittance the bake applies to this crown this month (Decision Record 26). `months` is
 * null until the site and weather are both ready, and every month then reads as in leaf: the
 * bake can't run before both have loaded, so nothing it draws can disagree with this
 */
const transmittanceInForceFor = (
  tree: Tree,
  months: readonly boolean[] | null,
  timeUtcMillis: EpochMillis,
): Fraction => {
  if (tree.evergreen || months === null) return tree.transmittance
  const month = new Date(timeUtcMillis).getUTCMonth()
  const inLeaf = months[month] ?? true
  return inLeaf ? tree.transmittance : tree.leaflessTransmittance
}

/**
 * A tree, drawn as the same box the bake shades with: a crown from `crownBaseM` to `heightM`,
 * carrying whichever transmittance the bake applies to it this month (Decision Record 26).
 * Nothing here is drawn that the bake doesn't also hold (Decision Record 14.5): the trunk shades
 * no bed the bake measures over, so it casts a shadow for the picture and reaches nothing the
 * light model reads. The crown's opacity and the density of its stippled shadow both follow that
 * same transmittance
 */
export const TreeMesh = ({ obstructionId, selected }: TreeMeshProps): ReactElement | null => {
  const tree = useAppStore((s): Tree | null => {
    const found = scenePlot(s)?.obstructions.find((o) => o.id === obstructionId)
    return found?.kind === 'tree' ? found : null
  })
  const mode = useAppStore((s) => s.mode)
  const selectObstruction = useAppStore((s) => s.selectObstruction)
  const setSidebarStep = useAppStore((s) => s.setSidebarStep)
  const dragging = useAppStore((s) => s.dragging)
  const site = useAppStore((s) => s.site)
  const weather = useAppStore((s) => s.weather)
  const timeUtcMillis = useAppStore((s) => s.timeUtcMillis)
  // in Move mode a press on the tree picks it up. Every other mode leaves the press to the camera
  const drag = useObstructionDrag(obstructionId, 'tree')

  // the 8760-hour Growing Season Index pass runs once per site/weather pair
  const months = useMemo(
    () =>
      site.status === 'ready' && weather.status === 'ready'
        ? leafOnMonthsFor(site.value, weather.value)
        : null,
    [site, weather],
  )
  const transmittanceInForce = tree ? transmittanceInForceFor(tree, months, timeUtcMillis) : 1

  const trunkGeometry = useMemo(() => {
    if (!tree) return null
    const geometry = new CylinderGeometry(TRUNK_RADIUS_M, TRUNK_RADIUS_M, tree.crownBaseM, 10)
    // baked in local space, so the trunk's own geometry already spans ground to crownBaseM
    geometry.translate(0, tree.crownBaseM / 2, 0)
    return geometry
  }, [tree])

  const crownGeometry = useMemo(() => {
    if (!tree) return null
    const geometry = new ExtrudeGeometry(bedShape(tree.footprint), {
      depth: tree.heightM - tree.crownBaseM,
      bevelEnabled: false,
    })
    // local z becomes scene y once rotated below, so this is where crownBaseM enters
    geometry.translate(0, 0, tree.crownBaseM)
    return geometry
  }, [tree])

  const crownDepthMaterial = useMemo(
    () =>
      new MeshDepthMaterial({
        depthPacking: RGBADepthPacking,
        alphaMap: ditherTexture(1 - transmittanceInForce),
        alphaTest: 0.5,
      }),
    [transmittanceInForce],
  )

  // runs whenever a geometry is replaced or this mesh unmounts, exactly as `HouseMesh` frees its own
  useEffect(() => {
    return () => {
      trunkGeometry?.dispose()
      crownGeometry?.dispose()
    }
  }, [trunkGeometry, crownGeometry])

  useEffect(() => {
    return () => crownDepthMaterial.dispose()
  }, [crownDepthMaterial])

  const onClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      // a handle owns this press, and the tree under it is the thing being moved: see `Ground`
      if (dragging) return
      event.stopPropagation()
      selectObstruction(obstructionId)
      // its card is on the ground step, so the press opens it, as a plant opens the plants step,
      // and asks for the card to scroll into view
      setSidebarStep('ground')
      requestCardScroll(obstructionId)
    },
    [dragging, obstructionId, selectObstruction, setSidebarStep],
  )

  if (!tree || !trunkGeometry || !crownGeometry) return null

  const centroid = centroidOf(tree.footprint.exterior)
  const tint = tintedBy(1, selected)
  const crownColor: Rgb = [
    CROWN_GREEN[0] * tint[0],
    CROWN_GREEN[1] * tint[1],
    CROWN_GREEN[2] * tint[2],
  ]

  // the selected crown's rim, drawn as a line, the same way the selected house's eaves are
  const outline = selected
    ? [...tree.footprint.exterior, tree.footprint.exterior[0]].flatMap((point) =>
        point === undefined
          ? []
          : [[point.xM, tree.heightM + 0.03, -point.yM] as [number, number, number]],
      )
    : null

  return (
    <group
      name={`tree-${obstructionId}`}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      userData={{
        testid: `scene-tree-${obstructionId}`,
        heightM: tree.heightM,
        crownBaseM: tree.crownBaseM,
        transmittanceInForce,
      }}
    >
      <mesh
        name={`tree-${obstructionId}-trunk`}
        geometry={trunkGeometry}
        position={[centroid.xM, 0, -centroid.yM]}
        castShadow
        onClick={onClick}
      >
        <meshStandardMaterial color={TRUNK_BROWN} roughness={1} metalness={0} />
      </mesh>
      <mesh
        name={`tree-${obstructionId}-crown`}
        geometry={crownGeometry}
        rotation={[-Math.PI / 2, 0, 0]}
        castShadow
        receiveShadow
        customDepthMaterial={crownDepthMaterial}
        onClick={onClick}
      >
        <meshStandardMaterial
          color={crownColor}
          roughness={1}
          metalness={0}
          transparent
          opacity={1 - transmittanceInForce}
        />
      </mesh>
      {outline === null ? null : (
        <Line
          name={`tree-${obstructionId}-outline`}
          points={outline}
          color="#ffffff"
          lineWidth={3}
          depthTest={false}
        />
      )}
      {/* corners only in Move mode, keeping the rectangle the way a plot corner drag does */}
      {mode === 'move' ? (
        <VertexHandles
          ring={tree.footprint.exterior}
          color="#f2c14e"
          onMove={(index, to) => moveObstructionCorner(obstructionId, index, to)}
        />
      ) : null}
    </group>
  )
}
