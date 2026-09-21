import { expect, test, type Page } from '@playwright/test'
import {
  BAKE_TIMEOUT_MS,
  LAT,
  LON,
  openApp,
  openFold,
  rankedBed,
  resolveSite,
  SITE_TIMEOUT_MS,
  step,
  type Upstreams,
} from './fixtures/app.ts'
import {
  emptySoilBody,
  hourlyArchiveBody,
  nulledDailyNormalsBody,
  soilBodyWith,
  truncatedDailyNormalsBody,
} from './fixtures/weather.ts'

interface Ranking {
  readonly rows: number
  readonly recommended: number
  readonly unexplained: readonly string[]
}

/**
 * The ranking shows its top twelve and folds the rest behind a switch, because the whole catalog
 * rendered in full runs to tens of thousands of pixels on a phone. These tests are about how many
 * crops SURVIVED a degraded soil read, which is a question about the whole list, so the switch is
 * thrown first. It only exists when there's something folded, hence the count check
 */
const showEveryRankedCrop = async (page: Page): Promise<void> => {
  // the ranking sits behind the plants step's "Every crop ranked, and why" fold
  await step(page, 'plants')
  await openFold(page, 'details-plants-ranking')
  const all = page.getByTestId('control-recommendation-all')
  if ((await all.count()) > 0 && !(await all.isChecked())) await all.check()
}

/** What the ranking panel actually put on the page, and any row that named no limiting factor */
const ranking = (page: Page): Promise<Ranking> =>
  page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-testid^="item-recommendation-"]')]
    const unexplained: string[] = []
    let recommended = 0
    for (const row of rows) {
      const id = (row.getAttribute('data-testid') ?? '').replace('item-recommendation-', '')
      const verdict = row.querySelector('[data-testid^="badge-verdict-"]')?.textContent ?? ''
      if (verdict === 'Recommended') recommended += 1
      const limiting = row.querySelector('[data-testid^="readout-limiting-"]')?.textContent ?? ''
      if (verdict !== 'Recommended' && !/Why:\s*\S/.test(limiting)) unexplained.push(id)
    }
    return { rows: rows.length, recommended, unexplained }
  })

/**
 * SoilGrids answers `mean: null` at a no-data depth. `null / 10` is 0, so a reader that divides
 * without checking collapses the pH envelope to 0 and every crop falls outside it, which empties
 * the list against live data. `src/data/soilgrids.test.ts` pins the reader, and this pins the
 * consequence, which is the part a user would see
 */
const SOIL_CASES: Readonly<Record<string, Upstreams>> = {
  'a no-data depth (mean: null)': { soil: soilBodyWith(null) },
  'an out-of-range pH (mean: 0)': { soil: soilBodyWith(0) },
  'no layers at all': { soil: emptySoilBody() },
}

for (const [label, over] of Object.entries(SOIL_CASES)) {
  test(`SoilGrids returning ${label} still recommends crops`, async ({ page }) => {
    test.setTimeout(BAKE_TIMEOUT_MS + 240_000)
    const app = await rankedBed(page, over)
    await showEveryRankedCrop(page)
    const result = await ranking(page)
    expect(result.rows).toBeGreaterThan(100)
    expect(result.recommended, 'the degraded soil read excluded the whole catalog').toBeGreaterThan(
      0,
    )
    expect(result.unexplained).toEqual([])
    expect(app.errors).toEqual([])
  })
}

const DEGRADED: Readonly<Record<string, Upstreams>> = {
  'soil no-data': { soil: soilBodyWith(null) },
  'soil absent': { soil: emptySoilBody() },
  'elevation absent': { hourly: hourlyArchiveBody(LAT, LON, null) },
}

for (const [label, over] of Object.entries(DEGRADED)) {
  test(`${label}: nothing disappears without an explanation`, async ({ page }) => {
    test.setTimeout(BAKE_TIMEOUT_MS + 240_000)
    const app = await rankedBed(page, over)
    await showEveryRankedCrop(page)
    const result = await ranking(page)

    // the catalog is always ranked in full: an exclusion stays in the list
    // as a row with a reason
    expect(result.rows, 'the recommendation list emptied silently').toBeGreaterThan(100)
    expect(result.unexplained, 'rows with no limiting factor').toEqual([])

    if (result.recommended === 0) {
      // nothing is plantable, so the calendar must say so rather than render blank
      await step(page, 'calendar')
      const feasibility = await page.getByTestId(/^status-calendar-feasibility-/).all()
      expect(feasibility.length).toBeGreaterThan(0)
      for (const notice of feasibility.slice(0, 5)) {
        expect((await notice.textContent()) ?? '').toMatch(/\S/)
      }
    }
    expect(app.errors).toEqual([])
  })
}

/**
 * An elevation nobody answered is null, and the readout names the weather record that carried no
 * height. Rendered as "0.00 m" it would be a real elevation at sea level, and it would feed the PV
 * chain's pressure and air-mass terms as if it had been measured
 */
test('elevation absent: the readout names the weather record and never reads 0.00 m', async ({
  page,
}) => {
  test.setTimeout(SITE_TIMEOUT_MS + 120_000)
  const app = await openApp(page, { hourly: hourlyArchiveBody(LAT, LON, null) })
  await resolveSite(page)
  const readout = page.getByTestId('readout-site-elevation')
  await expect(readout).toContainText(/Open-Meteo/i)
  await expect(readout).not.toContainText('0.00 m')
  expect(app.errors).toEqual([])
})

/**
 * `fetchDailyNormals` counts the values it actually wrote and rejects a response below
 * `MIN_COVERAGE`, the way `soilAt` rejects an implausible pH. Without that check, `series?.[index]
 * ?? 0` would turn an all-null Open-Meteo response into a real 0 C, 0 mm climate, presented at
 * 42.37 N as Koppen EF (ice cap) and USDA 10a (subtropical) in the same panel with no crop
 * recommended and nothing on screen to say why
 */
const UNUSABLE: Readonly<Record<string, unknown>> = {
  'all null': nulledDailyNormalsBody(LAT, LON),
  truncated: truncatedDailyNormalsBody(LAT, LON),
}

for (const [label, daily] of Object.entries(UNUSABLE)) {
  test(`daily normals ${label}: refused, and the refusal is on screen`, async ({ page }) => {
    test.setTimeout(BAKE_TIMEOUT_MS + 120_000)
    const app = await openApp(page, { daily })
    await step(page, 'place')
    // the coordinate fields are reference material and sit behind the fold on this step
    await openFold(page, 'details-site-more')
    await page.getByTestId('control-site-latitude').fill(String(LAT))
    await page.getByTestId('control-site-longitude').fill(String(LON))
    await page.getByTestId('action-site-resolve').click()

    const status = page.getByTestId('status-site')
    await expect(status).toHaveAttribute('data-state', 'error', { timeout: 120_000 })
    // the message must name the upstream and the shortfall
    await expect(status).toContainText(/coverage/i)
    await expect(status).toContainText(/Open-Meteo/i)

    // no fabricated climate anywhere: an ice cap and a subtropical zone can't coexist
    const sidebar = (await page.getByTestId('panel-sidebar').textContent()) ?? ''
    expect(sidebar).not.toMatch(/\bEF\b/)
    expect(app.errors).toEqual([])
  })
}
