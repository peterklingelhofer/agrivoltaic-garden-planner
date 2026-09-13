import { act } from 'react'
import { beforeEach, describe, expect, it } from 'bun:test'
import { getAppState, resetAppStore, useAppStore } from '../state/store'
import { vec2 } from '../state/geom'
import { cornersSoFar, DRAW_HINT, MOVE_HINT, TOUCH_MOVE_HINT } from './scene-hint'
import { SceneHint } from './SceneHint'
import { mount } from './testkit'

/** A key on `window`, which is where the hint listens */
const press = async (key: string, target: EventTarget = window): Promise<void> => {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  })
}

const drawTriangle = async (): Promise<void> => {
  await act(async () => {
    const store = useAppStore.getState()
    store.setMode('draw-bed')
    store.pushDraftVertex(vec2(0, 0))
    store.pushDraftVertex(vec2(2, 0))
    store.pushDraftVertex(vec2(2, 2))
  })
}

beforeEach(() => {
  resetAppStore()
})

describe('what a drawing mode says it is waiting for', () => {
  it('says nothing at all while nothing is being drawn', async () => {
    const harness = await mount(<SceneHint />)
    expect(harness.find('status-scene-hint')).toBeNull()
    await harness.unmount()
  })

  it('names the finishing gesture the moment a mode is entered', async () => {
    await act(async () => useAppStore.getState().setMode('draw-bed'))
    const harness = await mount(<SceneHint />)
    const said = harness.get('status-scene-hint').textContent ?? ''
    expect(said).toContain(DRAW_HINT['draw-bed'])
    // the three ways out, all of them true and none of them in the sidebar
    expect(said).toMatch(/double-click/i)
    expect(said).toMatch(/enter/i)
    expect(said).toMatch(/esc/i)
    await harness.unmount()
  })

  /**
   * `commitDraft` refuses a draft under three vertices, so "press Enter to close it" is a promise
   * the app can't keep on the second corner. Saying which side of that line the drawing is on is
   * the difference between a rule and a dead key
   */
  it('counts the corners against the three a shape needs', async () => {
    await act(async () => {
      useAppStore.getState().setMode('draw-bed')
      useAppStore.getState().pushDraftVertex(vec2(0, 0))
    })
    const harness = await mount(<SceneHint />)
    expect(harness.get('readout-scene-hint-corners').textContent).toBe(cornersSoFar(1))
    expect(harness.get('readout-scene-hint-corners').textContent).toContain('3 corners a shape')
    await act(async () => {
      useAppStore.getState().pushDraftVertex(vec2(2, 0))
      useAppStore.getState().pushDraftVertex(vec2(2, 2))
    })
    expect(harness.get('readout-scene-hint-corners').dataset.corners).toBe('3')
    expect(harness.get('readout-scene-hint-corners').textContent).toContain('enough to close')
    await harness.unmount()
  })
})

describe('what Move mode says it can do', () => {
  it('names the arrow keys and their two step sizes, for a mouse and for a finger', async () => {
    await act(async () => useAppStore.getState().setMode('move'))
    const harness = await mount(<SceneHint />)
    expect(harness.get('status-scene-hint').textContent).toContain(MOVE_HINT)
    for (const hint of [MOVE_HINT, TOUCH_MOVE_HINT]) {
      expect(hint).toMatch(/arrow keys/i)
      expect(hint).toContain('0.1 m')
      expect(hint).toContain('1 m with Shift')
    }
    await harness.unmount()
  })
})

describe('the keys the hint promises', () => {
  it('closes the shape on Enter, which is what the sidebar button does', async () => {
    const harness = await mount(<SceneHint />)
    await drawTriangle()
    const before = useAppStore.getState().plot?.beds.length ?? 0
    await press('Enter')
    const after = useAppStore.getState()
    expect(after.plot?.beds.length).toBe(before + 1)
    expect(after.mode).toBe('select')
    expect(after.draft).toHaveLength(0)
    await harness.unmount()
  })

  it('throws the drawing away on Escape without raising anything', async () => {
    const harness = await mount(<SceneHint />)
    await drawTriangle()
    const before = useAppStore.getState().plot?.beds.length ?? 0
    await press('Escape')
    const after = useAppStore.getState()
    expect(after.plot?.beds.length).toBe(before)
    expect(after.draft).toHaveLength(0)
    expect(after.mode).toBe('select')
    await harness.unmount()
  })

  /**
   * The address search is an input in the sidebar and Enter in it runs a search. A global Enter
   * handler that didn't check its target would turn every one of those into a bed
   */
  it('leaves Enter alone inside a field', async () => {
    const harness = await mount(<SceneHint />)
    await drawTriangle()
    const field = document.createElement('input')
    document.body.append(field)
    const before = useAppStore.getState().plot?.beds.length ?? 0
    await press('Enter', field)
    expect(useAppStore.getState().plot?.beds.length).toBe(before)
    expect(useAppStore.getState().draft).toHaveLength(3)
    field.remove()
    await harness.unmount()
  })

  it("stops listening once the mode is left, so Enter is the page's again", async () => {
    const harness = await mount(<SceneHint />)
    await drawTriangle()
    await act(async () => useAppStore.getState().cancelDraft())
    const before = useAppStore.getState().plot?.beds.length ?? 0
    await press('Enter')
    expect(useAppStore.getState().plot?.beds.length).toBe(before)
    await harness.unmount()
  })
})

/**
 * The one dead end the phone walkthrough found.
 *
 * A bed tapped in the garden selects, raises its move handles, and on a phone the panel about it is
 * on a surface that is not on screen, so this prompt says so and offers the way there. On a laptop
 * the same prompt would be furniture, which is why the stylesheet alone decides
 * whether it's on screen. What is held here is that it appears only when there's a bed to talk
 * about and that its press does BOTH halves of the job
 */
describe('what to do with the bed that was just tapped', () => {
  const raiseBed = async (): Promise<string> => {
    await drawTriangle()
    await act(async () => {
      useAppStore.getState().commitDraft()
    })
    const bed = getAppState().plot?.beds[0]
    expect(bed).toBeDefined()
    await act(async () => {
      const store = useAppStore.getState()
      store.setMode('select')
      store.selectBed(bed!.id)
    })
    return String(bed!.id)
  }

  it('says nothing while nothing is selected', async () => {
    await act(async () => useAppStore.getState().setMode('select'))
    const harness = await mount(<SceneHint />)
    expect(harness.find('status-scene-selected')).toBeNull()
    await harness.unmount()
  })

  it('names the selected bed rather than saying something is selected', async () => {
    const id = await raiseBed()
    const harness = await mount(<SceneHint />)
    const prompt = harness.get('status-scene-selected')
    expect(prompt.getAttribute('data-bed')).toBe(id)
    // the label the bed carries everywhere else, so the prompt and the panel name the same thing
    expect(prompt.textContent).toContain(getAppState().plot?.beds[0]?.label ?? 'nothing')
    await harness.unmount()
  })

  /**
   * Both halves, and the second is the one worth pinning. Switching surfaces alone lands the
   * visitor wherever the stepper happened to be, which on a first visit is step one and the
   * address they have already given: the press has to open the step that plants a bed as well,
   * because that is the question the tap asked
   */
  it('takes the press to the editor AND to the step that plants a bed', async () => {
    await raiseBed()
    const harness = await mount(<SceneHint />)
    await harness.click('action-scene-plant-bed')
    expect(getAppState().surface).toBe('edit')
    expect(getAppState().sidebarStep).toBe('plants')
    await harness.unmount()
  })

  /**
   * The beds in the picture are the proposal's while a layout card is being looked at, and the
   * strip would read the proposal's bed ("Bed 2 is empty, plant it") with a press that opens the
   * garden's own Bed 2. Nothing to say until the picture is the garden again
   */
  it('stands down while a layout is being previewed over the garden', async () => {
    await raiseBed()
    const plot = getAppState().plot
    expect(plot).not.toBeNull()
    await act(async () => useAppStore.setState({ previewPlot: plot }))
    const harness = await mount(<SceneHint />)
    expect(harness.find('status-scene-selected')).toBeNull()
    await act(async () => useAppStore.setState({ previewPlot: null }))
    expect(harness.find('status-scene-selected')).not.toBeNull()
    await harness.unmount()
  })

  it('stands down while a shape is being drawn, which is a different question', async () => {
    await raiseBed()
    await act(async () => useAppStore.getState().setMode('draw-bed'))
    const harness = await mount(<SceneHint />)
    expect(harness.find('status-scene-selected')).toBeNull()
    expect(harness.find('status-scene-hint')).not.toBeNull()
    await harness.unmount()
  })
})
