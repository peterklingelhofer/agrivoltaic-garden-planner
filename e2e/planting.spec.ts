import { expect, test, type Page } from '@playwright/test'
import { AUTORUN_TIMEOUT_MS, openApp, openFold, step } from './fixtures/app.ts'
import { answerEveryQuestion, DESIGN_TIMEOUT_MS, revealLayout } from './fixtures/qa.ts'

/**
 * What a layout plants, and what a grower can do about it on the plants step.
 *
 * Which crops a bed can carry is decided against the light that bed actually gets, and no such
 * light exists until a layout does, so applying one plants every bed it places and lands on the
 * step that shows the result. These walk the whole path from the questions rather than seeding a
 * design, because the thing under test is the handover between the search and the beds, not the
 * step in isolation. Everything upstream is stubbed by `openApp`, weather included, so the search
 * runs here with no worker and no network
 */

const plantedFromLayout = async (page: Page): Promise<void> => {
  await answerEveryQuestion(page)
  await (await revealLayout(page, 'balanced')).click()
  await expect(page.getByTestId('panel-step-plants')).not.toHaveAttribute('hidden', '')
  await expect(page.getByTestId('readout-plants-status')).toContainText(
    /planted for you from the balanced layout/i,
    { timeout: DESIGN_TIMEOUT_MS },
  )
}

test('applying a layout plants every bed, and another mix can be tried on any of them', async ({
  page,
}) => {
  test.setTimeout(420_000)
  await openApp(page)
  await plantedFromLayout(page)

  // one card per bed, each saying what went in
  const cards = page.locator('[data-testid^="item-plants-bed-"]')
  expect(await cards.count()).toBeGreaterThan(0)
  for (const mix of await page.locator('[data-testid^="readout-plants-mix-"]').all()) {
    await expect(mix).not.toContainText(/nothing in it/i)
  }

  // the selected bed is the one that carries its counts, its confidence and its two presses
  const bedId = (await cards.first().getAttribute('data-bed')) ?? ''
  expect(bedId).not.toBe('')
  await page.getByTestId(`action-plants-select-${bedId}`).click()
  await expect(cards.first()).toHaveAttribute('data-selected', 'true')
  await expect(page.getByTestId(`readout-plants-counts-${bedId}`)).toHaveText(/\d/)
  // the bed holds one of the combinations computed for it, and says how sure that was
  await expect(page.getByTestId(`badge-plants-confidence-${bedId}`)).toHaveAttribute(
    'data-band',
    /low|moderate|high/,
  )

  /*
   * Either another mix fits this bed, and pressing for it replaces what the bed holds and says
   * which one it is; or none does, and the press says so rather than sitting there dead. Silence
   * is the one outcome the press must never produce
   */
  const mix = page.getByTestId(`readout-plants-mix-${bedId}`)
  const before = await mix.textContent()
  const next = page.getByTestId(`action-plants-next-mix-${bedId}`)
  if (await next.isEnabled()) {
    await next.click()
    await expect(page.getByTestId(`status-plants-mix-${bedId}`)).toContainText(/Mix \d+ of \d+/)
    await expect(mix).not.toHaveText(before ?? '')
  } else {
    await expect(next).toContainText(/no other mix fits/i)
  }
})

/**
 * The handover, which is the last thing the search does and the first thing the plants step says.
 * It exists so the end of the questions shows that the design can be edited, and that the light
 * simulation and the planting calendar exist. The step says where the plants came from and what
 * light they rest on, and every way on from it is a press on the same screen
 */
test('the plants step says what it planted and offers the ways on', async ({ page }) => {
  test.setTimeout(420_000)
  await openApp(page)
  await plantedFromLayout(page)

  // the light the planting rests on is the full check, run by itself, and the row above says so
  await expect(page.getByTestId('readout-plants-status')).toHaveAttribute(
    'data-light',
    'full check done',
    { timeout: AUTORUN_TIMEOUT_MS },
  )
  await expect(page.getByTestId('readout-step-summary-light')).toHaveText('Computed')
  // and the whole thing can be put back from one press, offered beside the one that replants
  await expect(page.getByTestId('action-plants-undo')).toBeVisible()
  await expect(page.getByTestId('action-plants-fill')).toContainText(/plant every bed again/i)

  // a plant to change: the press on a bed's card opens the picker for that bed, with the search
  // field in view, which is what anyone looking for one plant needs next
  const bedId =
    (await page.locator('[data-testid^="item-plants-bed-"]').first().getAttribute('data-bed')) ?? ''
  await page.getByTestId(`action-plants-select-${bedId}`).click()
  await page.getByTestId(`action-plants-edit-${bedId}`).click()
  await expect(page.getByTestId('details-plants-by-hand')).toHaveAttribute('open', '')
  await expect(page.getByTestId('control-bed-crop-search')).toBeVisible()
  await expect(page.getByTestId('list-bed-plantings')).toBeVisible()

  // the whole ranking with its reasons, one fold away
  await openFold(page, 'details-plants-ranking')
  await expect(page.locator('[data-testid^="item-recommendation-"]').first()).toBeVisible({
    timeout: AUTORUN_TIMEOUT_MS,
  })

  // and the way forward is the foot of the step, naming where it goes
  await expect(page.getByTestId('action-step-next')).toContainText(/when to plant and harvest/i)
  await page.getByTestId('action-step-next').click()
  await expect(page.getByTestId('panel-step-calendar')).not.toHaveAttribute('hidden', '')
  // the closed row keeps the record of what was planted
  await expect(page.getByTestId('readout-step-summary-plants')).toContainText(/bed/i)
})

/**
 * A picture beside every crop, in every list that names one.
 *
 * The claim is coverage rather than appearance: every row in all five lists carries one, none of
 * them is empty, and no row falls back to the class silhouette, which is what a crop with no
 * sprite would get. `crop-sprite.test.ts` holds the table total against the catalogue; this holds
 * that the table is actually reached from the places a crop is named.
 *
 * Also that they are silent. The crop's name is right beside the picture, so one that announced
 * itself would make every row in a 182-row list say its class twice
 */
test('every crop in every list is drawn as well as named', async ({ page }) => {
  test.setTimeout(420_000)
  await openApp(page, { exampleGarden: true })
  await step(page, 'plants')
  // the picker and the preferences sit behind folds on the plants step, opened so the rows are
  // read as a visitor sees them rather than only as the document holds them
  await openFold(page, 'details-plants-by-hand')
  await expect(page.locator('[data-testid^="item-bed-crop-"]').first()).toBeVisible({
    timeout: DESIGN_TIMEOUT_MS,
  })
  await openFold(page, 'details-plants-more')
  await openFold(page, 'details-plants-ranking')

  const readLists = async (): Promise<Record<string, { total: number; drawn: number }>> =>
    page.evaluate(() => {
      /*
        `data-crop` and not the testid prefix alone: the agenda's own prefix also matches its
        group headings and its supply headings, which name a KIND of job rather than a crop and
        have nothing to draw. Every row that names a crop carries the crop it names
      */
      const rows = (prefix: string): { total: number; drawn: number } => {
        const found = [...document.querySelectorAll(`[data-testid^="${prefix}"][data-crop]`)]
        return {
          total: found.length,
          drawn: found.filter((row) => row.querySelector('.crop-sprite') !== null).length,
        }
      }
      return {
        picker: rows('item-bed-crop-'),
        ranking: rows('item-recommendation-'),
        preferences: rows('item-polyculture-preference-'),
        calendar: rows('item-calendar-crop-'),
        agenda: rows('item-agenda-'),
      }
    })

  const onPlants = await readLists()
  await step(page, 'calendar')
  const onCalendar = await readLists()

  const lists = {
    picker: onPlants.picker,
    ranking: onPlants.ranking,
    preferences: onPlants.preferences,
    calendar: onCalendar.calendar,
    // the dated jobs, where the picture is mid-sentence rather than at the head of a row: the
    // swatch beside it is the ACTION's colour and says something else entirely
    agenda: onCalendar.agenda,
  }
  for (const [name, counted] of Object.entries(lists)) {
    expect(counted?.total ?? 0, `${name} has no rows to draw`).toBeGreaterThan(0)
    expect(counted?.drawn, `${name} has rows with no picture`).toBe(counted?.total)
  }

  const drawn = await page.evaluate(() => ({
    // every one of them decorative: the row says the crop's name itself
    silent: [...document.querySelectorAll('.crop-sprite')].every(
      (sprite) => sprite.getAttribute('aria-hidden') === 'true',
    ),
    // and every one actually drew something rather than rendering an empty box
    shapes: [...document.querySelectorAll('.crop-sprite')].every(
      (sprite) => sprite.childElementCount > 0,
    ),
    /*
      No silhouettes anywhere, which is the fallback for a crop nobody has drawn. It is a real
      fallback and it is meant never to be reached: a build that reaches it has a crop in the
      catalogue and not in the sprite table, and this is where that shows up as a mixed list
    */
    fallbacks: document.querySelectorAll('.crop-glyph').length,
    // and more than two shapes: a list drawn with one shape throughout would pass everything above
    forms: new Set(
      [...document.querySelectorAll('.crop-sprite')].map((sprite) =>
        sprite.getAttribute('data-form'),
      ),
    ).size,
  }))
  expect(drawn.silent).toBe(true)
  expect(drawn.shapes).toBe(true)
  expect(drawn.fallbacks).toBe(0)
  expect(drawn.forms).toBeGreaterThan(2)
})
