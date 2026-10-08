/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { act, createElement } from 'react'
import { beforeEach, describe, expect, it } from 'bun:test'
import { vi } from '../../test/vi'
import { makeArray } from '../state/defaults'
import { canUndo, useHistory } from '../state/history'
import { WRITE_DELAY_MS } from '../state/persist'
import type { EditorMode } from '../state/slices'
import { getAppState, resetAppStore } from '../state/store'
import { bedId, obstructionId } from '../types/ids'
import { mount } from './testkit'
import { useEditKeys } from './useEditKeys'

/*
  The hook listens on `window`, and `App` mounts it once. It sits outside the scene so that the
  keys and the toolbar's buttons go together when WebGL2 is missing, and the harness below stands
  in for that one mount
*/

const Keys = (): null => {
  useEditKeys()
  return null
}

/** Dispatches a keydown at `target` and says whether anything called `preventDefault` on it */
const press = async (
  key: string,
  init: KeyboardEventInit = {},
  target: EventTarget = window,
): Promise<boolean> => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  await act(async () => {
    target.dispatchEvent(event)
  })
  return event.defaultPrevented
}

const bedIds = (): readonly string[] => getAppState().plot?.beds.map((bed) => bed.id) ?? []
const maxCrops = (): number => getAppState().maxCropsPerBed

/** A field in the page, to press a key inside, removed again by the caller */
const inPage = <T extends HTMLElement>(element: T): T => {
  document.body.append(element)
  return element
}

beforeEach(() => {
  localStorage.clear()
  resetAppStore()
})

describe('undo and redo from the keyboard', () => {
  it('undoes with Cmd or Ctrl and Z, and claims the press', async () => {
    const harness = await mount(createElement(Keys))
    getAppState().setMaxCropsPerBed(9)
    expect(await press('z', { metaKey: true })).toBe(true)
    expect(maxCrops()).not.toBe(9)
    getAppState().setMaxCropsPerBed(9)
    expect(await press('z', { ctrlKey: true })).toBe(true)
    expect(maxCrops()).not.toBe(9)
    await harness.unmount()
  })

  it('reads the letter either way up, since Caps Lock makes it a capital', async () => {
    const harness = await mount(createElement(Keys))
    getAppState().setMaxCropsPerBed(9)
    expect(await press('Z', { ctrlKey: true })).toBe(true)
    expect(maxCrops()).not.toBe(9)
    await harness.unmount()
  })

  it('redoes with Shift and Cmd or Ctrl and Z, and with Ctrl and Y', async () => {
    const harness = await mount(createElement(Keys))
    const chords: readonly (readonly [string, KeyboardEventInit])[] = [
      ['Z', { metaKey: true, shiftKey: true }],
      ['Z', { ctrlKey: true, shiftKey: true }],
      ['y', { ctrlKey: true }],
    ]
    for (const [key, init] of chords) {
      resetAppStore()
      getAppState().setMaxCropsPerBed(9)
      await press('z', { ctrlKey: true })
      expect(maxCrops()).not.toBe(9)
      expect(await press(key, init), `${key} ${JSON.stringify(init)}`).toBe(true)
      expect(maxCrops()).toBe(9)
    }
    await harness.unmount()
  })

  it('claims a shortcut that has nothing to step over', async () => {
    const harness = await mount(createElement(Keys))
    const before = maxCrops()
    expect(canUndo(useHistory.getState())).toBe(false)
    expect(await press('z', { ctrlKey: true })).toBe(true)
    expect(await press('z', { ctrlKey: true, shiftKey: true })).toBe(true)
    expect(maxCrops()).toBe(before)
    await harness.unmount()
  })

  it('leaves alone a press that is not the shortcut', async () => {
    const harness = await mount(createElement(Keys))
    getAppState().setMaxCropsPerBed(9)
    const notShortcuts: readonly [string, KeyboardEventInit][] = [
      ['z', {}],
      ['z', { shiftKey: true }],
      ['z', { ctrlKey: true, altKey: true }],
      ['z', { metaKey: true, altKey: true }],
      ['x', { ctrlKey: true }],
      // Cmd and Y is the browser's History, and Shift on the Windows chord is a different command
      ['y', { metaKey: true }],
      ['y', { ctrlKey: true, shiftKey: true }],
      ['y', { ctrlKey: true, altKey: true }],
    ]
    for (const [key, init] of notShortcuts) {
      expect(await press(key, init), `${key} ${JSON.stringify(init)}`).toBe(false)
    }
    expect(maxCrops()).toBe(9)
    await harness.unmount()
  })

  it('leaves a press inside a field to the field, which keeps its own undo', async () => {
    const harness = await mount(createElement(Keys))
    getAppState().setMaxCropsPerBed(9)
    const typed = inPage(document.createElement('div'))
    typed.setAttribute('contenteditable', 'true')
    const inner = document.createElement('span')
    typed.append(inner)
    const fields: readonly HTMLElement[] = [
      inPage(document.createElement('input')),
      inPage(document.createElement('textarea')),
      inPage(document.createElement('select')),
      typed,
      inner,
    ]
    for (const field of fields) {
      expect(await press('z', { ctrlKey: true }, field), field.tagName).toBe(false)
      expect(await press('Z', { metaKey: true, shiftKey: true }, field), field.tagName).toBe(false)
      expect(await press('y', { ctrlKey: true }, field), field.tagName).toBe(false)
    }
    expect(maxCrops()).toBe(9)
    for (const field of fields) field.remove()
    await harness.unmount()
  })

  it("doesn't mistake contenteditable=false for a field", async () => {
    const harness = await mount(createElement(Keys))
    getAppState().setMaxCropsPerBed(9)
    const sealed = inPage(document.createElement('div'))
    sealed.setAttribute('contenteditable', 'false')
    expect(await press('z', { ctrlKey: true }, sealed)).toBe(true)
    expect(maxCrops()).not.toBe(9)
    sealed.remove()
    await harness.unmount()
  })

  it('stops listening when the scene goes', async () => {
    const harness = await mount(createElement(Keys))
    await harness.unmount()
    getAppState().setMaxCropsPerBed(9)
    expect(await press('z', { ctrlKey: true })).toBe(false)
    expect(maxCrops()).toBe(9)
  })
})

describe('Delete and Backspace remove what is selected', () => {
  it('removes the selected bed, whichever of the two keys is pressed', async () => {
    const harness = await mount(createElement(Keys))
    for (const key of ['Delete', 'Backspace']) {
      resetAppStore()
      getAppState().selectBed(bedId('bed-2'))
      expect(await press(key)).toBe(true)
      expect(bedIds()).toEqual(['bed-1', 'bed-3'])
      expect(getAppState().selectedBedId).toBeNull()
    }
    await harness.unmount()
  })

  it('removes the selected row of panels', async () => {
    const harness = await mount(createElement(Keys))
    getAppState().upsertArray(makeArray(2))
    getAppState().selectArray(makeArray(2).id)
    expect(await press('Delete')).toBe(true)
    expect(getAppState().plot?.arrays.map((array) => array.id)).toEqual(['array-1'])
    await harness.unmount()
  })

  it('removes the selected house and the selected tree', async () => {
    const harness = await mount(createElement(Keys))
    getAppState().addHouse()
    getAppState().addTree()
    expect(getAppState().selectedObstructionId).toBe('tree-2')
    expect(await press('Delete')).toBe(true)
    expect(getAppState().plot?.obstructions.map((o) => o.id)).toEqual(['house-1'])
    getAppState().selectObstruction(obstructionId('house-1'))
    expect(await press('Backspace')).toBe(true)
    expect(getAppState().plot?.obstructions).toEqual([])
    await harness.unmount()
  })

  it('removes one thing for one press', async () => {
    const harness = await mount(createElement(Keys))
    getAppState().selectBed(bedId('bed-1'))
    await press('Delete')
    // the selection went with the bed, so a second press has nothing to take
    expect(await press('Delete')).toBe(false)
    expect(bedIds()).toEqual(['bed-2', 'bed-3'])
    await harness.unmount()
  })

  it('works in every editor mode', async () => {
    const harness = await mount(createElement(Keys))
    const modes: readonly EditorMode[] = ['select', 'move', 'draw-plot', 'draw-bed']
    for (const mode of modes) {
      resetAppStore()
      getAppState().setMode(mode)
      getAppState().selectBed(bedId('bed-1'))
      expect(await press('Delete'), mode).toBe(true)
      expect(bedIds(), mode).toEqual(['bed-2', 'bed-3'])
    }
    await harness.unmount()
  })

  it('leaves the key to the browser when nothing is selected', async () => {
    const harness = await mount(createElement(Keys))
    const plot = getAppState().plot
    expect(await press('Delete')).toBe(false)
    expect(await press('Backspace')).toBe(false)
    expect(getAppState().plot).toBe(plot)
    await harness.unmount()
  })

  it('leaves the key to the browser when the selection points at nothing', async () => {
    const harness = await mount(createElement(Keys))
    const plot = getAppState().plot
    getAppState().selectBed(bedId('bed-99'))
    expect(await press('Backspace')).toBe(false)
    expect(getAppState().plot).toBe(plot)
    await harness.unmount()
  })

  it('ignores the keys with Cmd, Ctrl or Alt held', async () => {
    const harness = await mount(createElement(Keys))
    getAppState().selectBed(bedId('bed-1'))
    for (const init of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }]) {
      expect(await press('Delete', init), JSON.stringify(init)).toBe(false)
      expect(await press('Backspace', init), JSON.stringify(init)).toBe(false)
    }
    expect(bedIds()).toEqual(['bed-1', 'bed-2', 'bed-3'])
    await harness.unmount()
  })

  it('leaves a press inside a field to the field', async () => {
    const harness = await mount(createElement(Keys))
    getAppState().selectBed(bedId('bed-1'))
    const typed = inPage(document.createElement('div'))
    typed.setAttribute('contenteditable', '')
    const fields: readonly HTMLElement[] = [
      inPage(document.createElement('input')),
      inPage(document.createElement('textarea')),
      inPage(document.createElement('select')),
      typed,
    ]
    for (const field of fields) {
      expect(await press('Backspace', {}, field), field.tagName).toBe(false)
      expect(await press('Delete', {}, field), field.tagName).toBe(false)
    }
    expect(bedIds()).toEqual(['bed-1', 'bed-2', 'bed-3'])
    for (const field of fields) field.remove()
    await harness.unmount()
  })

  it('removes with a button holding the focus, which has no use for the key', async () => {
    const harness = await mount(createElement(Keys))
    getAppState().selectBed(bedId('bed-3'))
    const button = inPage(document.createElement('button'))
    expect(await press('Delete', {}, button)).toBe(true)
    expect(bedIds()).toEqual(['bed-1', 'bed-2'])
    button.remove()
    await harness.unmount()
  })

  it('leaves the keys to a drawing while corners are down, in either drawing mode', async () => {
    const harness = await mount(createElement(Keys))
    for (const mode of ['draw-plot', 'draw-bed'] as const) {
      resetAppStore()
      getAppState().setMode(mode)
      getAppState().selectBed(bedId('bed-1'))
      getAppState().pushDraftVertex({ xM: 1, yM: 1 } as never)
      expect(await press('Backspace'), mode).toBe(false)
      expect(await press('Delete'), mode).toBe(false)
      expect(bedIds(), mode).toEqual(['bed-1', 'bed-2', 'bed-3'])
      // the drawing ends and the selection is still there for the keys to act on
      getAppState().cancelDraft()
      getAppState().selectBed(bedId('bed-1'))
      expect(await press('Backspace'), mode).toBe(true)
      expect(bedIds(), mode).toEqual(['bed-2', 'bed-3'])
    }
    await harness.unmount()
  })

  it('takes the keys again in a drawing mode that has no corner down yet', async () => {
    const harness = await mount(createElement(Keys))
    getAppState().setMode('draw-bed')
    getAppState().selectBed(bedId('bed-2'))
    expect(getAppState().draft).toEqual([])
    expect(await press('Delete')).toBe(true)
    expect(bedIds()).toEqual(['bed-1', 'bed-3'])
    await harness.unmount()
  })

  it('still undoes while corners are down, which is the design and not the drawing', async () => {
    const harness = await mount(createElement(Keys))
    getAppState().setMaxCropsPerBed(9)
    getAppState().setMode('draw-plot')
    getAppState().pushDraftVertex({ xM: 1, yM: 1 } as never)
    expect(await press('z', { ctrlKey: true })).toBe(true)
    expect(maxCrops()).not.toBe(9)
    expect(getAppState().draft.length).toBe(1)
    await harness.unmount()
  })

  it('can be taken back with the undo shortcut', async () => {
    const harness = await mount(createElement(Keys))
    getAppState().selectBed(bedId('bed-2'))
    await press('Delete')
    expect(bedIds()).toEqual(['bed-1', 'bed-3'])
    await press('z', { ctrlKey: true })
    expect(bedIds()).toEqual(['bed-1', 'bed-2', 'bed-3'])
    await press('Z', { ctrlKey: true, shiftKey: true })
    expect(bedIds()).toEqual(['bed-1', 'bed-3'])
    await harness.unmount()
  })
})

describe('a press somebody else already claimed', () => {
  it('is left to them', async () => {
    const harness = await mount(createElement(Keys))
    getAppState().setMaxCropsPerBed(9)
    const claim = (event: Event): void => event.preventDefault()
    // a handler that claims the press before this hook's own listener gets it
    window.addEventListener('keydown', claim, { capture: true })
    try {
      expect(await press('z', { ctrlKey: true })).toBe(true)
      expect(maxCrops()).toBe(9)
      getAppState().selectBed(bedId('bed-1'))
      await press('Delete')
      expect(bedIds()).toEqual(['bed-1', 'bed-2', 'bed-3'])
    } finally {
      window.removeEventListener('keydown', claim, { capture: true })
    }
    await harness.unmount()
  })

  it('makes a second mount harmless: one chord goes back one step', async () => {
    const first = await mount(createElement(Keys))
    const second = await mount(createElement(Keys))
    vi.useFakeTimers()
    try {
      getAppState().setMaxCropsPerBed(7)
      vi.advanceTimersByTime(WRITE_DELAY_MS)
      getAppState().setMaxCropsPerBed(8)
      vi.advanceTimersByTime(WRITE_DELAY_MS)
    } finally {
      vi.useRealTimers()
    }
    expect(useHistory.getState().past.length).toBe(2)
    await press('z', { ctrlKey: true })
    // a doubled handler would have gone back to where it started
    expect(maxCrops()).toBe(7)
    expect(useHistory.getState().past.length).toBe(1)
    await first.unmount()
    await second.unmount()
  })
})

describe('where the keys are mounted', () => {
  const ROOT = join(process.cwd(), 'src')

  const sources = (dir: string, found: string[] = []): string[] => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) sources(path, found)
      else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) found.push(path)
    }
    return found
  }

  /**
   * `App` mounts them, outside `CheckedScene`, so they answer on a page whose scene never loads.
   * A second mount would run every chord twice, which is why this reads the source
   */
  it('is called once, from App, and from nothing else', () => {
    const calls = sources(ROOT)
      .filter((path) => path !== join(ROOT, 'ui', 'useEditKeys.ts'))
      .flatMap((path) => {
        const found = readFileSync(path, 'utf8').match(/\buseEditKeys\(\)/g) ?? []
        return found.map(() => path.slice(ROOT.length + 1))
      })
    expect(calls).toEqual(['App.tsx'])
  })

  it('is not reached from the scene, which only the lazy boundary may be', () => {
    const scene = sources(join(ROOT, 'scene')).filter((path) =>
      readFileSync(path, 'utf8').includes('useEditKeys'),
    )
    expect(scene).toEqual([])
  })
})
