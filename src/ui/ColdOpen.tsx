import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { CANCEL_EVENTS, prefersReducedMotion } from '../state/motion'
import { EMPTY_LIST } from '../state/slices'
import { scenePlot, showingExample, useAppStore } from '../state/store'
import type { Crop } from '../types/crop'
import { coldOpenReading } from './cold-open'

/**
 * Long enough to read 250 characters at an unhurried pace, short enough that a visitor who
 * started reading the guided questions instead is not still being narrated at. Nobody has to
 * wait it out: the first pointer, wheel, key or touch ends it on the spot
 */
export const COLD_OPEN_DWELL_MS = 15_000

/** The fade out, which is `--motion-quick` and therefore nothing at all under reduced motion */
const FADE_MS = 200

type Phase = 'showing' | 'leaving' | 'settled'

/**
 * A short, passive narration of the example garden, said once and then got out of the way.
 *
 * The app opens on a real baked design with a viridis light overlay painted on the ground, and
 * until this existed nothing on screen said what the colours meant for a plant: the banner says
 * whose garden it is and the legend says what the numbers are, and neither says why anyone should
 * care that one strip of ground reads half what another does. That sentence is the product's
 * whole argument, so it is now on screen before the first click.
 *
 * Four things about it are deliberate:
 *
 * - it renders only over the EXAMPLE, gated on the same `showingExample` the banner uses, so a
 *   grower who has drawn their own plot is never told what their own beds mean;
 * - it costs zero interactions. `e2e/first-time-user.spec.ts` holds `INTERACTION_BUDGET` at 18
 *   with a persona sitting exactly on it, and a narration that had to be dismissed would spend
 *   one of those on nothing. So there is no close button: it leaves on a timer, and any pointer,
 *   wheel, key or touch ends it immediately, because that gesture means the visitor is driving
 *   now. That is the same event list, from the same module, that stops the guided orbit;
 * - it never takes the pointer, for the reason `.scene-tooltip` never does;
 * - when it leaves it becomes `.visually-hidden` rather than unmounting. The sentence is worth
 *   the same to somebody reading the page with a screen reader as to somebody looking at it, and
 *   a graphic taking its place on screen is exactly what that class exists for
 */
export const ColdOpen = (): ReactElement | null => {
  const showing = useAppStore(showingExample)
  const plot = useAppStore(scenePlot)
  const bedLight = useAppStore((s) => s.bedLight)
  const catalog = useAppStore((s) =>
    s.catalog.status === 'ready' ? s.catalog.value : (EMPTY_LIST as readonly Crop[]),
  )
  const [phase, setPhase] = useState<Phase>('showing')
  // read once, not watched: a preference that could flip mid-narration would be a second way for
  // this to move, and the whole point of answering it is that there is only ever the one
  const [reducedMotion] = useState(prefersReducedMotion)

  const reading = useMemo(
    () => (showing ? coldOpenReading(plot, bedLight, catalog) : null),
    [showing, plot, bedLight, catalog],
  )
  /**
   * Listened for from the first render and not from the first render that has something to say,
   * because the example is fetched: a visitor who grabbed the scene while it was still arriving
   * has already answered the question this asks, and a narration that opened over them anyway
   * would be one that waited for its own data before agreeing to be interrupted
   */
  useEffect(() => {
    if (phase !== 'showing') return undefined
    const leave = (): void => setPhase('leaving')
    for (const name of CANCEL_EVENTS) globalThis.addEventListener?.(name, leave, { passive: true })
    return () => {
      for (const name of CANCEL_EVENTS) globalThis.removeEventListener?.(name, leave)
    }
  }, [phase])

  // the dwell starts when the sentence does, which is why this waits for the reading and the
  // listeners above do not
  useEffect(() => {
    if (reading === null || phase !== 'showing') return undefined
    const dwell = globalThis.setTimeout(() => setPhase('leaving'), COLD_OPEN_DWELL_MS)
    return () => globalThis.clearTimeout(dwell)
  }, [reading, phase])

  useEffect(() => {
    if (phase !== 'leaving') return undefined
    const done = globalThis.setTimeout(() => setPhase('settled'), reducedMotion ? 0 : FADE_MS)
    return () => globalThis.clearTimeout(done)
  }, [phase, reducedMotion])

  if (reading === null) return null

  return (
    <aside
      // the whole class is swapped rather than added to, because `.visually-hidden` and
      // `.cold-open` disagree about position and size and the loser of that would be whichever
      // rule this sheet happened to state last
      className={phase === 'settled' ? 'visually-hidden' : 'cold-open'}
      data-testid="panel-cold-open"
      data-phase={phase}
    >
      <p className="cold-open-title">{reading.title}</p>
      <p className="cold-open-body">{reading.body}</p>
      <p className="cold-open-caveat">{reading.caveat}</p>
    </aside>
  )
}
