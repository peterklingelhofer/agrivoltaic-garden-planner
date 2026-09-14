import { expect, test } from '@playwright/test'
import {
  AUTORUN_TIMEOUT_MS,
  BAKE_TIMEOUT_MS,
  openApp,
  step,
  runLightCheck,
  waitForCanvas,
} from './fixtures/app.ts'

/**
 * A tree drawn on the ground step answers "what shades this bed" itself (Decision Record 26):
 * the light step's figures move with it, and the answer holds across a reload. Pinned on the
 * shipped example, whose bed 1 spans y -14.25 to -12.75: a 10 by 10 m crown centred 18 m south,
 * standing up to 12 m, reaches into the bed from the south, the side this latitude's growing
 * season sun comes from
 */

const numberIn = (text: string | null): number => {
  const match = /-?\d+(?:\.\d+)?/.exec(text ?? '')
  expect(match, `no number in "${String(text)}"`).not.toBeNull()
  return Number(match?.[0] ?? 0)
}

test('a tree drawn on the ground shades the light, and survives a reload', async ({ page }) => {
  test.setTimeout(BAKE_TIMEOUT_MS + AUTORUN_TIMEOUT_MS + 60_000)
  const app = await openApp(page, { exampleGarden: true })
  // the example design and raster arrive over the network after the canvas is already up; the
  // banner is what says they landed, and drawing a tree before it does draws on the plot the
  // app started on rather than the example, which the fetch then overwrites from under it
  await expect(page.getByTestId('panel-example')).toBeVisible({ timeout: 60_000 })

  await step(page, 'light')
  const dli = page.getByTestId('readout-bed-light-dli-bed-1')
  await expect(dli).toBeVisible()
  const dliBefore = numberIn(await dli.textContent())

  // a disabled fieldset disables every radio inside it but Chromium never marks the fieldset
  // itself :disabled, so toBeDisabled()/toBeEnabled() cannot read it; the attribute is what the
  // component actually sets and what obstructions.test.tsx already checks it through
  const exposureFieldset = page.getByTestId('control-onboarding-exposure')

  await step(page, 'ground')
  await page.getByTestId('action-tree-add').click()
  await page.getByTestId('control-tree-width-tree-1').fill('10')
  await page.getByTestId('control-tree-depth-tree-1').fill('10')
  await page.getByTestId('control-tree-top-tree-1').fill('12')
  await page.getByTestId('control-tree-north-tree-1').fill('-18')
  await expect(exposureFieldset).toHaveAttribute('disabled', '')
  await expect(page.getByTestId('readout-onboarding-exposure-house')).toBeVisible()

  // the light step now reads the drawn tree as the answer to what shades the bed
  await step(page, 'light')
  await expect(page.getByTestId('readout-bed-light-surroundings')).toContainText('tree', {
    timeout: BAKE_TIMEOUT_MS,
  })
  await runLightCheck(page)
  await expect
    .poll(async () => numberIn(await dli.textContent()), { timeout: BAKE_TIMEOUT_MS })
    .toBeLessThan(dliBefore)

  // a tree is drawn geometry like a house, so it round-trips through storage the same way
  await page.reload()
  await expect(page.getByTestId('app-root')).toBeVisible()
  await waitForCanvas(page)
  await step(page, 'ground')
  await expect(page.getByTestId('item-tree-tree-1')).toBeVisible()
  await expect(exposureFieldset).toHaveAttribute('disabled', '')

  await page.getByTestId('action-tree-remove-tree-1').click()
  await expect(exposureFieldset).not.toHaveAttribute('disabled', '')
  expect(app.errors).toEqual([])
})
