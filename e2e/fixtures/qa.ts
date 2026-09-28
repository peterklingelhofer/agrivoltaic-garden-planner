import { expect, type Locator, type Page } from '@playwright/test'
import {
  AUTORUN_TIMEOUT_MS,
  BED_RING,
  drawPolygon,
  openFold,
  resolveSite,
  runLightCheck,
  step,
  stubUpstreams,
  waitForCanvas,
  waitForRanking,
  watchConsole,
  type App,
  type Upstreams,
} from './app.ts'

/**
 * Additions this suite needs that `app.ts` does not have: a colour-scheme aware open, a
 * multi-result geocode stub, and the small helpers the newer specs share. Kept in its
 * own module so the shared fixture keeps exactly the surface the older specs grew up on
 */

export type ColourScheme = 'light' | 'dark'

/**
 * `emulateMedia` before navigation, not after. Every custom property in the sheet is
 * resolved off `prefers-color-scheme`, so a scheme applied after first paint audits a
 * page that was laid out and painted for the other one
 */
export const openIn = async (
  page: Page,
  scheme: ColourScheme,
  over: Upstreams = {},
): Promise<App> => {
  await stubUpstreams(page, over)
  const errors = watchConsole(page)
  await page.emulateMedia({ colorScheme: scheme })
  await page.goto('/')
  await expect(page.getByTestId('app-root')).toBeVisible()
  await waitForCanvas(page)
  return { page, errors }
}

/** Site, bed, the automatic light and the automatic ranking, in a chosen colour scheme */
export const rankedBedIn = async (
  page: Page,
  scheme: ColourScheme,
  over: Upstreams = {},
): Promise<App> => {
  const app = await openIn(page, scheme, over)
  await resolveSite(page)
  await drawPolygon(page, 'bed', BED_RING)
  await runLightCheck(page)
  await waitForRanking(page)
  return app
}

/** Open every `details` so disclosure content is in the document and in any audit */
export const expandAll = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    for (const node of document.querySelectorAll('details')) node.open = true
  })
  await page.waitForTimeout(150)
}

/** Types a query and waits for the results listbox the geocode stub answers with */
export const searchAddress = async (page: Page, query: string): Promise<Locator> => {
  await step(page, 'place')
  await page.getByTestId('control-site-search').fill(query)
  await page.getByTestId('action-site-search').click()
  const list = page.getByTestId('list-site-results')
  await expect(list).toBeVisible({ timeout: 30_000 })
  return list
}

export interface GeocodeStubHit {
  readonly label: string
  readonly latitudeDeg: number
  readonly longitudeDeg: number
}

/**
 * A one-hit list cannot exercise Up/Down/Home/End, so the picker specs answer with a
 * spread of candidates. Every entry is a real Nominatim shape: `display_name`, string
 * coordinates and a country code
 */
export const geocodeListBody = (hits: readonly GeocodeStubHit[]): unknown =>
  hits.map((hit) => ({
    display_name: hit.label,
    lat: String(hit.latitudeDeg),
    lon: String(hit.longitudeDeg),
    address: { country_code: 'us' },
  }))

/** The first number in a readout, commas stripped, for directional comparisons */
export const readNumber = async (locator: Locator): Promise<number> => {
  const text = ((await locator.textContent()) ?? '').replace(/,/g, '')
  const match = /-?\d+(?:\.\d+)?/.exec(text)
  expect(match, `no number in "${text}"`).not.toBeNull()
  return Number(match![0])
}

/* ----------------------------- placing plants ------------------------------- */

/**
 * Every crop id the page is currently listing under one testid prefix. The rows carry
 * `data-crop` so a planting, a plan entry and a refusal are all read the same way and none
 * of them has to be parsed out of prose. Read off the document, so
 * rows behind a closed fold count too
 */
export const cropsUnder = (page: Page, prefix: string): Promise<readonly string[]> =>
  page
    .locator(`[data-testid^="${prefix}"]`)
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-crop') ?? ''))

/**
 * How many plantings the selected bed carries, off the ground step's readout, which sits behind
 * the "Change the beds" fold with the rest of the selected bed's fields
 */
export const plantingCount = async (page: Page): Promise<number> => {
  await step(page, 'ground')
  await openFold(page, 'details-ground-beds')
  return readNumber(page.getByTestId('readout-bed-plantings'))
}

/**
 * The picker is on the Plants step behind "Pick plants one at a time", and only offers anything
 * once the ranking is in
 */
export const openPlantPicker = async (page: Page): Promise<Locator> => {
  await step(page, 'plants')
  await openFold(page, 'details-plants-by-hand')
  const picker = page.getByTestId('list-bed-crops')
  await expect(picker).toBeVisible({ timeout: AUTORUN_TIMEOUT_MS })
  return picker
}

/** Chooses the top-ranked crop, accepts the derived defaults and returns the crop id */
export const addTopRankedPlanting = async (page: Page): Promise<string> => {
  const picker = await openPlantPicker(page)
  const option = picker.getByRole('option').first()
  const cropId = (await option.getAttribute('data-crop')) ?? ''
  expect(cropId).not.toBe('')
  await option.click()
  const add = page.getByTestId('action-bed-add-planting')
  await expect(add).toBeEnabled()
  await add.click()
  return cropId
}

/**
 * What every bed in the plot is carrying, bed by bed, off the plants step's bed cards. The card
 * for the selected bed is the one that prints its counts, so each bed is selected in turn; the
 * crop ids come from the picker's planting rows, which follow the selection
 */
export const plantedByBed = async (page: Page): Promise<ReadonlyMap<string, readonly string[]>> => {
  await step(page, 'plants')
  const bedIds = await page
    .locator('[data-testid^="item-plants-bed-"]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-bed') ?? ''))
  const planted = new Map<string, readonly string[]>()
  for (const bedId of bedIds) {
    await page.getByTestId(`action-plants-select-${bedId}`).click()
    await expect(page.getByTestId(`item-plants-bed-${bedId}`)).toHaveAttribute(
      'data-selected',
      'true',
    )
    planted.set(bedId, await cropsUnder(page, 'item-bed-planting-'))
  }
  return planted
}

/* --------------------------- polyculture suggestions ------------------------ */

/**
 * SoilGrids reports pH in units of 0.1. The site's reading is the pH every bed nobody has typed
 * starts from, and the soil-water stage scores each bed against its own, so this stub moves the
 * place and `setBedSoilPh` moves one bed by hand. Everything but the pH layer is the default body
 */
export const acidSoilBody = (phUnits: number): unknown => ({
  properties: {
    layers: [
      { name: 'phh2o', depths: [{ values: { mean: Math.round(phUnits * 10) } }] },
      { name: 'clay', depths: [{ values: { mean: 220 } }] },
      { name: 'sand', depths: [{ values: { mean: 380 } }] },
      { name: 'soc', depths: [{ values: { mean: 24000 } }] },
    ],
  },
})

/** pH 5.4 keeps most of the catalogue tolerated while only blueberry optimises there */
export const ACID_PH = 5.4

/**
 * The other half of the pair: the bed's own pH, moved through the control a grower has.
 *
 * The bed's soil is part of the key the light is checked against, so this edit makes the light
 * stale and the app bakes it again, and the ranking holds until that bake lands. Read on its own
 * the ranking status still says ready, about the ranking from before the edit, which never had
 * an acid-loving crop in it: the light is waited for first, then the ranking that follows it
 */
export const setBedSoilPh = async (page: Page, phUnits: number): Promise<void> => {
  await step(page, 'ground')
  await openFold(page, 'details-ground-beds')
  await page.getByTestId('control-bed-soil-ph').fill(String(phUnits))
  await runLightCheck(page)
  await waitForRanking(page)
}

export type PreferenceKindName = 'require' | 'prefer' | 'avoid' | 'exclude'

/**
 * Marks a crop the way a grower does on the plants step, then waits out the ranking it triggers.
 *
 * Two kinds of control now. A like chip (`control-plants-like-<crop>`) cycles none, prefer,
 * avoid, none, so prefer is one press from nothing and avoid is one more; the two hard kinds,
 * must have and never, sit in the "More choices" fold as a row per crop with a press for each.
 * Both write the same preference entry, and the row's `data-kind` is where it is read back
 */
export const setPreferenceKind = async (
  page: Page,
  cropId: string,
  kind: PreferenceKindName,
): Promise<void> => {
  await step(page, 'plants')
  const row = page.getByTestId(`item-polyculture-preference-${cropId}`)
  if (kind === 'require' || kind === 'exclude') {
    await openFold(page, 'details-plants-more')
    const chip = page.getByTestId(`control-polyculture-kind-${cropId}-${kind}`)
    await chip.scrollIntoViewIfNeeded()
    await chip.click()
  } else {
    const chip = page.getByTestId(`control-plants-like-${cropId}`)
    await chip.scrollIntoViewIfNeeded()
    // from nothing: prefer is the first press and avoid the second
    for (let presses = 0; presses < 3; presses += 1) {
      if ((await chip.getAttribute('data-kind')) === kind) break
      await chip.click()
    }
  }
  await expect(row).toHaveAttribute('data-kind', kind)
  await waitForRanking(page)
}

/**
 * The combinations for the selected bed, which arrive by themselves once the ranking has, with no
 * press to ask for them. They sit behind the plants step's "All the combinations for Bed N" fold,
 * which this opens
 */
export const openCombinations = async (page: Page): Promise<void> => {
  await waitForRanking(page)
  await openFold(page, 'details-plants-combinations')
  await expect(page.getByTestId('readout-polyculture-anchors')).toBeVisible({
    timeout: AUTORUN_TIMEOUT_MS,
  })
}

/** Each suggestion's crops, read off the row directly */
export const suggestedCombinations = (page: Page): Promise<readonly string[]> =>
  page
    .locator('[data-testid^="item-polyculture-suggestion-"]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-crops') ?? ''))

export const refusalsByCause = (page: Page, cause: string): Promise<readonly string[]> =>
  page
    .locator(`[data-testid^="item-polyculture-refusal-"][data-cause="${cause}"]`)
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-crop') ?? ''))

/* ------------------------------- saved designs ------------------------------- */

/**
 * The key `src/state/persist.ts` writes under. Restated here, because
 * the e2e project compiles under `nodenext` and does not resolve `src`
 */
export const STORAGE_KEY = 'agrivoltaic-garden-designer/design'

/** Puts a payload in place BEFORE the app boots, which is the only way to test a bad one */
export const seedStoredDesign = async (page: Page, payload: string): Promise<void> => {
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(String(key), String(value))
    },
    [STORAGE_KEY, payload],
  )
}

export const storedDesign = (page: Page): Promise<string | null> =>
  page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)

export const storageState = (page: Page): Locator => page.getByTestId('status-storage')

export const saveDesign = async (page: Page): Promise<void> => {
  await step(page, 'check')
  await page.getByTestId('action-storage-save').click()
  await expect(storageState(page)).toHaveAttribute('data-state', 'saved')
}

/**
 * A reset puts the WHOLE design back to its defaults, and `sidebarStep` is one of the fields
 * `defaultDesign` covers: the press that clears storage also navigates the sidebar back to
 * Place out from under whoever pressed it. So Check is asked for again afterwards, not just
 * before, or the panel that just wrote "cleared" is never the one on screen to say so.
 *
 * And that second press is itself a change to a persisted field, since the open step is saved
 * with the design (`persist.ts` records the wart): the panel reads "cleared" until the debounced
 * writer catches up, then "saved". Either is the panel telling the truth about a design that
 * is back at its defaults, so both are accepted here; what a caller checks afterwards is the
 * design, never this word
 */
export const forgetDesign = async (page: Page): Promise<void> => {
  await step(page, 'check')
  await forgetTheDesign(page)
  await step(page, 'check')
  await expect(storageState(page)).toHaveAttribute('data-state', /cleared|saved/)
}

/**
 * Two presses, because forgetting a design is not undoable and the panel says what it costs between
 * them. A helper that pressed once would only arm the confirmation, and every spec built on it
 * would assert against a design that was still saved
 */
export const forgetTheDesign = async (page: Page): Promise<void> => {
  await page.getByTestId('action-storage-reset').click()
  await page.getByTestId('action-storage-forget-confirm').click()
}

export const reopen = async (page: Page): Promise<void> => {
  await page.reload()
  await expect(page.getByTestId('app-root')).toBeVisible()
  await waitForCanvas(page)
}

/**
 * The design as the controls report it. Read off the inputs a grower typed in, so comparing
 * two of these compares the design. No number a run produced reaches it
 */
export interface DesignFingerprint {
  readonly site: string
  readonly beds: number
  readonly arrays: number
  readonly selectedBed: string
  readonly tiltDeg: string
  readonly pitchM: string
  readonly soilPh: string
  readonly plantings: string
  readonly overlayChannel: string
}

/**
 * Reads across three steps, because the fields a fingerprint compares are spread over the bed,
 * the array and the overlay, and a closed step holds nothing in the document: the toolbar site
 * label is the one field outside the stepper entirely, so it needs no step of its own. The bed
 * fields and the array fields each sit behind a fold on their step, opened on the way
 */
export const designFingerprint = async (page: Page): Promise<DesignFingerprint> => {
  const site = (await page.getByTestId('readout-toolbar-site').textContent()) ?? ''
  await step(page, 'ground')
  await openFold(page, 'details-ground-beds')
  const bedSelect = page.getByTestId('control-bed-select')
  const beds = await bedSelect.locator('option').count()
  const selectedBed = await bedSelect.inputValue()
  const soilPh = await page.getByTestId('control-bed-soil-ph').inputValue()
  const plantings = (await page.getByTestId('readout-bed-plantings').textContent()) ?? ''
  await step(page, 'panels')
  await openFold(page, 'details-panels-by-hand')
  const arrays = await page.getByTestId('control-array-select').locator('option').count()
  const tiltDeg = await page.getByTestId('control-array-tilt').inputValue()
  const pitchM = await page.getByTestId('control-array-pitch').inputValue()
  await step(page, 'light')
  const overlayChannel = await page.getByTestId('control-overlay-channel').inputValue()
  return { site, beds, arrays, selectedBed, tiltDeg, pitchM, soilPh, plantings, overlayChannel }
}

/** `formatBandRange` prints `lower-upper`, so a band is read as both of its bounds */
export const readBand = async (locator: Locator): Promise<readonly [number, number]> => {
  const text = ((await locator.textContent()) ?? '').replace(/,/g, '')
  // a band reads "45-61%" on most surfaces and "1.4 to 1.7" where a ratio is spelled out
  const match = /(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)/.exec(text)
  expect(match, `no band in "${text}"`).not.toBeNull()
  return [Number(match![1]), Number(match![2])]
}

/* ------------------------------- the layout search -------------------------------- */

/**
 * The engine runs one annual bake per candidate before the comparison can be drawn. It is
 * about a second on a GPU-backed browser and several on a software rasteriser, so the wait
 * is generous while still being a bounded wait
 */
export const DESIGN_TIMEOUT_MS = 240_000

/**
 * Runs the layout search from the panels step and waits for the comparison it lands. The search is
 * the first thing on that step, and the comparison renders under it on the same step
 */
export const searchLayouts = async (page: Page): Promise<void> => {
  await step(page, 'panels')
  await page.getByTestId('action-layouts-search').click()
  await expect(page.getByTestId('list-onboarding-scenarios')).toBeVisible({
    timeout: DESIGN_TIMEOUT_MS,
  })
}

/**
 * The comparison shows ONE layout at a time, chosen from a row of tabs that names every layout.
 *
 * The row of names is what these helpers read: every layout is a tab, a tab press shows its card,
 * and a set of one renders no row at all, which is handled by reading the one card that is there
 */
const layoutTabs = (page: Page): Locator => page.locator('[data-testid^="action-onboarding-show-"]')

/** Brings one named layout onto the screen, so a control on its card can be pressed */
export const showArchetype = async (page: Page, archetype: string): Promise<void> => {
  const card = page.getByTestId(`item-onboarding-scenario-${archetype}`)
  if ((await card.count()) === 0) {
    const tab = page.getByTestId(`action-onboarding-show-${archetype}`)
    expect(await tab.count(), `no layout tab for ${archetype}`).toBe(1)
    await tab.click()
  }
  await expect(card).toBeVisible()
}

/** Brings one layout's Apply button into reach, by its tab, and returns it */
export const revealLayout = async (page: Page, archetype: string): Promise<Locator> => {
  await showArchetype(page, archetype)
  const apply = page.getByTestId(`action-onboarding-apply-${archetype}`)
  await expect(apply).toBeVisible()
  return apply
}

/**
 * The same reveal, reached from the keyboard: Tab to the layout's own tab and press it. Separate
 * from `revealLayout` because that one clicks, and a spec proving the whole path is walkable
 * without a pointer may not borrow a pointer for one step of it
 */
export const revealForKeyboard = async (page: Page, archetype: string): Promise<void> => {
  if (await page.getByTestId(`action-onboarding-apply-${archetype}`).isVisible()) return
  // a tab row has one tab stop, the tab that is selected; the arrow keys move along it, and each
  // move shows that layout's card, so this is Tab to the row and then Right until it is reached
  const selected = page.locator('[data-testid^="action-onboarding-show-"][aria-selected="true"]')
  await tabTo(page, (await selected.getAttribute('data-testid')) ?? '')
  const wanted = page.getByTestId(`action-onboarding-show-${archetype}`)
  for (let moves = 0; moves < 8; moves += 1) {
    if ((await wanted.getAttribute('aria-selected')) === 'true') break
    await page.keyboard.press('ArrowRight')
  }
  expect(await wanted.getAttribute('aria-selected'), `the keys never reached ${archetype}`).toBe(
    'true',
  )
  await expect(page.getByTestId(`action-onboarding-apply-${archetype}`)).toBeVisible()
}

/**
 * The four question steps, in the order the column asks them, and the search they lead to. A
 * visitor who takes every default walks them with the Next at the foot of each; the press on the
 * panels step is the search itself
 */
export const QUESTION_STEPS = ['place', 'ground', 'wants', 'panels'] as const

/**
 * Straight through the questions on their defaults, which is what somebody trying it out does,
 * ending on the comparison the search lands.
 *
 * Waits for each step to be open before pressing Next on it. It never presses the same button
 * N times while trusting the count: a press landing mid-render is swallowed, and the failure reads
 * as the column having stopped in the middle. Asserting the step first also
 * makes a wrong ORDER fail here, naming the step it actually reached
 */
export const answerEveryQuestion = async (page: Page): Promise<void> => {
  await step(page, 'place')
  for (const id of ['ground', 'wants', 'panels'] as const) {
    await page.getByTestId('action-step-next').click()
    await expect(page.getByTestId(`panel-step-${id}`)).not.toHaveAttribute('hidden', '')
  }
  await searchLayouts(page)
}

export const activeTestId = (page: Page): Promise<string> =>
  page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '')

/**
 * Walks the tab order to a control and leaves focus on it. Nothing here clicks, so a
 * journey built out of these is a journey a keyboard could have made, and a control that
 * cannot be tabbed to fails here, and is never quietly clicked anyway
 */
export const tabTo = async (page: Page, testId: string, limit = 80): Promise<void> => {
  for (let step = 0; step < limit; step += 1) {
    if ((await activeTestId(page)) === testId) return
    await page.keyboard.press('Tab')
  }
  expect(await activeTestId(page), `Tab never reached ${testId}`).toBe(testId)
}

export const pressOn = async (page: Page, testId: string, key = 'Enter'): Promise<void> => {
  await tabTo(page, testId)
  await page.keyboard.press(key)
}

/** Replaces what a field holds using only the keyboard, as a person retyping would */
export const retype = async (page: Page, testId: string, value: string): Promise<void> => {
  await tabTo(page, testId)
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type(value)
}

/**
 * What a journey costs its user, counted as it is spent. One call is one thing a person
 * does: a click, a field filled in, an option chosen. Confirming an answer that was already
 * the default still costs one, so the total is an upper bound on the real effort
 */
export interface Hands {
  readonly spent: () => number
  click(testId: string): Promise<void>
  fill(testId: string, value: string): Promise<void>
  choose(testId: string): Promise<void>
  toggle(testId: string, on: boolean): Promise<void>
  /** Opens a fold, which is a press like any other when what the person wants is inside it */
  open(testId: string): Promise<void>
}

export const hands = (page: Page): Hands => {
  let spent = 0
  const one = async (run: () => Promise<void>): Promise<void> => {
    spent += 1
    await run()
  }
  return {
    spent: () => spent,
    click: (testId) => one(() => page.getByTestId(testId).click()),
    fill: (testId, value) => one(() => page.getByTestId(testId).fill(value)),
    choose: (testId) => one(() => page.getByTestId(testId).check()),
    toggle: (testId, on) => one(() => page.getByTestId(testId).setChecked(on)),
    open: (testId) => one(() => openFold(page, testId)),
  }
}

/**
 * Shows every layout in turn, gathering what `read` finds on each card, and puts the one that
 * was showing back.
 *
 * The restore at the end is the part worth stating: these are QUERIES, and a query that leaves
 * the screen on the last card is a query with a side effect. It cost one test exactly that way,
 * by paging past the baseline and then asserting the baseline badge was on screen
 */
const acrossPages = async <T>(
  page: Page,
  read: () => Promise<readonly T[]>,
): Promise<readonly T[]> => {
  const found: T[] = []
  const names = await scenarioArchetypes(page)
  if (names.length <= 1) return read()
  const showing = await page
    .locator('[data-testid^="item-onboarding-scenario-"]')
    .first()
    .getAttribute('data-archetype')
  for (const archetype of names) {
    await showArchetype(page, archetype)
    found.push(...(await read()))
  }
  if (showing !== null) await showArchetype(page, showing)
  return found
}

/**
 * Every layout the comparison offers, read off the row of tabs, which names all of them at once.
 * With one layout there is no row, and the one card on screen is the whole set
 */
export const scenarioArchetypes = async (page: Page): Promise<readonly string[]> => {
  const tabs = await layoutTabs(page).evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-archetype') ?? ''),
  )
  if (tabs.length > 0) return tabs.filter((archetype) => archetype.length > 0)
  return page
    .locator('[data-testid^="item-onboarding-scenario-"]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-archetype') ?? ''))
}

export const recommendedArchetype = async (page: Page): Promise<string> => {
  const tab = page.locator('[data-testid^="action-onboarding-show-"][data-recommended="true"]')
  if ((await tab.count()) === 1) return (await tab.getAttribute('data-archetype')) ?? ''
  // a set of one has no row: the card itself carries the mark
  const card = page.locator('[data-testid^="item-onboarding-scenario-"][data-recommended="true"]')
  expect(await card.count(), 'no layout is marked recommended').toBe(1)
  return (await card.getAttribute('data-archetype')) ?? ''
}

/** The percentage of today's light each option says it leaves, read off the sentence */
export const lightLeftByArchetype = async (page: Page): Promise<ReadonlyMap<string, number>> => {
  // across every layout in turn, because the claim this feeds is about EVERY layout on offer: read
  // off one screen, it would compare the open sky against a set of one and pass by saying nothing
  const entries = await acrossPages(page, () =>
    page
      .locator('[data-testid^="readout-onboarding-light-"]')
      .evaluateAll((nodes) =>
        nodes.map((node) => [
          (node.getAttribute('data-testid') ?? '').replace('readout-onboarding-light-', ''),
          node.textContent ?? '',
        ]),
      ),
  )
  return new Map(
    entries.map(([archetype, text]) => [
      String(archetype),
      Number(/(\d+)%/.exec(String(text))?.[1] ?? Number.NaN),
    ]),
  )
}

/* ------------------------- what the scene is being asked to draw ------------------------ */

/** The sow-to-harvest window each planting in the selected bed prints, read off its row */
export interface PlantingWindow {
  readonly cropId: string
  readonly startDay: number
  readonly endDay: number
}

export const plantingWindows = async (page: Page): Promise<readonly PlantingWindow[]> => {
  await step(page, 'plants')
  return page.locator('[data-testid^="item-bed-planting-"]').evaluateAll((nodes) =>
    nodes.map((node) => ({
      cropId: node.getAttribute('data-crop') ?? '',
      startDay: Number(node.getAttribute('data-harvest-start-day')),
      endDay: Number(node.getAttribute('data-harvest-end-day')),
    })),
  )
}

const DAYS_PER_YEAR = 365
const wrap = (day: number): number => ((day % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR

/** The middle of a planting's own harvest window, where it is drawn at full size */
export const harvestMidpoint = (window: PlantingWindow): number =>
  wrap(window.startDay + Math.round(wrap(window.endDay - window.startDay) / 2) - 1) + 1

/**
 * How many of the selected bed's plantings the panel says are not in the ground today. The
 * notice is absent when every one of them is, which is a zero
 */
export const undrawnPlantings = async (page: Page): Promise<number> => {
  await step(page, 'plants')
  const notice = page.getByTestId('status-bed-season')
  if ((await notice.count()) === 0) return 0
  return Number(await notice.getAttribute('data-undrawn'))
}

export const dayOfYear = async (page: Page): Promise<number> => {
  await step(page, 'light')
  return Number(await page.getByTestId('control-time-day').inputValue())
}

export const scrubToDay = async (page: Page, day: number): Promise<void> => {
  await step(page, 'light')
  await page.getByTestId('control-time-day').fill(String(day))
  await expect(page.getByTestId('control-time-day')).toHaveValue(String(day))
}

/**
 * Leaves selected the first bed in the plot that actually carries a planting, chosen from the
 * plants step's bed cards, which is where a grower chooses one
 */
export const selectPlantedBed = async (page: Page): Promise<string> => {
  const planted = await plantedByBed(page)
  for (const [bedId, crops] of planted) {
    if (crops.length === 0) continue
    await page.getByTestId(`action-plants-select-${bedId}`).click()
    await expect(page.getByTestId(`item-plants-bed-${bedId}`)).toHaveAttribute(
      'data-selected',
      'true',
    )
    return bedId
  }
  throw new Error(`none of the ${String(planted.size)} beds in the plot carries a planting`)
}
