import { expect, test, type Locator, type Page } from '@playwright/test'
import { BAKE_TIMEOUT_MS, canvas, openApp, step, waitForCanvas } from './fixtures/app.ts'
import {
  answerEveryQuestion,
  expandAll,
  revealLayout,
  scenarioArchetypes,
  showArchetype,
  storedDesign,
} from './fixtures/qa.ts'

/**
 * The first thirty seconds. Most of this file is about what a visitor who has never used this
 * product sees before they click anything, and nothing in it draws a plot.
 *
 * The camera assertions read a strip of sky only. Foliage has wind in
 * its vertex shader off a shared clock, so the canvas is never twice the same image and "the
 * orbit stopped" can't be asserted from it. Above the horizon there is nothing but the
 * Preetham sky, which is a function of the hour and the view direction: the hour is fixed by
 * the example, so that strip changes when and only when the camera turns
 */
const skyStrip = async (page: Page): Promise<Buffer> => {
  const box = await canvas(page).boundingBox()
  expect(box).not.toBeNull()
  return page.screenshot({
    clip: { x: box!.x + box!.width * 0.55, y: box!.y, width: box!.width * 0.4, height: 70 },
  })
}

const SETTLE_MS = 9_000
const TURN_MS = 4_000

const example = (page: Page): Locator => page.getByTestId('panel-example')

const openExample = async (page: Page): Promise<void> => {
  await openApp(page, { exampleGarden: true })
  await expect(example(page)).toBeVisible({ timeout: 60_000 })
}

const simState = (page: Page): Promise<string | null> =>
  page.getByTestId('app-root').getAttribute('data-sim-state')

test('the example garden is on screen before the first click, and says it is an example', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await openExample(page)

  await expect(example(page)).toContainText('Example garden')
  await expect(example(page)).toContainText('worked example for Amherst')

  // a DLI surface has to say where its numbers came from wherever it is read, and for this one
  // the answer is a bake with a recorded cell size and backend. It's two presses
  // away, behind the banner's "About this example" and then its own fold, both on the banner
  await page.getByTestId('action-example-expand').click()
  await page.getByTestId('action-example-provenance').click()
  const provenance = page.getByTestId('readout-example-provenance')
  await expect(provenance).toContainText('cells at 0.4 m')
  await expect(provenance).toContainText('CPU reference backend')
  await expect(provenance).toContainText('scripts/bake-example-garden.mjs')

  // the raster arrived with the design: the simulation reads ready without a bake being run
  await expect(page.getByTestId('app-root')).toHaveAttribute('data-sim-state', 'ready')
  const legend = page.getByTestId('readout-overlay-legend')
  await expect(legend).toBeVisible()
  expect(Number(await legend.getAttribute('data-max'))).toBeGreaterThan(0)

  // the column is open on its first question, and the site panel says whose garden this is, so the
  // visitor doesn't search for a place that is already on screen
  await expect(page.getByTestId('panel-step-place')).not.toHaveAttribute('hidden', '')
  await expect(page.getByTestId('panel-site')).toContainText('example garden for Amherst')

  // nothing about the example is the visitor's work, so nothing about it is written down
  expect(await storedDesign(page)).toBeNull()
})

test('one control clears the example and leaves the editor it always opened on', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await openExample(page)

  await page.getByTestId('action-example-clear').click()
  await expect(example(page)).toHaveCount(0)
  /*
   * The light field goes with it: a raster left standing over a plot it wasn't baked for is
   * exactly the stale-number-shown-as-current failure the storage policy exists to prevent. The
   * field doesn't stay gone, because the starting plot has a place and beds and the light
   * follows those by itself: what is read here is the example's field being dropped and the
   * starting plot's own arriving in its place
   */
  await expect.poll(() => simState(page), { timeout: 30_000 }).toMatch(/idle|loading/)
  await expect.poll(() => simState(page), { timeout: BAKE_TIMEOUT_MS }).toBe('ready')
  await expect(page.getByTestId('panel-site')).not.toContainText('example garden')
  expect(await storedDesign(page)).toBeNull()
})

test('the guided camera move runs, and the first pointer event stops it dead', async ({ page }) => {
  // biome-ignore lint/suspicious/noSkippedTests: waits on a settled GPU frame; GitHub macOS runners have no real GPU
  test.skip(!!process.env.CI, 'waits on a settled GPU frame; GitHub macOS runners have no real GPU')
  test.setTimeout(240_000)
  // the project asks for reduced motion, which is what keeps the orbit and the wind ticker off the
  // machine for the other tests: this one is about the orbit, so it asks back out, before the first
  // navigation because the preference is read once when the scene mounts
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await openExample(page)
  await page.waitForTimeout(SETTLE_MS)

  const before = await skyStrip(page)
  await page.waitForTimeout(TURN_MS)
  expect(before.equals(await skyStrip(page)), "the camera didn't move on its own").toBe(false)

  const box = await canvas(page).boundingBox()
  await page.mouse.click(box!.x + 40, box!.y + box!.height - 40)
  await page.waitForTimeout(2_000)
  const stopped = await skyStrip(page)
  await page.waitForTimeout(TURN_MS)
  expect(stopped.equals(await skyStrip(page)), 'the camera kept turning after a click').toBe(true)
})

test('prefers-reduced-motion frames the example and never starts the orbit', async ({ page }) => {
  test.setTimeout(240_000)
  // emulated before the first navigation, because the preference is read once when the scene
  // mounts: a tour that could be stopped later by a media query is a tour that already moved
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openExample(page)
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
    true,
  )
  await page.waitForTimeout(SETTLE_MS)

  const before = await skyStrip(page)
  await page.waitForTimeout(TURN_MS)
  expect(before.equals(await skyStrip(page)), 'the camera moved under reduced motion').toBe(true)
  // the framing is where to stand, with no motion: the overlay is still the subject of the shot
  await expect(page.getByTestId('readout-overlay-legend')).toBeVisible()
})

/**
 * What every other spec in this suite is standing on, asserted once where it's the subject. The
 * starting plot is a garden like any other, so its light comes by itself once the place it names
 * has been looked up
 */
test('an unreadable example asset opens the starting plot rather than failing', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const app = await openApp(page)
  await waitForCanvas(page)
  await expect(example(page)).toHaveCount(0)
  await expect(page.getByTestId('panel-site')).not.toContainText('example garden')
  await step(page, 'ground')
  await expect(page.getByTestId('readout-ground-beds')).toContainText('3 beds')
  await expect(page.getByTestId('app-root')).toHaveAttribute('data-sim-state', 'ready', {
    timeout: BAKE_TIMEOUT_MS,
  })
  expect(app.errors).toEqual([])
})

/**
 * The banner goes once a layout is applied. Left up, it would have a grower who answered the
 * questions and applied a layout reading "Nothing here is yours yet" over their own garden, which
 * reads as the questions having done nothing at all
 */
test('applying a layout stops the app calling the scene an example', async ({ page }) => {
  test.setTimeout(300_000)
  await openExample(page)

  await answerEveryQuestion(page)

  // the banner is right until something is applied: nothing on screen is theirs yet
  await expect(example(page)).toBeVisible()

  /*
   * Reading five text cards while the 3D shows somebody else's garden makes the questions look as
   * though they rendered nothing. The 3D follows the tab that is open, so showing another layout
   * has to move the scene
   */
  const shown = await page
    .locator('[data-testid^="item-onboarding-scenario-"]')
    .first()
    .getAttribute('data-archetype')
  const other = (await scenarioArchetypes(page)).find(
    (archetype) => archetype !== shown && archetype !== 'no-array-control',
  )
  expect(other, 'no second layout with panels to show').toBeDefined()
  const beforePreview = await canvas(page).screenshot()
  await showArchetype(page, String(other))
  await expect
    .poll(async () => (await canvas(page).screenshot()).equals(beforePreview), { timeout: 30_000 })
    .toBe(false)
  // and it's a preview: nothing is committed until the apply press
  await expect(page.getByTestId('details-plants-plan')).toHaveCount(0)

  await (await revealLayout(page, 'balanced')).click()
  await expect(page.getByTestId('panel-step-plants')).not.toHaveAttribute('hidden', '')
  await expect(page.getByTestId('details-plants-plan')).toBeAttached({ timeout: 240_000 })
  await expect(example(page), 'the example banner outlived the example').toHaveCount(0)
  await expect(page.getByTestId('badge-plan-archetype')).toHaveAttribute(
    'data-archetype',
    'balanced',
  )
})

test('nothing the example renders reads as a compliance determination', async ({ page }) => {
  test.setTimeout(180_000)
  await openExample(page)
  // compliance language lives only on the Check step
  await step(page, 'check')
  await expandAll(page)
  const text = await page.evaluate(() => document.body.textContent ?? '')
  expect(text).not.toMatch(/\b(compliant|non-?compliant|approved|rejected|in compliance)\b/i)
})
