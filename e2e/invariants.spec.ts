import { expect, test, type Page } from '@playwright/test'
import { BAKE_TIMEOUT_MS, rankedBed, step, type Step } from './fixtures/app.ts'

/**
 * Every step of the accordion. A scan "everywhere" means every one of the steps in turn, since a
 * closed step holds nothing in the document. The combinations live on the plants step
 */
const STEPS: readonly Step[] = [
  'place',
  'ground',
  'wants',
  'panels',
  'light',
  'plants',
  'calendar',
  'check',
  'sources',
]

/**
 * `textContent` over `innerText`: a string that regressed into the DOM and was then
 * hidden with CSS is still a string this product shipped, and these are the claims
 * the product isn't allowed to make
 */
const domText = async (page: Page): Promise<string> =>
  page.evaluate(() => document.body.textContent ?? '')

/** Open every disclosure so `details` content is in the document and in the scan */
const expandAll = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    for (const node of document.querySelectorAll('details')) node.open = true
  })
  await page.waitForTimeout(250)
}

const eachStep = async (page: Page, visit: (id: Step) => Promise<void>): Promise<void> => {
  for (const id of STEPS) {
    await step(page, id)
    await expandAll(page)
    await visit(id)
  }
}

test('every yield readout is a band, never a point estimate', async ({ page }) => {
  test.setTimeout(BAKE_TIMEOUT_MS + 240_000)
  await rankedBed(page)
  await expandAll(page)

  // one round trip: a ranked bed renders well over a thousand bands and reading each
  // attribute over the wire turns a two second check into a minute
  const audit = await page.evaluate(() => {
    const collapsed: string[] = []
    const unbanded: string[] = []
    const bands = [...document.querySelectorAll('[data-testid^="yield-band-"]')]
    for (const band of bands) {
      const id = band.getAttribute('data-testid') ?? ''
      const lower = Number(band.getAttribute('data-lower'))
      const upper = Number(band.getAttribute('data-upper'))
      const source = band.getAttribute('data-dominant-source') ?? ''
      if (!Number.isFinite(lower) || !Number.isFinite(upper) || source.length === 0) {
        unbanded.push(id)
      } else if (!(upper > lower)) collapsed.push(id)
    }
    // the attribution names the band and the caveats are prose. Every other yield
    // readout is a number a reader could mistake for a prediction
    const numeric = [...document.querySelectorAll('[data-testid^="readout-yield-"]')].filter(
      (node) => !/attribution|caveats/.test(node.getAttribute('data-testid') ?? ''),
    )
    const pointEstimates = numeric
      .filter((node) => !/\d+(\.\d+)?-\d+(\.\d+)?/.test(node.textContent ?? ''))
      .map((node) => `${node.getAttribute('data-testid') ?? ''}: ${node.textContent ?? ''}`)
    return { total: bands.length, numeric: numeric.length, collapsed, unbanded, pointEstimates }
  })

  expect(audit.total).toBeGreaterThan(0)
  expect(audit.numeric).toBeGreaterThan(0)
  expect(audit.unbanded, 'yield bands with no interval or no attribution').toEqual([])
  // a collapsed interval is a point estimate wearing a band's markup
  expect(audit.collapsed, 'yield bands collapsed to a point').toEqual([])
  expect(audit.pointEstimates, 'yield readouts that print a single number').toEqual([])
})

/**
 * Laub et al. 2022 tabulate a 95% CONFIDENCE interval and no prediction interval, so no band may be
 * labeled "prediction interval". The ban is on the labeling phrase, and the noun is allowed:
 * `CROP_RESPONSE_CONTRIBUTION` deliberately renders the sentence that says prediction intervals are
 * unavailable, and deleting it would be the same mistake in the other direction
 */
test('no band is labeled a prediction interval', async ({ page }) => {
  test.setTimeout(BAKE_TIMEOUT_MS + 240_000)
  await rankedBed(page)

  await eachStep(page, async (id) => {
    const text = await domText(page)
    expect(text, `${id} step`).not.toMatch(/\b\d+\s*%\s*(prediction|tolerance)\s+interval/i)
    for (const match of text.matchAll(/\b\d+\s*%\s*(\w+)\s+interval/gi)) {
      expect(match[1]?.toLowerCase(), `${id} step: ${match[0]}`).toBe('confidence')
    }
  })
})

/**
 * No regime is self-verifiable, so nothing the compliance
 * pathway renders may read as a determination. `src/ui/compliance-language.test.ts` pins
 * the label tables. This pins what actually reaches the page, including any regime a
 * second engineer adds
 */
test('no compliance determination reaches the DOM', async ({ page }) => {
  test.setTimeout(BAKE_TIMEOUT_MS + 240_000)
  await rankedBed(page)

  // unambiguous anywhere: no part of this product approves or rejects anything
  const ANYWHERE = /\b(compliant|non-?compliant|approved|rejected|in compliance)\b/i
  // pass/fail is ordinary English elsewhere ("Ranking failed"), so it's banned where a
  // reader would take it for a regulatory verdict
  const REGIME = /\b(compliant|non-?compliant|passe?s?|passed|fails?|failed|approved|rejected)\b/i

  await eachStep(page, async (id) => {
    expect(await domText(page), `${id} step`).not.toMatch(ANYWHERE)
  })

  await step(page, 'check')
  await expandAll(page)
  const panel = page.getByTestId('panel-compliance')
  await expect(panel).toBeVisible()
  expect(await panel.textContent()).not.toMatch(REGIME)
  await expect(page.getByTestId('readout-compliance-determination')).toContainText(
    /This is an estimate/i,
  )
  // the standing notice carries it, so no card has a badge saying it again
  await expect(page.getByTestId(/^badge-compliance-/)).toHaveCount(0)
})

test('grade D and E folklore never scores and never leaves the folklore panel', async ({
  page,
}) => {
  test.setTimeout(BAKE_TIMEOUT_MS + 240_000)
  await rankedBed(page)

  await step(page, 'sources')
  await expandAll(page)
  await expect(page.getByTestId('panel-folklore')).toBeVisible()
  const folkloreIds: string[] = []
  for (const item of await page.getByTestId(/^item-folklore-/).all()) {
    const id = ((await item.getAttribute('data-testid')) ?? '').replace('item-folklore-', '')
    folkloreIds.push(id)
    expect(['D', 'E'], id).toContain(await item.getAttribute('data-grade'))
  }
  expect(folkloreIds.length).toBeGreaterThan(0)

  // no D or E graded thing renders outside the folklore panel, on any step
  await eachStep(page, async (id) => {
    const stray = await page.evaluate(() =>
      [...document.querySelectorAll('[data-grade="D"], [data-grade="E"]')]
        .filter((node) => node.closest('[data-testid="panel-folklore"]') === null)
        .map((node) => node.getAttribute('data-testid') ?? node.textContent),
    )
    expect(stray, `${id} step`).toEqual([])
  })

  await step(page, 'plants')
  await expandAll(page)
  for (const id of folkloreIds) {
    await expect(page.getByTestId(`item-companion-rule-${id}`)).toHaveCount(0)
    await expect(page.getByTestId(`item-experimental-rule-${id}`)).toHaveCount(0)
  }
  // nothing that scores carries a folklore grade
  for (const badge of await page.getByTestId(/^badge-companion-/).all()) {
    expect(['A', 'B']).toContain(await badge.getAttribute('data-grade'))
  }
})

test('grade C renders only as visibly labeled experimental', async ({ page }) => {
  test.setTimeout(BAKE_TIMEOUT_MS + 240_000)
  await rankedBed(page)
  await step(page, 'plants')

  const experimental = page.getByTestId('panel-experimental-rules')
  await expect(experimental).toHaveCount(1)
  // the label must be readable before the disclosure is opened
  await expect(experimental.locator('summary')).toHaveText(/experimental/i)
  await expect(experimental.locator('summary')).toHaveText(/grade c/i)
  await expect(experimental.locator('summary')).toHaveText(/no effect on the ranking/i)

  await expandAll(page)
  expect((await page.getByTestId(/^item-experimental-rule-/).all()).length).toBeGreaterThan(0)
  const stray = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="item-experimental-rule-"]')]
      .filter((node) => node.closest('[data-testid="panel-experimental-rules"]') === null)
      .map((node) => node.getAttribute('data-testid')),
  )
  expect(stray).toEqual([])
})

/**
 * EVERY step is a real document boundary: the accordion renders nothing for a closed step, so the
 * same panels that are asserted present while Sources is open are asserted OUT of the document from
 * every other step
 */
test('a closed step is a separate document, not a hidden section of the one that is open', async ({
  page,
}) => {
  test.setTimeout(BAKE_TIMEOUT_MS + 240_000)
  await rankedBed(page)

  await step(page, 'sources')
  await expect(page.getByTestId('list-sources')).toBeVisible()
  const sourceCount = await page.getByTestId(/^item-source-/).count()
  expect(sourceCount).toBeGreaterThan(50)
  await expect(page.getByTestId('readout-source-count')).toContainText(/\d+ works/)

  for (const id of STEPS.filter((candidate) => candidate !== 'sources')) {
    await step(page, id)
    // count() over toBeVisible(): a CSS-hidden citation list would still be in the DOM
    await expect(page.getByTestId('list-sources'), `${id} step`).toHaveCount(0)
    await expect(page.getByTestId(/^item-source-/), `${id} step`).toHaveCount(0)
    await expect(page.getByTestId('panel-sources'), `${id} step`).toHaveCount(0)
    await expect(page.getByTestId('panel-folklore'), `${id} step`).toHaveCount(0)
  }
})
