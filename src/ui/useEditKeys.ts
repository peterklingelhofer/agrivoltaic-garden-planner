import { useEffect } from 'react'
import { redo, undo } from '../state/history'
import { useAppStore } from '../state/store'

/**
 * What a press belongs to when it lands there: a field keeps its own Undo, which steps through the
 * text typed into it, and its own Delete and Backspace, which erase it. `contenteditable="false"`
 * is a way of saying the opposite, so it doesn't count
 */
const FIELD = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])'

/**
 * What `isUndo` answers, in the form `aria-keyshortcuts` takes: modifiers and key joined by "+",
 * alternatives separated by a space. Every button that announces the keys reads this one string,
 * and `edit-keys.test.ts` presses each chord it names
 */
export const UNDO_KEYS = 'Meta+Z Control+Z'

const isUndo = (event: KeyboardEvent): boolean =>
  (event.metaKey || event.ctrlKey) &&
  !event.altKey &&
  !event.shiftKey &&
  event.key.toLowerCase() === 'z'

/** What `isRedo` answers, in the same form */
export const REDO_KEYS = 'Meta+Shift+Z Control+Shift+Z Control+Y'

/**
 * Shift with Cmd or Ctrl and Z, and Ctrl and Y for those whose hands learned it on Windows. Cmd and
 * Y is left alone, since it's the browser's own History
 */
const isRedo = (event: KeyboardEvent): boolean => {
  if (event.altKey) return false
  const key = event.key.toLowerCase()
  if ((event.metaKey || event.ctrlKey) && event.shiftKey) return key === 'z'
  return event.ctrlKey && !event.metaKey && !event.shiftKey && key === 'y'
}

const isDelete = (event: KeyboardEvent): boolean =>
  (event.key === 'Delete' || event.key === 'Backspace') &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.altKey

/**
 * Removes whichever bed, row of panels, house or tree is selected, through the same actions the
 * Remove buttons call, and says whether it removed anything. A selection that points at nothing
 * the plot holds removes nothing, so the press stays the browser's.
 *
 * Not while corners are down. A plot or a bed being drawn is a draft the grower is working on, and
 * a Backspace aimed at it that took the bed selected before the drawing began would be a loss
 * nobody asked for. The drawing's own keys (Enter and Escape, in `SceneHint`) are left alone
 */
const removeSelected = (): boolean => {
  const state = useAppStore.getState()
  if (state.draft.length > 0) return false
  const { plot, selectedBedId, selectedArrayId, selectedObstructionId } = state
  if (selectedBedId !== null && plot?.beds.some((bed) => bed.id === selectedBedId)) {
    state.removeBed(selectedBedId)
    return true
  }
  if (selectedArrayId !== null && plot?.arrays.some((array) => array.id === selectedArrayId)) {
    state.removeArray(selectedArrayId)
    return true
  }
  if (
    selectedObstructionId !== null &&
    plot?.obstructions.some((obstruction) => obstruction.id === selectedObstructionId)
  ) {
    state.removeObstruction(selectedObstructionId)
    return true
  }
  return false
}

/**
 * Undo, redo and Delete from the keyboard, in every editor mode, beside the arrow keys of Move
 * mode (`useNudgeKeys`) and for the same reasons: the listener is on `window` because the canvas
 * can't hold focus after a click on a sidebar field, and a press inside a field is the field's own.
 *
 * Mounted once, by `App`, outside the scene. The toolbar's Undo and Redo work with no WebGL2, and
 * keys that went with the canvas would leave that page with buttons that answer and keys that
 * don't. It lives here because only `SceneCanvas` may be reached from outside `src/scene/`.
 *
 * Cmd or Ctrl and Z undoes, Shift added or Ctrl and Y redoes, and both are claimed whether or not
 * there is anything to step over, so a shortcut that has nothing to do never does something else.
 * Delete and Backspace remove the selected thing and are claimed only when something went, so
 * Backspace on a page with nothing selected is left to the browser. A press somebody already
 * claimed is theirs: a second copy of this hook, if one were ever mounted, would find every chord
 * taken by the first and undo once
 */
export const useEditKeys = (): void => {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return
      const target = event.target
      if (target instanceof HTMLElement && target.closest(FIELD) !== null) return
      if (isUndo(event)) {
        event.preventDefault()
        undo()
      } else if (isRedo(event)) {
        event.preventDefault()
        redo()
      } else if (isDelete(event) && removeSelected()) {
        event.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
