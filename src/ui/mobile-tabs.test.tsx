import { act } from 'react'
import { beforeEach, describe, expect, it } from 'bun:test'
import { makeBed } from '../state/defaults'
import { useHistory } from '../state/history'
import { getAppState, resetAppStore } from '../state/store'
import { MobileTabs } from './MobileTabs'
import { mount, type Harness } from './testkit'
import { REDO_KEYS, UNDO_KEYS } from './useEditKeys'

/**
 * Undo and Redo sit in the phone's bottom bar, in a group beside the tabs. The tabs are the
 * subject of `mobile-shell.test.tsx`, the history of `state/history.test.ts` and the desktop pair
 * of `toolbar-history.test.tsx`. What these hold is that the pair is a group of its own outside
 * the nav, is wired to the history, and is live only when it can act.
 *
 * What the stylesheet does with the bar can't be checked here, since jsdom has no layout engine.
 * The one fact the equal shares are built on, how many cells the nav has, is held below
 */

beforeEach(() => {
  localStorage.clear()
  resetAppStore()
})

const UNDO = 'action-tabbar-undo'
const REDO = 'action-tabbar-redo'

/** The agent's tab joins the other two only in a build that carries the agent */
const TAB_IDS = [
  'action-tab-garden',
  'action-tab-edit',
  ...(__AGENT_ENABLED__ ? ['action-tab-chat'] : []),
]

const bedIds = (): readonly string[] => getAppState().plot?.beds.map((bed) => bed.id) ?? []

const testIdsIn = (parent: Element): readonly (string | undefined)[] =>
  [...parent.querySelectorAll<HTMLElement>('button')].map((button) => button.dataset.testid)

/** What the button tells assistive tech about whether it can act: "true" when it can't */
const unavailable = (harness: Harness, testId: string): string | null =>
  harness.get(testId).getAttribute('aria-disabled')

describe('the Undo and Redo pair in the bottom bar', () => {
  it('is a named region beside the nav, which keeps only its tabs', async () => {
    const harness = await mount(<MobileTabs />)
    const nav = harness.get('panel-tabbar')
    // a named section is a region landmark, and jsdom doesn't compute implicit roles, so the
    // element is asked for by name: `e2e/undo.spec.ts` asks the browser for the role
    const group = harness.container.querySelector('section[aria-label="Undo and redo"]')
    if (group === null) throw new Error('no Undo and redo group in the bar')
    expect(nav.tagName).toBe('NAV')
    expect(nav.getAttribute('aria-label')).toBe('What to show')
    expect(testIdsIn(nav)).toEqual(TAB_IDS)
    expect(testIdsIn(group)).toEqual([UNDO, REDO])
    // beside the nav and never inside it: a nav is for destinations, and these are actions
    expect(nav.contains(group)).toBe(false)
    expect(group.parentElement).toBe(nav.parentElement)
    // and the one wrapper over both is a plain element, which adds no landmark or role of its own
    const bar = nav.parentElement as HTMLElement
    expect(bar.tagName).toBe('DIV')
    expect(bar.hasAttribute('role')).toBe(false)
  })

  it('names each button by its text, and says which keys do the same', async () => {
    const harness = await mount(<MobileTabs />)
    expect(harness.get(UNDO).textContent).toBe('Undo')
    expect(harness.get(REDO).textContent).toBe('Redo')
    expect(harness.get(UNDO).hasAttribute('aria-label')).toBe(false)
    expect(harness.get(REDO).hasAttribute('aria-label')).toBe(false)
    expect(harness.get(UNDO).getAttribute('aria-keyshortcuts')).toBe(UNDO_KEYS)
    expect(harness.get(REDO).getAttribute('aria-keyshortcuts')).toBe(REDO_KEYS)
  })

  it('tells the stylesheet how many cells the nav has, one for each tab', async () => {
    const harness = await mount(<MobileTabs />)
    const bar = harness.get('panel-tabbar').parentElement as HTMLElement
    expect(bar.style.getPropertyValue('--tab-count')).toBe(String(TAB_IDS.length))
  })

  it('is unavailable in a session with nothing done', async () => {
    const harness = await mount(<MobileTabs />)
    expect(unavailable(harness, UNDO)).toBe('true')
    expect(unavailable(harness, REDO)).toBe('true')
    // the native attribute would take the focus from whoever pressed the last step
    expect(harness.get(UNDO).hasAttribute('disabled')).toBe(false)
    expect(harness.get(REDO).hasAttribute('disabled')).toBe(false)
  })

  it('turns Undo on with an edit, and Redo on with the undo', async () => {
    const harness = await mount(<MobileTabs />)
    await act(async () => {
      getAppState().upsertBed(makeBed(7))
    })
    // the edit is a moment old and hasn't settled, and Undo is live all the same
    expect(unavailable(harness, UNDO)).toBe('false')
    expect(unavailable(harness, REDO)).toBe('true')
    await harness.click(UNDO)
    expect(unavailable(harness, UNDO)).toBe('true')
    expect(unavailable(harness, REDO)).toBe('false')
  })

  it('reverts the edit when Undo is pressed, and applies it again with Redo', async () => {
    const harness = await mount(<MobileTabs />)
    await act(async () => {
      getAppState().upsertBed(makeBed(7))
    })
    expect(bedIds()).toEqual(['bed-1', 'bed-2', 'bed-3', 'bed-7'])
    await harness.click(UNDO)
    expect(bedIds()).toEqual(['bed-1', 'bed-2', 'bed-3'])
    await harness.click(REDO)
    expect(bedIds()).toEqual(['bed-1', 'bed-2', 'bed-3', 'bed-7'])
    expect(unavailable(harness, UNDO)).toBe('false')
    expect(unavailable(harness, REDO)).toBe('true')
  })

  /**
   * `redo` settles an unsettled burst of edits before it looks for a step to take, so a press that
   * reached it would close the burst the edit just opened. The click still arrives, since the
   * button is not natively disabled, and the guard on it is what stops the press
   */
  it('leaves an open burst of edits open when Redo is pressed with nothing to redo', async () => {
    const harness = await mount(<MobileTabs />)
    await act(async () => {
      getAppState().upsertBed(makeBed(7))
    })
    expect(useHistory.getState().open).not.toBeNull()
    await harness.click(REDO)
    expect(useHistory.getState().open).not.toBeNull()
    expect(useHistory.getState().past).toEqual([])
    expect(bedIds()).toEqual(['bed-1', 'bed-2', 'bed-3', 'bed-7'])
  })

  it('does nothing when pressed in a session with nothing done', async () => {
    const harness = await mount(<MobileTabs />)
    const plot = getAppState().plot
    await harness.click(UNDO)
    await harness.click(REDO)
    expect(getAppState().plot).toBe(plot)
    expect(useHistory.getState()).toEqual({ past: [], future: [], open: null })
  })

  it('takes the focus while it has nothing to do, which a disabled button would refuse', async () => {
    const harness = await mount(<MobileTabs />)
    for (const id of [UNDO, REDO]) {
      const button = harness.get(id)
      button.focus()
      expect(document.activeElement, id).toBe(button)
    }
  })

  it('is never the current destination, and a press leaves the surface where it was', async () => {
    const harness = await mount(<MobileTabs />)
    await act(async () => {
      getAppState().upsertBed(makeBed(7))
    })
    const surface = getAppState().surface
    for (const press of [UNDO, REDO]) {
      await harness.click(press)
      expect(getAppState().surface).toBe(surface)
      for (const id of [UNDO, REDO]) {
        expect(harness.get(id).hasAttribute('aria-current')).toBe(false)
        expect(harness.get(id).dataset.current).toBeUndefined()
      }
      // the one mark in the whole bar is still on the tab for the surface showing
      const marked = [...harness.container.querySelectorAll('[aria-current]')]
      expect(marked.map((el) => el.getAttribute('data-testid'))).toEqual([`action-tab-${surface}`])
    }
  })
})
