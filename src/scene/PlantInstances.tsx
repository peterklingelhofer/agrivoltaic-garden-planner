import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, type ReactElement } from 'react'
import {
  Color,
  DoubleSide,
  Matrix4,
  MeshDepthMaterial,
  MeshStandardMaterial,
  Quaternion,
  RGBADepthPacking,
  Vector3,
  type InstancedMesh,
} from 'three'
import { EMPTY_LIST } from '../state/slices'
import { scenePlot, useAppStore } from '../state/store'
import { dayOfYearUtc } from '../state/sun'
import type { CanopyShape, Crop } from '../types/crop'
import type { BedId, PlantingId } from '../types/ids'
import type { PvArray } from '../types/pv'
import { applyWind, canopyCards, LEAF_ALPHA_TEST, leafTexture, WIND_TIME } from './foliage'
import type { RenderQuality } from './quality'
import { applyLook, layoutPlanting, outcomeLook, type PlantItem, UNTOUCHED_LOOK } from './sceneMath'
import { useBedDrag } from './useGroundDrag'
import { useRenderQuality } from './useRenderQuality'

export interface PlantInstancesProps {
  readonly bedId: BedId
  readonly atYear: number
}

interface GroupProps {
  readonly shape: CanopyShape
  readonly items: readonly PlantItem[]
  /** Parallel to `items`: which planting each instance was laid out for */
  readonly plantingIds: readonly PlantingId[]
  readonly baseY: number
  readonly name: string
  readonly quality: RenderQuality
  readonly onHover: (plantingId: PlantingId | null) => void
}

const InstanceGroup = ({
  shape,
  items,
  plantingIds,
  baseY,
  name,
  quality,
  onHover,
}: GroupProps): ReactElement | null => {
  const ref = useRef<InstancedMesh | null>(null)
  const geometry = useMemo(
    () => canopyCards(shape, quality.foliageCards),
    [shape, quality.foliageCards],
  )
  const leaf = useMemo(() => leafTexture(quality.surfaceTextureSize), [quality.surfaceTextureSize])

  /**
   * Alpha-tested: a blended canopy would need sorting, which instancing rules out, and
   * the depth pass would see nothing, so plants would stop shading each other. `shadowSide` is both
   * sides for the same reason the module laminate needs it, a card being a plane
   */
  const material = useMemo(() => {
    const made = new MeshStandardMaterial({
      map: leaf,
      alphaTest: LEAF_ALPHA_TEST,
      side: DoubleSide,
      shadowSide: DoubleSide,
      roughness: 0.72,
      metalness: 0,
    })
    return quality.wind ? applyWind(made) : made
  }, [leaf, quality.wind])

  // The shadow pass runs its own material, so a swaying plant would cast a still shadow unless
  // the same displacement is compiled into the depth program too
  const depthMaterial = useMemo(
    () =>
      quality.wind
        ? applyWind(
            new MeshDepthMaterial({
              depthPacking: RGBADepthPacking,
              map: leaf,
              alphaTest: LEAF_ALPHA_TEST,
            }),
          )
        : null,
    [leaf, quality.wind],
  )

  useEffect(
    () => () => {
      material.dispose()
      depthMaterial?.dispose()
    },
    [material, depthMaterial],
  )

  // Instance attributes are written in one batch and flagged once, because naive per-frame
  // InstancedMesh updates regress past ~5000 objects (three.js#30352)
  useEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    mesh.customDepthMaterial = depthMaterial ?? undefined
    const matrix = new Matrix4()
    const position = new Vector3()
    const quaternion = new Quaternion()
    const scale = new Vector3()
    const color = new Color()
    items.forEach((item, index) => {
      position.set(item.x, baseY, item.z)
      scale.set(item.widthM, item.heightM, item.widthM)
      mesh.setMatrixAt(index, matrix.compose(position, quaternion, scale))
      mesh.setColorAt(index, color.setHex(item.color))
    })
    mesh.count = items.length
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [items, baseY, depthMaterial])

  /**
   * One mesh holds every plant of one canopy shape in the bed, so which PLANT the pointer is
   * over is only knowable from `instanceId`. That index is into `items`, and `plantingIds` was
   * built alongside it in the same pass, which is why the two can't drift
   */
  const onPointerOver = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const index = event.instanceId
      if (index === undefined) return
      event.stopPropagation()
      onHover(plantingIds[index] ?? null)
    },
    [plantingIds, onHover],
  )

  if (items.length === 0) return null

  return (
    <instancedMesh
      key={`${shape}-${items.length}`}
      ref={ref}
      name={name}
      args={[geometry, material, items.length]}
      castShadow
      receiveShadow
      onPointerOver={onPointerOver}
      userData={{ testid: name, instanceCount: items.length, cards: quality.foliageCards }}
    />
  )
}

export const PlantInstances = ({ bedId, atYear }: PlantInstancesProps): ReactElement | null => {
  const bed = useAppStore((s) => scenePlot(s)?.beds.find((b) => b.id === bedId) ?? null)
  // the arrays standing over this bed, for the same reason `BedMesh` reads them: a plant can't
  // be drawn through a module, so `layoutPlanting` needs to know what is above the soil
  const arrays = useAppStore((s) => scenePlot(s)?.arrays ?? (EMPTY_LIST as readonly PvArray[]))
  const timeUtcMillis = useAppStore((s) => s.timeUtcMillis)
  const catalog = useAppStore((s) =>
    s.catalog.status === 'ready' ? s.catalog.value : (EMPTY_LIST as readonly Crop[]),
  )
  const setHovered = useAppStore((s) => s.setHovered)
  const selectBed = useAppStore((s) => s.selectBed)
  const setSidebarStep = useAppStore((s) => s.setSidebarStep)
  // the plants are the biggest thing on a full bed, so a Move-mode press on them picks up the bed
  const drag = useBedDrag(bedId)
  const dragging = useAppStore((s) => s.dragging)
  const carrying = useAppStore((s) => s.carrying)
  const dropOnBed = useAppStore((s) => s.dropOnBed)
  const quality = useRenderQuality()
  const dayOfYear = dayOfYearUtc(timeUtcMillis)
  // the last season's report, which is a stored object and so a stable thing to select. What it
  // says about each planting is looked up below, where a fresh array would be a fresh render
  const lastReport = useAppStore((s) => s.simulation.reports[s.simulation.reports.length - 1])
  // while the season plays through, the plants grow as the clock moves and the outcome waits for
  // the end: applying the outcome look mid-sweep would show frost damage before the frost itself
  const sweeping = useAppStore((s) => s.sweeping)

  // One clock for every canopy in the scene. It runs here rather than in the rig because a
  // garden with nothing planted in it shouldn't be paying for wind
  useFrame(({ clock }) => {
    WIND_TIME.value = clock.elapsedTime
  })

  const groups = useMemo(() => {
    if (!bed) return []
    const byShape = new Map<CanopyShape, { items: PlantItem[]; plantingIds: PlantingId[] }>()
    for (const planting of bed.plantings) {
      const crop = catalog.find((c) => c.id === planting.cropId)
      const shape: CanopyShape = crop?.footprint.canopyShape ?? 'sphere'
      const bucket = byShape.get(shape) ?? { items: [], plantingIds: [] }
      /*
        The season's outcome, on the plants themselves (Decision Record 14). A frosted bed is
        drawn gray and collapsed, a starved one sallow and small, an eaten one leaning toward
        the color of a bed that pests are winning. The rule is `outcomeLook`, beside the rest of
        the scene arithmetic, and it reads the report the store kept rather than recomputing
      */
      const look = sweeping
        ? UNTOUCHED_LOOK
        : outcomeLook(lastReport?.outcomes.find((outcome) => outcome.plantingId === planting.id))
      const laid = layoutPlanting(bed, planting, crop, atYear, dayOfYear, arrays).map((item) =>
        applyLook(item, look),
      )
      bucket.items.push(...laid)
      for (const _ of laid) bucket.plantingIds.push(planting.id)
      byShape.set(shape, bucket)
    }
    return [...byShape.entries()]
  }, [bed, arrays, catalog, atYear, dayOfYear, lastReport, sweeping])

  const onHover = useCallback(
    (plantingId: PlantingId | null) => {
      setHovered(plantingId === null ? null : { kind: 'planting', bedId, plantingId })
    },
    [bedId, setHovered],
  )

  /**
   * A plant is part of its bed, so clicking one selects that bed and opens the step that owns
   * its planting.
   *
   * The plants are the biggest and brightest things in the scene, and on a full bed the soil is
   * what the foliage is covering, so a plant is a target too. The press also opens the plants step,
   * the way "Fix Bed 1" on the seasons step does, with this bed selected: what is in it is the
   * first thing that step shows. `BedMesh`'s own `onClick` keeps selecting alone, because the soil
   * is the drag target
   */
  const onClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      // same rule as the bed under these plants: a handle's press isn't a selection
      if (dragging) return
      event.stopPropagation()
      selectBed(bedId)
      setSidebarStep('plants')
    },
    [bedId, dragging, selectBed, setSidebarStep],
  )

  /**
   * And a crop let go over the foliage is let go over the bed under it, for the same reason.
   * `BedMesh` stops propagation on its own pointerup, so without this a drop would only land where
   * the pointer finds bare soil, which on a planted bed is wherever the plants aren't
   */
  const onPointerUp = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (carrying === null) return
      event.stopPropagation()
      dropOnBed(bedId)
    },
    [bedId, carrying, dropOnBed],
  )

  if (!bed) return null

  return (
    // on the group rather than on each instanced mesh: r3f bubbles a click up the object graph,
    // and nothing between here and the canopies stops one
    <group
      name={`plants-${bedId}`}
      userData={{ dayOfYear }}
      onClick={onClick}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={(event) => {
        drag.onPointerUp(event)
        onPointerUp(event)
      }}
    >
      {groups.map(([shape, bucket]) => (
        <InstanceGroup
          key={shape}
          shape={shape}
          items={bucket.items}
          plantingIds={bucket.plantingIds}
          baseY={bed.raisedHeightM}
          name={`plants-${bedId}-${shape}`}
          quality={quality}
          onHover={onHover}
        />
      ))}
    </group>
  )
}
