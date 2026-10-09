import { expect, test, type Page } from '@playwright/test'
import {
  AUTORUN_TIMEOUT_MS,
  canvasPixels,
  LABEL,
  openFold,
  SITE_TIMEOUT_MS,
  step,
} from './fixtures/app.ts'
import {
  DESIGN_TIMEOUT_MS,
  dayOfYear,
  expandAll,
  geocodeListBody,
  hands,
  harvestMidpoint,
  openIn,
  plantedByBed,
  plantingCount,
  plantingWindows,
  recommendedArchetype,
  revealLayout,
  scenarioArchetypes,
  scrubToDay,
  selectPlantedBed,
  showArchetype,
  undrawnPlantings,
  type Hands,
} from './fixtures/qa.ts'

/**
 * Several first-time personas, each answering the column's questions a different way, each ending
 * up with a garden a grower could go and plant
 *
 * The onboarding suite next door proves the column works: it can be finished with a keyboard,
 * it uses no jargon, it keeps its answers over a reload, it applies. This one proves the claim
 * that sits on top of that, which is the only one a product owner cares about: that an
 * ordinary person who has never heard of agrivoltaics gets a real garden out of it, whoever
 * they are and whatever they answer. So the personas differ along the axes the engine
 * branches on: objective, ambition, mounting, plot size, the unit it was measured in, exposure,
 * watering and experience, each its own journey
 *
 * Every persona is carried all the way: the questions, the comparison, the layout applied,
 * the beds placed in the light, the plants in those beds, the scene drawing them, and the
 * dated jobs and the shopping list that make it a garden. Nothing here
 * pins an absolute light, yield, land-use or electricity figure, and no persona is pinned to
 * a crop or an archetype unless their own answer forces it
 */

type Objective = 'mostly-food' | 'balanced' | 'mostly-electricity'
type Ambition = 'leafy-and-herbs' | 'mixed-vegetables' | 'fruiting-and-berries'
type Mounting = 'any' | 'overhead-canopy' | 'ground-rows' | 'vertical-bifacial'
type Exposure = 'open' | 'partly-sheltered' | 'overshadowed'
type Experience = 'novice' | 'some' | 'experienced'

/**
 * What each mounting answer is allowed to come back with. Restated from
 * `MOUNTING_ARCHETYPES` in `src/recommend/design.ts` on purpose: this is the promise the
 * question makes to whoever answers it, so the test has to hold its own copy of it
 */
const ALLOWED: Readonly<Record<Mounting, readonly string[]>> = {
  any: ['food-first', 'balanced', 'energy-first', 'vertical-east-west', 'no-array-control'],
  'overhead-canopy': ['food-first', 'balanced', 'energy-first', 'no-array-control'],
  'ground-rows': ['food-first', 'balanced', 'energy-first', 'no-array-control'],
  'vertical-bifacial': ['vertical-east-west', 'no-array-control'],
}

interface Persona {
  readonly name: string
  readonly who: string
  /** Whichever unit they measured in. The ground step switches its pair of fields to it */
  readonly unit: 'm' | 'ft'
  readonly width: number
  readonly depth: number
  readonly objective: Objective
  readonly ambition: Ambition
  readonly mounting: Mounting
  readonly exposure: Exposure
  readonly experience: Experience
  readonly irrigation: boolean
  /** Whether they search for their own address, on top of accepting the one already offered */
  readonly searches?: boolean
}

const PERSONAS: readonly Persona[] = [
  {
    name: 'the courtyard grower',
    who: 'one small walled yard the house shades all morning, paced out in feet, salad and herbs the whole ambition, and the panels wanted overhead so the beds keep the floor',
    unit: 'ft',
    width: 11.5,
    depth: 8,
    objective: 'mostly-food',
    ambition: 'leafy-and-herbs',
    mounting: 'overhead-canopy',
    exposure: 'partly-sheltered',
    experience: 'novice',
    irrigation: true,
  },
  {
    name: 'the community gardener',
    who: 'an open plot they already grow a bit of everything on, no view at all on how the panels should stand, and they want to see the figures behind each option',
    unit: 'm',
    width: 10,
    depth: 7,
    objective: 'balanced',
    ambition: 'mixed-vegetables',
    mounting: 'any',
    exposure: 'open',
    experience: 'experienced',
    irrigation: true,
    searches: true,
  },
  {
    name: 'the smallholder who wants the panels to pay',
    who: 'the largest plot here, tomatoes and berries that want the brightest ground they can get, panels in rows beside the beds rather than over them, and no way to water it through a dry spell',
    unit: 'm',
    width: 16,
    depth: 11,
    objective: 'mostly-electricity',
    ambition: 'fruiting-and-berries',
    mounting: 'ground-rows',
    exposure: 'open',
    experience: 'experienced',
    irrigation: false,
  },
  {
    name: 'the fence-line grower',
    who: 'wants the panels standing upright between the beds and nothing at all over their head, has never done any of this before, and is happy with plain words',
    unit: 'm',
    width: 9,
    depth: 12,
    objective: 'balanced',
    ambition: 'mixed-vegetables',
    mounting: 'vertical-bifacial',
    exposure: 'open',
    experience: 'novice',
    irrigation: true,
  },
]

/**
 * The ease claim, as a number. Fourteen deliberate answers gets a persona from a cold page to a
 * planted garden, seventeen if they look their own address up, without taking the place
 * already offered.
 *
 * The column asks the questions on four steps with three Nexts between them. The height limit sits
 * in the panels step's mounting fold and nobody here states one, and the two wildlife switches sit
 * on the plants step, where pressing them visibly changes the beds, so a persona who wants neither
 * never meets them. The unit switch costs one press, for a grower who measured in feet. Opening the
 * mounting fold is counted too, since a persona with a view on where the panels go has to open it.
 *
 * The next question added still fails this, which is still what it's for: the number is to be
 * argued about, and left where it is when a column grew for its own sake
 */
const INTERACTION_BUDGET = 17

const HITS = [
  { label: LABEL, latitudeDeg: 42.37, longitudeDeg: -72.52 },
  { label: 'Amherst, Erie County, New York', latitudeDeg: 42.98, longitudeDeg: -78.8 },
] as const

const stepIs = (page: Page, id: string): Promise<void> =>
  expect(page.getByTestId(`panel-step-${id}`)).not.toHaveAttribute('hidden', '')

/**
 * Stops the scene animating, so that comparing two drawing buffers means something
 *
 * Foliage wind is a vertex-shader displacement off a shared clock, so once anything is in the
 * ground every frame differs from the last and `expect(pixels).not.toBe(before)` passes
 * against an empty plot just as happily as against a planted one. Measured: at the automatic
 * render tier two reads a second and a half apart are never equal, and at the low tier, where
 * `quality.wind` is off, they're byte-identical. So the tier is dropped before any buffer is
 * read and the picture becomes a function of the design and the day and nothing else
 *
 * This is the rig: it's deliberately not one of the persona's counted
 * interactions, because nobody has to touch it to get a garden. The column is put back on the
 * first question afterward, through `page` over `user`, for the same reason
 */
const stillTheFrame = async (page: Page): Promise<void> => {
  await step(page, 'light')
  await openFold(page, 'details-overlay-display')
  await page.getByTestId('control-overlay-lighting').selectOption('low')
  await step(page, 'place')
}

/** Every question the column asks, answered the way this persona would answer it */
const answerAs = async (page: Page, user: Hands, persona: Persona): Promise<void> => {
  await stepIs(page, 'place')
  if (persona.searches === true) {
    await user.fill('control-site-search', 'Amherst')
    await user.click('action-site-search')
    await expect(page.getByTestId('list-site-results')).toBeVisible({ timeout: SITE_TIMEOUT_MS })
    await user.click(`item-site-result-${LABEL}`)
  }
  // the place the step is working from, chosen just now or looked up on arrival
  await expect(page.getByTestId('readout-site-label')).toContainText(LABEL, {
    timeout: SITE_TIMEOUT_MS,
  })
  /*
   * How much detail they want isn't asked here. The switch writes `experience`, whose only
   * reader is the comparison, so it appears on the step it acts on: a visitor meets the cards
   * and then asks for the figures behind them, without answering a question about a screen
   * they haven't seen. It's set in `waitForScenarios` instead
   */
  await user.click('action-step-next')

  await stepIs(page, 'ground')
  // one pair of fields in whichever unit they measured in, switched with one press
  if (persona.unit === 'ft') await user.choose('control-plot-units-ft')
  await user.fill(`control-plot-width-${persona.unit}`, String(persona.width))
  await user.fill(`control-plot-depth-${persona.unit}`, String(persona.depth))
  // the area is read back in both units whichever one was typed in
  await expect(page.getByTestId('readout-plot-area')).toContainText('sq ft')
  await expect(page.getByTestId('readout-plot-area')).toContainText('m²')
  await user.choose(`control-onboarding-exposure-${persona.exposure}`)
  await user.toggle('control-onboarding-irrigation', persona.irrigation)
  await user.click('action-step-next')

  await stepIs(page, 'wants')
  await user.choose(`control-onboarding-ambition-${persona.ambition}`)
  await user.choose(`control-onboarding-objective-${persona.objective}`)
  await user.click('action-step-next')

  // how the panels should sit is behind a fold on the panels step, for the visitor who has a
  // view on it. No persona here states a height limit, so that field is never opened
  await stepIs(page, 'panels')
  await user.open('details-panels-mounting')
  await user.choose(`control-onboarding-mounting-${persona.mounting}`)
  await user.click('action-layouts-search')
}

const waitForScenarios = async (page: Page, user: Hands, persona: Persona): Promise<void> => {
  await expect(page.getByTestId('list-onboarding-scenarios')).toBeVisible({
    timeout: DESIGN_TIMEOUT_MS,
  })
  // where the detail switch lives, and where pressing it changes the cards under the pointer
  await user.choose(`control-onboarding-experience-${persona.experience}`)
}

interface Job {
  readonly crop: string
  readonly action: string
  readonly day: number
  readonly basis: string
}

const agendaJobs = (page: Page): Promise<readonly Job[]> =>
  page.locator('[data-testid^="item-agenda-"][data-action]').evaluateAll((nodes) =>
    nodes.map((node) => ({
      crop: node.getAttribute('data-crop') ?? '',
      action: node.getAttribute('data-action') ?? '',
      day: Number(node.getAttribute('data-day')),
      basis:
        node.querySelector('[data-testid^="readout-agenda-basis-"]')?.getAttribute('data-basis') ??
        '',
    })),
  )

interface Supply {
  readonly crop: string
  readonly kind: string
  readonly quantity: number
}

const shoppingList = (page: Page): Promise<readonly Supply[]> =>
  page.locator('[data-testid^="item-agenda-supply-"][data-quantity]').evaluateAll((nodes) =>
    nodes.map((node) => ({
      crop: node.getAttribute('data-crop') ?? '',
      kind: node.getAttribute('data-kind') ?? '',
      quantity: Number(node.getAttribute('data-quantity')),
    })),
  )

for (const persona of PERSONAS) {
  test(`${persona.name} gets a plantable garden out of the questions`, async ({ page }) => {
    test.setTimeout(DESIGN_TIMEOUT_MS + 300_000)
    test.info().annotations.push({ type: 'persona', description: persona.who })
    /*
      The agenda drops a harvest whose own sowing hasn't come round again yet, so the
      first-harvest check below needs a day no catalog crop has already been sown for at
      Amherst, whichever place the persona ends up naming (every persona lands on `LABEL`).
      Ramps open the earliest field window, day 76. March 1, day 60, sits ahead of every one of
      them with room to spare. Set before the app loads, so the store's own boot-time read of
      the clock (`todayMillis` in state/store.ts) picks it up
    */
    await page.clock.setFixedTime(new Date('2025-03-01T12:00:00Z'))
    const app = await openIn(page, 'light', { geocode: geocodeListBody(HITS) })
    const user = hands(page)
    await expect(page.getByTestId('panel-step-place'), persona.who).not.toHaveAttribute(
      'hidden',
      '',
    )
    await stillTheFrame(page)

    await answerAs(page, user, persona)
    await waitForScenarios(page, user, persona)

    /* --------- a comparison came back, and it's one this persona could have asked for ------- */

    const archetypes = await scenarioArchetypes(page)
    expect(archetypes.length, `${persona.name} was offered nothing to compare`).toBeGreaterThan(1)
    expect(archetypes, 'the open sky is missing from the comparison').toContain('no-array-control')
    for (const archetype of archetypes) {
      expect(
        ALLOWED[persona.mounting],
        `${archetype} was offered against the mounting asked for`,
      ).toContain(archetype)
    }
    const suggested = await recommendedArchetype(page)
    expect(ALLOWED[persona.mounting]).toContain(suggested)
    // its card is a tab press away when the comparison opened on a layout with panels instead
    await showArchetype(page, suggested)
    await expect(page.getByTestId(`readout-onboarding-tradeoff-${suggested}`)).not.toBeEmpty()
    await openFold(page, `details-onboarding-flags-${suggested}`)
    await expect(page.getByTestId(`readout-onboarding-summary-${suggested}`)).not.toBeEmpty()

    /*
     * Whether the figures are there is the only trace of the experience this persona chose.
     *
     * Counted against the cards ON SCREEN: the
     * comparison shows one card at a time, so `archetypes.length` is the size of the whole set
     * and was never going to be the number of figure blocks rendered. The claim being made is
     * unchanged and is the one that matters, that asking for the detail puts it on every card
     * shown and not asking leaves it off all of them
     */
    // the cards, and only the cards: the tabs above them carry `data-archetype` too, one per
    // layout, and counting those would ask for figures on six things when one card is drawn
    const shown = await page.locator('[data-testid^="item-onboarding-scenario-"]').count()
    expect(shown).toBeGreaterThan(0)
    const figures = page.locator('[data-testid^="readout-onboarding-figures-"]')
    await expect(figures).toHaveCount(persona.experience === 'experienced' ? shown : 0)

    /* ------------------------------- they apply one of them --------------------------------- */

    // the engine is free to put the open sky top for a food-first garden, and this suite is
    // about what a persona can build, so the layout taken is the suggested one when it carries
    // panels and the best-placed one that does when it doesn't
    const applied =
      suggested === 'no-array-control'
        ? (archetypes.find((entry) => entry !== 'no-array-control') ?? '')
        : suggested
    expect(applied, 'not one option in the comparison has any panels on it').not.toBe('')

    const beforeApply = await canvasPixels(page)
    await revealLayout(page, applied)
    await user.click(`action-onboarding-apply-${applied}`)

    /*
     * The press places the beds, plants the best combination it found for each, and lands on the
     * plants step with every bed's card saying what went in. A persona who is happy with what
     * was planted is done here, and everything asserted below is about the garden that apply
     * already wrote. Choosing a different combination instead is `e2e/planting.spec.ts`'s subject
     */
    await stepIs(page, 'plants')
    await expect(page.getByTestId('readout-plants-status')).toContainText(/planted for you/i, {
      timeout: DESIGN_TIMEOUT_MS,
    })

    const spent = user.spent()
    expect(spent, `${persona.name} needed too many steps to get a garden`).toBeLessThanOrEqual(
      INTERACTION_BUDGET,
    )

    /* ------------------- a plot, an array, beds in the light, and plants --------------------- */

    // what the search decided, one fold under the bed cards
    await openFold(page, 'details-plants-plan')
    await expect(page.getByTestId('badge-plan-archetype')).toHaveAttribute(
      'data-archetype',
      applied,
    )
    await expect(page.getByTestId('readout-plan-explanation')).not.toBeEmpty()
    const planBeds = page.locator('[data-testid^="item-plan-bed-"]')
    await expect(planBeds.first()).toBeVisible()
    const bedCount = await planBeds.count()
    for (const bed of await planBeds.all()) {
      expect(await bed.getAttribute('data-zone')).toMatch(/bright-gap|shaded-band|even-light/)
    }
    await expect
      .poll(async () => Number(await page.getByTestId('readout-plan-plantings').textContent()), {
        timeout: AUTORUN_TIMEOUT_MS,
      })
      .toBeGreaterThan(0)
    const written = Number(await page.getByTestId('readout-plan-plantings').textContent())

    await step(page, 'panels')
    await expandAll(page)
    await expect(page.getByTestId('control-array-select').locator('option')).toHaveCount(1)
    expect(Number(await page.getByTestId('control-array-pitch').inputValue())).toBeGreaterThan(0)
    if (persona.mounting === 'vertical-bifacial') {
      // upright is what they asked for, and it's the one thing about the array they can see
      expect(Number(await page.getByTestId('control-array-tilt').inputValue())).toBe(90)
    }
    await step(page, 'ground')
    await expect(page.getByTestId('readout-ground-beds')).toContainText(`${String(bedCount)} bed`)

    // what the plan says it wrote is what the beds are carrying, bed by bed
    const planted = await plantedByBed(page)
    expect(planted.size).toBe(bedCount)
    const inBeds = [...planted.values()].flat()
    expect(inBeds.length).toBe(written)

    /* ---------------------------- and the scene is drawing it -------------------------------- */

    await expect.poll(() => canvasPixels(page), { timeout: 60_000 }).not.toBe(beforeApply)

    await selectPlantedBed(page)
    const inBed = await plantingCount(page)
    expect(inBed).toBeGreaterThan(0)
    const windows = await plantingWindows(page)
    expect(windows.length).toBe(inBed)

    const today = await dayOfYear(page)
    const inSeason = windows.map(harvestMidpoint).find((day) => day !== today)
    expect(inSeason, 'every planting harvests on the day the app already opened on').toBeDefined()

    // whatever is out of season on the day the app opened on says so plainly
    const undrawnToday = await undrawnPlantings(page)
    expect(undrawnToday).toBeLessThanOrEqual(inBed)
    const beforeScrub = await canvasPixels(page)
    await scrubToDay(page, inSeason as number)
    await expect.poll(() => canvasPixels(page), { timeout: 60_000 }).not.toBe(beforeScrub)
    // and on the day it is in the ground the bed isn't bare: at least one plant is drawn
    expect(await undrawnPlantings(page)).toBeLessThan(inBed)

    /* ----------------------- something to do, and something to buy --------------------------- */

    await step(page, 'plants')
    // the planting rests on the full light check, run by itself before anything was planted,
    // and the ranking the status line reports is the one against that light
    await expect(page.getByTestId('status-autorun')).toHaveAttribute('data-state', 'ready', {
      timeout: AUTORUN_TIMEOUT_MS,
    })
    await step(page, 'calendar')
    await expect
      .poll(async () => (await agendaJobs(page)).length, { timeout: AUTORUN_TIMEOUT_MS })
      .toBeGreaterThan(0)
    const jobs = await agendaJobs(page)
    for (const job of jobs) {
      expect(job.day).toBeGreaterThan(0)
      expect(job.day).toBeLessThanOrEqual(365)
      expect(job.basis, 'a job with no rule behind it').not.toBe('')
      expect(job.crop).not.toBe('')
    }
    expect(jobs.some((job) => job.action === 'first-harvest')).toBe(true)

    const supplies = await shoppingList(page)
    expect(supplies.length, 'nothing to buy for a garden that was just planted').toBeGreaterThan(0)
    for (const line of supplies) {
      expect(line.quantity).toBeGreaterThan(0)
      expect(['seed', 'transplant', 'perennial-stock']).toContain(line.kind)
    }
    // every plant in the beds is on the list, and nothing that is not in a bed is on it
    expect([...new Set(supplies.map((line) => line.crop))].sort()).toEqual(
      [...new Set(inBeds)].sort(),
    )

    /* --------------------- and then they can run the thing forward -------------------------- */

    /*
      The mode this whole app converges on (Decision Record 14), walked by the same persona. Nothing
      here pins a harvest, an outcome kind or a year: what it pins is that a visitor arriving on
      this step is TOLD what it is, is told what years they can run it on, can press once and get a
      report about their own plantings, and can press again and see the two seasons side by side.
      That's the whole claim of the step
    */
    await step(page, 'seasons')
    await expect(page.getByTestId('readout-seasons-how')).toContainText(/press Run/)
    await expect(page.getByTestId('status-seasons-record')).not.toBeEmpty()
    // nothing is missing: the run press stays live
    await expect(page.getByTestId('control-seasons-run')).toBeEnabled()

    await page.getByTestId('control-seasons-run').click()
    await expect(page.getByTestId('readout-seasons-advice')).not.toBeEmpty()
    await expect(page.getByTestId('readout-seasons-year')).toContainText(/Frost-free from/)
    const outcomes = page.locator('[data-testid^="item-seasons-outcome-"]')
    expect(await outcomes.count(), 'a season silent about some of the plantings').toBe(written)
    await expect(page.getByTestId('readout-seasons-standing')).toContainText(/1 of 5 seasons/)
    // the layout has panels, so what they cost to build is on the page
    await expect(page.getByTestId('readout-seasons-cost')).toContainText('$')
    // the copy that was there to teach them has done its job and gone
    await expect(page.getByTestId('readout-seasons-how')).toHaveCount(0)

    await page.getByTestId('control-seasons-run').click()
    await expect(page.getByTestId('list-seasons-record').locator('li')).toHaveCount(2)
    await expect(page.getByTestId('item-seasons-record-1')).toContainText(/Season 1/)

    // the ease claim as a number, and what the number bought, has to reach the run output:
    // an assertion that merely passed after two hundred clicks wouldn't be evidence
    const evidence = `${String(spent)} interactions -> ${applied}, ${String(bedCount)} beds, ${String(written)} plants, ${String(jobs.length)} dated jobs, ${String(undrawnToday)} of ${String(inBed)} in the selected bed out of season on day ${String(today)}`
    console.log(`[first-time user] ${persona.name}: ${evidence}`)
    test.info().annotations.push({ type: 'journey', description: evidence })

    expect(app.errors).toEqual([])
  })
}

/**
 * The fifth persona, and the one the claim has to survive. A window box isn't a garden, and the
 * honest answer is to say so plainly
 */
test('the window-box grower is told their space is too small rather than handed an empty plot', async ({
  page,
}) => {
  test.setTimeout(DESIGN_TIMEOUT_MS + 120_000)
  const app = await openIn(page, 'light')
  const user = hands(page)
  const windowBox = {
    name: 'the window-box grower',
    who: "a meter of ledge outside an apartment with the next building standing over it, which isn't enough ground to reach into",
    unit: 'm',
    width: 1.2,
    depth: 1,
    objective: 'mostly-food',
    ambition: 'leafy-and-herbs',
    mounting: 'vertical-bifacial',
    exposure: 'overshadowed',
    experience: 'novice',
    irrigation: true,
  } as const
  await answerAs(page, user, windowBox)
  await waitForScenarios(page, user, windowBox)

  const archetypes = await scenarioArchetypes(page)
  expect(archetypes.length).toBeGreaterThan(0)
  for (const archetype of archetypes) {
    // the refusal is on the card, in words, before anything is applied. One card shows at a time
    await showArchetype(page, archetype)
    await expect(page.getByTestId(`readout-onboarding-layout-refusal-${archetype}`)).toContainText(
      /leaves no room for one/i,
    )
    await openFold(page, `details-onboarding-flags-${archetype}`)
    await expect(page.getByTestId(`readout-onboarding-layout-${archetype}`)).toContainText(
      /Nothing was placed/i,
    )
    await expect(page.getByTestId(`list-onboarding-beds-${archetype}`)).toHaveCount(0)
  }
  expect(app.errors).toEqual([])
})
