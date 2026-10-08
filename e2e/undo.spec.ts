import { expect, test } from '@playwright/test'
import { openApp, step } from './fixtures/app.ts'

/**
 * Delete removes what is selected, and Undo and Redo walk back and forth over it, from the toolbar
 * and from the keyboard (`src/ui/useEditKeys.ts`, `src/state/history.ts`), and on a phone from the
 * bottom bar (`src/ui/MobileTabs.tsx`). A tree is the thing removed: adding one selects it, so the
 * spec needs no click on the canvas to have a selection.
 *
 * The history groups edits made less than 600 ms apart into one step, which is `WRITE_DELAY_MS` in
 * `src/state/persist.ts`. Adding the tree and deleting it a few milliseconds later, as a script
 * does, is one step that ends where it began, so the spec waits this long between the two
 */
const HISTORY_SETTLE_MS = 800

test('Delete removes the selected tree, and Undo and Redo take it back and away again', async ({
  page,
}) => {
  const app = await openApp(page)
  await step(page, 'ground')
  const tree = page.getByTestId('item-tree-tree-1')
  const undo = page.getByTestId('action-toolbar-undo')
  const redo = page.getByTestId('action-toolbar-redo')

  await expect(undo).toHaveAttribute('aria-keyshortcuts', 'Meta+Z Control+Z')
  await expect(redo).toHaveAttribute('aria-keyshortcuts', 'Meta+Shift+Z Control+Shift+Z Control+Y')
  // the bottom bar's pair is for the phone shell, so it has no box up here
  await expect(page.getByTestId('action-tabbar-undo')).toBeHidden()
  await expect(page.getByTestId('action-tabbar-redo')).toBeHidden()

  await page.getByTestId('action-tree-add').click()
  await expect(tree).toBeVisible()
  await expect(page.getByTestId('action-tree-remove-tree-1')).toHaveAttribute(
    'aria-keyshortcuts',
    'Delete Backspace',
  )
  await page.waitForTimeout(HISTORY_SETTLE_MS)

  // the focus is on the button that added the tree, which has no use for the key
  await page.keyboard.press('Delete')
  await expect(tree).toHaveCount(0)

  await undo.click()
  await expect(tree).toBeVisible()
  await expect(redo).toBeEnabled()

  await redo.click()
  await expect(tree).toHaveCount(0)
  // pressed down to the last step, Redo goes dim and keeps the focus that press gave it
  await expect(redo).toHaveAttribute('aria-disabled', 'true')
  await expect(redo).toBeFocused()

  // Cmd on a Mac and Ctrl elsewhere, which Playwright picks by platform
  await page.keyboard.press('ControlOrMeta+z')
  await expect(tree).toBeVisible()
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect(tree).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(tree).toBeVisible()
  // and the Windows habit for redo, which works on every platform
  await page.keyboard.press('Control+y')
  await expect(tree).toHaveCount(0)

  expect(app.errors).toEqual([])
})

test('Backspace in a field edits the field, and the tree stays', async ({ page }) => {
  const app = await openApp(page)
  await step(page, 'ground')
  await page.getByTestId('action-tree-add').click()
  const tree = page.getByTestId('item-tree-tree-1')
  await expect(tree).toBeVisible()

  const width = page.getByTestId('control-tree-width-tree-1')
  await width.fill('12')
  await width.press('Backspace')
  await expect(width).toHaveValue('1')
  await expect(tree).toBeVisible()
  expect(app.errors).toEqual([])
})

/**
 * The same walk on a phone, from the pair in the bottom bar.
 *
 * At 760px and below the toolbar's pill no longer holds Undo and Redo. They sit in the bar beside
 * the Garden and Plan tabs, the one strip of controls on screen on both tabs. The tree is added
 * and taken back as above, with no wait for the history to settle: an edit a moment old already
 * makes Undo live
 */
test.describe('a phone, where Undo and Redo are in the bottom bar', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('Undo and Redo in the bar take an added tree away and bring it back', async ({ page }) => {
    const app = await openApp(page)
    await page.getByTestId('action-tab-edit').click()
    await step(page, 'ground')
    const tree = page.getByTestId('item-tree-tree-1')
    const undo = page.getByTestId('action-tabbar-undo')
    const redo = page.getByTestId('action-tabbar-redo')

    // the bar as a reader meets it: a nav of places, and beside it a region of two actions
    await expect(page.getByRole('navigation', { name: 'What to show' })).toBeVisible()
    const group = page.getByRole('region', { name: 'Undo and redo' })
    await expect(group.getByRole('button')).toHaveText(['Undo', 'Redo'])
    await expect(undo).toHaveAttribute('aria-keyshortcuts', 'Meta+Z Control+Z')
    await expect(redo).toHaveAttribute(
      'aria-keyshortcuts',
      'Meta+Shift+Z Control+Shift+Z Control+Y',
    )

    await page.getByTestId('action-tree-add').click()
    await expect(tree).toBeVisible()
    await expect(undo).toBeEnabled()

    await undo.click()
    await expect(tree).toHaveCount(0)
    await expect(redo).toBeEnabled()
    // pressed down to the last step, Undo goes dim and keeps the focus that press gave it
    await expect(undo).toHaveAttribute('aria-disabled', 'true')
    await expect(undo).toBeFocused()

    await redo.click()
    await expect(tree).toBeVisible()
    await expect(redo).toHaveAttribute('aria-disabled', 'true')
    await expect(redo).toBeFocused()
    expect(app.errors).toEqual([])
  })

  test('keeps every cell of the bar in one row at one width, on both tabs', async ({ page }) => {
    const app = await openApp(page)
    // the tabs and the pair are the test ids that start `action-tab`: four cells, or five in a
    // build that carries the agent
    const cells = page.locator('[data-testid^="action-tab"]')
    for (const tab of ['action-tab-edit', 'action-tab-garden']) {
      await page.getByTestId(tab).click()
      const boxes = await cells.evaluateAll((els) =>
        els.map((el) => {
          const box = el.getBoundingClientRect()
          return { width: box.width, top: box.top, height: box.height }
        }),
      )
      expect(boxes.length, tab).toBeGreaterThanOrEqual(4)
      const widths = boxes.map((box) => box.width)
      expect(Math.max(...widths) - Math.min(...widths), tab).toBeLessThan(1)
      // one row at one height, which is how the pair adds nothing to the bar
      expect(new Set(boxes.map((box) => Math.round(box.top))).size, tab).toBe(1)
      expect(new Set(boxes.map((box) => Math.round(box.height))).size, tab).toBe(1)
      await expect(page.getByTestId('action-tabbar-undo'), tab).toBeVisible()
      await expect(page.getByTestId('action-tabbar-redo'), tab).toBeVisible()
    }
    expect(app.errors).toEqual([])
  })
})

/**
 * Between 480px and 760px the pill held all six buttons, since a row had room for them. It holds
 * the four modes now, and the pair is in the bottom bar at every width the bar is
 */
test.describe('a phone held wide, 600px across', () => {
  test.use({ viewport: { width: 600, height: 900 } })

  test("leaves Undo and Redo out of the toolbar's pill, and in the bottom bar", async ({
    page,
  }) => {
    const app = await openApp(page)
    await page.getByTestId('action-tab-garden').click()
    // the pill is up on the garden, so the pair's absence from it is the stylesheet's doing
    await expect(page.getByTestId('action-toolbar-mode-draw-bed')).toBeVisible()
    await expect(page.getByTestId('action-toolbar-undo')).toBeHidden()
    await expect(page.getByTestId('action-toolbar-redo')).toBeHidden()
    await expect(page.getByTestId('action-tabbar-undo')).toBeVisible()
    await expect(page.getByTestId('action-tabbar-redo')).toBeVisible()
    expect(app.errors).toEqual([])
  })
})
