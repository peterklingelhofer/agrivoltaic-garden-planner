import { beforeEach, describe, expect, it } from 'bun:test'
import { loadCitations } from '../data/citations'
import { getAppState, resetAppStore } from '../state/store'
import { ArrayPanel } from './ArrayPanel'
import { GroundPanel } from './BedPanel'
import { mount } from './testkit'

/**
 * Delete and Backspace remove what is selected (`ui/useEditKeys.ts`), and the Remove button of
 * each kind says so to assistive tech, which is how a keyboard-only reader learns the key exists
 */

beforeEach(async () => {
  localStorage.clear()
  resetAppStore()
  // the tree card's source link reads the registry on its first render
  await loadCitations()
})

const KEYS = 'Delete Backspace'

describe('the Remove buttons name the keys that do the same', () => {
  it('on a bed', async () => {
    const harness = await mount(<GroundPanel />)
    const remove = harness.get('action-bed-remove')
    expect(remove.getAttribute('aria-keyshortcuts')).toBe(KEYS)
    expect(remove.textContent).toBe('Remove bed')
    await harness.click('action-bed-remove')
    expect(getAppState().plot?.beds.map((bed) => bed.id)).toEqual(['bed-2', 'bed-3'])
    await harness.unmount()
  })

  it('on a row of panels', async () => {
    const harness = await mount(<ArrayPanel />)
    const remove = harness.get('action-array-remove')
    expect(remove.getAttribute('aria-keyshortcuts')).toBe(KEYS)
    expect(remove.textContent).toBe('Remove array')
    await harness.click('action-array-remove')
    expect(getAppState().plot?.arrays).toEqual([])
    await harness.unmount()
  })

  it('on a house and on a tree', async () => {
    const harness = await mount(<GroundPanel />)
    await harness.click('action-house-add')
    await harness.click('action-tree-add')
    const house = harness.get('action-house-remove-house-1')
    const tree = harness.get('action-tree-remove-tree-2')
    expect(house.getAttribute('aria-keyshortcuts')).toBe(KEYS)
    expect(tree.getAttribute('aria-keyshortcuts')).toBe(KEYS)
    await harness.click('action-tree-remove-tree-2')
    await harness.click('action-house-remove-house-1')
    expect(getAppState().plot?.obstructions).toEqual([])
    await harness.unmount()
  })

  it('and are otherwise the buttons they were: the same element, classes and attributes', async () => {
    const harness = await mount(<GroundPanel />)
    await harness.click('action-house-add')
    await harness.click('action-tree-add')
    const ids = ['action-bed-remove', 'action-house-remove-house-1', 'action-tree-remove-tree-2']
    for (const id of ids) {
      const remove = harness.get(id)
      expect(remove.tagName, id).toBe('BUTTON')
      expect(remove.className, id).toBe('action action-ghost')
      // the one attribute added to what `Action` always wrote for a plain press
      expect(remove.getAttributeNames().sort(), id).toEqual([
        'aria-keyshortcuts',
        'class',
        'data-testid',
        'type',
      ])
      expect(remove.hasAttribute('disabled'), id).toBe(false)
    }
    await harness.unmount()
    const panels = await mount(<ArrayPanel />)
    expect(panels.get('action-array-remove').getAttributeNames().sort()).toEqual([
      'aria-keyshortcuts',
      'class',
      'data-testid',
      'type',
    ])
    await panels.unmount()
  })
})
