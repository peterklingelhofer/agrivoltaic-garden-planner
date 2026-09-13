import { useThree, type ThreeEvent } from '@react-three/fiber'
import { useCallback, useEffect, useRef } from 'react'
import type { Object3D } from 'three'
import { translateRing } from '../state/geom'
import { scenePlot, useAppStore } from '../state/store'
import type { ArrayId, BedId } from '../types/ids'
import { rayGroundHit } from './sceneMath'

export interface GroundDragHandlers {
  onPointerDown(event: ThreeEvent<PointerEvent>): void
  onPointerMove(event: ThreeEvent<PointerEvent>): void
  onPointerUp(event: ThreeEvent<PointerEvent>): void
}

/**
 * Dragging a thing across the ground in Move mode.
 *
 * Moving used to go through a `TransformControls` gizmo: three arrows on the selected bed that
 * looked like "this little square thing" and said nothing about what they did, while a drag
 * anywhere else orbited the camera and a drag on a plot corner reshaped the plot. One
 * rule replaces all three: "you don't move the camera at all, but you drag
 * stuff". So in Move mode the camera holds still (`OrbitControls` keeps only its zoom) and a
 * press on a bed, a row of panels or a plot corner moves that thing, by the ground the pointer
 * crosses. Outside Move mode none of these handlers do anything, and a drag orbits as before.
 *
 * The objects named are moved in place while the pointer is down and the store is written once
 * on release, the way the gizmo committed: a store write per pointer move re-renders the sidebar
 * per move. `dragging` is raised for the duration so the ground under the pointer does not read
 * the press as a request to clear the selection, and the plants group is named alongside its bed
 * so the foliage travels with the soil rather than catching up on release
 */
export const useGroundDrag = (
  enabled: boolean,
  names: readonly string[],
  onMoved: (dxM: number, dzM: number) => void,
): GroundDragHandlers => {
  const scene = useThree((s) => s.scene)
  const invalidate = useThree((s) => s.invalidate)
  const setDragging = useAppStore((s) => s.setDragging)
  const start = useRef<readonly [number, number] | null>(null)
  const moving = useRef<Object3D[]>([])

  const onPointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (!enabled) return
      const hit = rayGroundHit(event.ray)
      if (hit === null) return
      event.stopPropagation()
      start.current = hit
      moving.current = names.flatMap((name) => {
        const found = scene.getObjectByName(name)
        return found === undefined ? [] : [found]
      })
      // the pointer stays with this object until release, wherever it goes on screen
      const target = event.target as { setPointerCapture?(pointerId: number): void }
      target.setPointerCapture?.(event.pointerId)
      setDragging(true)
    },
    [enabled, names, scene, setDragging],
  )

  const onPointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const from = start.current
      if (from === null) return
      const hit = rayGroundHit(event.ray)
      if (hit === null) return
      event.stopPropagation()
      for (const object of moving.current)
        object.position.set(hit[0] - from[0], 0, hit[1] - from[1])
      invalidate()
    },
    [invalidate],
  )

  const onPointerUp = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (start.current === null) return
      event.stopPropagation()
      const target = event.target as { releasePointerCapture?(pointerId: number): void }
      target.releasePointerCapture?.(event.pointerId)
      const first = moving.current[0]
      const dxM = first?.position.x ?? 0
      const dzM = first?.position.z ?? 0
      for (const object of moving.current) object.position.set(0, 0, 0)
      start.current = null
      moving.current = []
      setDragging(false)
      if (Math.abs(dxM) + Math.abs(dzM) > 1e-6) onMoved(dxM, dzM)
    },
    [onMoved, setDragging],
  )

  return { onPointerDown, onPointerMove, onPointerUp }
}

/**
 * A bed moved east and north by plot metres, written back as one footprint. The one write a
 * drag and an arrow key both end in, so the two can never disagree about what a move is
 */
export const moveBed = (bedId: BedId, dxM: number, dyM: number): void => {
  const state = useAppStore.getState()
  const bed = scenePlot(state)?.beds.find((entry) => entry.id === bedId)
  if (bed === undefined) return
  state.upsertBed({
    ...bed,
    footprint: {
      exterior: translateRing(bed.footprint.exterior, dxM, dyM),
      holes: bed.footprint.holes.map((hole) => translateRing(hole, dxM, dyM)),
    },
  })
}

/** A whole array of rows, moved by its origin */
export const moveArray = (arrayId: ArrayId, dxM: number, dyM: number): void => {
  const state = useAppStore.getState()
  const array = scenePlot(state)?.arrays.find((entry) => entry.id === arrayId)
  if (array === undefined) return
  const origin = translateRing([array.geometry.originM], dxM, dyM)[0] ?? array.geometry.originM
  state.upsertArray({ ...array, geometry: { ...array.geometry, originM: origin } })
}

/** A bed and its plants, moved together */
export const useBedDrag = (bedId: BedId): GroundDragHandlers => {
  const enabled = useAppStore((s) => s.mode === 'move')
  // scene z runs south, plot y runs north
  const onMoved = useCallback((dxM: number, dzM: number) => moveBed(bedId, dxM, -dzM), [bedId])
  return useGroundDrag(enabled, [`bed-${bedId as string}`, `plants-${bedId as string}`], onMoved)
}

export const useArrayDrag = (arrayId: ArrayId): GroundDragHandlers => {
  const enabled = useAppStore((s) => s.mode === 'move')
  const onMoved = useCallback(
    (dxM: number, dzM: number) => moveArray(arrayId, dxM, -dzM),
    [arrayId],
  )
  return useGroundDrag(enabled, [`array-${arrayId as string}`], onMoved)
}

/** How far one arrow press moves the selected thing, in metres, without and with Shift */
export const NUDGE_M = 0.1
export const SHIFT_NUDGE_M = 1

/** East and north per press of each arrow */
const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
}

/**
 * Move mode from the keyboard: the arrows carry the selected bed or row of panels, so moving is
 * open to a switch, a screen reader or anyone whose mouse hand is not steady, and the drag above
 * stops being the only way. Gated on the mode the way `SceneHint` gates Enter and Escape, and
 * listening on `window` for the same reason: the canvas cannot hold focus after a click on a
 * sidebar field. A press inside a field is the field's own, where an arrow steps a number
 */
export const useNudgeKeys = (): void => {
  const enabled = useAppStore((s) => s.mode === 'move')
  useEffect(() => {
    if (!enabled) return undefined
    const onKey = (event: KeyboardEvent): void => {
      const arrow = ARROWS[event.key]
      if (arrow === undefined) return
      const target = event.target
      if (target instanceof HTMLElement && target.closest('input, textarea, select') !== null)
        return
      const { selectedBedId, selectedArrayId } = useAppStore.getState()
      if (selectedBedId === null && selectedArrayId === null) return
      event.preventDefault()
      const step = event.shiftKey ? SHIFT_NUDGE_M : NUDGE_M
      if (selectedBedId !== null) moveBed(selectedBedId, arrow[0] * step, arrow[1] * step)
      else if (selectedArrayId !== null)
        moveArray(selectedArrayId, arrow[0] * step, arrow[1] * step)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
}
