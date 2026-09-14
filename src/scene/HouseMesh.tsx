import { Line } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, type ReactElement } from 'react'
import { ExtrudeGeometry } from 'three'
import { scenePlot, useAppStore } from '../state/store'
import type { ObstructionId } from '../types/ids'
import { tintedBy } from './materials'
import { VertexHandles } from './PlotBoundary'
import { bedShape } from './sceneMath'
import { moveObstructionCorner, useObstructionDrag } from './useGroundDrag'

export interface HouseMeshProps {
  readonly obstructionId: ObstructionId
  readonly selected: boolean
}

/**
 * A house, drawn as the same box the bake shades with: the top and four walls, opaque from the
 * ground to the eaves (Decision Record 26). Nothing here is drawn that the bake does not also
 * hold (Decision Record 14.5), and it casts the scene's live shadow the way a panel does
 */
export const HouseMesh = ({ obstructionId, selected }: HouseMeshProps): ReactElement | null => {
  const house = useAppStore(
    (s) => scenePlot(s)?.obstructions.find((o) => o.id === obstructionId) ?? null,
  )
  const mode = useAppStore((s) => s.mode)
  const selectObstruction = useAppStore((s) => s.selectObstruction)
  const dragging = useAppStore((s) => s.dragging)
  // in Move mode a press on the house picks it up; every other mode leaves the press to the camera
  const drag = useObstructionDrag(obstructionId, 'house')

  const geometry = useMemo(() => {
    if (!house) return null
    return new ExtrudeGeometry(bedShape(house.footprint), {
      depth: house.heightM,
      bevelEnabled: false,
    })
  }, [house])

  // runs whenever `geometry` is replaced or this mesh unmounts, exactly as `BedMesh` frees its own
  useEffect(() => {
    return () => geometry?.dispose()
  }, [geometry])

  const onClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      // a handle owns this press, and the house under it is the thing being moved: see `Ground`
      if (dragging) return
      event.stopPropagation()
      selectObstruction(obstructionId)
    },
    [dragging, obstructionId, selectObstruction],
  )

  if (!house || !geometry) return null

  // the selected house's eaves, drawn as a line, the same way the selected bed's rim is
  const outline = selected
    ? [...house.footprint.exterior, house.footprint.exterior[0]].flatMap((point) =>
        point === undefined
          ? []
          : [[point.xM, house.heightM + 0.03, -point.yM] as [number, number, number]],
      )
    : null

  return (
    <group
      name={`house-${obstructionId}`}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      userData={{ testid: `scene-house-${obstructionId}`, heightM: house.heightM }}
    >
      <mesh
        name={`house-${obstructionId}-solid`}
        geometry={geometry}
        rotation={[-Math.PI / 2, 0, 0]}
        castShadow
        receiveShadow
        onClick={onClick}
      >
        <meshStandardMaterial color={tintedBy(0.62, selected)} roughness={1} metalness={0} />
      </mesh>
      {outline === null ? null : (
        <Line
          name={`house-${obstructionId}-outline`}
          points={outline}
          color="#ffffff"
          lineWidth={3}
          depthTest={false}
        />
      )}
      {/* corners only in Move mode, keeping the rectangle the way a plot corner drag does */}
      {mode === 'move' ? (
        <VertexHandles
          ring={house.footprint.exterior}
          colour="#f2c14e"
          onMove={(index, to) => moveObstructionCorner(obstructionId, index, to)}
        />
      ) : null}
    </group>
  )
}
