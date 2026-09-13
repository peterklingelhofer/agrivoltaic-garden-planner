/**
 * Everything that counts as "something moved", under `frameloop="demand"`.
 *
 * With the loop on demand, a frame happens only when this asks for one. Miss a source and the
 * canvas goes stale, which reads worse than the waste it replaced, so the rule here is to ask
 * too often rather than too rarely: a spurious frame costs one frame, a missed one costs a
 * visitor believing the picture.
 *
 * What already asks without help: drei's `OrbitControls` calls `invalidate()` itself on every
 * change, so dragging, zooming and panning need nothing from this file beyond the structural
 * flag that `GardenScene` attaches to the same event
 */
import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { useAppStore } from '../state/store'
import { requestStructuralRedraw } from './redraw'

/** Wind frames a second. Sway is a slow bend, and nobody can tell this from sixty */
const WIND_FPS = 24

/**
 * Whether the window is both on screen and in front. A tab in the background is already throttled
 * by the browser, but a visible-and-unfocused window is not, and that is the case this exists
 * for: the app left open beside the thing the visitor is actually doing.
 *
 * No document means no answer, and no answer is treated as attended. The alternative reads the
 * other way round and is worse: it makes "I cannot tell" stop the scene animating, which in a
 * test environment with no DOM silently turned the example's orbit off and failed three tests
 * about the orbit's geometry with assertions that looked like a maths error
 */
export const attended = (): boolean =>
  typeof document === 'undefined' || (document.visibilityState === 'visible' && document.hasFocus())

export const useInvalidate = (windRunning: boolean): void => {
  const invalidate = useThree((s) => s.invalidate)

  /**
   * Any store write may move the picture. Subscribed whole rather than per-slice deliberately:
   * the list of fields the scene reads is long and grows, and a field added to the store without
   * a line added here would show up as a canvas that stops updating, which is a bug nobody would
   * connect to the commit that caused it. An extra frame on a store write nothing in the scene
   * reads is the cheap side of that trade
   */
  useEffect(() => {
    const redraw = (): void => {
      requestStructuralRedraw()
      invalidate()
    }
    const unsubscribe = useAppStore.subscribe(redraw)
    // coming back to the window: the picture may have been resized or the theme changed under it
    window.addEventListener('focus', redraw)
    document.addEventListener('visibilitychange', redraw)
    return () => {
      unsubscribe()
      window.removeEventListener('focus', redraw)
      document.removeEventListener('visibilitychange', redraw)
    }
  }, [invalidate])

  /**
   * The wind ticker, and the one loop in this app that runs without anybody doing anything.
   *
   * It asks for a frame rather than doing work: `PlantInstances` writes the clock the vertex
   * shader reads, and it can only do that on a frame that happens. The frame it asks for is
   * cosmetic, so `RenderPipeline` skips the cascades and the occlusion for it.
   *
   * `setInterval` rather than a self-invalidating `useFrame`: calling `invalidate()` from inside
   * a frame sets r3f's counter to two rather than one, which sustains the loop at full rate and
   * would quietly put the app back where it started
   */
  useEffect(() => {
    if (!windRunning) return
    const tick = (): void => {
      if (attended()) invalidate()
    }
    const timer = window.setInterval(tick, Math.round(1000 / WIND_FPS))
    return () => window.clearInterval(timer)
  }, [windRunning, invalidate])
}
