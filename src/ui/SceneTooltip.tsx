import { useEffect, useRef, type ReactElement } from 'react'
import { EMPTY_LIST } from '../state/slices'
import { scenePlot, useAppStore } from '../state/store'
import type { Crop } from '../types/crop'
import { describeHover } from './hover'

/** Clear of the cursor, so the thing being named is never under the label naming it */
const OFFSET_PX = 14

/**
 * A label for whatever the pointer is over in the 3D.
 *
 * The position is written straight to the element's own transform rather than held in React
 * state. A pointer move fires at the display's refresh rate, and putting that through a store or
 * a `useState` would re-render the scene's whole subtree on every one of them; the only thing
 * React is asked to re-render here is the text, and only when the target under the pointer
 * actually changes
 */
export const SceneTooltip = (): ReactElement | null => {
  const hovered = useAppStore((s) => s.hovered)
  const plot = useAppStore(scenePlot)
  const catalog = useAppStore((s) =>
    s.catalog.status === 'ready' ? s.catalog.value : (EMPTY_LIST as readonly Crop[]),
  )
  const setHovered = useAppStore((s) => s.setHovered)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = ref.current?.parentElement
    if (!host) return
    const move = (event: PointerEvent): void => {
      const box = host.getBoundingClientRect()
      const node = ref.current
      if (!node) return
      const x = event.clientX - box.left + OFFSET_PX
      const y = event.clientY - box.top + OFFSET_PX
      // kept inside the canvas, so a label near the right edge is not clipped away
      const maxX = box.width - node.offsetWidth - 4
      const maxY = box.height - node.offsetHeight - 4
      node.style.transform = `translate(${String(Math.min(x, Math.max(0, maxX)))}px, ${String(Math.min(y, Math.max(0, maxY)))}px)`
    }
    const leave = (): void => {
      setHovered(null)
    }
    host.addEventListener('pointermove', move)
    host.addEventListener('pointerleave', leave)
    return () => {
      host.removeEventListener('pointermove', move)
      host.removeEventListener('pointerleave', leave)
    }
  }, [setHovered])

  // the last season's report, a stored object and so a stable thing to select
  const lastReport = useAppStore(
    (s) => s.simulation.reports[s.simulation.reports.length - 1] ?? null,
  )
  const named = hovered === null ? null : describeHover(plot, catalog, hovered, lastReport)

  return (
    <div
      ref={ref}
      className="scene-tooltip"
      data-testid="scene-tooltip"
      data-visible={named !== null}
      // it names what the pointer is already on, so it must never take the pointer itself
      aria-hidden
    >
      {named === null ? null : (
        <>
          <strong>{named.title}</strong>
          <span>{named.detail}</span>
        </>
      )}
    </div>
  )
}
