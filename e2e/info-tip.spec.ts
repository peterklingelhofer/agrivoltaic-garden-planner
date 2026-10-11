import { expect, test } from '@playwright/test'
import { openApp, SITE_TIMEOUT_MS } from './fixtures/app.ts'

/**
 * The sentence an i holds stays inside its own box.
 *
 * The bubble is a child of the i, so it inherits the text styles of wherever the i stands. Beside a
 * sentence's last word that was `.with-tip`'s `nowrap`, and the bubble's sentence ran on one line
 * out of its 240px box and across the garden, with no background behind it. jsdom lays nothing
 * out, so only a browser can say whether the words fit
 */
test('an i at the end of a sentence opens a bubble that holds its whole sentence', async ({
  page,
}) => {
  await openApp(page)
  // the frost dates are printed once the place the app opens on has been looked up
  const trigger = page.getByTestId('info-season-dates')
  await expect(trigger).toBeVisible({ timeout: SITE_TIMEOUT_MS })
  await trigger.hover()
  const bubble = page.getByTestId('info-season-dates-bubble')
  await expect(bubble).toBeVisible()
  const fit = await bubble.evaluate((node) => ({
    content: node.scrollWidth,
    box: node.clientWidth,
  }))
  expect(fit.content).toBeLessThanOrEqual(fit.box)
})
