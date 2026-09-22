import type { EditorMode } from '../state/slices'

/**
 * What each drawing mode is waiting for, and the gestures that end it.
 *
 * Naming the finishing gesture is the whole point. Enter and a double-click on the last corner both
 * close a shape, and Esc starts over, all said on the surface the drawing is happening on, where
 * the drawer is already looking.
 *
 * Kept beside the component, in its own module, for the reason `cold-open.ts` is: what a surface
 * says can be read, and tested, without a store or a canvas behind it
 */
export type DrawMode = Exclude<EditorMode, 'select' | 'move'>

export const DRAW_HINT: Readonly<Record<DrawMode, string>> = {
  'draw-plot':
    'Click the corners of your plot. Double-click the last one, or press Enter, to close it. Esc starts over.',
  'draw-bed':
    'Click the corners of the bed. Double-click the last one, or press Enter, to close it. Esc starts over.',
}

/**
 * The same, for a finger. The desktop hint reads "Double-click... press Enter... Esc" on a screen
 * with no mouse and no keys. The gestures here are the ones a touch screen has, and the two
 * presses beside the hint are what close and abandon a shape whatever the pointer
 */
export const TOUCH_DRAW_HINT: Readonly<Record<DrawMode, string>> = {
  'draw-plot':
    'Tap the corners of your plot, then tap the last one twice or press Close the shape.',
  'draw-bed': 'Tap the corners of the bed, then tap the last one twice or press Close the shape.',
}

/**
 * What Move mode does, said once over the garden, with the way back to looking around. The
 * arrow keys are named because they're the move a keyboard has: see `useNudgeKeys`
 */
export const MOVE_HINT =
  'Drag a bed, a row of panels, a house or a plot corner to move it. Arrow keys move the selected one 0.1 m, or 1 m with Shift. Scroll to zoom. Press Select to look around again.'

export const TOUCH_MOVE_HINT =
  'Drag a bed, a row of panels, a house or a plot corner to move it. With a keyboard, arrow keys move the selected one 0.1 m, or 1 m with Shift. Pinch to zoom. Press Select to look around again.'

/**
 * How far along the shape is, in corners.
 *
 * Three is `commitDraft`'s own refusal: under three vertices there is no
 * polygon to raise a bed from. Saying which side of that line the drawing is on is what stops
 * "press Enter to close it" reading as a broken promise on the second corner
 */
export const cornersSoFar = (count: number): string =>
  count === 0
    ? 'No corners yet'
    : count < 3
      ? `${String(count)} of the 3 corners a shape needs`
      : `${String(count)} corners, enough to close`
