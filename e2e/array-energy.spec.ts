import { expect, test, type Page } from '@playwright/test'
import { openApp, openFold, resolveSite, SITE_TIMEOUT_MS, step } from './fixtures/app.ts'
import { readBand, readNumber } from './fixtures/qa.ts'

/**
 * PV geometry and the annual energy chain.
 *
 * Not one absolute number is asserted. Every model output here will be retuned, so the
 * assertions are structure (the readout exists and is internally consistent with the
 * others) and DIRECTION (the derived quantity moves the way the geometry says it must).
 * A test pinning "23.4%" would be deleted at the next calibration and would have caught
 * nothing; "widening the pitch lowers the ground cover ratio" survives every retune and
 * fails the moment a sign flips
 */

/**
 * The array editor and the energy report, which sit together behind the panels step's "Adjust
 * the panels by hand" fold: the face of that step is the layout search
 */
const panels = async (page: Page): Promise<void> => {
  await step(page, 'panels')
  await openFold(page, 'details-panels-by-hand')
}

/** The default plot already carries one array; the panel edits a second, added one */
const addArray = async (page: Page): Promise<void> => {
  await panels(page)
  await page.getByTestId('action-array-add').click()
  await expect(page.getByTestId('control-array-select').locator('option')).toHaveCount(2)
  await page.getByTestId('control-array-select').selectOption({ index: 1 })
  await page.getByTestId('control-array-tracking').selectOption('fixed')
  await expect(page.getByTestId('control-array-tilt')).toBeVisible()
}

const gcr = (page: Page): Promise<number> => readNumber(page.getByTestId('readout-array-gcr'))
const projected = (page: Page): Promise<number> =>
  readNumber(page.getByTestId('readout-array-projected-gcr'))
const height = (page: Page): Promise<number> =>
  readNumber(page.getByTestId('readout-array-max-height'))
const nameplate = (page: Page): Promise<number> =>
  readNumber(page.getByTestId('readout-array-nameplate'))

test('geometry edits move the ground cover ratios in the direction the geometry demands', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const app = await openApp(page)
  await addArray(page)

  // a known starting point, so every step below is a single-variable change
  await page.getByTestId('control-array-tilt').fill('25')
  await page.getByTestId('control-array-collector-width').fill('2')
  await page.getByTestId('control-array-pitch').fill('5')
  await page.getByTestId('control-array-clearance').fill('3')
  await expect.poll(() => gcr(page)).toBeGreaterThan(0)

  // GCR is collector width over pitch: spreading the rows lowers it
  const wideBefore = await gcr(page)
  await page.getByTestId('control-array-pitch').fill('8')
  await expect.poll(() => gcr(page)).toBeLessThan(wideBefore)
  const narrowBefore = await gcr(page)
  await page.getByTestId('control-array-pitch').fill('4')
  await expect.poll(() => gcr(page)).toBeGreaterThan(narrowBefore)

  // and a wider collector raises it at fixed pitch
  const widthBefore = await gcr(page)
  await page.getByTestId('control-array-collector-width').fill('3')
  await expect.poll(() => gcr(page)).toBeGreaterThan(widthBefore)

  // projected GCR is the same ratio times cos(tilt): tilting the rows up lowers it and
  // leaves the plan-view ratio alone
  const gcrAtTilt = await gcr(page)
  const projectedBefore = await projected(page)
  await page.getByTestId('control-array-tilt').fill('60')
  await expect.poll(() => projected(page)).toBeLessThan(projectedBefore)
  expect(await gcr(page), 'tilt is not a plan-view quantity').toBeCloseTo(gcrAtTilt, 1)
  // projected never exceeds plan view, at any tilt
  expect(await projected(page)).toBeLessThanOrEqual(await gcr(page))

  await page.getByTestId('control-array-tilt').fill('0')
  expect(await projected(page), 'flat rows project their whole width').toBeCloseTo(
    await gcr(page),
    1,
  )
  expect(app.errors).toEqual([])
})

test('clearance and tilt raise the array, and the module grid raises the nameplate', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await openApp(page)
  await addArray(page)
  await page.getByTestId('control-array-tilt').fill('25')
  await page.getByTestId('control-array-collector-width').fill('2')
  await page.getByTestId('control-array-clearance').fill('2')

  const clearanceBefore = await height(page)
  await page.getByTestId('control-array-clearance').fill('3.4')
  await expect.poll(() => height(page)).toBeGreaterThan(clearanceBefore)

  // max height is clearance plus the collector's rise, so tilting adds to it
  const tiltBefore = await height(page)
  await page.getByTestId('control-array-tilt').fill('45')
  await expect.poll(() => height(page)).toBeGreaterThan(tiltBefore)

  // nameplate is a module count times a module rating: each of the three raises it
  await page.getByTestId('control-array-row-count').fill('2')
  await page.getByTestId('control-array-modules-per-row').fill('4')
  await page.getByTestId('control-array-module-power').fill('400')
  const base = await nameplate(page)
  expect(base).toBeGreaterThan(0)

  await page.getByTestId('control-array-row-count').fill('4')
  await expect.poll(() => nameplate(page)).toBeGreaterThan(base)
  const rows = await nameplate(page)

  await page.getByTestId('control-array-modules-per-row').fill('8')
  await expect.poll(() => nameplate(page)).toBeGreaterThan(rows)
  const modules = await nameplate(page)

  await page.getByTestId('control-array-module-power').fill('600')
  await expect.poll(() => nameplate(page)).toBeGreaterThan(modules)

  // module height sets how many modules stack up the collector slope, so a taller
  // module fits fewer of them into the same collector width
  await page.getByTestId('control-array-collector-width').fill('4')
  await page.getByTestId('control-array-module-height').fill('1')
  await expect.poll(() => nameplate(page)).toBeGreaterThan(0)
  const dense = await nameplate(page)
  await page.getByTestId('control-array-module-height').fill('2')
  await expect.poll(() => nameplate(page)).toBeLessThan(dense)

  // module width does not change the count, so it must not change the nameplate
  const beforeWidth = await nameplate(page)
  await page.getByTestId('control-array-module-width').fill('1.4')
  await expect.poll(() => nameplate(page)).toBe(beforeWidth)
})

test('row azimuth and tracking mode reach the panel', async ({ page }) => {
  test.setTimeout(180_000)
  await openApp(page)
  await addArray(page)

  await page.getByTestId('control-array-row-azimuth').fill('135')
  await expect(page.getByTestId('readout-array-row-azimuth')).toContainText('135')

  // a fixed array exposes tilt and surface azimuth; every tracker exposes a rotation limit
  await expect(page.getByTestId('control-array-azimuth')).toBeVisible()
  for (const mode of [
    'single-axis-horizontal-ns',
    'single-axis-tilted',
    'dual-axis',
    'agro-optimised',
  ] as const) {
    await page.getByTestId('control-array-tracking').selectOption(mode)
    await expect(page.getByTestId('control-array-max-rotation'), mode).toBeVisible()
    await expect(page.getByTestId('control-array-tilt'), mode).toHaveCount(0)
  }
  await page.getByTestId('control-array-tracking').selectOption('fixed')
  await expect(page.getByTestId('control-array-tilt')).toBeVisible()
  await expect(page.getByTestId('control-array-max-rotation')).toHaveCount(0)

  // with no array left the panel says so rather than rendering an empty form
  await page.getByTestId('action-array-remove').click()
  await expect(page.getByTestId('control-array-select').locator('option')).toHaveCount(1)
  await page.getByTestId('action-array-remove').click()
  await expect(page.getByTestId('status-array')).toContainText(/no array/i)
  await expect(page.getByTestId('readout-array-gcr')).toHaveCount(0)
})

/* -------------------------------------------------------------------------------- */
/* Annual energy                                                                      */
/* -------------------------------------------------------------------------------- */

/** The exact annual figure behind the readout, whose text is rounded to two figures */
const annualKwh = async (page: Page): Promise<number> =>
  Number(
    await page
      .getByTestId('readout-energy-annual-ac')
      .locator('[data-kwh]')
      .getAttribute('data-kwh'),
  )

const runEnergy = async (page: Page): Promise<void> => {
  // the energy report sits beside the array editor, on the panels step
  await panels(page)
  await page.getByTestId('control-energy-run').click()
  await expect(page.getByTestId('readout-energy-annual-ac')).toBeVisible({ timeout: 120_000 })
}

test('the energy panel reports a whole chain and stays internally consistent', async ({ page }) => {
  test.setTimeout(SITE_TIMEOUT_MS + 240_000)
  const app = await openApp(page)
  await resolveSite(page)
  await runEnergy(page)

  for (const id of [
    'energy-annual-ac',
    'energy-specific-yield',
    'energy-nameplate-dc',
    'energy-nameplate-ac',
    'energy-dc-ac-ratio',
    'energy-clipping',
    'energy-system-loss',
    'energy-land',
  ] as const) {
    await expect(page.getByTestId(`readout-${id}`), id).not.toBeEmpty()
  }

  const dc = await readNumber(page.getByTestId('readout-energy-nameplate-dc'))
  const ac = await readNumber(page.getByTestId('readout-energy-nameplate-ac'))
  const ratio = await readNumber(page.getByTestId('readout-energy-dc-ac-ratio'))
  expect(dc).toBeGreaterThan(0)
  expect(ac).toBeGreaterThan(0)
  // the ratio is not an independent number: it is the two nameplates
  expect(dc / ac).toBeCloseTo(ratio, 1)

  const annual = await annualKwh(page)
  const specific = await readNumber(page.getByTestId('readout-energy-specific-yield'))
  expect(annual).toBeGreaterThan(0)
  // specific yield is annual AC over the DC nameplate, by definition, within what the
  // rounded specific-yield and nameplate readouts can express
  expect(Math.abs(specific - annual / dc) / specific).toBeLessThan(0.05)

  // the loss stack names every component, and the two the panel derives rather than
  // assumes are called out with the geometry they came from
  await expect(page.getByTestId('list-energy-losses').locator('li').first()).toBeVisible()
  await expect(page.getByTestId('readout-energy-loss-row-shading')).toContainText(
    /pitch, tilt and profile angle/i,
  )
  await expect(page.getByTestId('readout-energy-loss-clipping')).toContainText(/DC:AC ratio/i)
  await expect(page.getByTestId('readout-energy-gain-bifacial')).toContainText(
    /added to the total/i,
  )

  // the LER electricity term is a band with a stated basis, never a bare number
  await expect(page.getByTestId('readout-energy-band-ler-electricity')).toHaveAttribute(
    'data-kind',
    /\S/,
  )
  const [lower, upper] = await readBand(page.getByTestId('readout-energy-ler-electricity'))
  expect(upper, 'the electricity term is a collapsed point, not a band').toBeGreaterThan(lower)
  await expect(page.getByTestId('readout-energy-basis-ler-electricity')).toContainText(
    /dominated by/i,
  )
  await expect(page.getByTestId('list-energy-contributions').locator('li').first()).toBeVisible()

  // the crop term belongs to a planting, so the panel says this is the electricity term on its
  // own rather than presenting it as the whole ratio
  await expect(page.getByTestId('readout-energy-ler-crops-unavailable')).toContainText(
    /electricity term on its own/i,
  )
  await expect(page.getByTestId('readout-energy-band-ler-total')).toHaveCount(0)

  // the denominator is defined on screen: a ratio with an unstated reference is unreadable
  const definition = page.getByTestId('readout-energy-reference-definition')
  await expect(definition).toContainText(/ground cover ratio 0\.40/i)
  await expect(definition).toContainText(/per square metre of land/i)
  await expect(definition).toContainText(/Dupraz/i)
  for (const id of [
    'energy-reference-gcr',
    'energy-reference-tilt',
    'energy-reference-azimuth',
    'energy-reference-yield',
  ] as const) {
    await expect(page.getByTestId(`readout-${id}`), id).not.toBeEmpty()
  }
  // the reference is equator-facing at this northern site
  await expect(page.getByTestId('readout-energy-reference-azimuth')).toContainText('180')

  await expect(page.getByTestId('list-energy-provenance').locator('li').first()).toBeVisible()
  expect(app.errors).toEqual([])
})

/**
 * The headline directional claim of the whole product: spreading the rows to let light
 * reach the crop costs electricity per unit of land, which is the trade the land
 * equivalent ratio exists to express. If this ever inverts, the tool is arguing the
 * opposite of the literature it cites
 */
test('spreading the rows lowers the electricity term of the LER', async ({ page }) => {
  test.setTimeout(SITE_TIMEOUT_MS + 300_000)
  await openApp(page)
  await resolveSite(page)
  await panels(page)
  await page.getByTestId('control-array-tracking').selectOption('fixed')
  await page.getByTestId('control-array-collector-width').fill('2')
  await page.getByTestId('control-array-pitch').fill('4')
  await runEnergy(page)

  const dense = await readBand(page.getByTestId('readout-energy-ler-electricity'))
  const denseLand = await readNumber(page.getByTestId('readout-energy-land'))
  expect(dense[0]).toBeGreaterThan(0)

  // an array edit invalidates the electricity term rather than keeping a stale one
  await panels(page)
  await page.getByTestId('control-array-pitch').fill('12')
  await panels(page)
  await expect(page.getByTestId('status-energy')).toBeVisible()
  await expect(page.getByTestId('readout-energy-annual-ac')).toHaveCount(0)

  await runEnergy(page)
  const spread = await readBand(page.getByTestId('readout-energy-ler-electricity'))
  const spreadLand = await readNumber(page.getByTestId('readout-energy-land'))
  expect(spread[0], 'widening the pitch did not lower the electricity term').toBeLessThan(dense[0])
  expect(spread[1], 'widening the pitch did not lower the electricity term').toBeLessThan(dense[1])
  expect(spreadLand, 'output per land area did not fall with the pitch').toBeLessThan(denseLand)
})

test('turning the array away from the equator costs annual output', async ({ page }) => {
  test.setTimeout(SITE_TIMEOUT_MS + 300_000)
  await openApp(page)
  await resolveSite(page)
  await panels(page)
  await page.getByTestId('control-array-tracking').selectOption('fixed')
  await page.getByTestId('control-array-tilt').fill('30')
  await page.getByTestId('control-array-azimuth').fill('180')
  await runEnergy(page)
  const south = await annualKwh(page)

  await panels(page)
  await page.getByTestId('control-array-azimuth').fill('90')
  await runEnergy(page)
  const east = await annualKwh(page)
  expect(east, 'an east-facing array outproduced a south-facing one at 42 N').toBeLessThan(south)

  // and a bigger module raises it, which is the other half of the same sanity check
  await panels(page)
  await page.getByTestId('control-array-azimuth').fill('180')
  await runEnergy(page)
  const back = await annualKwh(page)
  await panels(page)
  await page.getByTestId('control-array-module-power').fill('900')
  await runEnergy(page)
  expect(await annualKwh(page)).toBeGreaterThan(back)
})

/*
 * The app looks the site up by itself now, so "no site" is a failed lookup rather than one that
 * never happened. The refusal is the energy panel's OWN, and stays that way: the Check step
 * waits on nothing, because the panels on it each know what they are missing and one of them,
 * the saved design, is not about the garden at all and must never be locked away behind it
 */
test('the energy chain refuses to run without a site rather than inventing one', async ({
  page,
}) => {
  await openApp(page, { siteUnreachable: true })
  await panels(page)
  await page.getByTestId('control-energy-run').click()
  const status = page.getByTestId('status-energy')
  await expect(status).toHaveAttribute('data-state', 'error')
  await expect(status).toContainText(/typical meteorological year|never assumed/i)
  await expect(page.getByTestId('readout-energy-annual-ac')).toHaveCount(0)
})

test('the energy chain refuses to run without an array rather than reporting zero', async ({
  page,
}) => {
  test.setTimeout(SITE_TIMEOUT_MS + 120_000)
  await openApp(page)
  await resolveSite(page)
  await panels(page)
  await page.getByTestId('action-array-remove').click()
  await expect(page.getByTestId('status-array')).toContainText(/no array/i)
  await panels(page)
  await page.getByTestId('control-energy-run').click()
  const status = page.getByTestId('status-energy')
  await expect(status).toHaveAttribute('data-state', 'error')
  await expect(status).toContainText(/no electricity without panels/i)
})
