import { expect, test, type Page, type Route } from '@playwright/test'
import {
  AGENT_IN_BUILD,
  AUTORUN_TIMEOUT_MS,
  BAKE_TIMEOUT_MS,
  LAT,
  LON,
  nextStep,
  openFold,
  resolveSite,
  step,
  type Step,
} from './fixtures/app.ts'
import {
  ACID_PH,
  acidSoilBody,
  addTopRankedPlanting,
  expandAll,
  geocodeListBody,
  openCombinations,
  openIn,
  rankedBedIn,
  searchAddress,
  searchLayouts,
  seedStoredDesign,
  setBedSoilPh,
  setPreferenceKind,
  DESIGN_TIMEOUT_MS,
  forgetTheDesign,
  revealLayout,
  showArchetype,
  recommendedArchetype,
  type ColorScheme,
} from './fixtures/qa.ts'
import {
  auditContrast,
  auditFocusIndicators,
  auditHovered,
  contrastCollector,
  type ContrastCollector,
} from './fixtures/contrast.ts'
import { hourlyArchiveBody, nulledDailyNormalsBody } from './fixtures/weather.ts'

/**
 * Why this file exists.
 *
 * The case it exists for: `.picker-option:hover` declaring only `background`. It outranks
 * `.picker-option-active` on specificity, and when that rule is the one supplying `color`, hovering
 * the search result that is ALREADY active paints `--accent-text` on `--bg`: #10241b on #14171b in
 * dark and #ffffff on #f5f6f3 in light, about 1.1:1 in both.
 *
 * No static tool can see that. It's two rules
 * meeting through custom properties in one interactive state, and the only instrument
 * that can report the pair of colors that actually met is a browser resolving real
 * computed styles. So this suite drives the app into states and measures.
 *
 * Three things the audit does that a rest-state check wouldn't, each because the bug
 * would have escaped otherwise:
 *
 * 1. both color schemes, because `prefers-color-scheme` swaps every custom property and
 *    the bug was present in each with different colors
 * 2. interactive states, because at rest the active option was correct: hover was the
 *    only broken state
 * 3. the intersection, hovering the option that is already active, because neither
 *    hovering an inactive option nor leaving the active option alone reproduces it
 *
 * Every state accumulates into one collector and the test asserts once at the end, so a
 * failure is the complete list of bad pairs rather than whichever one came first
 */

const SCHEMES: readonly ColorScheme[] = ['light', 'dark']

const HITS = [
  { label: 'Amherst, Hampshire County, Massachusetts', latitudeDeg: 42.37, longitudeDeg: -72.52 },
  { label: 'Amherst, Erie County, New York', latitudeDeg: 42.98, longitudeDeg: -78.8 },
  { label: 'Amherst, Lorain County, Ohio', latitudeDeg: 41.4, longitudeDeg: -82.22 },
  { label: 'Amherst, Hillsborough County, New Hampshire', latitudeDeg: 42.86, longitudeDeg: -71.6 },
] as const

const settle = (collector: ContrastCollector): void => {
  expect(collector.audited(), 'the audit read no text at all').toBeGreaterThan(0)
  expect(collector.total(), `\n${collector.report()}`).toBe(0)
}

/** Every step of the accordion, in the order a grower reaches them */
const STEPS: readonly Step[] = [
  'place',
  'ground',
  'wants',
  'panels',
  'light',
  'plants',
  'calendar',
  'seasons',
  'check',
  'sources',
]

const auditStep = async (
  page: Page,
  collector: ContrastCollector,
  id: Step,
  label: string,
): Promise<void> => {
  await step(page, id)
  await expandAll(page)
  collector.add(`${label} / ${id} step at rest`, await auditContrast(page))
}

/**
 * The historical pair, recreated at runtime. `--accent-text` on `--bg` is what the
 * hovered active option actually painted before the fix, and nothing in the repository
 * is touched to get it: the rule is injected into the running page and thrown away with
 * the context.
 *
 * This test exists because an audit that can't fail is worse than no audit. If a selector rots, a
 * resolver returns null, or the walk stops finding text, every audit in this file goes green and
 * nobody learns anything. This one goes red first
 */
const SHIPPED_BUG = `
.picker-option-active:hover {
  background: var(--bg) !important;
  color: var(--accent-text) !important;
  border-color: var(--bg) !important;
}`

for (const scheme of SCHEMES) {
  test(`the audit still detects the pair that shipped (${scheme})`, async ({ page }) => {
    await openIn(page, scheme, { geocode: geocodeListBody(HITS) })
    const list = await searchAddress(page, 'Amherst')
    const active = list.getByRole('option').first()
    await expect(active).toHaveClass(/picker-option-active/)

    const within = '[data-testid="list-site-results"]'
    const clean = await auditHovered(page, active, within)
    expect(clean.violations, 'the fixed sheet is already failing').toEqual([])

    await page.addStyleTag({ content: SHIPPED_BUG })
    const broken = await auditHovered(page, active, within)
    expect(
      broken.violations.length,
      "the audit didn't see --accent-text painted on --bg",
    ).toBeGreaterThan(0)
    // it was about 1.1:1: anything that reports this as merely marginal isn't measuring
    const worst = Math.min(...broken.violations.map((finding) => finding.ratio))
    expect(worst).toBeLessThan(1.5)
    // and the report names something a developer can open
    expect(broken.violations[0]?.testId).toContain('item-site-result-')
    expect(broken.violations[0]?.path).toContain('picker-option-active')
  })

  /**
   * The regression test proper. Every state the picker has, in the order a user reaches
   * them, with the active-plus-hover intersection called out because that is the exact
   * combination that shipped broken
   */
  test(`the address picker keeps a legible pair in every option state (${scheme})`, async ({
    page,
  }) => {
    const found = contrastCollector()
    await openIn(page, scheme, { geocode: geocodeListBody(HITS) })
    const list = await searchAddress(page, 'Amherst')
    const options = list.getByRole('option')
    await expect(options).toHaveCount(HITS.length)

    const active = options.first()
    const inactive = options.nth(1)
    await expect(active).toHaveAttribute('aria-selected', 'true')
    await expect(active).toHaveClass(/picker-option-active/)

    const within = '[data-testid="list-site-results"]'
    found.add(`${scheme} picker at rest`, await auditContrast(page, { within }))
    found.add(
      `${scheme} picker hovering an INACTIVE option`,
      await auditHovered(page, inactive, within),
    )
    // the shipped bug, exactly: hover the option that is already .picker-option-active
    found.add(
      `${scheme} picker hovering the ACTIVE option`,
      await auditHovered(page, active, within),
    )

    // keyboard focus, which is a third rule in the same specificity fight
    await page.getByTestId('control-site-search').focus()
    await page.keyboard.press('ArrowDown')
    await expect(active).toBeFocused()
    found.add(
      `${scheme} picker with the active option focused`,
      await auditContrast(page, { within }),
    )
    found.add(
      `${scheme} picker hovering the focused active option`,
      await auditHovered(page, active, within),
    )

    // and walking the list with the keyboard moves the active pair with it
    await page.keyboard.press('ArrowDown')
    await expect(inactive).toBeFocused()
    await expect(inactive).toHaveClass(/picker-option-active/)
    found.add(
      `${scheme} picker hovering the second option once it's active`,
      await auditHovered(page, inactive, within),
    )

    settle(found)
  })

  test(`the design steps are legible at rest, hovered and focused (${scheme})`, async ({
    page,
  }) => {
    test.setTimeout(300_000)
    const found = contrastCollector()
    await openIn(page, scheme)
    await resolveSite(page)

    // the first five steps, each its own mounted surface, audited at rest in turn with its folds
    // open
    for (const id of ['place', 'ground', 'wants', 'panels', 'light'] as const) {
      await step(page, id)
      await expandAll(page)
      found.add(`${scheme} ${id} step at rest`, await auditContrast(page))
    }

    // the energy readouts, loss stack and LER breakdown only exist once the chain runs, and the
    // report sits on the panels step, behind the fold that holds the array editor
    await step(page, 'panels')
    await openFold(page, 'details-panels-by-hand')
    await page.getByTestId('control-energy-run').click()
    await expect(page.getByTestId('readout-energy-annual-ac')).toBeVisible()
    await expandAll(page)
    found.add(`${scheme} panels step with the energy report`, await auditContrast(page))

    // every step button in the stepper, selected and not, hovered
    for (const id of STEPS) {
      found.add(
        `${scheme} hovering action-step-${id}`,
        await auditHovered(
          page,
          page.getByTestId(`action-step-${id}`),
          '[data-testid="panel-stepper"]',
        ),
      )
    }

    // each control lives on a different step, so the step it needs travels with it, and the
    // folds are opened on the way: the light step's own press is offered only when the light won't
    // come by itself, so what is hovered there is the fold that explains the run
    const hoveredControls: readonly (readonly [string, Step])[] = [
      ['action-site-resolve', 'place'],
      ['action-site-geolocate', 'place'],
      ['action-sim-how', 'light'],
      ['control-energy-run', 'panels'],
      ['action-storage-save', 'check'],
      ['action-storage-reset', 'check'],
    ]
    for (const [id, on] of hoveredControls) {
      await step(page, on)
      await expandAll(page)
      found.add(
        `${scheme} hovering ${id}`,
        await auditHovered(page, page.getByTestId(id), `[data-testid="${id}"]`),
      )
    }

    // the focus sweep runs per step too: a closed step holds nothing tabbable to walk
    for (const id of ['place', 'ground', 'panels', 'light', 'check'] as const) {
      await step(page, id)
      found.addFocus(`${scheme} ${id} step focus indicators`, await auditFocusIndicators(page, 40))
    }

    // the saved-design notice repaints on every outcome, and its written and cleared states
    // only exist after the buttons are pressed, so the audit drives them rather than
    // reading whatever the page happened to boot with. Last, because the reset empties the
    // page the audits above depend on
    await step(page, 'check')
    const storage = '[data-testid="panel-storage"]'
    found.add(`${scheme} saved design at rest`, await auditContrast(page, { within: storage }))
    await page.getByTestId('action-storage-save').click()
    await expect(page.getByTestId('status-storage')).toHaveAttribute('data-state', 'saved')
    found.add(
      `${scheme} saved design after a write`,
      await auditContrast(page, { within: storage }),
    )
    // a reset puts the WHOLE design back to its defaults, `sidebarStep` included, so it
    // navigates the sidebar back to Place out from under this audit. Check has to be asked
    // for again before the panel it just wrote "cleared" onto is back on screen, and that press
    // is itself a saved change, so the panel may already read "saved" (see `forgetDesign`)
    await forgetTheDesign(page)
    await step(page, 'check')
    await expect(page.getByTestId('status-storage')).toHaveAttribute('data-state', /cleared|saved/)
    found.add(
      `${scheme} saved design after a reset`,
      await auditContrast(page, { within: storage }),
    )

    settle(found)
  })

  /**
   * The full surface: badges (verdict, evidence tier, compliance), the notices in every
   * state the run produces, yield bands, the folklore panel, the calendar legend and its
   * bars, and the DLI legend. `expandAll` first, because a claim hidden behind a
   * disclosure is still a claim the product renders
   */
  test(`every step stays legible after a bake and a ranking (${scheme})`, async ({ page }) => {
    test.setTimeout(BAKE_TIMEOUT_MS + 420_000)
    const found = contrastCollector()
    await rankedBedIn(page, scheme)
    await expect(page.getByTestId('status-autorun')).toHaveAttribute('data-state', 'ready', {
      timeout: AUTORUN_TIMEOUT_MS,
    })

    for (const id of STEPS) await auditStep(page, found, id, scheme)

    // the crop picker is the second listbox in the product and reuses the option rules the
    // hover bug lived in, so it gets the same treatment: inactive hovered, then the
    // intersection that shipped broken, hovering the option that is already chosen. It sits
    // behind the plants step's "Pick plants one at a time" fold
    await step(page, 'plants')
    await expandAll(page)
    const crops = page.getByTestId('list-bed-crops')
    await expect(crops).toBeVisible({ timeout: AUTORUN_TIMEOUT_MS })
    const cropWithin = '[data-testid="list-bed-crops"]'
    const chosen = crops.getByRole('option').first()
    found.add(`${scheme} crop picker at rest`, await auditContrast(page, { within: cropWithin }))
    found.add(
      `${scheme} crop picker hovering an INACTIVE option`,
      await auditHovered(page, crops.getByRole('option').nth(1), cropWithin),
    )
    await chosen.click()
    await expect(chosen).toHaveAttribute('aria-selected', 'true')
    found.add(
      `${scheme} crop picker hovering the CHOSEN option`,
      await auditHovered(page, chosen, cropWithin),
    )
    // and the text a placement produces: the derived dates, the badges on the row and any
    // refusal the combination wrote
    await page.getByTestId('action-bed-add-planting').click()
    await step(page, 'ground')
    await expect(page.getByTestId('readout-bed-plantings')).toHaveText('1')
    await step(page, 'plants')
    await expandAll(page)
    found.add(
      `${scheme} plants step carrying a planting`,
      await auditContrast(page, { within: '[data-testid="details-plants-by-hand"]' }),
    )

    // the three channels whose legends are recolored by the overlay field
    await step(page, 'light')
    for (const channel of ['rsr', 'sky-view-factor'] as const) {
      await page.getByTestId('control-overlay-channel').selectOption(channel)
      found.add(
        `${scheme} overlay legend on ${channel}`,
        await auditContrast(page, { within: '[data-testid="panel-overlay"]' }),
      )
    }

    // a ranked page is the only place badge-verdict-*, badge-feasibility-* and the
    // yield bands exist, so hover the row that carries them
    await step(page, 'plants')
    await expandAll(page)
    const firstRow = page.getByTestId(/^item-recommendation-/).first()
    await expect(firstRow).toBeVisible()
    const rowTestId = await firstRow.getAttribute('data-testid')
    found.add(
      `${scheme} hovering the top recommendation row`,
      await auditHovered(page, firstRow, `[data-testid="${String(rowTestId)}"]`),
    )

    settle(found)
  })

  /**
   * The agenda is the surface a novice lands on, and it's the one place in the product
   * where a row repaints on hover: `.agenda-item:hover` moves the background off the panel
   * color, which is exactly the rule shape that stranded `--accent-text` on `--bg` in the
   * picker. It's measured at rest, hovered, held down and with focus inside it, in both
   * schemes, and the shopping list is measured with it because its lines share the class
   */
  test(`the agenda is legible in every row state (${scheme})`, async ({ page }) => {
    test.setTimeout(BAKE_TIMEOUT_MS + 420_000)
    const found = contrastCollector()
    await rankedBedIn(page, scheme)
    await expect(page.getByTestId('status-autorun')).toHaveAttribute('data-state', 'ready', {
      timeout: AUTORUN_TIMEOUT_MS,
    })
    // an empty agenda is a state a real reader sees, so it's audited before anything is planted
    await step(page, 'calendar')
    const panel = '[data-testid="panel-agenda"]'
    found.add(`${scheme} agenda with nothing planted`, await auditContrast(page, { within: panel }))

    await addTopRankedPlanting(page)
    await step(page, 'plants')
    await expect(page.getByTestId('status-autorun')).toHaveAttribute('data-state', 'ready', {
      timeout: AUTORUN_TIMEOUT_MS,
    })
    await step(page, 'calendar')
    await expandAll(page)
    const row = page.locator('[data-testid^="item-agenda-"][data-action]').first()
    await expect(row).toBeVisible()
    const rowId = String(await row.getAttribute('data-testid'))
    const rowScope = `[data-testid="${rowId}"]`

    found.add(`${scheme} agenda at rest`, await auditContrast(page, { within: panel }))
    found.add(`${scheme} hovering an agenda row`, await auditHovered(page, row, rowScope))
    // held down, because :active is a third rule in the same specificity fight
    await row.hover()
    await page.mouse.down()
    found.add(`${scheme} agenda row held down`, await auditContrast(page, { within: rowScope }))
    await page.mouse.up()

    const supply = page.locator('[data-testid^="item-agenda-supply-"][data-quantity]').first()
    await expect(supply).toBeVisible()
    const supplyId = String(await supply.getAttribute('data-testid'))
    found.add(
      `${scheme} hovering a shopping line`,
      await auditHovered(page, supply, `[data-testid="${supplyId}"]`),
    )

    // the frost dial repaints every date in the panel, so the moved state is audited too
    await page.getByTestId('control-calendar-frost-percentile').selectOption('10')
    await step(page, 'plants')
    await expect(page.getByTestId('status-autorun')).toHaveAttribute('data-state', 'ready', {
      timeout: AUTORUN_TIMEOUT_MS,
    })
    await step(page, 'calendar')
    await expandAll(page)
    found.add(
      `${scheme} agenda after the frost dial moved`,
      await auditContrast(page, { within: panel }),
    )
    found.addFocus(`${scheme} agenda focus indicators`, await auditFocusIndicators(page, 60))

    settle(found)
  })

  /**
   * The like chips are the second place in the product where a selected state and a hover
   * state fight over one element, which is exactly what shipped broken in the address picker.
   * A chip cycles through prefer and avoid, and the two hard kinds, must have and never, are a
   * row per crop behind "More choices": four fills are in play, because a "Never" chip painted
   * in the accent green would read as approval, and each has to survive rest, hover, focus and
   * the selected-plus-hovered intersection in both schemes.
   *
   * The combination cards and the refusal groups are audited in the same pass because they
   * carry color the rest of the product doesn't: the confidence badges, the per-term
   * verdict badges and the colored rules down the side of a conflicting term
   */
  test(`the plants step is legible in every chip and card state (${scheme})`, async ({ page }) => {
    test.setTimeout(BAKE_TIMEOUT_MS + 480_000)
    const found = contrastCollector()
    await rankedBedIn(page, scheme, { soil: acidSoilBody(ACID_PH) })
    await setBedSoilPh(page, ACID_PH)
    await step(page, 'plants')

    const chips = page.locator('[data-testid^="control-plants-like-"]')
    await expect(chips.first()).toBeVisible({ timeout: AUTORUN_TIMEOUT_MS })
    const crops = await chips.evaluateAll((nodes) =>
      nodes.map((node) =>
        (node.getAttribute('data-testid') ?? '').replace('control-plants-like-', ''),
      ),
    )
    const [preferred, avoided, excluded] = crops.filter((cropId) => cropId !== 'blueberry')
    expect(preferred).toBeDefined()
    expect(avoided).toBeDefined()
    expect(excluded).toBeDefined()

    // one chip of each fill, so every selected color pair is on the page at once
    await setPreferenceKind(page, 'blueberry', 'require')
    await setPreferenceKind(page, String(preferred), 'prefer')
    await setPreferenceKind(page, String(avoided), 'avoid')
    await setPreferenceKind(page, String(excluded), 'exclude')

    const panel = '[data-testid="panel-plants"]'
    const likes = '[data-testid="list-plants-likes"]'
    found.add(`${scheme} like chips at rest`, await auditContrast(page, { within: likes }))

    const chosen = page.getByTestId(`control-plants-like-${String(preferred)}`)
    const plain = page.locator('[data-testid^="control-plants-like-"][data-kind="none"]').first()
    found.add(`${scheme} hovering an UNSELECTED chip`, await auditHovered(page, plain, likes))
    // the shipped cascade, recreated on the new control: hover the chip already selected
    found.add(
      `${scheme} hovering the SELECTED prefer chip`,
      await auditHovered(page, chosen, likes),
    )
    found.add(
      `${scheme} hovering the selected avoid chip`,
      await auditHovered(page, page.getByTestId(`control-plants-like-${String(avoided)}`), likes),
    )

    await chosen.focus()
    found.add(`${scheme} selected chip focused`, await auditContrast(page, { within: likes }))
    found.add(
      `${scheme} selected chip focused and hovered`,
      await auditHovered(page, chosen, likes),
    )

    // the two hard kinds, whose fills are the accent and --error, in their rows
    await openFold(page, 'details-plants-more')
    const more = '[data-testid="details-plants-more"]'
    found.add(`${scheme} preference rows at rest`, await auditContrast(page, { within: more }))
    for (const [cropId, kind] of [
      ['blueberry', 'require'],
      [String(excluded), 'exclude'],
    ] as const) {
      const scope = `[data-testid="item-polyculture-preference-${cropId}"]`
      found.add(
        `${scheme} hovering the selected ${kind} chip`,
        await auditHovered(
          page,
          page.getByTestId(`control-polyculture-kind-${cropId}-${kind}`),
          scope,
        ),
      )
    }
    found.add(`${scheme} deeper choices`, await auditContrast(page, { within: more }))

    // then the results: headline, badges, the eight-term breakdown and the refusal groups
    await openCombinations(page)
    await expandAll(page)
    found.add(`${scheme} combinations and refusals`, await auditContrast(page, { within: panel }))
    const card = page.getByTestId('item-polyculture-suggestion-0')
    await expect(card).toBeVisible()
    found.add(
      `${scheme} hovering a combination card`,
      await auditHovered(page, card, '[data-testid="item-polyculture-suggestion-0"]'),
    )
    found.add(
      `${scheme} the pH refusal group`,
      await auditContrast(page, {
        within: '[data-testid="item-polyculture-refusal-group-soil-ph"]',
      }),
    )
    found.addFocus(`${scheme} plants step focus indicators`, await auditFocusIndicators(page, 60))

    settle(found)
  })

  /**
   * `--error` on `--error-bg` and `--warn` on `--warn-bg` are pairs no healthy page ever
   * paints, so a rest-state sweep of a working app never audits them. A failure notice
   * that can't be read is a worse failure than the one it is reporting
   */
  test(`failure and warning notices are legible in the state that produces them (${scheme})`, async ({
    page,
  }) => {
    test.setTimeout(240_000)
    const found = contrastCollector()
    // a stored design this build can't read, so the warn pair on the storage notice is
    // painted by the boot itself rather than by anything the test has to fake afterward
    await seedStoredDesign(page, '{"version":999,"design":{}}')
    // the Check step waits on nothing, so the discarded-design notice can be reached at once. The
    // site is broken deliberately and last, once nothing past the Place step is still needed
    await openIn(page, scheme)
    await step(page, 'check')
    await expect(page.getByTestId('status-storage')).toHaveAttribute('data-state', 'discarded')
    found.add(
      `${scheme} discarded saved design notice`,
      await auditContrast(page, { within: '[data-testid="status-storage"]' }),
    )

    // and the standing warning notices, which are warn-on-warn-bg
    found.add(
      `${scheme} unquantified microclimate warning`,
      await auditContrast(page, { within: '[data-testid="readout-water-modeled"]' }),
    )
    found.add(
      `${scheme} not-a-determination warning`,
      await auditContrast(page, { within: '[data-testid="readout-compliance-determination"]' }),
    )

    // the energy chain refuses without an array, on its own notice: reachable because the site
    // is still resolved and the step stays open for it. Both presses sit behind the fold
    await step(page, 'panels')
    await openFold(page, 'details-panels-by-hand')
    await page.getByTestId('action-array-remove').click()
    await page.getByTestId('control-energy-run').click()
    await expect(page.getByTestId('status-energy')).toHaveAttribute('data-state', 'error')
    found.add(
      `${scheme} energy error notice`,
      await auditContrast(page, { within: '[data-testid="status-energy"]' }),
    )

    // an upstream that answers with no usable values: the site refuses and says why. Place
    // never locks, so its own notices stay legible even once nothing past it does.
    // `unroute` first, rather than layering a second handler: a route added on top of
    // `stubUpstreams`'s own falls back to it for anything it doesn't answer itself, and that
    // fallback is one thing too many to get right live against a real fetch race
    /*
     * BOTH spellings of the same upstream. The weather is fetched same-origin through
     * `/api/proxy/open-meteo/` so the edge cache can hold it, and overriding only the hostname
     * left this test's broken-upstream route matching nothing: the request fell through to the
     * fixture's healthy proxy stub, the site resolved perfectly, and the error notice this test
     * exists to photograph was never painted
     */
    const nulled = (route: Route): Promise<void> =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(
          route.request().url().includes('daily=')
            ? nulledDailyNormalsBody(LAT, LON)
            : hourlyArchiveBody(LAT, LON),
        ),
      })
    await page.unroute(/open-meteo\.com/)
    await page.unroute('**/api/proxy/open-meteo/**')
    await page.route(/open-meteo\.com/, nulled)
    await page.route('**/api/proxy/open-meteo/**', nulled)
    await step(page, 'place')
    /**
     * A DIFFERENT coordinate from the one the app already looked up on mount, and that is the
     * whole trick. `data/site.ts` caches a resolved site under `siteCacheKey`, which is the
     * coordinate, so re-resolving the same place answers out of the cache and never reaches the
     * upstream this test just broke: the site stays ready, and `status-site` is an `AsyncNotice`
     * that renders nothing at all when ready. Moving the pin is what makes the lookup happen
     */
    // the coordinate fields are reference material and sit behind the fold on this step
    await openFold(page, 'details-site-more')
    await page.getByTestId('control-site-latitude').fill(String(LAT + 3))
    await page.getByTestId('control-site-longitude').fill(String(LON + 3))
    await page.getByTestId('action-site-resolve').click()
    const status = page.getByTestId('status-site')
    await expect(status).toHaveAttribute('data-state', 'error', { timeout: 120_000 })
    // the site notice alone: the same lookup writes the weather, so its notice is suppressed
    // while it would only repeat the site's sentence
    found.add(
      `${scheme} site error notice`,
      await auditContrast(page, { within: '[data-testid="status-site"]' }),
    )

    // a search the geocoder can't answer paints the other error notice. On the proxy leg, because
    // the geocoders sit behind `/api/proxy` and that is the leg the browser calls
    const unusable = (route: Route): Promise<void> =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([{ display_name: 'x' }]),
      })
    await page.route('**/api/proxy/nominatim/**', unusable)
    await page.route('**/api/proxy/photon/**', unusable)
    await page.getByTestId('control-site-search').fill('nowhere at all')
    await page.getByTestId('action-site-search').click()
    await expect(page.getByTestId('status-site-search')).toBeVisible({ timeout: 30_000 })
    found.add(
      `${scheme} address search error notice`,
      await auditContrast(page, { within: '[data-testid="status-site-search"]' }),
    )

    settle(found)
  })

  /**
   * The questions are the first thing a novice meets, so every state they have is measured in
   * both schemes. The choice cards are the cascade that shipped broken in the address picker,
   * recreated on a radio drawn as a card: a card repaints its whole box on selection, so a hover
   * rule that set only `background` would strand `--accent-text` on `--bg` here in precisely the
   * way it did on `.picker-option`. The address picker itself is audited above
   */
  test(`the questions are legible in every step and option state (${scheme})`, async ({ page }) => {
    test.setTimeout(DESIGN_TIMEOUT_MS + 300_000)
    const found = contrastCollector()
    await openIn(page, scheme, { geocode: geocodeListBody(HITS) })
    const column = '[data-testid="panel-sidebar"]'
    await expect(page.getByTestId('panel-step-place')).not.toHaveAttribute('hidden', '')
    await expandAll(page)
    found.add(`${scheme} place question`, await auditContrast(page, { within: column }))

    // how big, and what shades it: the first choice cards the column reaches
    await nextStep(page, 'ground')
    await expandAll(page)
    found.add(`${scheme} ground question`, await auditContrast(page, { within: column }))
    const group = '[data-testid="control-onboarding-exposure"]'
    const preset = page.getByTestId('control-onboarding-exposure-open')
    const untouched = page.getByTestId('control-onboarding-exposure-overshadowed')
    await expect(preset).toBeChecked()
    found.add(`${scheme} choice cards at rest`, await auditContrast(page, { within: group }))
    found.add(
      `${scheme} hovering an UNSELECTED choice card`,
      await auditHovered(page, untouched, group),
    )
    found.add(`${scheme} hovering the SELECTED exposure`, await auditHovered(page, preset, group))
    await preset.focus()
    found.add(`${scheme} selected choice focused`, await auditContrast(page, { within: group }))
    found.add(
      `${scheme} selected choice focused and hovered`,
      await auditHovered(page, preset, group),
    )
    /*
     * The focus sweep runs here, one step past the address list.
     * It reads a control's styles before and after focus and reports any that doesn't
     * change. `index.css` gives `.picker-option-active` and `.picker-option:focus-visible`
     * the SAME declarations on purpose, so the option that is ALREADY the active one can't
     * change when focused, because it's already drawn the way focus would draw it. Every
     * option in that list was contrast-audited three states deep above
     */
    found.addFocus(
      `${scheme} ground question focus indicators`,
      await auditFocusIndicators(page, 30),
    )

    // what you want from it, with the sliders fold open
    await nextStep(page, 'wants')
    await expandAll(page)
    found.add(`${scheme} wants question`, await auditContrast(page, { within: column }))

    // where the panels go: the mounting fold, and the height fields, which only exist once a
    // limit is stated
    await nextStep(page, 'panels')
    await expandAll(page)
    found.add(`${scheme} panels question`, await auditContrast(page, { within: column }))
    await page.getByTestId('control-onboarding-height-limit').check()
    found.add(
      `${scheme} panels question with a height limit stated`,
      await auditContrast(page, { within: column }),
    )

    // and the comparison: the quality notice, the baseline, recommended and confidence
    // badges, the caveat lists and both tones of apply button
    await searchLayouts(page)
    await expandAll(page)
    /*
     * The figures a novice never sees are still text this product renders, so the audit asks for
     * them: everything below is then the superset of both readers' views. Asked for here because
     * here is where the switch lives, and where the cards it changes are on screen
     */
    await page.getByTestId('control-onboarding-experience-experienced').check()
    await expandAll(page)
    found.add(`${scheme} comparison at rest`, await auditContrast(page, { within: column }))
    const suggested = await recommendedArchetype(page)
    const card = `[data-testid="item-onboarding-scenario-${suggested}"]`
    await showArchetype(page, suggested)
    found.add(
      `${scheme} hovering the suggested layout card`,
      await auditHovered(page, page.getByTestId(`item-onboarding-scenario-${suggested}`), card),
    )
    /*
     * Shown, then hovered. The comparison shows one layout at a time, so hovering a card's
     * Apply means bringing that card up first: without this the audit sat on
     * `action-onboarding-apply-no-array-control` until the test timed out, on a control that was
     * one press away the whole time
     */
    for (const archetype of ['no-array-control', suggested]) {
      await showArchetype(page, archetype)
      found.add(
        `${scheme} hovering apply on ${archetype}`,
        await auditHovered(
          page,
          page.getByTestId(`action-onboarding-apply-${archetype}`),
          `[data-testid="action-onboarding-apply-${archetype}"]`,
        ),
      )
    }
    await showArchetype(page, suggested)
    // a tab press swaps the card, and a fresh card brings its `<details>` back shut: the figures
    // are inside one, so the disclosure has to be reopened on whatever card was landed on
    await expandAll(page)
    await expect(page.getByTestId(`readout-onboarding-figures-${suggested}`)).toBeVisible()
    found.addFocus(`${scheme} comparison focus indicators`, await auditFocusIndicators(page, 40))

    // and the surface the questions end on: what it planted, the bed cards, the like chips, the
    // zone badges and per-bed figures behind the plan fold, and the button that undoes it all
    await (await revealLayout(page, suggested)).click()
    await expect(page.getByTestId('panel-step-plants')).not.toHaveAttribute('hidden', '')
    await expect(page.getByTestId('readout-plants-status')).toContainText(/planted for you/i, {
      timeout: AUTORUN_TIMEOUT_MS,
    })
    await expandAll(page)
    const plants = '[data-testid="panel-plants"]'
    found.add(`${scheme} planted garden at rest`, await auditContrast(page, { within: plants }))
    const bedCard = page.locator('[data-testid^="item-plants-bed-"]').first()
    await expect(bedCard).toBeVisible()
    const bedTestId = await bedCard.getAttribute('data-testid')
    found.add(
      `${scheme} hovering a bed card`,
      await auditHovered(page, bedCard, `[data-testid="${String(bedTestId)}"]`),
    )
    const planBed = page.locator('[data-testid^="item-plan-bed-"]').first()
    await expect(planBed).toBeVisible()
    const planBedTestId = await planBed.getAttribute('data-testid')
    found.add(
      `${scheme} hovering a generated bed`,
      await auditHovered(page, planBed, `[data-testid="${String(planBedTestId)}"]`),
    )
    found.add(
      `${scheme} hovering the undo button`,
      await auditHovered(
        page,
        page.getByTestId('action-plants-undo'),
        '[data-testid="action-plants-undo"]',
      ),
    )
    found.addFocus(
      `${scheme} planted garden focus indicators`,
      await auditFocusIndicators(page, 40),
    )

    settle(found)
  })
}

/**
 * The example banner is the one piece of chrome painted over the 3D canvas, and it's the
 * first thing on screen. Its container isn't interactive, so the container's own pair is
 * all there is to check there. The button inside it is, so it's checked at rest, hovered
 * and focused, in both schemes
 */
for (const scheme of SCHEMES) {
  test(`the example banner reads in ${scheme}`, async ({ page }) => {
    test.setTimeout(180_000)
    await openIn(page, scheme, { exampleGarden: true })
    const within = '[data-testid="panel-example"]'
    await expect(page.getByTestId('panel-example')).toBeVisible({ timeout: 60_000 })

    const found = contrastCollector()
    found.add(`${scheme} example banner at rest`, await auditContrast(page, { within }))
    found.add(
      `${scheme} hovering the clear control`,
      await auditHovered(page, page.getByTestId('action-example-clear'), within),
    )
    found.addFocus(`${scheme} example banner focus indicators`, await auditFocusIndicators(page, 8))
    settle(found)
  })
}

/**
 * The phone chrome, which no other audit in this file can see.
 *
 * Everything above runs at the project's 1280-wide viewport, and the tab bar is `display: none`
 * there: it's the whole of the mobile navigation. The example notice is folded to a line at this
 * width too, so its close and its More control are a different pair of states from the ones the
 * desktop test above checks.
 *
 * 320x568 rather than a roomier phone, because that is where the mobile audit found everything
 * else and because a narrower bar puts more of its label on one line
 */
for (const scheme of SCHEMES) {
  test(`the phone chrome reads in ${scheme}`, async ({ page }) => {
    test.setTimeout(180_000)
    await page.setViewportSize({ width: 320, height: 568 })
    await openIn(page, scheme, { exampleGarden: true })

    const found = contrastCollector()
    const bar = '[data-testid="panel-tabbar"]'
    await expect(page.getByTestId('panel-tabbar')).toBeVisible()
    // a first visit opens on the plan, so the bar is over a panel: the current tab and the one
    // that is not are different pairs, and both are on screen at once, so one audit of the bar
    // covers them together
    found.add(`${scheme} tab bar over the plan`, await auditContrast(page, { within: bar }))
    found.add(
      `${scheme} hovering a tab that is not current`,
      await auditHovered(page, page.getByTestId('action-tab-garden'), bar),
    )
    found.add(
      `${scheme} hovering the current tab`,
      await auditHovered(page, page.getByTestId('action-tab-edit'), bar),
    )

    // and over the garden, where the bar is over the 3D rather than a panel, with the strip
    // back to the plan pinned across the top of it
    await page.getByTestId('action-tab-garden').click()
    found.add(`${scheme} tab bar over the garden`, await auditContrast(page, { within: bar }))
    const strip = '[data-testid="action-garden-plan"]'
    found.add(`${scheme} strip back to the plan`, await auditContrast(page, { within: strip }))
    found.add(
      `${scheme} hovering the strip back to the plan`,
      await auditHovered(page, page.getByTestId('action-garden-plan'), strip),
    )

    // the notice, folded, which is a shape it only ever takes at this width
    const notice = '[data-testid="panel-example"]'
    await expect(page.getByTestId('panel-example')).toBeVisible({ timeout: 60_000 })
    found.add(`${scheme} folded example notice`, await auditContrast(page, { within: notice }))
    found.add(
      `${scheme} hovering the notice close`,
      await auditHovered(page, page.getByTestId('action-example-dismiss'), notice),
    )
    found.add(
      `${scheme} hovering the fold`,
      await auditHovered(page, page.getByTestId('action-example-expand'), notice),
    )
    await page.getByTestId('action-example-expand').click()
    found.add(`${scheme} unfolded example notice`, await auditContrast(page, { within: notice }))

    /*
      And the color key, which grew the same kind of control for the same reason and is the one
      surface in this app whose whole subject is color. Both of its states are audited: unfolded
      it is a caption, a ramp, the iso-line ticks and the range, and folded it is a caption and
      this control, which is a pair the desktop legend never forms
    */
    const legend = '[data-testid="readout-overlay-legend"]'
    await expect(page.getByTestId('readout-overlay-legend')).toBeVisible()
    found.add(`${scheme} color key`, await auditContrast(page, { within: legend }))
    found.add(
      `${scheme} hovering the key fold`,
      await auditHovered(page, page.getByTestId('action-legend-fold'), legend),
    )
    await page.getByTestId('action-legend-fold').click()
    found.add(`${scheme} folded color key`, await auditContrast(page, { within: legend }))
    await page.getByTestId('action-legend-fold').click()

    found.addFocus(`${scheme} phone chrome focus indicators`, await auditFocusIndicators(page, 12))
    settle(found)
  })
}

/**
 * The conversational surface, in both schemes.
 *
 * Every state it can take is a color pair the rest of the app doesn't form: two bubble kinds
 * against each other, a chip, a supporting line at 0.82rem, and the caveat rule. The caveat is
 * the one worth auditing hardest: it's drawn with `--warn` beside body-sized text precisely so
 * it can't be read as small print, and a caveat nobody can read is the failure this app's whole
 * citation doctrine is built to avoid.
 *
 * 320x568, like the phone chrome above, and for the same reason: it's the width everything else
 * broke at, and a chat bubble has the least room to spare there
 */
for (const scheme of SCHEMES) {
  test(`the agent reads in ${scheme}`, async ({ page }) => {
    // biome-ignore lint/suspicious/noSkippedTests: gated on the build flag, see `AGENT_IN_BUILD`
    test.skip(!AGENT_IN_BUILD, 'built without the agent: run with VITE_AGENT=on')
    test.setTimeout(180_000)
    await page.setViewportSize({ width: 320, height: 568 })
    await openIn(page, scheme, { exampleGarden: true })

    const found = contrastCollector()
    const agent = '[data-testid="panel-agent"]'
    await page.getByTestId('action-tab-chat').click()
    await expect(page.getByTestId('panel-agent')).toBeVisible()
    found.add(`${scheme} agent at rest`, await auditContrast(page, { within: agent }))
    found.add(
      `${scheme} hovering send`,
      await auditHovered(page, page.getByTestId('action-agent-send'), agent),
    )

    // a turn of each kind on screen at once: what was said, what was answered, the caveat that
    // qualifies it, and the chips underneath
    await page.getByTestId('input-agent').fill('i want to grow tomatoes')
    await page.getByTestId('action-agent-send').click()
    await expect(page.getByTestId('item-agent-turn-us')).toHaveCount(1, { timeout: 30_000 })
    await expect(page.locator('[data-tone="caveat"]').first()).toBeVisible()
    found.add(
      `${scheme} agent with a reply and its caveat`,
      await auditContrast(page, { within: agent }),
    )

    // and a refusal, which is the other half of what it says and uses the chips for recovery
    await page.getByTestId('input-agent').fill('what about the shade')
    await page.getByTestId('action-agent-send').click()
    await expect(page.getByTestId('item-agent-turn-us')).toHaveCount(2, { timeout: 30_000 })
    const chip = page.locator('.agent-chip').first()
    await expect(chip).toBeVisible()
    found.add(`${scheme} agent offering a way out`, await auditContrast(page, { within: agent }))
    found.add(`${scheme} hovering a chip`, await auditHovered(page, chip, agent))

    found.addFocus(`${scheme} agent focus indicators`, await auditFocusIndicators(page, 12))

    /*
      And again on a laptop, where it's a different surface: it takes the editor's column rather
      than the whole screen, so it paints on `--panel` against a border instead of on `--bg`, and
      it's reached from the toolbar rather than the tab bar. A pair audited at 320px says nothing
      about the pair that ships at 1280
    */
    await page.setViewportSize({ width: 1280, height: 800 })
    // already on the conversation from the phone half above, so the resize is the whole change
    await expect(page.getByTestId('panel-agent')).toBeVisible()
    await expect(page.getByTestId('action-toolbar-ask')).toHaveAttribute('aria-pressed', 'true')
    found.add(`${scheme} agent in the editor column`, await auditContrast(page, { within: agent }))
    found.add(
      `${scheme} hovering ask`,
      await auditHovered(
        page,
        page.getByTestId('action-toolbar-ask'),
        '[data-testid="panel-toolbar"]',
      ),
    )
    settle(found)
  })
}
