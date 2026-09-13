import { expect, test, type Route } from '@playwright/test'
import { LABEL, LAT, LON, openApp, SITE_TIMEOUT_MS, step } from './fixtures/app.ts'
import { geocodeListBody, searchAddress } from './fixtures/qa.ts'

/**
 * The address picker end to end, and the two defects it guards against: a click that sets
 * coordinates and leaves the user to press a second button, which reads as doing nothing, and a
 * hover rule that makes the active row unreadable. Both are reachable in under five seconds of
 * ordinary use.
 *
 * Nothing here asserts a geocoder's answer. It asserts the contract between the list and
 * the rest of the app: the listbox is a listbox, the keyboard reaches every option,
 * Escape puts focus back where it came from, and choosing a result RESOLVES a site
 * rather than filling in two number fields
 */

const HITS = [
  { label: 'Amherst, Hampshire County, Massachusetts', latitudeDeg: LAT, longitudeDeg: LON },
  { label: 'Amherst, Erie County, New York', latitudeDeg: 42.98, longitudeDeg: -78.8 },
  { label: 'Amherst, Lorain County, Ohio', latitudeDeg: 41.4, longitudeDeg: -82.22 },
  { label: 'Amherst, Hillsborough County, New Hampshire', latitudeDeg: 42.86, longitudeDeg: -71.6 },
] as const

const stub = { geocode: geocodeListBody(HITS) }

const option = (label: string): string => `item-site-result-${label}`

test('search results render as a labelled listbox of options', async ({ page }) => {
  const app = await openApp(page, stub)
  const list = await searchAddress(page, 'Amherst')

  await expect(list).toHaveRole('listbox')
  await expect(list).toHaveAttribute('aria-label', 'Address search results')
  await expect(list.getByRole('option')).toHaveCount(HITS.length)
  // the input owns the list, so a screen reader can find it from the field
  const listId = await list.getAttribute('id')
  expect(listId).toBeTruthy()
  await expect(page.getByTestId('control-site-search')).toHaveAttribute(
    'aria-controls',
    String(listId),
  )

  // exactly one option is active, and it is the only one in the tab order. A row prints the
  // name and the region under it, so the label is read back as its two halves
  for (const [index, hit] of HITS.entries()) {
    const row = page.getByTestId(option(hit.label))
    await expect(row).toHaveAttribute('aria-selected', index === 0 ? 'true' : 'false')
    await expect(row).toHaveAttribute('tabindex', index === 0 ? '0' : '-1')
    const [name, ...region] = hit.label.split(', ')
    await expect(row).toContainText(String(name))
    await expect(row).toContainText(region.join(', '))
  }
  expect(app.errors).toEqual([])
})

test('Down, Up, Home and End move the active option and the focus with it', async ({ page }) => {
  await openApp(page, stub)
  await searchAddress(page, 'Amherst')
  const rows = HITS.map((hit) => page.getByTestId(option(hit.label)))

  // ArrowDown from the field opens the list on its first option
  await page.getByTestId('control-site-search').focus()
  await page.keyboard.press('ArrowDown')
  await expect(rows[0]!).toBeFocused()
  await expect(rows[0]!).toHaveAttribute('aria-selected', 'true')

  await page.keyboard.press('ArrowDown')
  await expect(rows[1]!).toBeFocused()
  await expect(rows[0]!).toHaveAttribute('aria-selected', 'false')

  await page.keyboard.press('ArrowUp')
  await expect(rows[0]!).toBeFocused()

  // and it wraps, rather than dead-ending at the edges
  await page.keyboard.press('ArrowUp')
  await expect(rows[HITS.length - 1]!).toBeFocused()

  await page.keyboard.press('Home')
  await expect(rows[0]!).toBeFocused()
  await page.keyboard.press('End')
  await expect(rows[HITS.length - 1]!).toBeFocused()
  await expect(rows[HITS.length - 1]!).toHaveAttribute('aria-selected', 'true')
})

test('Escape dismisses the list and returns focus to the search field', async ({ page }) => {
  await openApp(page, stub)
  const list = await searchAddress(page, 'Amherst')

  await page.getByTestId('control-site-search').focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByTestId(option(HITS[0].label))).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(list).toHaveCount(0)
  await expect(page.getByTestId('control-site-search')).toBeFocused()
  /*
   * Dismissing is not choosing. The highlighted result is not adopted: nothing is selected, and the
   * place is unchanged from the one the app opened on
   */
  await expect(page.getByTestId('readout-site-selection')).toHaveCount(0)
  await expect(page.getByTestId('readout-toolbar-site')).toHaveText(LABEL)
})

test('the Close results button dismisses without choosing', async ({ page }) => {
  await openApp(page, stub)
  const list = await searchAddress(page, 'Amherst')
  await page.getByTestId('action-site-results-dismiss').click()
  await expect(list).toHaveCount(0)
  await expect(page.getByTestId('readout-site-selection')).toHaveCount(0)
})

/**
 * The regression. Choosing a result used to write the coordinates and stop, so the click
 * looked inert until the user found "Resolve these coordinates". Selecting IS resolving:
 * the list closes, the selection is confirmed, and the site readouts fill from the
 * chosen hit rather than from whatever was in the latitude field
 */
test('clicking a result resolves the site, not just the coordinates', async ({ page }) => {
  test.setTimeout(SITE_TIMEOUT_MS + 120_000)
  const app = await openApp(page, stub)
  const list = await searchAddress(page, 'Amherst')

  const chosen = HITS[1]
  await page.getByTestId(option(chosen.label)).click()

  await expect(list).toHaveCount(0)
  await expect(page.getByTestId('readout-site-selection')).toContainText(chosen.label)
  await expect(page.getByTestId('status-site')).toBeHidden({ timeout: SITE_TIMEOUT_MS })

  // resolved, which is the part that was missing: a label, a climate and a timezone
  await expect(page.getByTestId('readout-site-label')).toContainText(chosen.label)
  await expect(page.getByTestId('readout-site-koppen')).toHaveText(/^[A-E]/)
  await expect(page.getByTestId('readout-site-timezone')).not.toBeEmpty()
  await expect(page.getByTestId('readout-toolbar-site')).toContainText(chosen.label)

  // and the coordinate fields agree with the hit, so a later manual resolve is consistent
  await expect(page.getByTestId('control-site-latitude')).toHaveValue(String(chosen.latitudeDeg))
  await expect(page.getByTestId('control-site-longitude')).toHaveValue(String(chosen.longitudeDeg))
  expect(app.errors).toEqual([])
})

test('Enter on a keyboard-selected result resolves the same way a click does', async ({ page }) => {
  test.setTimeout(SITE_TIMEOUT_MS + 120_000)
  await openApp(page, stub)
  await searchAddress(page, 'Amherst')

  await page.getByTestId('control-site-search').focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('End')
  const chosen = HITS[HITS.length - 1]
  await expect(page.getByTestId(option(chosen.label))).toBeFocused()
  await page.keyboard.press('Enter')

  await expect(page.getByTestId('list-site-results')).toHaveCount(0)
  await expect(page.getByTestId('readout-site-selection')).toContainText(chosen.label)
  await expect(page.getByTestId('status-site')).toBeHidden({ timeout: SITE_TIMEOUT_MS })
  await expect(page.getByTestId('readout-site-label')).toContainText(chosen.label)
})

test('a geocoder that answers nothing usable says so instead of placing a pin at 0, 0', async ({
  page,
}) => {
  const app = await openApp(page)
  const startingLatitude = await page.getByTestId('control-site-latitude').inputValue()
  /*
    Both upstreams answer with results that carry no coordinates: the reader rejects them.
    Overridden on the proxy path, where the geocoders sit for the User-Agent the OSM policy asks
    for: a route registered on the upstream HOST would override a leg this build never calls
  */
  const nothingUsable = (route: Route): Promise<void> =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([{ display_name: 'nowhere' }]),
    })
  await page.route('**/api/proxy/nominatim/**', nothingUsable)
  await page.route('**/api/proxy/photon/**', nothingUsable)
  await step(page, 'place')
  await page.getByTestId('control-site-search').fill('nowhere at all')
  await page.getByTestId('action-site-search').click()

  const notice = page.getByTestId('status-site-search')
  await expect(notice).toBeVisible({ timeout: 30_000 })
  await expect(notice).toContainText(/no usable coordinates/i)
  await expect(page.getByTestId('list-site-results')).toHaveCount(0)
  // the coordinate fields still hold the app's own default, untouched by the failed search
  await expect(page.getByTestId('control-site-latitude')).toHaveValue(startingLatitude)
  expect(app.errors).toEqual([])
})

test('a query under three characters never reaches the geocoder', async ({ page }) => {
  await openApp(page, stub)
  const calls: string[] = []
  /**
   * Counted on the PROXY leg, which is where a search goes. No request reaches the upstream host
   * from the browser, so counting there would pass even for a build that searches on every
   * keystroke
   */
  const count = (route: Route): Promise<void> => {
    calls.push(route.request().url())
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(geocodeListBody(HITS)),
    })
  }
  await page.route('**/api/proxy/nominatim/**', count)
  await page.route('**/api/proxy/photon/**', count)
  await step(page, 'place')
  await page.getByTestId('control-site-search').fill('Am')
  await page.getByTestId('action-site-search').click()
  await page.waitForTimeout(2_000)
  expect(calls, 'Nominatim policy: a two character query is not a search').toEqual([])
  await expect(page.getByTestId('list-site-results')).toHaveCount(0)
})
