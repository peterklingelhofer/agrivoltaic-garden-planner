import { expect, test, type Page } from '@playwright/test'
import {
  BAKE_TIMEOUT_MS,
  BED_RING,
  drawPolygon,
  LAT,
  LON,
  openApp,
  openFold,
  resolveSite,
  runLightCheck,
  SITE_TIMEOUT_MS,
  step,
} from './fixtures/app.ts'
import { expandAll, readBand, readNumber } from './fixtures/qa.ts'
import { hourlyArchiveBody } from './fixtures/weather.ts'

/**
 * The water balance and the compliance pathway: the two panels that make claims a reader
 * could act on, and the two the product is most obliged to hedge.
 *
 * Nothing asserts a millimeter or a fraction. What is asserted is that the panel says
 * where its numbers came from, that a fallback is never silent, that a shaded bed never
 * needs MORE water than an open one, and that no regime reads as a determination
 */

const REGIMES = [
  'us-ma-smart',
  'de-din-spec-91434',
  'jp-maff',
  'it-dm-436-2023',
  'fr-decret-2024-318',
] as const

/** The same TMY with the wind series flattened, which is what forces the ET0 fallback */
const windlessHourly = (): unknown => {
  const body = hourlyArchiveBody(LAT, LON) as { hourly: Record<string, unknown[]> }
  return {
    hourly: { ...body.hourly, wind_speed_10m: body.hourly.wind_speed_10m?.map(() => 0) ?? [] },
  }
}

const openWater = async (page: Page): Promise<void> => {
  await step(page, 'check')
  await expect(page.getByTestId('panel-water')).toBeVisible()
  await expandAll(page)
}

test('the water panel says what it modeled, per bed, and discloses every unsourced part', async ({
  page,
}) => {
  test.setTimeout(SITE_TIMEOUT_MS + 180_000)
  const app = await openApp(page)
  await resolveSite(page)
  await openWater(page)

  // the standing caveat is a warning that says every figure is modeled
  await expect(page.getByTestId('readout-water-modeled')).toContainText(
    /modeled from a typical weather year/i,
  )
  await expect(page.getByTestId('readout-water-modeled')).toContainText(/can go either way/i)

  /**
   * Decision Record 6 grades water limitation with an index. The readout has to carry the grade,
   * its band and the evidence behind it, since a bare "limited" carries none of them
   */
  const limitation = page.getByTestId('readout-water-limitation')
  await expect(limitation).toContainText(/^(Not limited|Limited)\./)
  await expect(limitation).toContainText(
    /Rain leaves \d+% of the season's water demand unmet \(\d+% [a-z ]*(interval|range): \d+% to \d+%\)/,
  )
  await expect(limitation).toContainText(/\d+ mm of rain, \d+ mm of demand \(reference ET, /)

  // the ET0 method is named, and a fallback is never silent
  const method = (await page.getByTestId('readout-water-method').textContent()) ?? ''
  expect(['FAO-56 Penman-Monteith', 'Hargreaves-Samani']).toContain(method.trim())
  const fallback = page.getByTestId('readout-water-fallback')
  if (method.includes('Hargreaves')) {
    await expect(fallback, 'the ET0 method fell back with no reason on screen').toContainText(
      /supplies no/i,
    )
  } else {
    await expect(fallback).toHaveCount(0)
  }

  for (const id of [
    'water-et0',
    'water-irrigation-open',
    'water-irrigation-panels',
    'water-saving',
    'water-deficit',
    'water-soil',
    'water-rain-split',
  ] as const) {
    await expect(page.getByTestId(`readout-${id}`), id).not.toBeEmpty()
  }

  // both irrigation figures are bands, and the saving is a band with a stated basis
  const open = await readBand(page.getByTestId('readout-water-irrigation-open'))
  const under = await readBand(page.getByTestId('readout-water-irrigation-panels'))
  expect(open[1]).toBeGreaterThanOrEqual(open[0])
  expect(under[1]).toBeGreaterThanOrEqual(under[0])
  await expect(page.getByTestId('readout-water-saving')).toContainText(
    /\d+% [a-z ]*(interval|range)/,
  )
  await expect(page.getByTestId('list-water-band-basis').locator('li').first()).toBeVisible()

  // the shade pathway states whether it's on and why, rather than silently applying
  const shade = page.getByTestId('readout-water-shade-benefit')
  await expect(shade).toHaveAttribute('data-active', /^(true|false)$/)
  await expect(shade).toHaveAttribute('data-scale', /^[\d.]+$/)
  await expect(shade).toContainText(/of its maximum\./)

  await expect(page.getByTestId('list-water-notes').locator('li').first()).toBeVisible()

  // the three unsourced claims, each labeled as such with its justification
  for (const id of ['texture', 'runoff', 'stages'] as const) {
    await expect(page.getByTestId(`readout-water-unsourced-${id}`), id).toContainText(
      /, no source:/i,
    )
  }
  await expect(page.getByTestId('readout-water-unsourced-texture')).toContainText(/FAO-56 Table 19/)
  await expect(page.getByTestId('readout-water-unsourced-runoff')).toContainText(
    /modeling assumptions/i,
  )
  await expect(page.getByTestId('readout-water-unsourced-stages')).toContainText(/FAO-56 Table 11/)
  await expect(page.getByTestId('readout-water-caveat-rain-shadow')).toContainText(
    /rain shadow|under-modeled/i,
  )

  // one balance per bed, and the panel follows the selection
  const beds = page.getByTestId('control-water-bed').locator('option')
  const bedCount = await beds.count()
  expect(bedCount).toBeGreaterThan(1)
  const second = await beds.nth(1).getAttribute('value')
  await page.getByTestId('control-water-bed').selectOption(String(second))
  await expect(page.getByTestId('control-water-bed')).toHaveValue(String(second))
  await expect(page.getByTestId('readout-water-irrigation-open')).not.toBeEmpty()

  // removing a bed removes its balance rather than leaving a stale one behind
  await step(page, 'ground')
  await openFold(page, 'details-ground-beds')
  await page.getByTestId('control-bed-select').selectOption(String(second))
  await page.getByTestId('action-bed-remove').click()
  await openWater(page)
  expect(await page.getByTestId('control-water-bed').locator('option').count()).toBe(bedCount - 1)
  expect(app.errors).toEqual([])
})

/**
 * A silent method swap is the failure mode: Hargreaves-Samani and Penman-Monteith differ
 * by tens of millimeters a year, and a panel that switched without saying so would be
 * presenting a different model under the same label
 */
test('an ET0 fallback always names the upstream that forced it', async ({ page }) => {
  test.setTimeout(SITE_TIMEOUT_MS + 180_000)
  await openApp(page, { hourly: windlessHourly() })
  await resolveSite(page)
  await openWater(page)

  await expect(page.getByTestId('readout-water-method')).toHaveText('Hargreaves-Samani')
  await expect(page.getByTestId('readout-water-fallback')).toContainText(/supplies no wind speed/i)
  await expect(page.getByTestId('readout-water-limitation')).toContainText(/Hargreaves-Samani/)
})

// the site is looked up on mount now, so this asks for a lookup that can't succeed: the point
// is still that a water balance is never modeled against weather the app doesn't have
/**
 * The refusal is the water panel's own, and the caveats beside it aren't conditional on there
 * being numbers to caveat: that is the whole point of a standing caveat. Both are reachable because
 * the Check step waits on nothing, so nothing here is behind a lock
 */
test('the water panel refuses to model anything without a site', async ({ page }) => {
  await openApp(page, { siteUnreachable: true })
  await step(page, 'check')
  await expect(page.getByTestId('status-water')).toContainText(/Look up the place and its weather/i)
  await expect(page.getByTestId('readout-water-modeled')).toBeVisible()
  await expect(page.getByTestId('readout-water-unsourced-texture')).toBeVisible()
})

/**
 * One bake serves both panels: the shade pathway needs a raster to have any shade in it,
 * and every compliance regime is computed from that same raster
 */
test('a baked raster shades the water balance and evaluates all five regimes', async ({ page }) => {
  test.setTimeout(BAKE_TIMEOUT_MS + 300_000)
  const app = await openApp(page)
  await resolveSite(page)
  await drawPolygon(page, 'bed', BED_RING)
  await runLightCheck(page)
  await openWater(page)

  // shade can't cost water: the under-array balance is never thirstier than the open one
  const open = await readBand(page.getByTestId('readout-water-irrigation-open'))
  const under = await readBand(page.getByTestId('readout-water-irrigation-panels'))
  expect(under[0], 'the shaded bed needs more irrigation than the open one').toBeLessThanOrEqual(
    open[0],
  )
  expect(under[1], 'the shaded bed needs more irrigation than the open one').toBeLessThanOrEqual(
    open[1],
  )
  const saving = await readNumber(page.getByTestId('readout-water-saving'))
  expect(saving).toBeGreaterThanOrEqual(0)

  /* ------------------------------ compliance ------------------------------ */

  const panel = page.getByTestId('panel-compliance')
  await expect(panel).toBeVisible()
  await expect(page.getByTestId('readout-compliance-determination')).toContainText(
    /This is an estimate/i,
  )

  for (const regime of REGIMES) {
    await expect(page.getByTestId(`item-compliance-${regime}`), regime).toBeVisible()
    // the standing notice above the cards says it is an estimate, so no card carries a badge for it
    await expect(page.getByTestId(`badge-compliance-${regime}`), regime).toHaveCount(0)
    // an outcome and the barrier that stops it being a determination
    await expect(page.getByTestId(`readout-compliance-overall-${regime}`), regime).not.toBeEmpty()
    await expect(page.getByTestId(`readout-compliance-barrier-${regime}`), regime).not.toBeEmpty()
    // the waiver line shows only where there's a note to show, and Massachusetts has none
    await expect(page.getByTestId(`readout-compliance-waiver-${regime}`), regime).toHaveCount(
      regime === 'us-ma-smart' ? 0 : 1,
    )
    // the outcome text is a design-parameter statement
    await expect(page.getByTestId(`readout-compliance-overall-${regime}`), regime).toHaveText(
      /fast-track limit|need an exception|Can't be checked from the layout alone/i,
    )
  }

  // Massachusetts is the only regime checkable from geometry, so it's the only one with
  // real criteria, and each one has to disclose which window produced its number
  for (const key of [
    'sunlight-everywhere',
    'nameplate-dc',
    'nameplate-ac',
    'dc-ac-ratio',
  ] as const) {
    await expect(page.getByTestId(`item-criterion-${key}`), key).toBeVisible()
  }
  const sunlight = page.getByTestId('item-criterion-sunlight-everywhere')
  await expect(sunlight).toContainText(/at least 50% of open-sky PAR/i)
  await expect(sunlight, "the Growing Season Hours window isn't disclosed").toContainText(
    /Growing Season Hours/,
  )
  await expect(sunlight).toContainText(/every 15 minutes on the local clock/)

  // the waiver and the exception route are said in the barrier line, since Massachusetts has no
  // waiver note of its own
  const barrier = page.getByTestId('readout-compliance-barrier-us-ma-smart')
  await expect(barrier).toContainText(/Every limit can be waived/i)
  await expect(barrier).toContainText(/can still apply for an exception/i)

  // every clearance criterion is per array and names the array it measured
  const clearance = page.getByTestId(/^item-criterion-clearance:/)
  expect(await clearance.count()).toBeGreaterThan(0)
  await expect(clearance.first()).toContainText(/clearance/i)

  // the agronomic regimes can't be checked from geometry and must say exactly that
  for (const regime of REGIMES.filter((id) => id !== 'us-ma-smart')) {
    await expect(page.getByTestId(`readout-compliance-barrier-${regime}`), regime).toContainText(
      /crop yield measured in the field/i,
    )
  }
  expect(app.errors).toEqual([])
})

/**
 * The light comes by itself the moment the place has resolved, so a garden with no light is one
 * whose place couldn't be looked up: that is the state in which the panel has nothing to
 * evaluate, and the one it has to be honest about
 */
test("compliance says the simulation hasn't run rather than rendering an empty verdict", async ({
  page,
}) => {
  await openApp(page, { siteUnreachable: true })
  await step(page, 'check')
  // and offers the bake rather than naming a panel two down the stepper for the visitor to find
  await expect(page.getByTestId('status-compliance')).toContainText(/hasn't been computed yet/i)
  await expect(page.getByTestId('status-compliance-run')).toBeVisible()
  for (const regime of REGIMES) {
    await expect(page.getByTestId(`item-compliance-${regime}`), regime).toHaveCount(0)
  }
  // the standing disclaimer is still there with nothing to disclaim
  await expect(page.getByTestId('readout-compliance-determination')).toBeVisible()
})
