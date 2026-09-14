/**
 * The one landing in flight. The stepper holds the header of the step just opened at the top of
 * the column for a moment after the press, undoing any other scroll while it does (`Stepper`).
 * A source jump lands on a row inside that step, and on 2026-09-14 a persona who pressed "show
 * this work in Sources" from a tree's card arrived at the top of the step with the row 28,000 px
 * below: the jump had scrolled first and the landing had dragged the column back. So the jump
 * settles the landing and then scrolls, and the two never fight over the same column
 */
interface Landing {
  stop(): void
}

let live: Landing | null = null

/** The stepper registers its landing for its lifetime; the returned function forgets it */
export const registerLanding = (landing: Landing): (() => void) => {
  live = landing
  return () => {
    if (live === landing) live = null
  }
}

/** Ends the landing in flight, if any, so a scroll made now is left where it lands */
export const settleLanding = (): void => {
  live?.stop()
}
