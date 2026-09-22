import { expect, test, type Page } from '@playwright/test'
import { AUTORUN_TIMEOUT_MS, BAKE_TIMEOUT_MS, openFold, rankedBed, step } from './fixtures/app.ts'
import {
  ACID_PH,
  acidSoilBody,
  cropsUnder,
  openCombinations,
  openPlantPicker,
  plantingCount,
  readBand,
  refusalsByCause,
  setBedSoilPh,
  setPreferenceKind,
  suggestedCombinations,
} from './fixtures/qa.ts'

/**
 * The blueberry journey the combinations exist for. Nothing here asserts an absolute DLI,
 * yield or ratio: what is checked is that a preference reaches the engine, that the engine's
 * refusals reach the screen with their reasoning intact, and that a combination can be
 * planted through the same write-back a manual planting uses.
 *
 * The combinations live on the plants step, behind "All the combinations for Bed N", and they
 * arrive by themselves once the ranking has, so every helper here waits for the ranking and opens
 * the fold, without pressing anything
 */

const anchoredOnBlueberry = async (page: Page): Promise<void> => {
  await rankedBed(page, { soil: acidSoilBody(ACID_PH) })
  await setBedSoilPh(page, ACID_PH)
  await setPreferenceKind(page, 'blueberry', 'require')
  await openCombinations(page)
}

test.describe('polyculture suggestions', () => {
  test.beforeEach(() => {
    test.setTimeout(BAKE_TIMEOUT_MS + 240_000)
  })

  test('a required crop anchors every combination it produces', async ({ page }) => {
    await anchoredOnBlueberry(page)
    await expect(page.getByTestId('readout-polyculture-anchors')).toContainText('blueberry')
    const combinations = await suggestedCombinations(page)
    expect(combinations.length).toBeGreaterThan(0)
    for (const combination of combinations) expect(combination).toContain('blueberry')
  })

  test('the default reading is advice: crops, counts, fit, band and confidence', async ({
    page,
  }) => {
    await anchoredOnBlueberry(page)
    const headline = page.getByTestId('readout-polyculture-headline-0')
    await expect(headline).toContainText('blueberry')
    await expect(headline).toContainText('plants')
    await expect(headline).toContainText('bed')
    await expect(page.getByTestId('badge-polyculture-confidence-0')).toHaveAttribute(
      'data-band',
      /low|moderate|high/,
    )

    // the case for the card is behind its own fold: a ratio is a band and both bounds are on
    // the page. No midpoint is rendered anywhere
    await openFold(page, 'panel-polyculture-breakdown-0')
    const [lower, upper] = await readBand(page.getByTestId('readout-polyculture-ler-0'))
    expect(upper).toBeGreaterThan(lower)
    await expect(page.getByTestId('readout-polyculture-ler-basis-0')).toContainText('interval')
    await expect(page.getByTestId('readout-polyculture-tiers-0')).toContainText('canopy tier')
  })

  test('expanding a suggestion gives the per-term compatibility breakdown', async ({ page }) => {
    await anchoredOnBlueberry(page)
    const breakdown = page.getByTestId('panel-polyculture-breakdown-0')
    await expect(breakdown).not.toHaveAttribute('open', '')
    await breakdown.locator('summary').click()

    const terms = page.locator('[data-testid^="item-polyculture-0-term-"]')
    await expect(terms.first()).toBeVisible()
    const kinds = await terms.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-term') ?? ''),
    )
    expect(kinds).toContain('soil-ph')
    expect(kinds).toContain('canopy-tier')

    // every term declares whether it was allowed to move the number, and says so in words
    const scored = await terms.evaluateAll((nodes) =>
      nodes.map((node) => ({
        scores: node.getAttribute('data-scores') ?? '',
        text: node.textContent ?? '',
      })),
    )
    for (const term of scored) {
      expect(term.text).toContain(
        term.scores === 'true' ? 'scored, moves this pair' : 'no effect on the score',
      )
    }
    // and no grade D or E claim is described here, only counted
    const grades = await page
      .locator('[data-testid^="item-polyculture-0-term-"] [data-grade]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-grade') ?? ''))
    expect(grades).not.toContain('D')
    expect(grades).not.toContain('E')
  })

  test('the pH refusals are surfaced, grouped and argued in prose', async ({ page }) => {
    await anchoredOnBlueberry(page)
    await openFold(page, 'details-plants-refusals')
    const group = page.getByTestId('item-polyculture-refusal-group-soil-ph')
    await expect(group).toBeVisible()
    const refused = await refusalsByCause(page, 'soil-ph')
    expect(refused.length).toBeGreaterThan(5)
    await expect(page.getByTestId('readout-polyculture-refusal-count')).toContainText(
      'were refused for this bed',
    )
    // the refusal is the argument in words: it names both ranges and the compromise
    const first = page.locator('[data-cause="soil-ph"][data-testid^="item-polyculture-refusal-"]')
    await expect(first.first()).toContainText('optimizes at pH')
    await expect(first.first()).toContainText('blueberry')
  })

  test('an excluded crop leaves every combination rather than sinking in the ranking', async ({
    page,
  }) => {
    await anchoredOnBlueberry(page)
    const before = await suggestedCombinations(page)
    const victim = before
      .flatMap((combination) => combination.split('+'))
      .find((cropId) => cropId !== 'blueberry' && cropId.length > 0)
    expect(victim).toBeDefined()
    if (victim === undefined) return

    await setPreferenceKind(page, victim, 'exclude')
    // the combinations follow the ranking the change started, with no press in between
    await openCombinations(page)
    await expect
      .poll(() => suggestedCombinations(page), { timeout: AUTORUN_TIMEOUT_MS })
      .not.toEqual(before)
    for (const combination of await suggestedCombinations(page)) {
      expect(combination.split('+')).not.toContain(victim)
    }
  })

  /**
   * "Plant this combination" either changes the bed in view or prints why not, next to the press,
   * and it REPLACES what the bed holds: a bed given a second combination carries only the second,
   * since carrying both would be a mix nobody chose
   */
  test('applying a suggestion plants the bed, says so, and a second one replaces the first', async ({
    page,
  }) => {
    await anchoredOnBlueberry(page)
    expect(await plantingCount(page)).toBe(0)
    await openCombinations(page)

    const cards = page.locator('[data-testid^="item-polyculture-suggestion-"]')
    const offered = await cards.count()
    expect(offered).toBeGreaterThan(0)

    // the first press plants, and the outcome line beside the press says what went in. The
    // card's crops are read before the press: planting re-ranks the bed, and the cards follow
    const chosen = ((await cards.first().getAttribute('data-crops')) ?? '').split('+')
    await page.getByTestId('action-polyculture-apply-0').click()
    const first = page.getByTestId('status-polyculture-applied-0')
    await expect(first).toContainText(/planted in bed/i)
    const firstPlanted = Number(await first.getAttribute('data-planted'))
    expect(firstPlanted).toBeGreaterThan(0)
    const planted = await cropsUnder(page, 'item-bed-planting-')
    expect(planted.length).toBe(firstPlanted)
    for (const cropId of planted) expect(chosen).toContain(cropId)
    expect(await plantingCount(page)).toBe(planted.length)

    // a second combination, or the same one again when there's only one: either way the bed
    // holds what the last press planted and nothing left over from the one before
    await openCombinations(page)
    const index = (await cards.count()) > 1 ? 1 : 0
    const wanted = ((await cards.nth(index).getAttribute('data-crops')) ?? '').split('+')
    await page.getByTestId(`action-polyculture-apply-${String(index)}`).click()
    const second = page.getByTestId(`status-polyculture-applied-${String(index)}`)
    await expect(second).toContainText(/planted in bed/i)
    const replaced = await cropsUnder(page, 'item-bed-planting-')
    expect(replaced.length).toBe(Number(await second.getAttribute('data-planted')))
    for (const cropId of replaced) expect(wanted).toContain(cropId)
  })

  test('the deeper choices are folded by default and reach the engine when opened', async ({
    page,
  }) => {
    await anchoredOnBlueberry(page)
    const more = page.getByTestId('details-plants-more')
    // opened once already, to require blueberry. A closed step holds nothing in the document,
    // so leaving and coming back is a fresh visit to the step, with the fold shut again
    await step(page, 'ground')
    await openCombinations(page)
    await expect(more).not.toHaveAttribute('open', '')
    await openFold(page, 'details-plants-more')
    // soil pH is the one term the corpus always grades B, so it's always allowed to score
    const weight = page.getByTestId('control-polyculture-weight-soil-ph')
    await expect(weight).toBeVisible()
    await weight.fill('0')
    // a zeroed term is still reported, only with no contribution. The
    // combinations follow the weights by themselves, so nothing is pressed between the two
    await openCombinations(page)
    await openFold(page, 'panel-polyculture-breakdown-0')
    const ph = page
      .locator('[data-testid^="item-polyculture-0-term-"][data-term="soil-ph"]')
      .first()
    await expect(ph).toBeVisible()
    await expect(ph).toContainText('+0.00')
  })

  /**
   * A crop the bed can't grow is never offered as something to like, must have or never: the
   * chips and the rows are drawn from the crops the ranking didn't rule out, so an anchor the
   * bed can't carry can't be asked for and then quietly substituted. The one list that still
   * shows it, the picker, says why it's out
   */
  test("a crop the bed can't grow isn't offered as a like, and the picker says why", async ({
    page,
  }) => {
    await rankedBed(page)
    // the default bed is near-neutral, and blueberry's pH envelope is physiology, so the ranking
    // rules it out before any preference could ask for it
    await expect(page.getByTestId('control-plants-like-blueberry')).toHaveCount(0)
    await openFold(page, 'details-plants-more')
    await expect(page.getByTestId('item-polyculture-preference-blueberry')).toHaveCount(0)

    const picker = await openPlantPicker(page)
    await page.getByTestId('control-bed-crop-all').check()
    const row = picker.getByTestId('item-bed-crop-blueberry')
    await expect(row).toHaveAttribute('data-verdict', 'excluded')
    await expect(row).toContainText(/not suited:/i)
    await expect(row).toContainText(/pH/)
  })
})
