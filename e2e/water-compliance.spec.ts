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
 * Nothing asserts a millimetre or a fraction. What is asserted is that the panel says
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

test('the water panel says what it modelled, per bed, and discloses every unsourced part', async ({
  page,
}) => {
  test.setTimeout(SITE_TIMEOUT_MS + 180_000)
  const app = await openApp(page)
  await resolveSite(page)
  await openWater(page)

  // the standing caveat is a warning, not a footnote: nothing here was measured
  await expect(page.getByTestId('readout-water-modelled')).toContainText(
    /nothing here was measured in your garden/i,
  )
  await expect(page.getByTestId('readout-water-modelled')).toContainText(/flip sign/i)

  /**
   * Decision Record 6 grades water limitation with an index. The readout has to carry the grade,
   * its band and the evidence behind it, since a bare "limited" carries none of them
   */
  const limitation = page.getByTestId('readout-water-limitation')
  await expect(limitation).toContainText(/index \d+\.\d+ \(\d+% to \d+%\)/)
  await expect(limitation).toContainText(/rainfall \d+ mm against \d+ mm reference ET/)
  await expect(limitation).toContainText(/(not )?limited/)
  await expect(limitation).toContainText(/\d+% [a-z ]*(interval|range)/)

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

  // the shade pathway states whether it is on and why, without silently applying
  const shade = page.getByTestId('readout-water-shade-benefit')
  await expect(shade).toHaveAttribute('data-active', /^(true|false)$/)
  await expect(shade).toHaveAttribute('data-scale', /^[\d.]+$/)
  await expect(shade).toContainText(/of its maximum:/)

  await expect(page.getByTestId('list-water-notes').locator('li').first()).toBeVisible()

  // the three unsourced claims, each labelled as such with its justification
  for (const id of ['texture', 'runoff', 'stages'] as const) {
    await expect(page.getByTestId(`readout-water-unsourced-${id}`), id).toContainText(
      /, no source:/i,
    )
  }
  await expect(page.getByTestId('readout-water-unsourced-texture')).toContainText(/FAO-56 Table 19/)
  await expect(page.getByTestId('readout-water-unsourced-runoff')).toContainText(
    /No source quantifies/i,
  )
  await expect(page.getByTestId('readout-water-unsourced-stages')).toContainText(/FAO-56 Table 11/)
  await expect(page.getByTestId('readout-water-caveat-rain-shadow')).toContainText(
    /plan geometry|wind/i,
  )

  // one balance per bed, and the panel follows the selection
  const beds = page.getByTestId('control-water-bed').locator('option')
  const bedCount = await beds.count()
  expect(bedCount).toBeGreaterThan(1)
  const second = await beds.nth(1).getAttribute('value')
  await page.getByTestId('control-water-bed').selectOption(String(second))
  await expect(page.getByTestId('control-water-bed')).toHaveValue(String(second))
  await expect(page.getByTestId('readout-water-irrigation-open')).not.toBeEmpty()

  // removing a bed removes its balance too, leaving nothing stale behind
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
 * by tens of millimetres a year, and a panel that switched without saying so would be
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

// the site is looked up on mount now, so this asks for a lookup that cannot succeed: the point
// is still that a water balance is never modelled against weather the app does not have
/**
 * The refusal is the water panel's own, and the caveats beside it are not conditional on there
 * being numbers to caveat: that is the whole point of a standing caveat. Both are reachable because
 * the Check step waits on nothing, so nothing here is behind a lock
 */
test('the water panel refuses to model anything without a site', async ({ page }) => {
  await openApp(page, { siteUnreachable: true })
  await step(page, 'check')
  await expect(page.getByTestId('status-water')).toContainText(/Look up the place and its weather/i)
  await expect(page.getByTestId('readout-water-modelled')).toBeVisible()
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

  // shade cannot cost water: the under-array balance is never thirstier than the open one
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
    /Not a determination/i,
  )

  for (const regime of REGIMES) {
    await expect(page.getByTestId(`item-compliance-${regime}`), regime).toBeVisible()
    await expect(page.getByTestId(`badge-compliance-${regime}`), regime).toHaveText(
      /estimate only, not a determination/i,
    )
    // an outcome, the barrier that stops it being a determination, and the waiver note
    await expect(page.getByTestId(`readout-compliance-overall-${regime}`), regime).not.toBeEmpty()
    await expect(page.getByTestId(`readout-compliance-barrier-${regime}`), regime).not.toBeEmpty()
    await expect(page.getByTestId(`readout-compliance-waiver-${regime}`), regime).not.toBeEmpty()
    // the outcome text is a design-parameter statement, never a verdict
    await expect(page.getByTestId(`readout-compliance-overall-${regime}`), regime).toHaveText(
      /expedited design parameters|exception request|Cannot be determined/i,
    )
  }

  // Massachusetts is the only regime checkable from geometry, so it is the only one with
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
  await expect(sunlight, 'the Growing Season Hours window is not disclosed').toContainText(
    /Growing Season Hours/,
  )
  await expect(sunlight).toContainText(/225 CMR 28\.02/)

  const waiver = page.getByTestId('readout-compliance-waiver-us-ma-smart')
  await expect(waiver).toContainText(/Shading Analysis Tool/i)
  await expect(waiver).toContainText(/225 CMR 28\.07\(5\)\(b\)3\.b\.iv/)
  await expect(waiver).toContainText(/a miss becomes an exception request/i)

  // every clearance criterion is per array and names the array it measured
  const clearance = page.getByTestId(/^item-criterion-clearance:/)
  expect(await clearance.count()).toBeGreaterThan(0)
  await expect(clearance.first()).toContainText(/clearance/i)

  // the agronomic regimes cannot be checked from geometry and must say exactly that
  for (const regime of REGIMES.filter((id) => id !== 'us-ma-smart')) {
    await expect(page.getByTestId(`readout-compliance-barrier-${regime}`), regime).toContainText(
      /measured agricultural yield/i,
    )
  }
  expect(app.errors).toEqual([])
})

/**
 * The light comes by itself the moment the place has resolved, so a garden with no light is one
 * whose place could not be looked up: that is the state in which the panel has nothing to
 * evaluate, and the one it has to be honest about
 */
test('compliance says the simulation has not run rather than rendering an empty verdict', async ({
  page,
}) => {
  await openApp(page, { siteUnreachable: true })
  await step(page, 'check')
  // and offers the bake here, so the visitor never has to find the light step four steps up
  await expect(page.getByTestId('status-compliance')).toContainText(/hasn't been computed yet/i)
  await expect(page.getByTestId('status-compliance-run')).toBeVisible()
  for (const regime of REGIMES) {
    await expect(page.getByTestId(`item-compliance-${regime}`), regime).toHaveCount(0)
  }
  // the standing disclaimer is still there with nothing to disclaim
  await expect(page.getByTestId('readout-compliance-determination')).toBeVisible()
})
