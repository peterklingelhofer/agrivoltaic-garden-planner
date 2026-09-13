import { expect, test } from '@playwright/test'
import {
  AUTORUN_TIMEOUT_MS,
  BAKE_TIMEOUT_MS,
  BED_RING,
  PLOT_RING,
  calendarSowDates,
  canvas,
  canvasPixels,
  dayByKey,
  drawPolygon,
  drawingBuffer,
  openApp,
  openFold,
  rankedBed,
  resolveSite,
  runLightCheck,
  step,
} from './fixtures/app.ts'

const readouts = ['site-koppen', 'site-hardiness', 'site-elevation', 'site-timezone'] as const

test('1: the app mounts a sized canvas with no console or page errors', async ({ page }) => {
  const app = await openApp(page)
  const box = await canvas(page).boundingBox()
  const host = await page.getByTestId('canvas-root').boundingBox()
  expect(box?.width ?? 0).toBeGreaterThan(0)
  expect(box?.height ?? 0).toBeGreaterThan(0)
  expect(box?.width).toBeCloseTo(host?.width ?? 0, 0)
  expect(box?.height).toBeCloseTo(host?.height ?? 0, 0)
  const [bufferWidth, bufferHeight] = await drawingBuffer(page)
  expect(bufferWidth).toBeGreaterThan(0)
  expect(bufferHeight).toBeGreaterThan(0)
  await expect(page.getByTestId('panel-canvas-failed')).toHaveCount(0)
  expect(app.errors).toEqual([])
})

test('2: a manual lat/lon resolves the site readouts', async ({ page }) => {
  const app = await openApp(page)
  await resolveSite(page)
  for (const id of readouts) {
    await expect(page.getByTestId(`readout-${id}`)).not.toBeEmpty()
  }
  await expect(page.getByTestId('readout-site-koppen')).toHaveText(/^[A-E]/)
  // in a gardener's words: "zone 6a (USDA)"
  await expect(page.getByTestId('readout-site-hardiness')).toContainText(/zone \S+ \(USDA\)/)
  await expect(page.getByTestId('readout-site-nrcan-zone')).toHaveCount(0)
  await expect(page.getByTestId('readout-site-attribution')).toContainText('OpenStreetMap')
  expect(app.errors).toEqual([])
})

test('2b: a Canadian site carries the NRCan zone beside the temperature rating, never blended', async ({
  page,
}) => {
  const app = await openApp(page)
  // Toronto, which NRCan's own map service publishes as 7a
  await resolveSite(page, 43.6532, -79.3832)
  await expect(page.getByTestId('readout-site-nrcan-zone')).toHaveText('7a')
  // off the USDA grid the rating is computed from the weather record and says so; either
  // way it is a USDA-scale figure and the Canadian zone stays in its own readout
  await expect(page.getByTestId('readout-site-hardiness')).toContainText(/USDA/)
  await expect(page.getByTestId('readout-site-hardiness')).not.toContainText(/nrcan|Canada/i)
  await expect(page.getByTestId('readout-site-nrcan-note')).toContainText(
    "doesn't convert to a USDA zone",
  )
  await step(page, 'sources')
  await expect(page.getByTestId('item-attribution-nrcan-hardiness')).toContainText(
    'Open Government Licence',
  )
  expect(app.errors).toEqual([])
})

test('3: array geometry edits move both ground cover readouts', async ({ page }) => {
  await openApp(page)
  await drawPolygon(page, 'plot', PLOT_RING)
  // the array editor sits behind the panels step's "Adjust the panels by hand" fold
  await step(page, 'panels')
  await openFold(page, 'details-panels-by-hand')

  await page.getByTestId('action-array-add').click()
  const options = page.getByTestId('control-array-select').locator('option')
  await expect(options).toHaveCount(2)
  await page.getByTestId('control-array-select').selectOption({ index: 1 })

  const gcr = page.getByTestId('readout-array-gcr')
  const projected = page.getByTestId('readout-array-projected-gcr')
  const height = page.getByTestId('readout-array-max-height')

  const pitchBefore = await gcr.textContent()
  await page.getByTestId('control-array-pitch').fill('5')
  await expect(gcr).not.toHaveText(pitchBefore ?? '')

  const tiltBefore = await projected.textContent()
  await page.getByTestId('control-array-tilt').fill('55')
  await expect(projected).not.toHaveText(tiltBefore ?? '')

  const clearanceBefore = await height.textContent()
  await page.getByTestId('control-array-clearance').fill('3.4')
  await expect(height).not.toHaveText(clearanceBefore ?? '')

  const trackingBefore = await projected.textContent()
  await page.getByTestId('control-array-tracking').selectOption('single-axis-horizontal-ns')
  await expect(page.getByTestId('control-array-max-rotation')).toBeVisible()
  await expect(projected).not.toHaveText(trackingBefore ?? '')
})

test('4: a drawn bed takes a light bake, an overlay, a legend and monthly readouts', async ({
  page,
}) => {
  test.setTimeout(BAKE_TIMEOUT_MS + 120_000)
  const app = await openApp(page)
  await resolveSite(page)
  await drawPolygon(page, 'bed', BED_RING)

  const beds = page.getByTestId('control-bed-select').locator('option')
  const bedCount = await beds.count()
  expect(bedCount).toBeGreaterThan(3)

  await runLightCheck(page)
  // `reinhart-mf2` is the full check's subdivision, and the full check is the only one there is
  // since 2026-09-09: this readout reports the subdivision the bake actually used, which is what
  // catches the fixture waiting on something else
  await openFold(page, 'details-sim-how')
  await expect(page.getByTestId('readout-sim-raster-quality')).toContainText('reinhart-mf2')

  await expect(page.getByTestId('status-overlay')).toBeHidden()
  const legend = page.getByTestId('readout-overlay-legend')
  await expect(legend).toBeVisible()
  expect(Number(await legend.getAttribute('data-max'))).toBeGreaterThan(0)

  // the overlay is a scene object with no DOM node, so prove it draws: hiding it changes pixels
  const withOverlay = await canvasPixels(page)
  await page.getByTestId('control-overlay-visible').uncheck()
  await expect.poll(() => canvasPixels(page)).not.toBe(withOverlay)
  await page.getByTestId('control-overlay-visible').check()

  await step(page, 'ground')
  await openFold(page, 'details-ground-beds')
  await expect(page.getByTestId('list-bed-months').locator('li')).toHaveCount(12)
  await expect(page.getByTestId('readout-bed-annual-dli')).toContainText('mol/m²/d')
  await expect(page.getByTestId('readout-bed-homogeneity')).toContainText('min/mean')
  expect(app.errors).toEqual([])
})

test('5: ranking arrives automatically and every crop says what limits it', async ({ page }) => {
  test.setTimeout(BAKE_TIMEOUT_MS + 240_000)
  const app = await rankedBed(page)
  // the whole ranking sits behind the plants step's "Every crop ranked, and why"
  await openFold(page, 'details-plants-ranking')

  const rows = page.getByTestId(/^item-recommendation-/)
  expect(await rows.count()).toBeGreaterThan(0)

  // every crop that is not recommended must say what stopped it. `textContent`, because the
  // badge is set in capitals by the stylesheet and `innerText` reads it as rendered
  const verdicts = await page.getByTestId(/^badge-verdict-/).all()
  expect(verdicts.length).toBeGreaterThan(0)
  for (const badge of verdicts.slice(0, 40)) {
    const cropId = (await badge.getAttribute('data-testid'))?.replace('badge-verdict-', '') ?? ''
    if (((await badge.textContent()) ?? '').trim() === 'Recommended') continue
    await expect(page.getByTestId(`readout-limiting-${cropId}`).first()).toContainText(/Why: \S/)
  }

  await step(page, 'calendar')
  await expect(page.getByTestId('list-calendar')).toBeVisible()
  expect(app.errors).toEqual([])
})

/**
 * The sowing floor is the LATEST of four constraints, each carrying its own basis:
 * the frost anchor plus the crop offset, the soil-temperature crossing, the first
 * adequately lit month and the catalogue sow window. Only a planting the panel
 * reports as `frost-offset` can be moved by the frost dial, and even then not the
 * `start-indoors` row, whose date is the floor counted back by the raising period
 * however the floor was reached. So the dial is tested against the plantings that
 * claim it, not against whichever marker happens to be first in the document
 */
test('6: the calendar dates every crop and the frost dial moves the frost-bound dates', async ({
  page,
}) => {
  test.setTimeout(BAKE_TIMEOUT_MS + 240_000)
  const app = await rankedBed(page)
  await step(page, 'calendar')
  await expect(page.getByTestId('list-calendar')).toBeVisible()
  await expect(page.getByTestId('readout-calendar-axis').locator('span')).toHaveCount(12)

  const BASES = [
    'frost-offset',
    'soil-temperature',
    'light-window',
    'catalog-window',
    'days-to-maturity',
  ]
  const median = await calendarSowDates(page)
  expect(median.length).toBeGreaterThan(0)
  for (const sow of median) {
    // no date without a rule, and no rule outside the closed set the type declares
    expect(BASES, sow.key).toContain(sow.basis)
    expect(sow.day, sow.key).toMatch(/^\d+$/)
  }

  await page.getByTestId('control-calendar-frost-percentile').selectOption('10')
  await step(page, 'plants')
  await expect(page.getByTestId('status-autorun')).toHaveAttribute('data-state', 'ready', {
    timeout: AUTORUN_TIMEOUT_MS,
  })
  await step(page, 'calendar')
  await expect
    .poll(async () => (await calendarSowDates(page)).some((sow) => sow.basis === 'frost-offset'), {
      timeout: AUTORUN_TIMEOUT_MS,
    })
    .toBe(true)
  const conservative = await calendarSowDates(page)
  const was = dayByKey(median)

  // a sowing the panel attributes to the frost anchor must follow it
  const frostBound = conservative.filter(
    (sow) => sow.basis === 'frost-offset' && sow.method !== 'start-indoors',
  )
  expect(
    frostBound.length,
    'no rendered sowing is frost-bound at the conservative percentile',
  ).toBeGreaterThan(0)
  for (const sow of frostBound) {
    expect(sow.day, `${sow.key} did not follow the frost anchor`).not.toBe(was.get(sow.key))
  }

  // and the weaker invariant regardless of which crop happens to be frost-bound here
  expect(conservative.some((sow) => sow.day !== was.get(sow.key))).toBe(true)

  // the two dials are one setting, and the Place step moves the dates back
  await step(page, 'place')
  // the frost-caution select is reference material and sits behind the fold on this step
  await openFold(page, 'details-site-more')
  await page.getByTestId('control-site-frost-percentile').selectOption('50')
  await step(page, 'plants')
  await expect(page.getByTestId('status-autorun')).toHaveAttribute('data-state', 'ready', {
    timeout: AUTORUN_TIMEOUT_MS,
  })
  await step(page, 'calendar')
  await expect(page.getByTestId('control-calendar-frost-percentile')).toHaveValue('50')
  await expect
    .poll(async () => dayByKey(await calendarSowDates(page)).get(frostBound[0]?.key ?? ''), {
      timeout: AUTORUN_TIMEOUT_MS,
    })
    .not.toBe(frostBound[0]?.day)
  expect(app.errors).toEqual([])
})

/**
 * The three tabs this used to cover became ten accordion steps: one panel open at a time,
 * a header that is a button carrying `aria-expanded` rather than `aria-selected`, and
 * ArrowDown/ArrowUp/Home/End walking all ten instead of ArrowLeft/ArrowRight walking three.
 * What made the original worth having is unchanged and is the one thing kept exactly: the
 * canvas is a single mount for the life of the page, and switching what the sidebar shows
 * must never be the reason it remounts
 */
test('7: steps switch by pointer and keyboard without remounting the canvas', async ({ page }) => {
  const app = await openApp(page)
  await canvas(page).evaluate((node) => {
    ;(node as unknown as Record<string, unknown>).__probe = 'kept'
  })

  // pointer: the default step is Place, and only the open step's panel is in the document
  await expect(page.getByTestId('panel-site')).toBeVisible()
  await step(page, 'ground')
  await expect(page.getByTestId('panel-ground')).toBeVisible()
  await expect(page.getByTestId('panel-site')).toHaveCount(0)

  await step(page, 'sources')
  await expect(page.getByTestId('panel-sources')).toBeVisible()

  // keyboard: the header is a button, `aria-expanded` says which one is open, and
  // ArrowDown/ArrowUp/Home/End cycle the ten steps in the order they are answered
  const header = page.getByTestId('action-step-sources')
  await expect(header).toHaveAttribute('aria-expanded', 'true')
  await header.focus()
  await page.keyboard.press('ArrowUp')
  await expect(page.getByTestId('action-step-check')).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('ArrowDown')
  await expect(page.getByTestId('action-step-sources')).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('Home')
  await expect(page.getByTestId('action-step-place')).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('End')
  await expect(page.getByTestId('action-step-sources')).toHaveAttribute('aria-expanded', 'true')

  await step(page, 'place')
  await expect(page.getByTestId('panel-site')).toBeVisible()
  expect(
    await canvas(page).evaluate((node) => (node as unknown as Record<string, unknown>).__probe),
  ).toBe('kept')
  expect(app.errors).toEqual([])
})
