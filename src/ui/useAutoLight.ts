import { useEffect } from 'react'
import { lightGeometryKey, lightIsMissing, lightIsStale } from '../state/light-freshness'
import { useAppStore } from '../state/store'

/**
 * Computes the light by itself: the first time, and again whenever the garden moves out from
 * under it.
 *
 * `light-freshness.ts` made a stale field say so; this is what stops it being stale in the first
 * place. Moving a panel and then being told to go and press a button in another panel is a poor
 * answer to "what does this do to my light", which is the question the whole tool exists for.
 * Dragging a row of panels two metres south and watching the ground recolour IS the product.
 *
 * The FIRST light is here too, since 2026-09-10. It was not: `lightIsStale` is false with no
 * raster at all, on purpose, so a grower who had just looked up their town was handed a locked
 * step and a button, and the author asked why the light did not simply follow the place. It does
 * now, once the place has resolved and there is a bed to read the light in. A failed run stays
 * failed rather than retrying on a timer; the light step keeps the press for that.
 *
 * The FULL check, not the quick one. The quick settings hand back a different crop list
 * (`src/recommend/design.ts` measures the share moving by 0.07 at Bergen), and a rough answer
 * that runs by itself is an answer nobody chose to trust. It costs about 800 ms on a real GPU
 * (`the port document` section 5), which a debounce spends once per settled edit rather than per
 * nudge. The quick settings stay what the layout search bakes its five candidates at.
 *
 * Not while the layout search is running: its candidate bakes and this one would share the GPU,
 * and the plot on screen is about to be replaced by whichever layout is chosen
 */

/**
 * Longer than the ranking's 600 ms, because what it starts is heavier and because a nudge is
 * rarely a grower's last one. The gizmo writes to the store once, on mouse up, rather than
 * continuously through a drag, so this is waiting for the next NUDGE and not for the drag
 */
export const AUTO_LIGHT_DELAY_MS = 900

export const useAutoLight = (): void => {
  const enabled = useAppStore((s) => s.autoRun)
  const stale = useAppStore(lightIsStale)
  const missing = useAppStore(lightIsMissing)
  const running = useAppStore((s) => s.raster.status === 'loading')
  const searching = useAppStore((s) => s.onboarding.designs.status === 'loading')
  const runFinal = useAppStore((s) => s.runFinal)
  /**
   * The geometry itself, not just whether it is stale, and that distinction is the difference
   * between a debounce and a delay. `stale` is a boolean: it goes true on the first nudge and
   * stays true through every nudge after, so an effect keyed on it alone sets ONE timer, at the
   * first edit, and fires part-way through a grower's third adjustment. Keyed on the arrangement,
   * each nudge is a new value, which tears down the pending timer and starts another, so the bake
   * lands after the last change instead of during them
   */
  const key = useAppStore((s) => (s.plot === null ? '' : lightGeometryKey(s.plot)))

  useEffect(() => {
    if (!enabled || running || searching || key === '' || !(stale || missing)) return
    const timer = setTimeout(() => void runFinal(), AUTO_LIGHT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [enabled, stale, missing, running, searching, key, runFinal])
}
