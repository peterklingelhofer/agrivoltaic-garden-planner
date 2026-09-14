import { expect, test } from '@playwright/test'
import {
  AUTORUN_TIMEOUT_MS,
  BAKE_TIMEOUT_MS,
  openApp,
  openFold,
  runLightCheck,
  step,
  waitForCanvas,
} from './fixtures/app.ts'

/**
 * A house drawn on the ground step answers "what shades this bed" itself (Decision Record 26): the
 * light step's figures move with it, the crop ranking follows, and the answer holds across a
 * reload. Pinned on the shipped example, whose bed 1 sits close enough north of the default house
 * that standing it up to 10 m and pulling its north wall in to a metre off the bed throws a shadow
 * across it for the whole growing season
 */

const numberIn = (text: string | null): number => {
  const match = /-?\d+(?:\.\d+)?/.exec(text ?? '')
  expect(match, `no number in "${String(text)}"`).not.toBeNull()
  return Number(match?.[0] ?? 0)
}

test('a house drawn on the ground shades the light and the ranking, and survives a reload', async ({
  page,
}) => {
  test.setTimeout(BAKE_TIMEOUT_MS + AUTORUN_TIMEOUT_MS + 60_000)
  const app = await openApp(page, { exampleGarden: true })
  // the example design and raster arrive over the network after the canvas is already up; the
  // banner is what says they landed, and drawing a house before it does draws on the plot the
  // app started on rather than the example, which the fetch then overwrites from under it
  await expect(page.getByTestId('panel-example')).toBeVisible({ timeout: 60_000 })

  await step(page, 'light')
  const open = page.getByTestId('readout-bed-light-open-bed-1')
  const dli = page.getByTestId('readout-bed-light-dli-bed-1')
  await expect(open).toBeVisible()
  const openBefore = numberIn(await open.textContent())
  const dliBefore = numberIn(await dli.textContent())

  // a disabled fieldset disables every radio inside it but Chromium never marks the fieldset
  // itself :disabled, so toBeDisabled()/toBeEnabled() cannot read it; the attribute is what the
  // component actually sets and what houses.test.tsx already checks it through
  const exposureFieldset = page.getByTestId('control-onboarding-exposure')

  await step(page, 'ground')
  await page.getByTestId('action-house-add').click()
  await page.getByTestId('control-house-height-house-1').fill('10')
  await page.getByTestId('control-house-north-house-1').fill('-19.25')
  await expect(exposureFieldset).toHaveAttribute('disabled', '')
  await expect(page.getByTestId('readout-onboarding-exposure-house')).toBeVisible()

  // the light step now reads the drawn house as the answer to what shades the bed
  await step(page, 'light')
  await expect(page.getByTestId('readout-bed-light-surroundings')).toContainText('house', {
    timeout: BAKE_TIMEOUT_MS,
  })
  await runLightCheck(page)
  await expect
    .poll(async () => numberIn(await open.textContent()), { timeout: BAKE_TIMEOUT_MS })
    .toBeLessThan(openBefore)
  await expect
    .poll(async () => numberIn(await dli.textContent()), { timeout: BAKE_TIMEOUT_MS })
    .toBeLessThan(dliBefore)

  // and the ranking reads the same bed: a house this close is enough to drop tomato off the top
  await step(page, 'plants')
  await openFold(page, 'details-plants-ranking')
  await expect(page.getByTestId('status-autorun')).toHaveAttribute('data-state', 'ready', {
    timeout: AUTORUN_TIMEOUT_MS,
  })
  await page.getByTestId('control-recommendation-all').check()
  await expect(
    page.getByTestId('item-recommendation-set-bed-1').getByTestId('badge-verdict-tomato'),
  ).toHaveText('Not suited', { timeout: AUTORUN_TIMEOUT_MS })

  // a house is drawn geometry like a bed, so it round-trips through storage the same way
  await page.reload()
  await expect(page.getByTestId('app-root')).toBeVisible()
  await waitForCanvas(page)
  await step(page, 'ground')
  await expect(page.getByTestId('item-house-house-1')).toBeVisible()
  await expect(exposureFieldset).toHaveAttribute('disabled', '')

  await page.getByTestId('action-house-remove-house-1').click()
  await expect(exposureFieldset).not.toHaveAttribute('disabled', '')
  expect(app.errors).toEqual([])
})
