import { Line } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useCallback, useMemo, useRef, type ReactElement } from 'react'
import { fromSceneXZ, toSceneXZ, untangledRing } from '../state/geom'
import { scenePlot, useAppStore } from '../state/store'
import type { Vec2M } from '../types/geo'
import { rayGroundHit } from './sceneMath'

const toPoints = (
  ring: readonly Vec2M[],
  closed: boolean,
  y: number,
): [number, number, number][] => {
  const points = ring.map((p) => {
    const [x, z] = toSceneXZ(p)
    return [x, y, z] as [number, number, number]
  })
  const first = points[0]
  return closed && first ? [...points, first] : points
}

interface HandlesProps {
  readonly ring: readonly Vec2M[]
  readonly color: string
  onMove(index: number, point: Vec2M): void
}

const VertexHandles = ({ ring, color, onMove }: HandlesProps): ReactElement => {
  const setDragging = useAppStore((s) => s.setDragging)
  const dragging = useRef<number | null>(null)

  const onPointerDown = useCallback(
    (index: number) => (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation()
      dragging.current = index
      setDragging(true)
    },
    [setDragging],
  )

  const onPointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (dragging.current === null) return
      const hit = rayGroundHit(event.ray)
      if (!hit) return
      event.stopPropagation()
      onMove(dragging.current, fromSceneXZ(hit[0], hit[1]))
    },
    [onMove],
  )

  const onPointerUp = useCallback(() => {
    dragging.current = null
    setDragging(false)
  }, [setDragging])

  return (
    <group name="vertex-handles">
      {ring.map((p, index) => {
        const [x, z] = toSceneXZ(p)
        return (
          <mesh
            // The ring position IS the handle's identity: the drag callbacks are bound to it,
            // and two vertices may briefly share coordinates mid-drag
            // biome-ignore lint/suspicious/noArrayIndexKey: positional handle, see above
            key={`${index}-${p.xM}-${p.yM}`}
            name={`vertex-handle-${index}`}
            position={[x, 0.2, z]}
            onPointerDown={onPointerDown(index)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            <sphereGeometry args={[0.22, 12, 12]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} />
          </mesh>
        )
      })}
    </group>
  )
}

export const PlotBoundary = (): ReactElement | null => {
  const plot = useAppStore(scenePlot)
  const draft = useAppStore((s) => s.draft)
  const mode = useAppStore((s) => s.mode)
  const moveBoundaryVertex = useAppStore((s) => s.moveBoundaryVertex)
  const moveDraftVertex = useAppStore((s) => s.moveDraftVertex)

  const boundaryPoints = useMemo(
    () => (plot ? toPoints(plot.boundary.exterior, true, 0.05) : []),
    [plot],
  )
  // the line shows the shape the close will make, so a bow-tie reads as the rectangle it becomes
  const draftPoints = useMemo(() => toPoints(untangledRing(draft), draft.length > 2, 0.06), [draft])

  if (!plot) return null

  return (
    <group name="plot-boundary">
      {boundaryPoints.length > 1 ? (
        <Line points={boundaryPoints} color="#f2c14e" lineWidth={2} />
      ) : null}
      {/* corners only in Move mode: a hand reaching for the camera grabbed one and reshaped the
          plot, and dropped a finished layout search with it */}
      {mode === 'move' ? (
        <VertexHandles ring={plot.boundary.exterior} color="#f2c14e" onMove={moveBoundaryVertex} />
      ) : null}
      {/*
        Solid and thick enough to read as a shape being drawn, over a ground whose light overlay is
        painted in the same range of colors. Its color stays easy to tell from the yellow the
        committed boundary is drawn in
      */}
      {draftPoints.length > 1 ? <Line points={draftPoints} color="#4ec3f2" lineWidth={3} /> : null}
      {draft.length > 0 ? (
        <VertexHandles ring={draft} color="#4ec3f2" onMove={moveDraftVertex} />
      ) : null}
    </group>
  )
}
