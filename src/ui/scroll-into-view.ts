import { prefersReducedMotion } from '../state/motion'

/**
 * How many screens away a node can be and still be scrolled to smoothly. Two hundred sources are
 * some 30,000 px on a phone, and a smooth scroll across them takes over a second, shows nothing
 * but a blur of other rows, and eats most of a highlight's time before the row is even on screen
 */
const FAR_JUMP_SCREENS = 3

/**
 * Scrolls a node into the middle of the view, or to the top of it when the node is taller than the
 * window: centered, a tree card on a phone would open on its middle fields with its name cut off.
 * Smooth over a short hop and a jump over a far one, or for a visitor who asked for less motion.
 * Does nothing where there's no view to scroll: jsdom has no `scrollIntoView`, and a browser
 * missing it simply does nothing, without throwing
 */
export const bringIntoView = (node: HTMLElement | null): void => {
  if (node === null || typeof node.scrollIntoView !== 'function') return
  const box = typeof node.getBoundingClientRect === 'function' ? node.getBoundingClientRect() : null
  const tall = box !== null && box.height > globalThis.innerHeight
  const far = box !== null && Math.abs(box.top) > FAR_JUMP_SCREENS * globalThis.innerHeight
  node.scrollIntoView({
    block: tall ? 'start' : 'center',
    behavior: prefersReducedMotion() || far ? 'auto' : 'smooth',
  })
}
