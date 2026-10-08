import type { ObstructionId } from '../types/ids'

/**
 * Asking for a house or tree card to scroll into view, from a click in the scene or from the press
 * that added it.
 *
 * A selection can't carry the ask. A card mounts selected whenever its step opens, so pressing the
 * step's header with an old selection would scroll past the top of the step to a card nobody had
 * just asked for. The click names the card, and the card takes the request once. The step that
 * holds the card is usually closed when the ask is made, so the request is parked here until the
 * card is there to take it, and a card already on screen is told directly (the same shape as
 * `requestSourceJump`). It sits in `state` because the scene asks and the sidebar answers, and
 * those two meet only through this layer
 */
let pending: ObstructionId | null = null
const listeners = new Set<() => void>()

/** Asks for this card to scroll into view. Only the latest ask is kept */
export const requestCardScroll = (id: ObstructionId): void => {
  pending = id
  for (const listener of [...listeners]) listener()
}

/** True once for each ask, and only for the card it named, so a served ask is never replayed */
export const takeCardScroll = (id: ObstructionId): boolean => {
  if (pending !== id) return false
  pending = null
  return true
}

/** Calls `listener` on every later ask until the returned function is called */
export const onCardScrollRequest = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
