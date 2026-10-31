import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { LABEL, SITE_TIMEOUT_MS, stubUpstreams, watchConsole } from './fixtures/app.ts'

/**
 * The crop finder end to end on the stubbed upstreams: the planner's place search on a page of
 * its own, every crop in the catalog ranked for the place it finds, and the ranking moving when
 * an answer about the ground does. The finder has no scene, so nothing here waits on a canvas
 */
test('a place looked up ranks every crop, and the ground fields re-rank it', async ({ page }) => {
  test.setTimeout(SITE_TIMEOUT_MS + 60_000)
  await stubUpstreams(page)
  const errors = watchConsole(page)
  await page.goto('/crops/')
  await expect(page.getByTestId('crops-root')).toBeVisible()
  await expect(page.getByTestId('status-crops-results')).toBeVisible()

  await page.getByTestId('control-site-search').fill('Amherst')
  await page.getByTestId('action-site-search').click()
  const hit = page.locator('[data-testid^="item-site-result-"]').first()
  await expect(hit).toBeVisible({ timeout: 30_000 })
  await hit.click()
  await expect(page.getByTestId('readout-site-label')).toHaveText(LABEL)

  // the lookup assembles ten stubbed years of weather before anything is ranked
  const rows = page.getByTestId('list-crops-results').locator('tbody tr')
  await expect(rows.first()).toBeVisible({ timeout: SITE_TIMEOUT_MS })
  const count = page.getByTestId('readout-crops-count')
  await expect(count).toHaveText(/^\d+ recommended, \d+ limited, \d+ not suited$/)
  // suited first, in the planner's word for it
  await expect(rows.first().locator('.crops-verdict')).toHaveText('Recommended')

  const open = (await count.textContent()) ?? ''
  await page.getByTestId('control-crops-shade').fill('60')
  await expect(count).not.toHaveText(open)
  // and the address carries the new answer, so a copied link opens on it
  await expect(page).toHaveURL(/[?&]shade=60(&|$)/)

  await page.getByTestId('control-crops-own-ph').uncheck()
  await expect(page.getByTestId('readout-crops-ph-source')).toHaveText(
    'From the soil map for this place: pH 6.4',
  )

  // the whole page, ranked table and all, through the same axe rules the planner's surfaces meet
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze()
  expect(audit.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([])
  expect(errors).toEqual([])
})
