import { expect, test, type Page } from '@playwright/test'
import { BAKE_TIMEOUT_MS, openApp, openFold, rankedBed, step } from './fixtures/app.ts'
import {
  addTopRankedPlanting,
  designFingerprint,
  forgetDesign,
  reopen,
  saveDesign,
  seedStoredDesign,
  storageState,
  storedDesign,
} from './fixtures/qa.ts'

/**
 * The design is the user's. Everything computed from it is not.
 *
 * A reload keeps the plot, the arrays, the beds, the plantings and every preference, and it loses
 * the light raster, the annual PV energy, the crop ranking and the polyculture suggestions,
 * deliberately: those are derived, they're megabytes, and a stale one shown as current is worse
 * than none. So every assertion below is one of two kinds: this survived, or this was computed
 * again.
 *
 * Nothing here asserts a DLI, a yield, an LER or a kWh figure. The point is what is and
 * isn't restored
 */

/** The array fields, behind the panels step's "Adjust the panels by hand" fold */
const arrayFields = async (page: Page): Promise<void> => {
  await step(page, 'panels')
  await openFold(page, 'details-panels-by-hand')
}

/** The selected bed's fields, behind the ground step's "Change the beds" fold */
const bedFields = async (page: Page): Promise<void> => {
  await step(page, 'ground')
  await openFold(page, 'details-ground-beds')
}

/**
 * What a reload does with the derived slices: none of them is read back off storage, and the two
 * that the garden can't be read without are computed again by themselves.
 *
 * The site is fetched again: a site is what dates a sowing, ranks a crop and balances a bed's
 * water, so leaving it idle left a returning visitor looking at a planted garden beside panels
 * that said nothing had been computed. And the light follows it, the moment
 * the place has resolved and there's a bed: a reload with both lands on a garden whose light is
 * ready without a press. The energy report is the one derived slice that waits to be asked for
 */
const recomputedAfterReload = async (page: Page): Promise<void> => {
  await step(page, 'place')
  await expect(page.getByTestId('status-site')).toHaveCount(0, { timeout: 60_000 })
  await expect(page.getByTestId('app-root')).toHaveAttribute('data-sim-state', 'ready', {
    timeout: BAKE_TIMEOUT_MS,
  })
  await step(page, 'light')
  await expect(page.getByTestId('status-simulation')).toHaveAttribute('data-sim-state', 'ready')
  await arrayFields(page)
  await expect(page.getByTestId('status-energy')).toHaveAttribute('data-state', 'idle')
}

test('the design survives a reload while every computed result is recomputed', async ({ page }) => {
  test.setTimeout(BAKE_TIMEOUT_MS + 240_000)
  await rankedBed(page)
  await addTopRankedPlanting(page)

  // move the array geometry and the bed soil, so both halves of the design are in play
  await arrayFields(page)
  await page.getByTestId('control-array-tilt').fill('33')
  await page.getByTestId('control-array-pitch').fill('7.5')
  await bedFields(page)
  await page.getByTestId('control-bed-soil-ph').fill('6.1')
  await step(page, 'light')
  await page.getByTestId('control-overlay-channel').selectOption('rsr')
  await saveDesign(page)

  const before = await designFingerprint(page)
  expect(before.plantings).not.toBe('0')
  expect(before.beds).toBeGreaterThan(3)

  /*
   * The panel is read BEFORE anything else is looked at. The open step is saved with the design
   * (`persist.ts` records the cost), so every step opened after the reload schedules the
   * debounced write, and once one lands the panel truthfully says saved. Reading the fingerprint
   * first walked three steps and read restored only when they were quick enough. Leaving on the
   * Check step means the reload opens on it, so reading it moves nothing
   */
  await step(page, 'check')
  await reopen(page)

  await step(page, 'check')
  await expect(storageState(page)).toHaveAttribute('data-state', 'restored')
  expect(await designFingerprint(page)).toEqual(before)
  await recomputedAfterReload(page)
})

test('an edit saves itself without being asked, and the reset forgets it', async ({ page }) => {
  test.setTimeout(180_000)
  await openApp(page)
  await arrayFields(page)

  // no click on Save: the debounced writer is what has to pick this up
  await page.getByTestId('control-array-tilt').fill('41')
  await step(page, 'check')
  await expect(storageState(page)).toHaveAttribute('data-state', 'saved', { timeout: 30_000 })

  await reopen(page)
  // restored is read first, on the step the reload opens on: opening the array fields first is
  // a change to the open step, which is saved with the design, and the panel then truthfully
  // says saved as soon as the debounced write lands
  await step(page, 'check')
  await expect(storageState(page)).toHaveAttribute('data-state', 'restored')
  await arrayFields(page)
  await expect(page.getByTestId('control-array-tilt')).toHaveValue('41')

  await forgetDesign(page)
  await arrayFields(page)
  await expect(page.getByTestId('control-array-tilt')).toHaveValue('25')

  /*
   * After a reload the grower's edit is gone, which is the claim. What the panel says is either
   * idle or restored: looking at the Check step after the reset changed the open step, which is
   * saved with the design, so the writer may have put the DEFAULT design back before the reload.
   * `persist.ts` records that cost. The tilt is what proves the reset took
   */
  await reopen(page)
  await step(page, 'check')
  await expect(storageState(page)).toHaveAttribute('data-state', /idle|restored/)
  await arrayFields(page)
  await expect(page.getByTestId('control-array-tilt')).toHaveValue('25')
})

test('a corrupt payload leaves a working app on the default design, and says so', async ({
  page,
}) => {
  await seedStoredDesign(page, '{"version":1,"design":{"plot":{"beds"')
  const app = await openApp(page)
  await step(page, 'check')

  await expect(storageState(page)).toHaveAttribute('data-state', 'discarded')
  await bedFields(page)
  await expect(page.getByTestId('control-bed-select').locator('option')).toHaveCount(3)
  expect(app.errors, `console errors: ${app.errors.join('\n')}`).toEqual([])
})

test("a payload from a schema this build can't read is discarded whole, never half-loaded", async ({
  page,
}) => {
  await seedStoredDesign(
    page,
    JSON.stringify({
      version: 999,
      savedAtUtcMillis: 1_720_000_000_000,
      design: { plantYear: 7, locationLabel: 'Somewhere else', imageryEnabled: true },
    }),
  )
  await openApp(page)
  await step(page, 'check')

  const notice = storageState(page)
  await expect(notice).toHaveAttribute('data-state', 'discarded')
  await expect(notice).toContainText('newer version')
  // not one field of it was taken
  await expect(page.getByTestId('readout-toolbar-site')).not.toContainText('Somewhere else')
  await step(page, 'light')
  await expect(page.getByTestId('control-overlay-imagery')).not.toBeChecked()
  await bedFields(page)
  await expect(page.getByTestId('control-bed-plant-year')).toHaveValue('1')
})

test('a payload with unreadable fields keeps the rest of the design and names what it reset', async ({
  page,
}) => {
  await openApp(page)
  await arrayFields(page)
  await page.getByTestId('control-array-tilt').fill('37')
  await saveDesign(page)

  const saved = JSON.parse((await storedDesign(page)) ?? '{}') as {
    design: Record<string, unknown>
  }
  saved.design.frostPercentile = 'not a percentile'
  await seedStoredDesign(page, JSON.stringify(saved))

  await reopen(page)
  await step(page, 'check')
  const notice = storageState(page)
  await expect(notice).toHaveAttribute('data-state', 'repaired')
  await expect(notice).toContainText('frostPercentile')
  // the design itself is still the grower's, and the bad field is back at its default
  await arrayFields(page)
  await expect(page.getByTestId('control-array-tilt')).toHaveValue('37')
  await step(page, 'place')
  await openFold(page, 'details-site-more')
  await expect(page.getByTestId('control-site-frost-percentile')).toHaveValue('20')
})

test("the panel states what is kept, where it's kept and what is never kept", async ({ page }) => {
  await openApp(page)
  await step(page, 'check')
  const panel = page.getByTestId('panel-storage')
  await expect(panel).toContainText('kept in this browser alone')
  await expect(panel).toContainText('None of it is uploaded or shared')
  await expect(page.getByTestId('readout-storage-scope')).toContainText('No simulation result')
  await expect(page.getByTestId('readout-storage-size')).toBeVisible()
})
