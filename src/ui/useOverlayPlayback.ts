import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '../state/store'
import type { MonthIndex } from '../types/units'

/** Slow enough to read a month, fast enough that a year is not a wait */
export const OVERLAY_PLAYBACK_MS = 650

const MONTHS = 12

/**
 * Plays the light overlay through the year, one month a step, and optionally accumulates it.
 *
 * The overlay draws one slice at a time, and without this the year has to be assembled in the
 * grower's head from twelve separate readings. This is the animation the data already supports: the
 * shade band sweeping north and back is the single clearest statement this product makes about what
 * an array does to a garden, and without it only somebody who thought to change the month twelve
 * times would see it.
 *
 * By default each frame is still just that month's own mean daily light integral, and nothing is
 * summed. Turning accumulation on hands `overlayField` a `from` month, and it is `overlayField`
 * that does the honest version of "the year adding up": the mean daily light integral over the
 * months elapsed, weighted by each month's length in days, never a running total of a daily rate.
 *
 * The month it plays is transient, so the month the grower picked is still theirs when it stops,
 * and `prefers-reduced-motion` refuses to start it at all, the same as the guided tour. Whether to
 * accumulate is this hook's own preference, not part of the persisted design: it describes how
 * the grower wants to watch the year play, not what the garden is
 */
export const useOverlayPlayback = (): {
  readonly playing: boolean
  readonly toggle: () => void
  readonly allowed: boolean
  readonly accumulating: boolean
  readonly setAccumulating: (accumulating: boolean) => void
} => {
  const setOverlayPlayback = useAppStore((s) => s.setOverlayPlayback)
  const [playing, setPlaying] = useState(false)
  const [accumulating, setAccumulatingState] = useState(false)
  const month = useRef<MonthIndex>(1)
  // the month a run of accumulation started counting from, or null while each frame stands alone
  const from = useRef<MonthIndex | null>(null)

  const allowed =
    typeof matchMedia !== 'function' || !matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (!playing) {
      setOverlayPlayback(null)
      return
    }
    setOverlayPlayback({ month: month.current, from: from.current })
    const timer = setInterval(() => {
      month.current = ((month.current % MONTHS) + 1) as MonthIndex
      setOverlayPlayback({ month: month.current, from: from.current })
    }, OVERLAY_PLAYBACK_MS)
    return () => {
      clearInterval(timer)
      setOverlayPlayback(null)
    }
  }, [playing, setOverlayPlayback])

  /**
   * Where to start is read here rather than inside the effect. Reading it in there would make it
   * a dependency, and the effect writes a month back on every tick, so following it would restart
   * the year twice a second. A suppression comment would have hidden that rather than fixed it
   */
  const toggle = useCallback(() => {
    setPlaying((was) => {
      if (was) return false
      const chosen = useAppStore.getState().overlay.slice
      month.current = chosen === 'annual' ? 1 : chosen
      from.current = accumulating ? month.current : null
      return allowed
    })
  }, [allowed, accumulating])

  /**
   * Flipping the toggle mid-run must show up on the next paint, not the next tick, so the store
   * is written here directly rather than left to the interval. Turning it on starts counting from
   * whatever is on screen right now, since there is no earlier month for this run to have shown;
   * turning it off drops back to one month at a time without touching `playing` at all
   */
  const setAccumulating = useCallback(
    (next: boolean) => {
      setAccumulatingState(next)
      from.current = next ? month.current : null
      if (playing) setOverlayPlayback({ month: month.current, from: from.current })
    },
    [playing, setOverlayPlayback],
  )

  return { playing, toggle, allowed, accumulating, setAccumulating }
}
