import { prefersReducedMotion } from '../state/motion'

/**
 * Scrolls a node into the middle of the view, and does nothing where there's no view to
 * scroll: jsdom has no `scrollIntoView`, and a browser missing it simply does nothing, without
 * throwing
 */
export const bringIntoView = (node: HTMLElement | null): void => {
  if (node === null || typeof node.scrollIntoView !== 'function') return
  node.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
}
