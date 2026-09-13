/**
 * Three facts about the visitor's own settings and input, shared by the 3D scene and by surfaces
 * that never touch it.
 *
 * They live here, outside `scene/useGuidedTour.ts`, because three surfaces in `ui/` ask as well:
 * that module imports react-three-fiber, which imports three, so a sidebar wanting to know whether
 * to animate a chevron would drag the entire 3D stack into the main bundle with it. Nothing here
 * imports anything
 */

/**
 * Whether the visitor asked their operating system for less movement. Answered through
 * `globalThis` and optional-called, because this is read from module scope in environments that
 * have no `matchMedia` at all
 */
export const prefersReducedMotion = (): boolean =>
  globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

/**
 * Whether the main pointer is a finger. Asked the same way and for the same reason: the move
 * gizmo's arrows are a hover-and-drag control, and on a touch screen they would be three arrows
 * over a tapped bed that nothing could grab. The stylesheet's `pointer: coarse` rules read the same
 * query, so the two never disagree about which device this is
 */
export const coarsePointer = (): boolean =>
  globalThis.matchMedia?.('(pointer: coarse)').matches === true

/**
 * What counts as the visitor taking over from an animation that was playing for them.
 *
 * One list, because the camera tour and the cold-open narration both have to answer "have they
 * started doing something themselves" and two lists that drifted apart would show up as a caption
 * still being narrated over a scene the visitor is already dragging
 */
export const CANCEL_EVENTS = ['pointerdown', 'wheel', 'keydown', 'touchstart'] as const
