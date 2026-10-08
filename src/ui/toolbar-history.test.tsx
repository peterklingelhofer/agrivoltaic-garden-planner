import { act } from 'react'
import { beforeEach, describe, expect, it } from 'bun:test'
import { Toolbar } from '../App'
import { makeBed } from '../state/defaults'
import { getAppState, resetAppStore } from '../state/store'
import { mount } from './testkit'

/**
 * Undo and Redo sit after the drawing modes. The history is the subject of
 * `state/history.test.ts` and the keys of `ui/edit-keys.test.ts`: what these hold is that the
 * buttons are wired to them, say which keys do the same, and are live only when they can act
 */

beforeEach(() => {
  localStorage.clear()
  resetAppStore()
})

const bedIds = (): readonly string[] => getAppState().plot?.beds.map((bed) => bed.id) ?? []

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
    expect(harness.get('action-toolbar-undo').getAttribute('aria-keyshortcuts')).toBe(
      'Meta+Z Control+Z',
    )
    expect(harness.get('action-toolbar-redo').getAttribute('aria-keyshortcuts')).toBe(
      'Meta+Shift+Z Control+Shift+Z Control+Y',
    )
    await harness.unmount()
  })

  it('are both disabled in a session with nothing done', async () => {
    const harness = await mount(<Toolbar />)
    expect(harness.get('action-toolbar-undo').hasAttribute('disabled')).toBe(true)
    expect(harness.get('action-toolbar-redo').hasAttribute('disabled')).toBe(true)
    await harness.unmount()
  })

  it('turn Undo on with an edit, and Redo on with the undo', async () => {
    const harness = await mount(<Toolbar />)
    await act(async () => {
      getAppState().upsertBed(makeBed(7))
    })
    // the edit is a moment old and hasn't settled, and Undo is live all the same
    expect(harness.get('action-toolbar-undo').hasAttribute('disabled')).toBe(false)
    expect(harness.get('action-toolbar-redo').hasAttribute('disabled')).toBe(true)
    await harness.click('action-toolbar-undo')
    expect(harness.get('action-toolbar-undo').hasAttribute('disabled')).toBe(true)
    expect(harness.get('action-toolbar-redo').hasAttribute('disabled')).toBe(false)
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
    expect(harness.get('action-toolbar-undo').hasAttribute('disabled')).toBe(true)
    expect(harness.get('action-toolbar-redo').hasAttribute('disabled')).toBe(true)
    await harness.unmount()
  })
})
