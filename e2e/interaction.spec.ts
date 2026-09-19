import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  AUTORUN_TIMEOUT_MS,
  BAKE_TIMEOUT_MS,
  BED_RING,
  canvas,
  canvasPixels,
  drawPolygon,
  openApp,
  openFold,
  rankedBed,
  resolveSite,
  runLightCheck,
  step,
} from './fixtures/app.ts'
import {
  addTopRankedPlanting,
  cropsUnder,
  openPlantPicker,
  plantingCount,
  readNumber,
} from './fixtures/qa.ts'

/**
 * Editing, the time scrubber, the overlay and what survives a run.
 *
 * The scene has no DOM, so anything about the 3D view is asserted the way a user sees
 * it: the pixels r3f actually put in the drawing buffer. Everything else is asserted
 * through the readouts the edit is supposed to move
 */

/**
 * Sets a range input with Playwright's `fill`, which assigns the value and fires `input` and
 * `change`
 */
const setRange = async (locator: Locator, value: number): Promise<void> => {
  await locator.fill(String(value))
}

const sunElevation = (page: Page): Promise<number> =>
  readNumber(page.getByTestId('readout-sun-elevation'))

/** The bed tools and the selected bed's fields, which sit behind the ground step's fold */
const bedTools = async (page: Page): Promise<void> => {
  await step(page, 'ground')
  await openFold(page, 'details-ground-beds')
}

const DAYS_PER_YEAR = 365
const wrap = (day: number): number => ((day % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR

/**
 * Puts the scrubber in the middle of a planting's own HARVEST window.
 *
 * The scene draws a planting at its growth stage, so an annual outside its season is genuinely not
 * in the ground and one just sown is a seedling. A drawing-buffer comparison taken on whatever day
 * the app happened to open on would be comparing two bare beds and proving nothing, which is
 * exactly how this spec broke; taken just after sowing it compares two sub-pixel plants, which is
 * how the first repair of it broke. At harvest the plant is at full size whatever its sow day is.
 * The window is read off the row rather than assumed, and a missing attribute fails here rather
 * than silently becoming day zero through `Number(null)`
 */
const scrubToHarvest = async (page: Page, row: Locator): Promise<number> => {
  const dayAttribute = async (name: string): Promise<number> => {
    const raw = await row.getAttribute(name)
    expect(raw, `the planting row carries no ${name}`).not.toBeNull()
    return Number(raw)
  }
  const start = await dayAttribute('data-harvest-start-day')
  const end = await dayAttribute('data-harvest-end-day')
  const midpoint = wrap(start + Math.round(wrap(end - start) / 2) - 1) + 1
  // the scrubber is on Light, the planting row it is timed against is on Plants
  await step(page, 'light')
  await setRange(page.getByTestId('control-time-day'), midpoint)
  await expect(page.getByTestId('control-time-day')).toHaveValue(String(midpoint))
  await openPlantPicker(page)
  // and with the day inside the season, the panel stops saying the bed is bare
  await expect(page.getByTestId('status-bed-season')).toHaveCount(0)
  return midpoint
}

/* ------------------------------- bed editing -------------------------------- */

/**
 * A bed without a pointer, which the editor had no way to make.
 *
 * A corner is placed by a press on the ground and by nothing else: `pushDraftVertex` has one call
 * site in the whole app, inside `Ground.tsx`'s `onPointerDown`. Enter closes a shape and Escape
 * abandons it, so the keyboard can finish a drawing it has no way to start. The only other thing
 * that can add a bed is the conversational agent, which ships switched off, so without
 * `action-bed-add` a basic capability of the editor would hang on a feature nobody has turned on.
 *
 * Driven from the keyboard rather than by clicking the new control, because a control that
 * exists and cannot be reached this way would pass a test that clicked it and still be no use
 * to the person this is for. Shaping the bed afterwards still wants a pointer
 */
test('a bed can be added without ever touching the ground', async ({ page }) => {
  test.setTimeout(180_000)
  await openApp(page)
  await bedTools(page)
  const add = page.getByTestId('action-bed-add')
  await expect(add).toBeVisible()

  const before = await page.getByTestId('list-bed-strip').locator('.bed-card').count()
  await add.focus()
  await expect(add).toBeFocused()
  await page.keyboard.press('Enter')

  const strip = page.getByTestId('list-bed-strip').locator('.bed-card')
  await expect(strip).toHaveCount(before + 1)
  // selected, the same way a drawn bed is, so the panel below is already editing the new one
  await expect(
    page.getByTestId('list-bed-strip').locator('.bed-card[data-selected="true"]'),
  ).toHaveCount(1)
  // and it is a bed of its own rather than a second copy of one that is already there
  const labels = await strip.allInnerTexts()
  expect(new Set(labels).size).toBe(labels.length)
})

test('drawing a bed: every vertex can be undone and the draft can be cancelled', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const app = await openApp(page)
  await bedTools(page)
  const undo = page.getByTestId('action-bed-undo-vertex')
  const close = page.getByTestId('action-bed-close-polygon')
  const cancel = page.getByTestId('action-bed-cancel-draw')

  // nothing drafted: all three draft actions are inert
  await expect(undo).toBeDisabled()
  await expect(close).toBeDisabled()
  await expect(cancel).toBeDisabled()

  await page.getByTestId('action-bed-draw').click()
  const box = await canvas(page).boundingBox()
  expect(box).not.toBeNull()
  const at = (x: number, y: number): [number, number] => [
    box!.x + box!.width * x,
    box!.y + box!.height * y,
  ]

  // the ground is behind a Suspense boundary, so the first click can land on nothing
  await expect(async () => {
    await page.mouse.click(...at(0.42, 0.62))
    await expect(undo).toBeEnabled({ timeout: 2_000 })
  }).toPass({ timeout: 60_000, intervals: [400] })

  await page.mouse.click(...at(0.58, 0.62))
  // two vertices is not a polygon
  await expect(close).toBeDisabled()
  await page.mouse.click(...at(0.58, 0.74))
  await expect(close).toBeEnabled()

  // undo walks the draft back one vertex at a time and disables itself when empty
  await undo.click()
  await expect(close).toBeDisabled()
  await undo.click()
  await undo.click()
  await expect(undo).toBeDisabled()
  await expect(cancel).toBeDisabled()

  // and a cancelled draft leaves no bed behind
  const bedsBefore = await page.getByTestId('control-bed-select').locator('option').count()
  await page.mouse.click(...at(0.42, 0.62))
  await page.mouse.click(...at(0.58, 0.62))
  await expect(cancel).toBeEnabled()
  await cancel.click()
  await expect(undo).toBeDisabled()
  expect(await page.getByTestId('control-bed-select').locator('option').count()).toBe(bedsBefore)

  // a closed ring becomes a bed with a real area
  await drawPolygon(page, 'bed', BED_RING)
  expect(await page.getByTestId('control-bed-select').locator('option').count()).toBe(
    bedsBefore + 1,
  )
  expect(await readNumber(page.getByTestId('readout-bed-area'))).toBeGreaterThan(0)
  expect(app.errors).toEqual([])
})

test('soil, irrigation and bed geometry edits reach the model and can be undone by removal', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const app = await openApp(page)
  await bedTools(page)
  const beds = page.getByTestId('control-bed-select').locator('option')
  const before = await beds.count()
  expect(before).toBeGreaterThan(0)

  await page.getByTestId('control-bed-soil-ph').fill('5.2')
  await expect(page.getByTestId('control-bed-soil-ph')).toHaveValue('5.2')

  await page.getByTestId('control-bed-irrigation').selectOption('subsurface-drip')
  await expect(page.getByTestId('control-bed-irrigation')).toHaveValue('subsurface-drip')

  await page.getByTestId('control-bed-drip-basin').check()
  await expect(page.getByTestId('control-bed-drip-basin')).toBeChecked()

  await page.getByTestId('control-bed-raised-height').fill('0.6')
  await expect(page.getByTestId('control-bed-raised-height')).toHaveValue('0.6')

  await setRange(page.getByTestId('control-bed-plant-year'), 5)
  await expect(page.getByTestId('control-bed-plant-year')).toHaveValue('5')

  // the edits belong to the selected bed alone
  const second = await beds.nth(1).getAttribute('value')
  await page.getByTestId('control-bed-select').selectOption(String(second))
  await expect(page.getByTestId('control-bed-soil-ph')).not.toHaveValue('5.2')
  await expect(page.getByTestId('control-bed-irrigation')).not.toHaveValue('subsurface-drip')

  // and removing a bed removes exactly one
  await page.getByTestId('action-bed-remove').click()
  await expect(beds).toHaveCount(before - 1)
  expect(app.errors).toEqual([])
})

/* -------------------------------- plantings --------------------------------- */

/**
 * The picker is the ranking, so with nothing ranked there is nothing to place. The Plants step
 * waits on the same chain a ranking needs, and the light comes by itself the moment the place and a
 * bed exist, so the place is the one prerequisite a test can keep unmet. With the weather out of
 * reach, the step shows its own lock, names the one thing owed and offers the press, and the picker
 * never mounts
 */
test('placing a plant waits for its prerequisites instead of offering an unranked catalogue', async ({
  page,
}) => {
  await openApp(page, { siteUnreachable: true })
  await bedTools(page)
  await expect(page.getByTestId('readout-bed-plantings')).toHaveText('0')
  await step(page, 'plants')
  const blocked = page.getByTestId('status-step-blocked-plants')
  await expect(blocked).toContainText(/looked up/i, { timeout: 60_000 })
  await expect(page.getByTestId('status-step-blocked-plants-run')).toBeVisible()
  await expect(page.getByTestId('list-bed-crops')).toHaveCount(0)
  await expect(page.getByTestId('action-bed-add-planting')).toHaveCount(0)
  await expect(page.getByTestId('action-plants-fill')).toHaveCount(0)
})

test('a plant can be placed from the ranked picker, edited, seen in the scene and removed', async ({
  page,
}) => {
  test.setTimeout(BAKE_TIMEOUT_MS + 420_000)
  const app = await rankedBed(page)
  expect(await plantingCount(page)).toBe(0)
  const picker = await openPlantPicker(page)

  // the picker is ranked and says why a crop it will not place is out
  const top = picker.getByRole('option').first()
  await expect(top).toHaveAttribute('data-verdict', /recommended|marginal/)
  /*
   * And where the leading crops are level it says so, on the list a grower picks from rather than
   * only on the ranking panel above it. `rank.ts` breaks a score tie on crop id so two runs agree,
   * which is a determinism guarantee that reads on screen as a ranking: without this the top of an
   * open bed's list is alphabetical order wearing one. Asserted as "either tied and said, or not
   * tied", because whether this bed's own leaders are level is a property of the fixture's light
   */
  const tied = page.getByTestId('readout-bed-crops-tied')
  if ((await tied.count()) > 0) await expect(tied).toContainText(/too close together/i)
  await page.getByTestId('control-bed-crop-all').check()
  const excluded = picker.locator('[data-verdict="excluded"]').first()
  await expect(excluded).toContainText(/Not suited:/i)
  await page.getByTestId('control-bed-crop-all').uncheck()

  const cropId = await addTopRankedPlanting(page)

  expect(await plantingCount(page)).toBe(1)
  await openPlantPicker(page)
  expect(await cropsUnder(page, 'item-bed-planting-')).toEqual([cropId])

  const rows = page.locator('[data-testid^="item-bed-planting-"]')
  const row = rows.first()
  // the row's controls sit behind its own "Change or remove" fold
  const change = async (): Promise<void> => {
    await openPlantPicker(page)
    const fold = row.locator('[data-testid^="details-bed-planting-"]')
    if ((await fold.getAttribute('open')) === null) await fold.locator('summary').click()
    await expect(fold).toHaveAttribute('open', '')
  }
  const remove = async (): Promise<void> => {
    await change()
    await row.locator('[data-testid^="action-bed-remove-planting-"]').click()
  }
  await scrubToHarvest(page, row)

  /**
   * The bare reference is taken at that same instant, by lifting the plant back out and putting
   * it straight back in. Same bed, same day, same sun, same everything the renderer reads: the
   * only difference between the two buffers is whether the plant is in the ground
   */
  await remove()
  await expect(rows).toHaveCount(0)
  const bare = await canvasPixels(page)
  // removing changes the bed's own key in `autoRunKey`, which queues a fresh ranking; reading
  // the picker before that settles risks reading the ranking mid-flight, from when the plant
  // now being lifted back out was still occupying the bed
  await expect(page.getByTestId('status-autorun')).toHaveAttribute('data-state', 'ready', {
    timeout: AUTORUN_TIMEOUT_MS,
  })
  expect(await addTopRankedPlanting(page)).toBe(cropId)
  await expect(rows).toHaveCount(1)
  // the scene has no DOM: the only evidence the plant is there is the drawing buffer
  await expect.poll(() => canvasPixels(page), { timeout: 30_000 }).not.toBe(bare)

  // the derived defaults are both editable, and the row reads back what was typed. Excludes
  // the sow-date note, whose own testid shares this one's prefix
  const readout = row.locator(
    '[data-testid^="readout-bed-planting-"]:not([data-testid^="readout-bed-planting-sow-date-"])',
  )
  await change()
  const count = row.locator('[data-testid^="control-bed-planting-count-"]')
  // the count defaulted from the density helper, not from 1
  expect(Number(await count.inputValue())).toBeGreaterThan(1)
  const oneCrop = await canvasPixels(page)

  await count.fill('3')
  await expect(readout).toContainText('3 plants')
  await expect.poll(() => canvasPixels(page), { timeout: 30_000 }).not.toBe(oneCrop)

  // the sow day is the last edit, because moving it past the harvest days the planting already
  // carries leaves the plant a seedling for the whole of its own window, which is honest and
  // is also too small to read in the buffer
  /*
   * A month and a day, not a day-of-year box. A number from 1 to 365 is a calendar nobody owns, so
   * the field is two selects and the edit is made the way it is offered. 30 May IS day 150 on the
   * non-leap reference year the app counts in, and the readout says so
   */
  await row.locator('[data-testid^="control-bed-planting-sow-month-"]').selectOption('5')
  await row.locator('[data-testid^="control-bed-planting-sow-day-"]').selectOption('30')
  await expect(readout).toContainText('day 150')
  // the count survives the sow-day edit: an update patches, it does not rebuild
  await expect(readout).toContainText('3 plants')

  await remove()
  await expect(rows).toHaveCount(0)
  expect(await plantingCount(page)).toBe(0)
  expect(app.errors).toEqual([])
})

/* ------------------------------- time scrubber ------------------------------- */

test('the time scrubber moves the sun readouts and repaints the shadows', async ({ page }) => {
  test.setTimeout(180_000)
  const app = await openApp(page)
  await step(page, 'light')
  // the sun readouts sit behind the time panel's fold
  await openFold(page, 'details-time-sun')

  // the app opens on a fixed day in late July; morning is lower in the sky than midday. The
  // slider runs on the wall clock where the garden is, so 420 is seven in the morning there
  await setRange(page.getByTestId('control-time-minutes'), 420)
  const morning = await sunElevation(page)
  const morningAzimuth = await readNumber(page.getByTestId('readout-sun-azimuth'))
  const morningPixels = await canvasPixels(page)

  await setRange(page.getByTestId('control-time-minutes'), 720)
  await expect.poll(() => sunElevation(page)).not.toBe(morning)
  expect(await sunElevation(page), 'the sun did not rise towards local noon').toBeGreaterThan(
    morning,
  )
  expect(await readNumber(page.getByTestId('readout-sun-azimuth'))).not.toBe(morningAzimuth)
  // the scene has no DOM: the only evidence the shadows moved is the drawing buffer
  await expect.poll(() => canvasPixels(page)).not.toBe(morningPixels)

  // and midsummer stands higher at the same clock time than midwinter at 42 N
  const summer = await sunElevation(page)
  const summerDaylight = await page.getByTestId('readout-sun-daylight').textContent()
  await setRange(page.getByTestId('control-time-day'), 355)
  await expect.poll(() => sunElevation(page)).toBeLessThan(summer)
  const winter = await sunElevation(page)
  await expect(page.getByTestId('readout-sun-daylight')).not.toHaveText(String(summerDaylight))
  await expect(page.getByTestId('readout-sun-source')).not.toBeEmpty()

  // the scrubber is reversible: the same day gives the same sun back
  await setRange(page.getByTestId('control-time-day'), 172)
  await expect.poll(() => sunElevation(page)).toBeGreaterThan(winter)
  expect(app.errors).toEqual([])
})

/* --------------------------------- overlay ---------------------------------- */

/**
 * Switches the automatic light and ranking off, from the one control that governs both.
 *
 * The switch is on the plants step behind "Every crop ranked, and why", which exists only once a
 * ranking has landed, so the garden is ranked first. What it buys the tests below is a light that
 * stays where it is put: with it on, a cancelled run is restarted and a stale one redone before
 * anything about the idle state can be read
 */
const automaticRunsOff = async (page: Page): Promise<void> => {
  await step(page, 'plants')
  await openFold(page, 'details-plants-ranking')
  await page.getByTestId('control-recommendation-autorun').uncheck()
  await expect(page.getByTestId('status-autorun')).toHaveAttribute('data-state', 'off')
}

/**
 * Cancels the light run the press starts, which is the one way to a garden with no light of its
 * own now that the first run comes by itself: a cancel is an answer rather than a pause, so the
 * arrangement is left alone afterwards until it changes.
 *
 * On the CPU reference backend, and that is not a detail. Since the WebGL2 bake was fixed on
 * 2026-09-11 it finishes in tens of milliseconds on a real GPU, measured at 27 ms for the
 * starting plot, which is less time than a press takes to land: a cancel aimed at it hit a run
 * that was already over. The CPU reference takes tens of seconds for the same plot, which is the
 * one run a person could ever interrupt, and cancelling is what is under test here, not the
 * backend. The select sits behind the light step's "How the light was computed" fold
 */
const cancelledRun = async (page: Page): Promise<void> => {
  await step(page, 'light')
  await openFold(page, 'details-sim-how')
  await page.getByTestId('control-sim-backend').selectOption('cpu-reference')
  const status = page.getByTestId('status-simulation')
  await page.getByTestId('action-sim-final').click()
  await expect(status).toHaveAttribute('data-sim-state', 'loading')
  await page.getByTestId('action-sim-cancel').click()
  await expect(status).toHaveAttribute('data-sim-state', 'idle')
}

/**
 * The legend is the key to the ground's colours, pinned over the ground and gated on the field
 * `DliOverlay` paints from. So with no bake there is no legend, because there is no colour for one
 * to explain, and this test is about what the panel owes a grower who has no light yet: which
 * channel is selected, what the others are, and what the one they picked means. The ramp's own
 * caption is asserted where the ramp exists, in the baked test below. The light comes by itself, so
 * "no light yet" is reached by switching the automatic run off and cancelling one, which the app
 * treats as an answer about this arrangement
 */
test('the overlay names its channel before there is anything to show', async ({ page }) => {
  test.setTimeout(BAKE_TIMEOUT_MS + 240_000)
  await rankedBed(page)
  await automaticRunsOff(page)
  await cancelledRun(page)
  const legend = page.getByTestId('readout-overlay-legend')
  /**
   * The panel says what is missing AND offers the press that settles it, so a missing raster can be
   * acted on where it is read
   */
  await expect(page.getByTestId('status-overlay')).toContainText(/hasn't been computed yet/i)
  await expect(page.getByTestId('status-overlay-run')).toBeVisible()
  await expect(legend).toHaveCount(0)

  // every channel is offered in words, so choosing one needs no vocabulary the panel withholds
  const channel = page.getByTestId('control-overlay-channel')
  await expect(channel.locator('option')).toHaveText([
    'Daily light integral',
    'Relative shade ratio',
    'Sky view factor',
    'Rain reaching the ground',
  ])

  await channel.selectOption('rsr')
  await expect(channel).toHaveValue('rsr')
  await expect(page.getByTestId('panel-overlay')).toContainText(/season-cumulative shade fraction/i)

  await channel.selectOption('sky-view-factor')
  await expect(channel).toHaveValue('sky-view-factor')

  await channel.selectOption('dli')
  await page.getByTestId('control-overlay-slice').selectOption('7')
  await expect(page.getByTestId('control-overlay-slice')).toHaveValue('7')
  await page.getByTestId('control-overlay-slice').selectOption('annual')
  await expect(page.getByTestId('control-overlay-slice')).toHaveValue('annual')

  // and nothing claimed a key to a surface that is not there
  await expect(legend).toHaveCount(0)
})

test('a baked raster drives the channel, the monthly slice, the opacity and the backdrop', async ({
  page,
}) => {
  test.setTimeout(BAKE_TIMEOUT_MS + 240_000)
  const app = await openApp(page)
  await resolveSite(page)
  await drawPolygon(page, 'bed', BED_RING)
  await runLightCheck(page)

  const legend = page.getByTestId('readout-overlay-legend')
  await expect(page.getByTestId('status-overlay')).toHaveCount(0)
  const annualMax = Number(await legend.getAttribute('data-max'))
  expect(annualMax).toBeGreaterThan(0)
  // the ramp is described wherever it is drawn, so no colour on the ground is unexplained
  await expect(legend).toContainText(/darker is less, brighter is more/i)
  await expect(legend).toContainText('Daily light integral')
  await expect(legend).toContainText('mol/m²/d')

  // the monthly slice is a real slice of the raster: July stands above January at 42 N
  await page.getByTestId('control-overlay-slice').selectOption('7')
  const july = Number(await legend.getAttribute('data-max'))
  await page.getByTestId('control-overlay-slice').selectOption('1')
  const january = Number(await legend.getAttribute('data-max'))
  expect(july, 'January out-lit July at 42 N').toBeGreaterThan(january)
  await page.getByTestId('control-overlay-slice').selectOption('annual')

  // switching channel switches the scale as well as the caption
  const dliPixels = await canvasPixels(page)
  await page.getByTestId('control-overlay-channel').selectOption('rsr')
  await expect(legend).toContainText('Relative shade ratio')
  await expect(legend).toHaveAttribute('data-max', '1')
  await expect.poll(() => canvasPixels(page)).not.toBe(dliPixels)

  await page.getByTestId('control-overlay-channel').selectOption('sky-view-factor')
  await expect(legend).toContainText('Sky view factor')

  await page.getByTestId('control-overlay-channel').selectOption('dli')
  await expect.poll(async () => Number(await legend.getAttribute('data-max'))).toBe(annualMax)

  // opacity and visibility both reach the ground plane
  const opaque = await canvasPixels(page)
  await setRange(page.getByTestId('control-overlay-opacity'), 0.1)
  await expect(page.getByTestId('panel-overlay')).toContainText('10%')
  await expect.poll(() => canvasPixels(page)).not.toBe(opaque)

  await page.getByTestId('control-overlay-visible').uncheck()
  await expect(page.getByTestId('control-overlay-visible')).not.toBeChecked()
  await page.getByTestId('control-overlay-visible').check()

  // the satellite backdrop is a toggle, and turning it on must not take the canvas down
  await page.getByTestId('control-overlay-imagery').check()
  await expect(page.getByTestId('control-overlay-imagery')).toBeChecked()
  await expect(page.getByTestId('panel-canvas-failed')).toHaveCount(0)
  await page.getByTestId('control-overlay-imagery').uncheck()
  await expect(page.getByTestId('panel-canvas-failed')).toHaveCount(0)
  // the fixture aborts every off-origin request, so the tile fetch the toggle starts is
  // meant to fail here; what matters is that the failure does not reach the scene
  expect(
    app.errors.filter((message) => !/Failed to load resource|ERR_FAILED/i.test(message)),
  ).toEqual([])
})

/* ------------------------------- robustness --------------------------------- */

/**
 * The bake that follows a drawn bed starts by itself, so nothing is pressed here: the state is
 * read off the root, which carries it for whatever waits on a bake from a step that is not the
 * light step, and the steps are switched while it runs. Recorded rather than watched, because
 * on a real GPU the whole run is over in tens of milliseconds and a poll can miss it
 */
test('switching steps mid-bake keeps the canvas mounted and finishes the run', async ({ page }) => {
  test.setTimeout(BAKE_TIMEOUT_MS + 300_000)
  const app = await openApp(page)
  await resolveSite(page)
  await canvas(page).evaluate((node) => {
    ;(node as unknown as Record<string, unknown>).__probe = 'kept'
  })
  const root = page.getByTestId('app-root')
  await root.evaluate((node) => {
    const seen: string[] = [node.getAttribute('data-sim-state') ?? '']
    ;(window as unknown as { __sim: string[] }).__sim = seen
    new MutationObserver(() => seen.push(node.getAttribute('data-sim-state') ?? '')).observe(node, {
      attributes: true,
      attributeFilter: ['data-sim-state'],
    })
  })
  await drawPolygon(page, 'bed', BED_RING)

  // the root carries the run across every step, because the sim panel lives on Light alone
  await step(page, 'plants')
  await expect(page.getByTestId('status-simulation')).toHaveCount(0)
  await expect(root).toHaveAttribute('data-sim-state', /loading|ready/)
  await step(page, 'sources')
  await runLightCheck(page)
  // the drawn bed made the light stale, and the automatic run picked that up after its debounce
  expect(await page.evaluate(() => (window as unknown as { __sim: string[] }).__sim)).toContain(
    'loading',
  )

  // the GL context was never torn down, so the WebGL state and the raster both survived
  expect(
    await canvas(page).evaluate((node) => (node as unknown as Record<string, unknown>).__probe),
  ).toBe('kept')
  await expect(page.getByTestId('panel-canvas-failed')).toHaveCount(0)
  // `reinhart-mf2` is the full check's subdivision: this reads back the subdivision the bake
  // ACTUALLY used, so a readout that did not say so would mean it was not reading the bake
  await openFold(page, 'details-sim-how')
  await expect(page.getByTestId('readout-sim-raster-quality')).toContainText('reinhart-mf2')
  await bedTools(page)
  await expect(page.getByTestId('list-bed-months').locator('li')).toHaveCount(12)

  // and the state the run produced is still there after another round of steps: light having
  // landed, the ranking follows it
  await step(page, 'plants')
  await expect(page.getByTestId('status-autorun')).toHaveAttribute('data-state', /queued|ready/, {
    timeout: AUTORUN_TIMEOUT_MS,
  })
  await bedTools(page)
  await expect(page.getByTestId('readout-bed-annual-dli')).toContainText('mol/m²/d')
  expect(app.errors).toEqual([])
})

/**
 * With the automatic run switched off first, so nothing restarts the run the moment it is
 * cancelled; the press on the light step is offered exactly when the light will not come by
 * itself, and it is what starts the run this cancels
 */
test('cancelling a bake returns the app to idle and leaves it usable', async ({ page }) => {
  test.setTimeout(BAKE_TIMEOUT_MS + 300_000)
  const app = await rankedBed(page)
  await automaticRunsOff(page)
  await step(page, 'light')

  const status = page.getByTestId('status-simulation')
  const cancel = page.getByTestId('action-sim-cancel')
  // nothing to cancel: the press is absent rather than dead
  await expect(cancel).toHaveCount(0)
  await expect(page.getByTestId('action-sim-final')).toBeVisible()

  await cancelledRun(page)

  // idle, not error and not a half-written raster, and the sentence says the run is still owed
  await expect(status).toContainText(/not computed for this arrangement/i)
  await expect(cancel).toHaveCount(0)
  await expect(page.getByTestId('readout-sim-progress')).toHaveCount(0)
  await expect(page.getByTestId('status-overlay')).toBeVisible()
  await expect(page.getByTestId('panel-canvas-failed')).toHaveCount(0)

  // and the cancelled run left nothing that stops the next one: with the automatic run off, the
  // press is the way, and it is still there. Back on the GPU, because forty seconds of CPU bake
  // would prove nothing this run does not
  await page.getByTestId('control-sim-backend').selectOption('webgl2-shadowmap')
  await page.getByTestId('action-sim-final').click()
  await runLightCheck(page)
  await bedTools(page)
  await expect(page.getByTestId('readout-bed-annual-dli')).toContainText('mol/m²/d')
  expect(app.errors).toEqual([])
})

/**
 * A ranking is queued by an edit and runs after a debounce, which is the window in which it can
 * be cancelled. The edit here is a like chip on the plants step, the smallest thing that reaches
 * the ranking's own key; cancelling leaves the ranking that was on screen where it was
 */
test('cancelling a queued ranking leaves the plants step usable', async ({ page }) => {
  test.setTimeout(BAKE_TIMEOUT_MS + 300_000)
  await rankedBed(page)
  await openFold(page, 'details-plants-ranking')
  const autorun = page.getByTestId('status-autorun')

  await page.locator('[data-testid^="control-plants-like-"]').first().click()
  await expect(autorun).toHaveAttribute('data-state', /queued|running/)
  await page.getByTestId('action-recommendation-cancel').click()
  await expect(autorun).toHaveAttribute('data-state', /ready|blocked|queued/, {
    timeout: AUTORUN_TIMEOUT_MS,
  })

  // turning automatic ranking off says so, and the manual re-run still works
  await page.getByTestId('control-recommendation-autorun').uncheck()
  await expect(autorun).toHaveAttribute('data-state', 'off')
  await expect(autorun).toContainText(/Automatic ranking is off/i)

  await page.getByTestId('action-recommendation-rerun').click()
  await expect(page.getByTestId(/^item-recommendation-/).first()).toBeVisible({
    timeout: AUTORUN_TIMEOUT_MS,
  })
})
