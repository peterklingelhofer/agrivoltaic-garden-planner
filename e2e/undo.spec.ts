import { expect, test } from '@playwright/test'
import { openApp, step } from './fixtures/app.ts'

/**
 * Delete removes what is selected, and Undo and Redo walk back and forth over it, from the toolbar
 * and from the keyboard (`src/ui/useEditKeys.ts`, `src/state/history.ts`). A tree is the thing
 * removed: adding one selects it, so the spec needs no click on the canvas to have a selection.
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
