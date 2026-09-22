import { expect } from '@playwright/test'
import type { CaptionAt, Director } from './overlay.ts'

/**
 * The film itself: what is said, what is done while it is being said, and which of the two cuts
 * each moment belongs to.
 *
 * A single table drives both cuts. A short cut that drifted out of step with the long one
 * would be two films to keep true as the product changes, and the short cut is the one that
 * gets emailed, so it is the one that must never be showing a screen the app no longer has.
 *
 * Nothing here asserts a figure. The captions are allowed to say what a panel is FOR and what
 * the tool refuses to do, both of which are stable, and are not allowed to quote a number the
 * engine is free to change. The one exception is the scope statement, which is quoted because
 * the product's own words are the point of that beat
 */

export type Cut = 'short' | 'full'

export interface Beat {
  /** What is on the caption bar. Also, one line of the voiceover script this run emits */
  readonly caption: string
  readonly at?: CaptionAt
  readonly cuts: readonly Cut[]
  /** Present on the first beat of a chapter, and it plays the title card before the caption */
  readonly chapter?: readonly [string, string]
  readonly run?: (d: Director) => Promise<void>
}

const BOTH: readonly Cut[] = ['short', 'full']
const FULL: readonly Cut[] = ['full']

/* ------------------------------- shared movements ------------------------------- */

/**
 * Opens one step of the column, the way a viewer would: by its header, which is also where the
 * camera has to be looking. Every beat that belongs to a step says which one, so the short cut,
 * which skips beats, still lands on the right screen
 */
const sidebarStep = async (d: Director, id: string): Promise<void> => {
  const header = d.page.getByTestId(`action-step-${id}`)
  if ((await header.getAttribute('aria-expanded')) === 'true') return
  await d.click(header)
  await expect(d.page.getByTestId(`panel-step-${id}`)).not.toHaveAttribute('hidden', '', {
    timeout: 60_000,
  })
  await d.hold(800)
}

/** A `details` opens from its summary, which is the only part of it that is a control */
const openDetails = async (d: Director, testId: string): Promise<boolean> => {
  const details = d.page.getByTestId(testId).first()
  if ((await details.count()) === 0) return false
  if ((await details.getAttribute('open')) !== null) return true
  const summary = details.locator('summary').first()
  if ((await summary.count()) === 0) return false
  await d.click(summary)
  await d.hold(600)
  return true
}

/**
 * The address search against the real geocoder, with one retry.
 *
 * Nominatim is a free service with a rate limit, and this is the one moment of the film that
 * depends on a third-party server answering. A retry is not flake-hiding here: a visitor whose
 * first search came back with nothing would press it again too
 */
const chooseSite = async (d: Director, query: string): Promise<void> => {
  await d.write('control-site-search', query)
  await d.click('action-site-search')
  const results = d.page.getByTestId('list-site-results')
  try {
    await expect(results).toBeVisible({ timeout: 30_000 })
  } catch {
    await d.click('action-site-search')
    await expect(results).toBeVisible({ timeout: 60_000 })
  }
  await d.click(d.page.locator('[data-testid^="item-site-result-"]').first())
  await expect(d.page.getByTestId('readout-site-selection')).toBeVisible({ timeout: 60_000 })
}

/**
 * The wait on the layout search, filled with the garden in motion.
 *
 * This is real work: a year of hourly weather run over every candidate layout, with a progress
 * bar reading actual passes. It can run for a minute or more, so
 * the camera orbits while it does and the captions say what is happening
 */
const RETRIES = 4

const waitForLayouts = async (d: Director): Promise<void> => {
  const scenarios = d.page.getByTestId('list-onboarding-scenarios')
  const failed = d.page.getByTestId('status-onboarding-designs')
  const deadline = Date.now() + 480_000
  let attempts = 0
  while (Date.now() < deadline) {
    if (await scenarios.isVisible()) return
    /*
     * An upstream said no, and the search press is the retry.
     *
     * Open-Meteo rate-limits its free tier, and a run can come back with `open-meteo responded
     * 429` under the search. That is not a fault in the app, which surfaces the refusal in place
     * of inventing a year of weather, and it is not one in the recording either. A visitor who saw
     * it would wait a moment and press the button again, so that is what this does, while the
     * camera keeps moving
     */
    if (attempts < RETRIES && (await failed.count()) > 0 && (await failed.isVisible())) {
      attempts += 1
      for (let held = 0; held < 8; held += 1) await d.orbit(5, 2.4)
      await d.click('action-layouts-search')
      continue
    }
    await d.orbit(9, 2.6)
  }
  await expect(scenarios).toBeVisible({ timeout: 60_000 })
}

/** The layout the search marked, off its tab, which is on screen whichever card is */
const recommended = async (d: Director): Promise<string> => {
  const marked = d.page.locator('[data-recommended="true"]').first()
  await expect(marked).toBeVisible({ timeout: 60_000 })
  return (await marked.getAttribute('data-archetype')) ?? ''
}

/** Brings one layout's card up, by its tab, when it is not the card already showing */
const showLayout = async (d: Director, archetype: string): Promise<void> => {
  const card = d.page.getByTestId(`item-onboarding-scenario-${archetype}`)
  if ((await card.count()) > 0) return
  const tab = d.page.getByTestId(`action-onboarding-show-${archetype}`)
  if ((await tab.count()) === 0) return
  await d.click(tab)
}

/**
 * Applies the best layout that actually has panels, and this is the one editorial decision in the
 * whole film, so it is written down here, in the open.
 *
 * The comparison is allowed to recommend the open sky, and on a small plot aimed squarely at food
 * it frequently does: a 71 m² plot in New Jersey asking mostly for
 * food can land on "no panels at all" as the honest suggestion. That is the tool being honest, and it is the entire
 * reason the baseline is in the comparison. It also produces a film about agrivoltaics that ends
 * on a garden with no photovoltaics in it.
 *
 * So the recording does what a visitor who came here about panels would do: read the
 * recommendation, then ask for the panelled option anyway, which is the question this tool exists
 * to answer. The caption on the beat before this says exactly that out loud, so nothing is being
 * hidden from the viewer: the suggestion is on screen, and so is the decision to go past it
 */
const applyPanelled = async (d: Director): Promise<void> => {
  const tabs = d.page.locator('[data-testid^="action-onboarding-show-"]')
  const options = await tabs.evaluateAll((nodes) =>
    nodes.map((node) => ({
      archetype: node.getAttribute('data-archetype') ?? '',
      baseline: node.getAttribute('data-baseline') === 'true',
    })),
  )
  const chosen =
    options.find((option) => !option.baseline && option.archetype !== '') ??
    options[0] ??
    // a set of one has no row: the one card on screen is the whole set
    ({
      archetype:
        (await d.page
          .locator('[data-testid^="item-onboarding-scenario-"]')
          .first()
          .getAttribute('data-archetype')) ?? '',
      baseline: false,
    } as const)
  if (chosen.archetype === '') return
  await showLayout(d, chosen.archetype)
  await d.click(`action-onboarding-apply-${chosen.archetype}`)
}

/** Points at something only if this build has it, so an optional panel never stops the recording */
const pointIfPresent = async (d: Director, testId: string): Promise<boolean> => {
  const locator = d.page.getByTestId(testId).first()
  if ((await locator.count()) === 0) return false
  await d.point(locator)
  return true
}

/**
 * The light, computed and ready, which is a step of the product. It is not a detail of the
 * recording.
 *
 * The layout search bakes every layout at full quality. The light check runs again by itself
 * once a layout is applied, and nothing downstream of the light unlocks until it has: a film
 * that raced ahead would reach the crop picker and find the step still waiting on the light. The
 * camera orbits while it works, and the one press left on the light step is for a run that failed
 */
const waitForLight = async (d: Director): Promise<void> => {
  const status = d.page.getByTestId('status-simulation')
  const deadline = Date.now() + 480_000
  while (Date.now() < deadline) {
    const state = await status.getAttribute('data-sim-state')
    const stale = (await status.getAttribute('data-sim-stale')) !== null
    if (state === 'error') {
      await d.click('action-sim-final')
    } else if (state === 'ready' && !stale) {
      return
    }
    await d.orbit(7, 2.4)
  }
}

/* ------------------------------------ the film ----------------------------------- */

export const BEATS: readonly Beat[] = [
  /* ---------------------------- 1. what you land on ---------------------------- */
  {
    chapter: ['Agrivoltaic garden model', 'Where the panels go, and what still grows underneath'],
    caption:
      'This tool computes where solar panels could stand over a garden, and what will still grow in the shade they cast.',
    cuts: BOTH,
    run: async (d) => {
      await d.hold(1400)
    },
  },
  {
    caption:
      'It opens on a worked example and reads it back to you: two beds, and which of them the panels leave brighter.',
    cuts: BOTH,
    run: async (d) => {
      await pointIfPresent(d, 'panel-cold-open')
      await d.hold(900)
    },
  },
  {
    caption:
      'The garden is a 3D model. You can walk around it at any point without leaving whatever you were doing.',
    cuts: BOTH,
    run: async (d) => {
      await d.page.evaluate(() => window.__demo.mark(null))
      await d.orbit(24, 3.2)
    },
  },
  {
    caption:
      'The colours on the ground are the light itself, and the scale that explains them is pinned over the surface it describes.',
    at: 'bottom',
    cuts: FULL,
    run: async (d) => {
      await pointIfPresent(d, 'readout-overlay-legend')
    },
  },

  /* ------------------------------ 2. the questions ------------------------------ */
  {
    chapter: ['Four questions', 'Each one answerable without looking anything up'],
    caption:
      'The plan is one column of steps, and the first four are questions. None of them mentions tilt, pitch, ground cover ratio or daily light integral. Turning an answer into those is the engine’s job.',
    cuts: BOTH,
    run: async (d) => {
      await sidebarStep(d, 'place')
      await d.point('panel-stepper')
    },
  },
  {
    caption:
      'First, where the space is. The place decides how much sun reaches it and how long things can grow.',
    cuts: BOTH,
    run: async (d) => {
      await sidebarStep(d, 'place')
      await chooseSite(d, 'New Brunswick, New Jersey')
    },
  },
  {
    caption:
      'That search is live, and so is everything behind it: real weather for those coordinates, real soil, real ground elevation. Nothing here is a stand-in.',
    cuts: BOTH,
    run: async (d) => {
      await pointIfPresent(d, 'readout-onboarding-season')
    },
  },
  {
    caption:
      'How big is it. A rough rectangle is enough, in metres or feet, and the plot on the garden follows what you type.',
    cuts: BOTH,
    run: async (d) => {
      await d.click('action-step-next')
      await sidebarStep(d, 'ground')
      await d.write('control-plot-width-m', '9')
      await d.write('control-plot-depth-m', '8')
      await pointIfPresent(d, 'readout-plot-area')
    },
  },
  {
    caption:
      'What is already around it. Buildings, fences and trees shade a space before any panel does, so this says how much sun the ground starts with.',
    cuts: FULL,
    run: async (d) => {
      await sidebarStep(d, 'ground')
      await d.choose('control-onboarding-exposure-partly-sheltered')
    },
  },
  {
    caption:
      'And whether you can water it in a dry spell, because shade is what keeps the ground damp when nobody is watering.',
    cuts: BOTH,
    run: async (d) => {
      await sidebarStep(d, 'ground')
      await pointIfPresent(d, 'control-onboarding-irrigation')
    },
  },
  {
    caption:
      'What you would like to grow. Some crops are happy in shade and some sulk in it, so this decides how much shade the layout is allowed to cast at all.',
    cuts: BOTH,
    run: async (d) => {
      await d.click('action-step-next')
      await sidebarStep(d, 'wants')
      await d.choose('control-onboarding-ambition-mixed-vegetables')
    },
  },
  {
    caption:
      'What you want most out of it. There is no wrong answer: this decides how much of the sunlight goes to the panels and how much is left for the plants.',
    cuts: BOTH,
    run: async (d) => {
      await sidebarStep(d, 'wants')
      await d.choose('control-onboarding-objective-mostly-food')
      await pointIfPresent(d, 'readout-onboarding-objective-help')
    },
  },
  {
    caption:
      'And if you would rather set the mix yourself, the four sliders underneath are exactly what that choice was writing.',
    cuts: FULL,
    run: async (d) => {
      await openDetails(d, 'panel-onboarding-weights')
      await pointIfPresent(d, 'control-onboarding-weight-food')
    },
  },
  {
    caption:
      'How the panels should sit, which decides where their shade falls and how much of the space you can still walk and dig in.',
    cuts: FULL,
    run: async (d) => {
      await d.click('action-step-next')
      await sidebarStep(d, 'panels')
      await openDetails(d, 'details-panels-mounting')
      await d.choose('control-onboarding-mounting-overhead-canopy')
    },
  },
  {
    caption:
      'Whether anything limits the height: a local rule, a neighbour’s view, or simply what you are willing to look at.',
    cuts: FULL,
    run: async (d) => {
      await sidebarStep(d, 'panels')
      await openDetails(d, 'details-panels-mounting')
      await d.choose('control-onboarding-height-limit')
      await pointIfPresent(d, 'control-onboarding-max-height-m')
    },
  },

  /* --------------------------- 3. layouts, side by side --------------------------- */
  {
    chapter: ['Five layouts', 'And the open sky, so the panels cost something'],
    caption:
      'Now it runs a year of hourly weather over each candidate layout. The progress bar counts real passes.',
    cuts: BOTH,
    run: async (d) => {
      await sidebarStep(d, 'panels')
      await d.click('action-layouts-search')
      await pointIfPresent(d, 'status-onboarding-progress')
      await waitForLayouts(d)
    },
  },
  {
    caption:
      'The comparison always includes the same space with no panels at all. That’s the baseline, so the panels can be seen to cost something as well as give.',
    cuts: BOTH,
    run: async (d) => {
      await showLayout(d, 'no-array-control')
      await pointIfPresent(d, 'badge-onboarding-baseline')
    },
  },
  {
    caption:
      'Each option says what it leaves on the ground, what it would generate, how many beds fit the light it leaves, and how confident the tool is about its own answer.',
    cuts: BOTH,
    run: async (d) => {
      const archetype = await recommended(d)
      await showLayout(d, archetype)
      await pointIfPresent(d, `readout-onboarding-key-figures-${archetype}`)
      await pointIfPresent(d, `badge-onboarding-confidence-${archetype}`)
    },
  },
  {
    caption:
      'By default it keeps the finer figures out of the way. Ask for them and they appear. A caveat is always shown.',
    cuts: BOTH,
    run: async (d) => {
      await d.choose('control-onboarding-experience-experienced')
      const archetype = await recommended(d)
      await openDetails(d, `details-onboarding-flags-${archetype}`)
      await pointIfPresent(d, `readout-onboarding-figures-${archetype}`)
    },
  },
  {
    caption:
      'Where the evidence will not carry a single number, you get a band and the reason for it. The tool would rather refuse a point estimate than invent one.',
    cuts: BOTH,
    run: async (d) => {
      const archetype = await recommended(d)
      await openDetails(d, `details-onboarding-flags-${archetype}`)
      await pointIfPresent(d, `readout-onboarding-summary-${archetype}`)
    },
  },
  {
    caption:
      'It is also allowed to recommend no panels at all, and on a small plot aimed squarely at food it often does. Ask for the panelled option anyway, and it will tell you exactly what that costs you.',
    cuts: BOTH,
    run: async (d) => {
      await openDetails(d, 'details-onboarding-explainer')
      await pointIfPresent(d, 'readout-onboarding-why')
      await d.hold(700)
    },
  },
  {
    caption:
      'The garden shows whichever layout you are reading about, so you can look at any of them before committing, and then commit to the one you want.',
    cuts: FULL,
    run: async (d) => {
      const tabs = d.page.locator('[data-testid^="action-onboarding-show-"]')
      if ((await tabs.count()) > 1) {
        await d.click(tabs.nth(1))
        await d.orbit(18, 2.6)
      }
    },
  },

  /* ---------------------------- 4. what goes in the beds ---------------------------- */
  {
    chapter: ['What goes in the beds', 'Planted for you, and yours to change'],
    caption:
      'Using a layout places the beds where its light falls and plants each one with the best combination the tool found for it. Which crops a bed can carry depends on the light that bed gets, and that doesn’t exist until a layout does.',
    cuts: BOTH,
    run: async (d) => {
      await applyPanelled(d)
      await expect(d.page.getByTestId('panel-step-plants')).not.toHaveAttribute('hidden', '', {
        timeout: 60_000,
      })
      await pointIfPresent(d, 'readout-plants-status')
      await pointIfPresent(d, 'list-plants-beds')
    },
  },
  {
    caption:
      'Each bed says what went in and why. If you would rather eat something else, try another mix: the next combination that fits the light that bed gets.',
    cuts: BOTH,
    run: async (d) => {
      const next = d.page.locator('[data-testid^="action-plants-next-mix-"]').first()
      if ((await next.count()) > 0 && (await next.isEnabled())) {
        const bedId = ((await next.getAttribute('data-testid')) ?? '').replace(
          'action-plants-next-mix-',
          '',
        )
        await d.click(next)
        await pointIfPresent(d, `status-plants-mix-${bedId}`)
      }
    },
  },
  {
    caption:
      'Or say what you like to eat. Press a plant once to prefer it and again to avoid it, and every bed is planted again around what you said.',
    cuts: FULL,
    run: async (d) => {
      const chip = d.page.locator('[data-testid^="control-plants-like-"]').first()
      if ((await chip.count()) > 0) await d.click(chip)
      await pointIfPresent(d, 'status-plants-replanted')
    },
  },
  {
    caption:
      'Two switches for what lives in the garden: flowers for bees, and wild plants from around here. Both are a preference and not a filter: they nudge the order crops come back in, and take nothing off the list.',
    cuts: FULL,
    run: async (d) => {
      await pointIfPresent(d, 'control-plants-pollinators')
      await pointIfPresent(d, 'control-plants-natives')
    },
  },

  /* --------------------------------- 5. the editor --------------------------------- */
  {
    chapter: ['The rest of the column', 'Ten steps, in the only order they can be answered'],
    caption:
      'The steps are a chain: a place has weather, weather and geometry make a light field, and only a light field can say which crops suit a bed.',
    cuts: BOTH,
    run: async (d) => {
      await pointIfPresent(d, 'panel-stepper')
      await d.hold(1000)
    },
  },
  {
    caption:
      'What the search decided is one fold under the beds, so a new layout always arrives with its reasoning on screen.',
    at: 'bottom',
    cuts: FULL,
    run: async (d) => {
      await openDetails(d, 'details-plants-plan')
      await pointIfPresent(d, 'list-plan-beds')
      await d.hold(700)
    },
  },
  {
    caption:
      'The site, with its coordinates, the weather it pulled, and where each of those came from.',
    at: 'bottom',
    cuts: FULL,
    run: async (d) => {
      await sidebarStep(d, 'place')
      await openDetails(d, 'details-site-more')
      await pointIfPresent(d, 'readout-toolbar-site')
    },
  },
  {
    caption: 'The ground: beds you can draw yourself, with their soil and whether they are raised.',
    at: 'bottom',
    cuts: FULL,
    run: async (d) => {
      await sidebarStep(d, 'ground')
      await openDetails(d, 'details-ground-beds')
      await pointIfPresent(d, 'control-bed-select')
    },
  },
  {
    caption: 'The panels, which you can move, rotate and re-pitch over the beds as they stand.',
    at: 'bottom',
    cuts: FULL,
    run: async (d) => {
      await sidebarStep(d, 'panels')
      await openDetails(d, 'details-panels-by-hand')
      await d.orbit(16, 2.4)
    },
  },
  {
    caption:
      'And the light. The colours on the ground are daily light integral, month by month, and you can play a year across the garden and watch the shade move with the season.',
    at: 'bottom',
    cuts: BOTH,
    run: async (d) => {
      await sidebarStep(d, 'light')
      await pointIfPresent(d, 'control-overlay-channel')
      const play = d.page.getByTestId('action-overlay-play')
      if ((await play.count()) > 0 && (await play.isEnabled())) {
        await d.click(play)
        await d.hold(7000)
      }
    },
  },
  {
    caption:
      'Every layout was compared on the full light run. It runs again by itself once the layout is chosen, and again whenever the garden changes.',
    at: 'bottom',
    cuts: BOTH,
    run: async (d) => {
      await pointIfPresent(d, 'status-simulation')
      await waitForLight(d)
    },
  },
  {
    caption: 'What you can grow, ranked against the light each bed receives.',
    at: 'bottom',
    cuts: BOTH,
    run: async (d) => {
      await sidebarStep(d, 'plants')
      await openDetails(d, 'details-plants-by-hand')
      await pointIfPresent(d, 'list-bed-crops')
    },
  },
  {
    caption:
      'What grows well together, which is a separate question from what grows here at all, and is answered from its own evidence.',
    at: 'bottom',
    cuts: FULL,
    run: async (d) => {
      await sidebarStep(d, 'plants')
      await openDetails(d, 'details-plants-combinations')
      await pointIfPresent(d, 'list-plants-combinations')
    },
  },
  {
    caption: 'When to plant it: what to do this week, and then the whole year as a timetable.',
    at: 'bottom',
    cuts: FULL,
    run: async (d) => {
      await sidebarStep(d, 'calendar')
      await pointIfPresent(d, 'list-calendar')
      await d.hold(800)
    },
  },
  {
    caption:
      'Then the checks: water balance, the compliance notes, and saving the design so it is there when you come back.',
    at: 'bottom',
    cuts: FULL,
    run: async (d) => {
      await sidebarStep(d, 'check')
      await pointIfPresent(d, 'control-water-bed')
      await d.hold(900)
    },
  },

  /* ------------------------------ 6. changing your mind ------------------------------ */
  {
    chapter: ['Changing your mind', 'The part a static plan cannot do'],
    caption:
      'None of this is a one-shot. Say you have looked at what it planted and you want something different in a bed.',
    at: 'bottom',
    cuts: BOTH,
    run: async (d) => {
      await sidebarStep(d, 'plants')
      await openDetails(d, 'details-plants-by-hand')
      await pointIfPresent(d, 'list-bed-plantings')
    },
  },
  {
    caption:
      'The picker only offers what that bed can carry, in the order the light puts them in. Choose one, and add it.',
    at: 'bottom',
    cuts: BOTH,
    run: async (d) => {
      const picker = d.page.getByTestId('list-bed-crops')
      await expect(picker).toBeVisible({ timeout: 300_000 })
      const options = picker.getByRole('option')
      if ((await options.count()) > 1) await d.click(options.nth(1))
      const add = d.page.getByTestId('action-bed-add-planting')
      if ((await add.count()) > 0 && (await add.isEnabled())) await d.click(add)
    },
  },
  {
    caption: 'A crop that would do badly in that bed is refused, with the reason attached.',
    at: 'bottom',
    cuts: BOTH,
    run: async (d) => {
      const shown = await pointIfPresent(d, 'details-bed-refusals')
      if (!shown) await pointIfPresent(d, 'status-bed-planting')
      await d.hold(800)
    },
  },
  {
    caption:
      'And the light behind it is computed again for the change, so the garden on screen always matches the design you have.',
    cuts: FULL,
    run: async (d) => {
      await pointIfPresent(d, 'readout-plants-status')
      await d.orbit(20, 3)
    },
  },

  /* --------------------------- 7. where the numbers come from --------------------------- */
  {
    chapter: ['Where the numbers come from', 'Including the ones it won’t give you'],
    caption:
      'Every figure in this app traces to a work on this list, and the list ships inside the app.',
    at: 'bottom',
    cuts: BOTH,
    run: async (d) => {
      await sidebarStep(d, 'sources')
      await pointIfPresent(d, 'readout-source-count')
    },
  },
  {
    caption:
      'Claims it can’t source yet are listed as gaps. This is the list of what the app doesn’t know.',
    at: 'bottom',
    cuts: BOTH,
    run: async (d) => {
      await pointIfPresent(d, 'list-gaps')
      await d.hold(900)
    },
  },
  {
    caption:
      'And this sits above the bibliography, because a caveat comes first: everything here is a planning estimate.',
    at: 'bottom',
    cuts: BOTH,
    run: async (d) => {
      await pointIfPresent(d, 'readout-sources-scope')
      await d.hold(1400)
    },
  },
  {
    caption:
      'None of it has been checked against a real garden built from one of its layouts. Before anyone spends money on this, it says to take the plan to an extension service and let somebody look at the site itself.',
    at: 'bottom',
    cuts: BOTH,
    run: async (d) => {
      await d.hold(1400)
    },
  },
  {
    chapter: ['Agrivoltaic garden model', 'A planning estimate you can argue with, and check'],
    caption: '',
    cuts: BOTH,
    run: async (d) => {
      await d.hold(1800)
    },
  },
]
