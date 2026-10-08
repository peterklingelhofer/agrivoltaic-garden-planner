import { act } from 'react'
import { beforeEach, describe, expect, it } from 'bun:test'
import { Toolbar } from '../App'
import { makeBed } from '../state/defaults'
import { useHistory } from '../state/history'
import { getAppState, resetAppStore } from '../state/store'
import { mount, type Harness } from './testkit'
import { REDO_KEYS, UNDO_KEYS } from './useEditKeys'

/**
 * Undo and Redo sit after the drawing modes. The history is the subject of
 * `state/history.test.ts` and the keys of `ui/edit-keys.test.ts`: what these hold is that the
 * buttons are wired to them, say which keys do the same, and are live only when they can act.
 *
 * A button that can't act says so with `aria-disabled`, so one pressed down to its last step keeps
 * the focus that press gave it. A press on one does nothing all the same
 */

beforeEach(() => {
  localStorage.clear()
  resetAppStore()
})

const bedIds = (): readonly string[] => getAppState().plot?.beds.map((bed) => bed.id) ?? []

/** What the button tells assistive tech about whether it can act: "true" when it can't */
const unavailable = (harness: Harness, testId: string): string | null =>
  harness.get(testId).getAttribute('aria-disabled')

describe('the Undo and Redo buttons', () => {
  it('come after the four modes, and say which keys do the same', async () => {
    const harness = await mount(<Toolbar />)
    const order = [...harness.container.querySelectorAll('.toolbar-modes button')].map((button) =>
      button.getAttribute('data-testid'),
    )
    expect(order.slice(0, 6)).toEqual([
      'action-toolbar-mode-select',
      'action-toolbar-mode-move',
      'action-toolbar-mode-draw-plot',
      'action-toolbar-mode-draw-bed',
      'action-toolbar-undo',
      'action-toolbar-redo',
    ])
    expect(harness.get('action-toolbar-undo').textContent).toBe('Undo')
    expect(harness.get('action-toolbar-redo').textContent).toBe('Redo')
    expect(harness.get('action-toolbar-undo').getAttribute('aria-keyshortcuts')).toBe(UNDO_KEYS)
    expect(harness.get('action-toolbar-redo').getAttribute('aria-keyshortcuts')).toBe(REDO_KEYS)
    await harness.unmount()
  })

  it('are both unavailable in a session with nothing done', async () => {
    const harness = await mount(<Toolbar />)
    expect(unavailable(harness, 'action-toolbar-undo')).toBe('true')
    expect(unavailable(harness, 'action-toolbar-redo')).toBe('true')
    // the native attribute would take the focus from whoever pressed the last step
    expect(harness.get('action-toolbar-undo').hasAttribute('disabled')).toBe(false)
    expect(harness.get('action-toolbar-redo').hasAttribute('disabled')).toBe(false)
    await harness.unmount()
  })

  it('turn Undo on with an edit, and Redo on with the undo', async () => {
    const harness = await mount(<Toolbar />)
    await act(async () => {
      getAppState().upsertBed(makeBed(7))
    })
    // the edit is a moment old and hasn't settled, and Undo is live all the same
    expect(unavailable(harness, 'action-toolbar-undo')).toBe('false')
    expect(unavailable(harness, 'action-toolbar-redo')).toBe('true')
    await harness.click('action-toolbar-undo')
    expect(unavailable(harness, 'action-toolbar-undo')).toBe('true')
    expect(unavailable(harness, 'action-toolbar-redo')).toBe('false')
    await harness.unmount()
  })

  it('undo and redo a change when they are pressed', async () => {
    const harness = await mount(<Toolbar />)
    await act(async () => {
      getAppState().upsertBed(makeBed(7))
    })
    expect(bedIds()).toEqual(['bed-1', 'bed-2', 'bed-3', 'bed-7'])
    await harness.click('action-toolbar-undo')
    expect(bedIds()).toEqual(['bed-1', 'bed-2', 'bed-3'])
    await harness.click('action-toolbar-redo')
    expect(bedIds()).toEqual(['bed-1', 'bed-2', 'bed-3', 'bed-7'])
    await harness.unmount()
  })

  it('do nothing when pressed with nothing to do', async () => {
    const harness = await mount(<Toolbar />)
    const plot = getAppState().plot
    await harness.click('action-toolbar-undo')
    await harness.click('action-toolbar-redo')
    expect(getAppState().plot).toBe(plot)
    expect(useHistory.getState()).toEqual({ past: [], future: [], open: null })
    await harness.unmount()
  })

  /**
   * `redo` settles an unsettled burst of edits before it looks for a step to take, so a press that
   * reached it would close the burst the edit just opened. The button's own guard is what stops
   * the press, and the click still arrives because the button is not natively disabled
   */
  it('leave an open burst of edits open when Redo is pressed with nothing to redo', async () => {
    const harness = await mount(<Toolbar />)
    await act(async () => {
      getAppState().upsertBed(makeBed(7))
    })
    expect(useHistory.getState().open).not.toBeNull()
    await harness.click('action-toolbar-redo')
    expect(useHistory.getState().open).not.toBeNull()
    expect(useHistory.getState().past).toEqual([])
    expect(bedIds()).toEqual(['bed-1', 'bed-2', 'bed-3', 'bed-7'])
    await harness.unmount()
  })

  it('take the focus while they have nothing to do, which a disabled button would refuse', async () => {
    const harness = await mount(<Toolbar />)
    for (const id of ['action-toolbar-undo', 'action-toolbar-redo']) {
      const button = harness.get(id)
      button.focus()
      expect(document.activeElement, id).toBe(button)
    }
    await harness.unmount()
  })

  it('go dead again when the design is forgotten', async () => {
    const harness = await mount(<Toolbar />)
    await act(async () => {
      getAppState().upsertBed(makeBed(7))
    })
    await harness.click('action-toolbar-undo')
    await act(async () => {
      getAppState().clearDesign()
    })
    expect(unavailable(harness, 'action-toolbar-undo')).toBe('true')
    expect(unavailable(harness, 'action-toolbar-redo')).toBe('true')
    await harness.unmount()
  })
})
