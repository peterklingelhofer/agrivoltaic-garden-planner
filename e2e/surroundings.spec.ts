import { expect, test } from '@playwright/test'
import { AUTORUN_TIMEOUT_MS, openApp, openFold, SITE_TIMEOUT_MS, step } from './fixtures/app.ts'

/**
 * Two things real weather can leave silent: the place step not saying whether the place as a whole
 * is one most of the catalog could live in, and the answer to "What is already around the space?"
 * changing nothing in the light or the ranking. Both on the starting plot, whose site resolves at
 * boot on the stubbed weather
 */

const percentOf = async (text: string | null): Promise<number> => {
  const match = /(\d+)%/.exec(text ?? '')
  expect(match, `no percentage in "${String(text)}"`).not.toBeNull()
  return Number(match?.[1] ?? 0)
}

test('the place step says how much of the catalog its climate admits and whether rain covers a garden', async ({
  page,
}) => {
  test.setTimeout(SITE_TIMEOUT_MS + 60_000)
  const app = await openApp(page)
  await step(page, 'place')
  const verdict = page.getByTestId('readout-site-verdict')
  await expect(verdict).toBeVisible({ timeout: SITE_TIMEOUT_MS })
  await expect(verdict).toContainText(/of the catalog grows in this climate: \d+ of \d+ crops\./)
  await expect(page.getByTestId('readout-site-verdict-water')).toContainText(
    /^Rain (is|covers|matches)/,
  )
  expect(app.errors).toEqual([])
})

test('saying the space is in shade most of the day dims every bed and the ranking follows', async ({
  page,
}) => {
  test.setTimeout(SITE_TIMEOUT_MS + AUTORUN_TIMEOUT_MS + 60_000)
  const app = await openApp(page)
  await expect(page.getByTestId('status-site')).toBeHidden({ timeout: SITE_TIMEOUT_MS })

  await step(page, 'light')
  const open = page.getByTestId('readout-bed-light-open-bed-1')
  await expect(open).toBeVisible()
  const before = await percentOf(await open.textContent())
  await expect(page.getByTestId('readout-bed-light-surroundings')).toHaveCount(0)

  await step(page, 'ground')
  await page.getByTestId('control-onboarding-exposure-overshadowed').check()

  await step(page, 'light')
  await expect(page.getByTestId('readout-bed-light-surroundings')).toContainText('60%')
  await expect.poll(async () => percentOf(await open.textContent())).toBeLessThan(before)
  // a sunny bed that loses three fifths of its light before the panels is a shady one
  await expect(page.getByTestId('item-bed-light-bed-1')).toHaveAttribute('data-zone', 'shady')

  // and the crops are ranked against that light: tomato reads as shaded out in bed 1 once the
  // surroundings take their share
  await step(page, 'plants')
  await openFold(page, 'details-plants-ranking')
  await expect(page.getByTestId('status-autorun')).toHaveAttribute('data-state', 'ready', {
    timeout: AUTORUN_TIMEOUT_MS,
  })
  // the ranking shows its head. A crop that dropped out sits past it, behind the switch
  await page.getByTestId('control-recommendation-all').check()
  await expect(
    page.getByTestId('item-recommendation-set-bed-1').getByTestId('badge-verdict-tomato'),
  ).toHaveText('Not suited', { timeout: AUTORUN_TIMEOUT_MS })
  expect(app.errors).toEqual([])
})
