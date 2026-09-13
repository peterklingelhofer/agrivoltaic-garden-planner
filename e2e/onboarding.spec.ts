import { expect, test, type Page } from '@playwright/test'
import {
  AUTORUN_TIMEOUT_MS,
  LABEL,
  nextStep,
  openFold,
  SITE_TIMEOUT_MS,
  step,
  type Step,
} from './fixtures/app.ts'
import {
  activeTestId,
  answerEveryQuestion,
  cropsUnder,
  DESIGN_TIMEOUT_MS,
  expandAll,
  geocodeListBody,
  lightLeftByArchetype,
  openIn,
  pressOn,
  QUESTION_STEPS,
  recommendedArchetype,
  reopen,
  retype,
  revealForKeyboard,
  revealLayout,
  scenarioArchetypes,
  searchLayouts,
  showArchetype,
  storedDesign,
  tabTo,
} from './fixtures/qa.ts'

/**
 * The first visit, through the one column.
 *
 * The product used to open on a bare canvas and eleven panels that assume the reader knows what
 * tilt, pitch, ground cover ratio, clearance and a daily light integral are, and then grew a
 * guided dock across the foot of the scene that asked the same questions a second time. The dock
 * is gone: its questions are the first four steps of the sidebar, each with a Next at its foot,
 * and the fourth runs the search and lands the comparison on the same step. This suite is that
 * path: it asks only things a home grower can answer, it can be finished without a mouse, it
 * ends in a comparison rather than a single answer, the open sky is in that comparison so the
 * panels can be seen to cost something, and a reload lands where the grower was with what they
 * said.
 *
 * Every assertion here is structural or directional. No absolute light, yield, land-use or
 * kWh figure is pinned anywhere: those are the engine's to change, and a test that froze
 * one would be pinning a model output rather than the product
 */

const HITS = [
  { label: LABEL, latitudeDeg: 42.37, longitudeDeg: -72.52 },
  { label: 'Amherst, Erie County, New York', latitudeDeg: 42.98, longitudeDeg: -78.8 },
] as const

/** The step the column is open on, off the one row that says so */
const openStep = (page: Page): Promise<string | null> =>
  page.locator('.step[data-open="true"]').getAttribute('data-step')

/**
 * The answers on the two question steps between the place and the panels, written through the
 * controls a grower has: a plot typed as a rectangle, what shades it, whether it can be watered,
 * what to grow and what the garden is for
 */
const answerGroundAndWants = async (page: Page): Promise<void> => {
  await nextStep(page, 'ground')
  await page.getByTestId('control-plot-width-m').fill('10')
  await page.getByTestId('control-plot-depth-m').fill('7')
  await expect(page.getByTestId('readout-plot-area')).toContainText('70')
  await page.getByTestId('control-onboarding-exposure-partly-sheltered').check()
  await page.getByTestId('control-onboarding-irrigation').uncheck()

  await nextStep(page, 'wants')
  await page.getByTestId('control-onboarding-ambition-leafy-and-herbs').check()
  await page.getByTestId('control-onboarding-objective-mostly-food').check()
  await expect(page.getByTestId('readout-onboarding-objective-help')).not.toBeEmpty()
}

/** What the closed rows say the two steps settled, which is how a reload proves it kept them */
const summariesAsGiven = async (page: Page): Promise<void> => {
  await expect(page.getByTestId('readout-step-summary-ground')).toContainText('10.0 x 7.0 m')
  await expect(page.getByTestId('readout-step-summary-wants')).toContainText(
    'Salad leaves and herbs',
  )
  await expect(page.getByTestId('readout-step-summary-wants')).toContainText('Mostly food')
}

test('a cold visit opens on the place step, and Next at the foot walks the questions to the search', async ({
  page,
}) => {
  test.setTimeout(DESIGN_TIMEOUT_MS + 120_000)
  const app = await openIn(page, 'light', { geocode: geocodeListBody(HITS) })

  // no saved design: the plan is what is on screen, open on the first question, and the field
  // that answers it is the first thing on it
  await expect(page.getByTestId('app-root')).toHaveAttribute('data-surface', 'edit')
  expect(await openStep(page)).toBe('place')
  await expect(page.getByTestId('control-site-search')).toBeVisible()
  // the app looks the place it names up by itself, so the step is never locked on arrival
  await expect(page.getByTestId('status-site')).toHaveCount(0, { timeout: SITE_TIMEOUT_MS })

  await answerGroundAndWants(page)
  await nextStep(page, 'panels')
  // the search is the panels step's own primary, so the foot Next stands aside for it
  await expect(page.getByTestId('action-layouts-search')).toBeVisible()
  await searchLayouts(page)

  // a comparison: a row of names, one card at a time, and the open sky among them
  const archetypes = await scenarioArchetypes(page)
  expect(archetypes.length).toBeGreaterThan(1)
  expect(archetypes).toContain('no-array-control')
  await expect(page.getByTestId('list-onboarding-layout-tabs')).toHaveAttribute(
    'data-total',
    String(archetypes.length),
  )
  await expect(page.locator('[data-testid^="item-onboarding-scenario-"]')).toHaveCount(1)
  const suggested = await recommendedArchetype(page)
  expect(archetypes).toContain(suggested)
  await showArchetype(page, suggested)
  await expect(page.getByTestId(`badge-onboarding-recommended-${suggested}`)).toBeVisible()
  await expect(page.getByTestId(`readout-onboarding-tradeoff-${suggested}`)).not.toBeEmpty()
  // three figures on the face, in words a grower reads
  await expect(page.getByTestId(`readout-onboarding-daylight-${suggested}`)).toContainText('%')
  await expect(page.getByTestId(`readout-onboarding-beds-${suggested}`)).toHaveText(/\d/)
  // and the reading behind the pick, one fold away
  await openFold(page, 'details-onboarding-explainer')
  await expect(page.getByTestId('readout-onboarding-why')).toContainText('is marked because')
  await expect(
    page.getByTestId('list-onboarding-not-considered').locator('li').first(),
  ).toBeVisible()
  await openFold(page, `details-onboarding-flags-${suggested}`)
  await expect(page.getByTestId(`list-onboarding-flags-${suggested}`)).toContainText(
    /determination/i,
  )

  // the two answers traveled: the closed rows above the open step record them
  await summariesAsGiven(page)
  expect(app.errors).toEqual([])
})

/**
 * One press on a layout hands over a planted garden: a plot, an array and beds with plants in them,
 * with nothing left to find per bed in the recommendation panel, the polyculture panel or the apply
 * action. This is that one press, end to end, and the way back out of it
 */
test('applying a layout lands on the plants step with beds, plants, the reasoning and an undo', async ({
  page,
}) => {
  test.setTimeout(DESIGN_TIMEOUT_MS + 300_000)
  await openIn(page, 'light')
  await answerEveryQuestion(page)

  const suggested = await recommendedArchetype(page)
  // the card says what the beds will be before anything is applied. A tab press shows it when
  // the comparison opened on a layout with panels instead
  await showArchetype(page, suggested)
  await openFold(page, `details-onboarding-flags-${suggested}`)
  await expect(page.getByTestId(`readout-onboarding-layout-${suggested}`)).not.toBeEmpty()
  await (await revealLayout(page, suggested)).click()

  // the press lands on the plants step, which is what a layout is for
  await expect(page.getByTestId('panel-step-plants')).not.toHaveAttribute('hidden', '')
  const status = page.getByTestId('readout-plants-status')
  await expect(status).toContainText(/planted for you/i, { timeout: AUTORUN_TIMEOUT_MS })
  // one card per bed the layout placed, each saying what it holds
  const cards = page.locator('[data-testid^="item-plants-bed-"]')
  const bedCount = await cards.count()
  expect(bedCount).toBeGreaterThan(0)
  for (const mix of await page.locator('[data-testid^="readout-plants-mix-"]').all()) {
    await expect(mix).not.toContainText(/nothing in it/i)
  }

  // the reasoning, one fold away: every bed says which light it was put in and why, in words
  await openFold(page, 'details-plants-plan')
  await expect(page.getByTestId('readout-plan-explanation')).not.toBeEmpty()
  await expect(page.getByTestId('status-plan-quality')).toHaveAttribute(
    'data-quality',
    /preview|final/,
  )
  const beds = page.locator('[data-testid^="item-plan-bed-"]')
  await expect(beds).toHaveCount(bedCount)
  for (const bed of await beds.all()) {
    expect(await bed.getAttribute('data-zone')).toMatch(/bright-gap|shaded-band|even-light/)
  }
  // something actually grew, and it's named
  expect(Number(await page.getByTestId('readout-plan-plantings').textContent())).toBeGreaterThan(0)
  const planted = await cropsUnder(page, 'item-plan-crop-')
  expect(planted.length).toBeGreaterThan(0)
  expect(planted.every((cropId) => cropId !== '')).toBe(true)
  // and the editor is carrying exactly those beds
  await step(page, 'ground')
  await expect(page.getByTestId('readout-ground-beds')).toContainText(`${String(bedCount)} beds`)

  // the whole thing is reversible from one button
  await step(page, 'plants')
  await page.getByTestId('action-plants-undo').click()
  await expect(page.getByTestId('details-plants-plan')).toHaveCount(0)
  await expect(page.getByTestId('action-plants-undo')).toHaveCount(0)
  await expect(status).not.toContainText(/planted for you/i)
})

test('the comparison opens on a layout with panels, anchored by the open sky', async ({ page }) => {
  test.setTimeout(DESIGN_TIMEOUT_MS + 120_000)
  await openIn(page, 'light')
  // every question on its defaults, waiting for each step rather than counting presses
  await answerEveryQuestion(page)

  /*
    What a visitor MEETS, read before anything below shows another card. Only one card is on screen
    at a time, so whichever is up is the answer as far as most people get: opening on "No panels at
    all", badged Baseline and carrying "Start with no panels and plant it", would be a strange
    answer to the questions about a solar garden. It opens on the pick when the pick has panels and
    on the best layout with panels otherwise. The pick keeps its mark on its tab either way
  */
  const opened = await page
    .locator('[data-testid^="item-onboarding-scenario-"]')
    .first()
    .getAttribute('data-archetype')
  const suggested = await recommendedArchetype(page)

  const archetypes = await scenarioArchetypes(page)
  // every layout is in the row, the open sky last, where the comparison is read against it
  expect(archetypes[archetypes.length - 1], "the open sky isn't the last tab").toBe(
    'no-array-control',
  )
  expect(opened, 'the comparison opened on the open sky').not.toBe('no-array-control')
  if (suggested !== 'no-array-control') {
    expect(opened, "the comparison didn't open on the layout it recommends").toBe(suggested)
  }
  // a tab press away, because it's not the card the step opens on
  await showArchetype(page, 'no-array-control')
  await expect(page.getByTestId('badge-onboarding-baseline')).toBeVisible()
  await expect(page.getByTestId('item-onboarding-scenario-no-array-control')).toHaveAttribute(
    'data-baseline',
    'true',
  )
  await openFold(page, 'details-onboarding-explainer')
  await expect(page.getByTestId('readout-onboarding-baseline-help')).toContainText(/no panels/i)
  // the control is the anchor rather than a fifth option: it loses nothing to itself
  await expect(page.getByTestId('readout-onboarding-crops-no-array-control')).toContainText(
    /as it stands today/i,
  )

  // direction only: no arrangement of panels leaves more light than no panels
  const light = await lightLeftByArchetype(page)
  const control = light.get('no-array-control') ?? Number.NaN
  expect(control).toBe(100)
  for (const [archetype, percent] of light) {
    expect(Number.isFinite(percent), archetype).toBe(true)
    expect(percent, `${archetype} claims more light than the open sky`).toBeLessThanOrEqual(control)
  }
})

test('choosing no panels at all leaves the plot with none', async ({ page }) => {
  test.setTimeout(DESIGN_TIMEOUT_MS + 120_000)
  await openIn(page, 'light')
  await answerEveryQuestion(page)

  await (await revealLayout(page, 'no-array-control')).click()
  await expect(page.getByTestId('panel-step-plants')).not.toHaveAttribute('hidden', '')
  await expect(page.getByTestId('readout-step-summary-panels')).toHaveText('No panels')
  await step(page, 'panels')
  await openFold(page, 'details-panels-by-hand')
  await expect(page.getByTestId('status-array')).toContainText(/no array/i)
})

test('a preview result says it is a preview and never presents itself as final', async ({
  page,
}) => {
  test.setTimeout(DESIGN_TIMEOUT_MS + 120_000)
  await openIn(page, 'light')
  await answerEveryQuestion(page)

  const quality = page.getByTestId('status-onboarding-quality')
  await expect(quality).toHaveAttribute('data-quality', /preview|final/)
  if ((await quality.getAttribute('data-quality')) === 'preview') {
    await expect(quality).toContainText(/quick run/i)
  }
  // and no confidence badge claims more than the engine can support
  const badges = page.locator('[data-testid^="badge-onboarding-confidence-"]')
  expect(await badges.count()).toBeGreaterThan(0)
  for (const badge of await badges.all()) {
    expect(await badge.textContent()).toMatch(/low|moderate/i)
  }
  await openFold(page, 'details-onboarding-explainer')
  await expect(page.getByTestId('readout-onboarding-confidence-ceiling')).toContainText(
    /no higher than moderate/i,
  )
})

/**
 * The answers and the open step are part of the design, so a reload lands where the grower was with
 * what they said. Bringing back the plot without the answers would read as the app forgetting
 */
test('a reload lands on the step that was open, with every answer as it was given', async ({
  page,
}) => {
  test.setTimeout(240_000)
  await openIn(page, 'light')
  await expect(page.getByTestId('status-site')).toHaveCount(0, { timeout: SITE_TIMEOUT_MS })
  await answerGroundAndWants(page)
  await nextStep(page, 'panels')
  await summariesAsGiven(page)

  // the writer is debounced, so the reload waits for the step to have reached storage
  await expect
    .poll(async () => ((await storedDesign(page)) ?? '').includes('"sidebarStep":"panels"'), {
      timeout: 30_000,
    })
    .toBe(true)
  await reopen(page)

  expect(await openStep(page)).toBe('panels')
  await summariesAsGiven(page)
  await step(page, 'ground')
  await expect(page.getByTestId('control-plot-width-m')).toHaveValue('10')
  await expect(page.getByTestId('control-plot-depth-m')).toHaveValue('7')
  await expect(page.getByTestId('control-onboarding-exposure-partly-sheltered')).toBeChecked()
  await expect(page.getByTestId('control-onboarding-irrigation')).not.toBeChecked()
  await step(page, 'wants')
  await expect(page.getByTestId('control-onboarding-ambition-leafy-and-herbs')).toBeChecked()
  await expect(page.getByTestId('control-onboarding-objective-mostly-food')).toBeChecked()
})

/**
 * The vocabulary wall, checked where it would actually be hit: the face of each question step, and
 * the words on its folds. `textContent` over `innerText`: a term that regressed into a question and
 * was then hidden with CSS is still a term the product put in front of someone who has never heard
 * it. What is inside a closed fold is left out on purpose, because that is where the hand editor
 * and the reference material live, and neither is a question: "Adjust the panels by hand" is for
 * somebody who already knows what a tilt is
 */
const faceText = (page: Page, id: Step): Promise<string> =>
  page.evaluate((stepId) => {
    const panel = document.querySelector(`[data-testid="panel-step-${stepId}"]`)
    if (panel === null) return ''
    const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT)
    const parts: string[] = []
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const parent = node.parentElement
      if (parent === null) continue
      const fold = parent.closest('details')
      if (fold !== null && parent.closest('summary') === null) continue
      parts.push(node.textContent ?? '')
    }
    return parts.join(' ')
  }, id)

test('not one question needs any agrivoltaic vocabulary to answer', async ({ page }) => {
  const JARGON =
    /\b(tilt|pitch|azimuth|ground cover ratio|gcr|dli|daily light integral|rsr|albedo|bifacial|land equivalent ratio|irradiance|insolation|clearance|homogeneity|tracker|inverter|nameplate)\b/i
  await openIn(page, 'light')
  await expect(page.getByTestId('status-site')).toHaveCount(0, { timeout: SITE_TIMEOUT_MS })
  for (const id of QUESTION_STEPS) {
    await step(page, id)
    const text = await faceText(page, id)
    expect(text.length, id).toBeGreaterThan(50)
    expect(text, `${id} step`).not.toMatch(JARGON)
  }
})

/** The four questions, answered with the keyboard and nothing else, through to the comparison */
const answerByKeyboard = async (page: Page): Promise<void> => {
  // where: type a place, open the results with the arrow keys, choose one with Enter
  await tabTo(page, 'control-site-search')
  await page.keyboard.type('Amherst')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('list-site-results')).toBeVisible({ timeout: SITE_TIMEOUT_MS })
  await tabTo(page, 'control-site-search')
  await page.keyboard.press('ArrowDown')
  expect(await activeTestId(page)).toBe(`item-site-result-${LABEL}`)
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('readout-site-selection')).toContainText(LABEL)
  await pressOn(page, 'action-step-next')

  // how big: a rectangle, typed. What is around it: a plain choice, moved with the arrow keys
  await expect(page.getByTestId('panel-step-ground')).not.toHaveAttribute('hidden', '')
  await retype(page, 'control-plot-width-m', '10')
  await retype(page, 'control-plot-depth-m', '7')
  await expect(page.getByTestId('readout-plot-area')).toContainText('70')
  await tabTo(page, 'control-onboarding-exposure-open')
  await page.keyboard.press('ArrowDown')
  await expect(page.getByTestId('control-onboarding-exposure-partly-sheltered')).toBeChecked()
  await pressOn(page, 'control-onboarding-irrigation', ' ')
  await expect(page.getByTestId('control-onboarding-irrigation')).not.toBeChecked()
  await pressOn(page, 'action-step-next')

  // what to grow, and what you want out of it: two plain choices
  await expect(page.getByTestId('panel-step-wants')).not.toHaveAttribute('hidden', '')
  await tabTo(page, 'control-onboarding-ambition-mixed-vegetables')
  await page.keyboard.press('ArrowUp')
  await expect(page.getByTestId('control-onboarding-ambition-leafy-and-herbs')).toBeChecked()
  await tabTo(page, 'control-onboarding-objective-balanced')
  await page.keyboard.press('ArrowUp')
  await expect(page.getByTestId('control-onboarding-objective-mostly-food')).toBeChecked()
  await pressOn(page, 'action-step-next')

  // where the panels go: the search is the step's own press
  await expect(page.getByTestId('panel-step-panels')).not.toHaveAttribute('hidden', '')
  await pressOn(page, 'action-layouts-search')
  await expect(page.getByTestId('list-onboarding-scenarios')).toBeVisible({
    timeout: DESIGN_TIMEOUT_MS,
  })
}

test('a novice finishes the questions with the keyboard alone and applies a layout', async ({
  page,
}) => {
  test.setTimeout(DESIGN_TIMEOUT_MS + 120_000)
  await openIn(page, 'light', { geocode: geocodeListBody(HITS) })
  await expect(page.getByTestId('panel-step-place')).not.toHaveAttribute('hidden', '')

  await answerByKeyboard(page)

  const archetypes = await scenarioArchetypes(page)
  expect(archetypes.length).toBeGreaterThan(1)
  const suggested = await recommendedArchetype(page)
  // the engine is free to suggest the open sky for a food-first garden, so the panels applied
  // here are the suggested ones when there are any and the first panel option when there aren't
  const withPanels =
    suggested === 'no-array-control'
      ? (archetypes.find((entry) => entry !== 'no-array-control') ?? '')
      : suggested
  expect(withPanels).not.toBe('')
  // apply a layout with the keyboard, and land on the plants step carrying it
  await revealForKeyboard(page, withPanels)
  await pressOn(page, `action-onboarding-apply-${withPanels}`)
  await expect(page.getByTestId('panel-step-plants')).not.toHaveAttribute('hidden', '')
  // the app opened the step, so focus follows it to the header: a keyboard visitor whose press
  // just vanished would otherwise be left on `body`, at the top of a column they can't see
  await expect(page.getByTestId('action-step-plants')).toBeFocused()
  await expect(page.getByTestId('readout-plants-status')).toContainText(/planted for you/i, {
    timeout: AUTORUN_TIMEOUT_MS,
  })

  await step(page, 'panels')
  await expandAll(page)
  await expect(page.getByTestId('control-array-select').locator('option')).toHaveCount(1)
  expect(Number(await page.getByTestId('control-array-pitch').inputValue())).toBeGreaterThan(0)
  // the tracker came across too, whichever kind it is: the editor is showing the one applied
  expect(await page.getByTestId('control-array-tracking').inputValue()).not.toBe('')
  await expect(page.getByTestId('readout-array-gcr')).not.toHaveText('0.0%')
  expect(Number(await page.getByTestId('control-array-clearance').inputValue())).toBeGreaterThan(0)
})
