import { prefersReducedMotion } from '../state/motion'

/**
 * Scrolls a node into the middle of the view, or to the top of it when the node is taller than the
 * window: centered, a tree card on a phone would open on its middle fields with its name cut off.
 * Does nothing where there's no view to scroll: jsdom has no `scrollIntoView`, and a browser
 * missing it simply does nothing, without throwing
 */
export const bringIntoView = (node: HTMLElement | null): void => {
  if (node === null || typeof node.scrollIntoView !== 'function') return
  const tall =
    typeof node.getBoundingClientRect === 'function' &&
    node.getBoundingClientRect().height > globalThis.innerHeight
  node.scrollIntoView({
    block: tall ? 'start' : 'center',
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
  })
}
