import { expect, test, type Page } from '@playwright/test'
import { AGENT_IN_BUILD, openApp, step, waitForCanvas } from './fixtures/app.ts'
import { forgetTheDesign } from './fixtures/qa.ts'

// the suite builds without the agent, so these drive a panel that is not in the page and skip.
// `VITE_AGENT=on bunx playwright test` builds the agent in and runs every one of them
// biome-ignore lint/suspicious/noSkippedTests: gated on the build flag, see above
test.skip(!AGENT_IN_BUILD, 'built without the agent: run with VITE_AGENT=on')

/**
 * The conversational surface, on a phone, against a real build.
 *
 * These tests run when the suite is built with `VITE_AGENT=on` (see `playwright.config.ts`). A
 * deployed build carries none of this, and `src/agent/flag-fold.test.ts` is what holds that. So
 * these tests are about whether the feature works, and `does not disturb the app it was added to`
 * below is about whether having it at all costs the existing surfaces anything.
 *
 * 375x667 because that is the screen the whole mobile pass was measured on, and because a chat
 * surface with a keyboard over it is the tightest layout in the product
 */
const PHONE = { width: 375, height: 667 }

const openChat = async (page: Page): Promise<void> => {
  await page.getByTestId('action-tab-chat').click()
  await expect(page.getByTestId('panel-agent')).toBeVisible()
}

/**
 * Waits on a NEW reply arriving.
 *
 * Sending clears the box, and the control is disabled whenever the box is empty, so waiting for
 * it to re-enable waits forever: it's disabled for the right reason both before the reply and
 * after it. Counting replies is the thing that actually distinguishes the two
 */
const say = async (page: Page, text: string): Promise<void> => {
  const before = await page.getByTestId('item-agent-turn-us').count()
  await page.getByTestId('input-agent').fill(text)
  await page.getByTestId('action-agent-send').click()
  /*
    At least one more reply, and sometimes two. The agent finishes its own sentence when a run it
    started lands, so a turn taken while the annual electricity run is in flight can gain two
    replies: the one that answers the press, and the one that arrives on its own
  */
  await expect
    .poll(async () => await page.getByTestId('item-agent-turn-us').count(), { timeout: 30_000 })
    .toBeGreaterThan(before)
}

const lastReply = (page: Page): ReturnType<Page['getByTestId']> =>
  page.getByTestId('item-agent-turn-us').last()

test.describe('the agent on a phone', () => {
  test.use({ viewport: PHONE })

  test("is reachable from the tab bar and says what it's for", async ({ page }) => {
    await openApp(page)
    await openChat(page)
    await expect(page.getByTestId('readout-agent-opening')).toBeVisible()
    await expect(page.getByTestId('input-agent')).toBeVisible()
  })

  /**
   * The input has to be 16px or larger. Anything smaller and iOS Safari zooms the viewport on
   * focus, and a zoomed viewport on a surface with a fixed tab bar is a layout a novice can't
   * get back out of. Asserted as a computed style because it's a rule about the rendered size
   */
  test('takes typing without zooming the viewport out from under itself', async ({ page }) => {
    await openApp(page)
    await openChat(page)
    const size = await page
      .getByTestId('input-agent')
      .evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize))
    expect(size).toBeGreaterThanOrEqual(16)
  })

  /**
   * That an answer reaches the design as well as the transcript, which is the whole point: the
   * agent is a way IN to the same store the column writes to. Checked
   * through the plan's own controls, because what a visitor can
   * verify is what matters and the store is deliberately not on `window`
   */
  test('understands a sentence and writes the answer into the design', async ({ page }) => {
    await openApp(page)
    await openChat(page)
    await say(page, 'my plot is 6 by 4 meters')
    await expect(lastReply(page)).toContainText('Got it')
    // the size is the plot boundary, which the ground step reads back in the unit it was said in
    await page.getByTestId('action-tab-edit').click()
    await step(page, 'ground')
    await expect(page.getByTestId('control-plot-width-m')).toHaveValue('6')
    await expect(page.getByTestId('control-plot-depth-m')).toHaveValue('4')
  })

  test('records a crop the grower names, and says it is a lean and not a rule', async ({
    page,
  }) => {
    await openApp(page)
    await openChat(page)
    await say(page, 'i want to grow tomatoes')
    // case-insensitive on purpose: crop names come from `cropLabel`, which hands back the
    // catalog's own lowercase common name everywhere in the app. Capitalizing them here and
    // nowhere else would be the agent inventing a rendering the product doesn't have
    await expect(lastReply(page)).toContainText(/tomato/i)
    // the caveat travels with the answer: a preference that reads as a guarantee is a lie
    await expect(lastReply(page).locator('[data-tone="caveat"]')).toBeVisible()
  })

  test('survives a misspelling, which is most of what a phone keyboard produces', async ({
    page,
  }) => {
    await openApp(page)
    await openChat(page)
    await say(page, 'can i have some tomatos')
    await expect(lastReply(page)).toContainText(/tomato/i)
  })

  /**
   * The recovery path. This router has no generative model behind it, so a sentence it can't
   * place still becomes something tappable: two taps is the difference
   * between a novice carrying on and a novice leaving
   */
  test("turns a sentence it can't place into something to tap", async ({ page }) => {
    await openApp(page)
    await openChat(page)
    await say(page, 'what about the shade')
    const chips = lastReply(page).locator('.agent-chip')
    await expect(chips.first()).toBeVisible()
    const label = await chips.first().innerText()
    await chips.first().click()
    await expect(page.getByTestId('item-agent-turn-them').last()).toContainText(label)
  })

  /**
   * The agent starts the work a question needs. A reply that names a chore, such as "ask me to
   * design it and I will run the sun over it first", promises a next step, and a next step that
   * doesn't work is worse than a refusal
   */
  test('starts the work a question needs rather than naming a chore', async ({ page }) => {
    await openApp(page)
    await openChat(page)
    await say(page, 'what can i grow')
    // the ranking is usually there already, so the answer is the list itself
    await expect(lastReply(page)).toContainText(
      /started running the sun|grow well|would do well|ranked for the light/i,
    )
    // and there's still somewhere to go from here, which is what this whole utterance is for
    await expect(page.locator('[data-testid^="action-agent-chip-"]').first()).toBeVisible()
  })

  test('hands over to the questions without losing what was said', async ({ page }) => {
    await openApp(page)
    await openChat(page)
    await say(page, 'i want to grow tomatoes')
    await say(page, 'show me the questions')
    await expect(lastReply(page)).toContainText('questions are on screen')
  })

  test('never renders an empty bubble, whatever it was asked', async ({ page }) => {
    await openApp(page)
    await openChat(page)
    for (const line of ['zzzz qqqq', 'undo', 'help', 'why not']) {
      await say(page, line)
      await expect(lastReply(page).locator('.agent-line').first()).not.toBeEmpty()
    }
  })

  test("keeps the garden in view while it's being talked about", async ({ page }) => {
    await openApp(page)
    await openChat(page)
    const canvas = await page.getByTestId('canvas-root').boundingBox()
    const agent = await page.getByTestId('panel-agent').boundingBox()
    expect(canvas?.height ?? 0).toBeGreaterThan(100)
    expect(agent?.height ?? 0).toBeGreaterThan(100)
    // the two share the screen, and neither covers the other
    expect((canvas?.y ?? 0) + (canvas?.height ?? 0)).toBeLessThanOrEqual((agent?.y ?? 0) + 1)
  })
})

test.describe("doesn't disturb the app it was added to", () => {
  test.use({ viewport: PHONE })

  test('leaves the two original tabs where they were', async ({ page }) => {
    await openApp(page)
    for (const tab of ['garden', 'edit']) {
      await expect(page.getByTestId(`action-tab-${tab}`)).toBeVisible()
    }
  })

  test('stays off every surface but its own', async ({ page }) => {
    await openApp(page)
    await page.getByTestId('action-tab-garden').click()
    await expect(page.getByTestId('panel-agent')).toBeHidden()
    await page.getByTestId('action-tab-edit').click()
    await expect(page.getByTestId('panel-agent')).toBeHidden()
  })
})

test.describe('on a desktop', () => {
  /**
   * Above 900px the garden and the editor both fit, so there's no turn-taking for the agent to
   * join. That's an argument about navigation: it explains why a third tab makes no sense in a tab
   * bar that doesn't exist, and says nothing about whether somebody on a laptop should be able to
   * ask a question in their own words
   */
  test("is reached from the toolbar, because there's no tab bar to be a destination in", async ({
    page,
  }) => {
    await openApp(page)
    await waitForCanvas(page)
    await expect(page.getByTestId('panel-tabbar')).toBeHidden()
    await expect(page.getByTestId('panel-agent')).toBeHidden()
    await page.getByTestId('action-toolbar-ask').click()
    await expect(page.getByTestId('panel-agent')).toBeVisible()
    await expect(page.getByTestId('input-agent')).toBeVisible()
    // it takes the editor's column, so the garden is still there
    await expect(page.getByTestId('panel-sidebar')).toBeHidden()
    await expect(page.getByTestId('canvas-root')).toBeVisible()
  })

  /**
   * Leaving is a step aside, exactly as leaving the guided questions is: the
   * editor comes back with every answer the conversation put in it
   */
  test('gives the editor its column back, with what was said still in the design', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await openApp(page)
    await waitForCanvas(page)
    await page.getByTestId('action-toolbar-ask').click()
    await page.getByTestId('input-agent').fill('i want to grow tomatoes')
    await page.getByTestId('action-agent-send').click()
    await expect(page.getByTestId('item-agent-turn-us')).toHaveCount(1, { timeout: 30_000 })
    await page.getByTestId('action-toolbar-ask').click()
    await expect(page.getByTestId('panel-sidebar')).toBeVisible()
    await expect(page.getByTestId('panel-agent')).toBeHidden()
    // and back again, to the same conversation
    await page.getByTestId('action-toolbar-ask').click()
    await expect(page.getByTestId('item-agent-turn-them').last()).toContainText(/tomato/i)
  })

  /**
   * The caret starts in the box.
   *
   * Otherwise focus would stay on the control that opened the panel, and the box could be the 33rd
   * of 34 focusable things on the page. Every offer the agent has ever made is a tab stop before
   * it, so the distance grows with the conversation and never comes back down. A keyboard user, a
   * switch user and anyone dictating all pay that, and nobody arrives at this surface wanting
   * anything except the box
   */
  test("puts the caret in the box, so it's never tabbed to", async ({ page }) => {
    await openApp(page)
    await waitForCanvas(page)
    await page.getByTestId('action-toolbar-ask').click()
    await expect(page.getByTestId('input-agent')).toBeFocused()
  })

  /**
   * A dictated sentence is a long one, and it has to be readable before it's sent: speech
   * recognition mishears, and the whole value of a text box over a chip is that you can see what
   * it heard. One line of a 380px column showed 27% of a 137-character sentence
   */
  test('grows the box to fit a long sentence instead of scrolling it sideways', async ({
    page,
  }) => {
    await openApp(page)
    await waitForCanvas(page)
    await page.getByTestId('action-toolbar-ask').click()
    const box = page.getByTestId('input-agent')
    const oneLine = await box.evaluate((node) => node.getBoundingClientRect().height)

    const dictated =
      'i have a small back garden in amherst massachusetts about forty square meters and i would like to grow tomatoes and kale under the panels'
    await box.fill(dictated)
    const grown = await box.evaluate((node) => ({
      height: node.getBoundingClientRect().height,
      // nothing hidden off to the right, which is what a single line did to this sentence
      clipped: node.scrollWidth > node.clientWidth + 1,
      /*
        and nothing hidden below either. The box sizes border-box and `scrollHeight` doesn't
        count a border, so growing it to a bare `scrollHeight` asked for a box two pixels
        shorter than its own text and cut the last line of this sentence in half
      */
      cut: node.scrollHeight > node.clientHeight,
    }))
    expect(grown.clipped).toBe(false)
    expect(grown.cut).toBe(false)
    expect(grown.height).toBeGreaterThan(oneLine)

    // and it stops somewhere, without eating the transcript it belongs to
    await box.fill(`${dictated} ${dictated} ${dictated}`)
    const capped = await box.evaluate((node) => node.getBoundingClientRect().height)
    expect(capped).toBeLessThan(200)
  })

  /**
   * The two halves of an exchange belong next to each other. On a phone the column is short and
   * this is automatic. On a laptop the transcript box was 789px holding 260px of conversation,
   * so the opening sat at the top with 529px of nothing between it and the box it was asking to
   * be answered in
   */
  test('keeps a short conversation against the box rather than at the top of the column', async ({
    page,
  }) => {
    await openApp(page)
    await waitForCanvas(page)
    await page.getByTestId('action-toolbar-ask').click()
    await expect(page.getByTestId('readout-agent-opening')).toBeVisible()
    const gap = await page.evaluate(() => {
      const log = document.querySelector('[data-testid="readout-agent-transcript"]')
      const turns = log?.querySelectorAll('.agent-turn')
      const last = turns?.[turns.length - 1]
      if (!log || !last) return null
      return log.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom
    })
    expect(gap).not.toBeNull()
    expect(gap as number).toBeLessThan(40)
  })

  /**
   * Pressing a chip is what makes the panel busy, so a chip that disables itself takes the focus
   * of the person who just pressed it. It went to the document body, which for a screen-reader
   * user is the top of the page: the recovery path from a sentence the router missed threw away
   * your place every time you used it
   */
  test('leaves focus somewhere real after a chip is pressed', async ({ page }) => {
    test.setTimeout(120_000)
    await openApp(page)
    await waitForCanvas(page)
    await page.getByTestId('action-toolbar-ask').click()
    const before = await page.getByTestId('item-agent-turn-us').count()
    await page.getByTestId('action-agent-chip-list-crops').click()
    await expect
      .poll(async () => await page.getByTestId('item-agent-turn-us').count(), { timeout: 30_000 })
      .toBeGreaterThan(before)
    const landed = await page.evaluate(() => document.activeElement?.tagName ?? null)
    expect(landed).not.toBe('BODY')
  })

  /** A composer sends on Enter. A textarea left to itself takes it as a newline and sends nothing */
  test('sends on Enter, and breaks the line on shift-Enter', async ({ page }) => {
    test.setTimeout(120_000)
    await openApp(page)
    await waitForCanvas(page)
    await page.getByTestId('action-toolbar-ask').click()
    const box = page.getByTestId('input-agent')

    await box.fill('kale and')
    await box.press('Shift+Enter')
    await box.pressSequentially('tomatoes')
    expect(await box.inputValue()).toContain('\n')

    const before = await page.getByTestId('item-agent-turn-us').count()
    await box.press('Enter')
    await expect
      .poll(async () => await page.getByTestId('item-agent-turn-us').count(), { timeout: 30_000 })
      .toBeGreaterThan(before)
    // sending empties the box, so the newline went with the sentence
    expect(await box.inputValue()).toBe('')
  })
})

/**
 * The other half of the focus rule, and the reason it is written against the pointer.
 *
 * On a laptop the caret belongs in the box: there's a keyboard attached and nobody opens this
 * surface to look at it. On a touch screen the same call throws the on-screen keyboard over the
 * conversation that has just been opened, and takes half the screen to do it. `viewport` alone
 * doesn't test this: a narrowed desktop browser still reports `pointer: fine`, so this needs
 * a context that actually emulates touch
 */
test.describe('on a touch screen', () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true })

  test("doesn't raise the keyboard over the conversation it just opened", async ({ page }) => {
    await openApp(page)
    // the premise: without this the test would pass on a fine pointer and prove nothing
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)
    await openChat(page)
    await expect(page.getByTestId('readout-agent-opening')).toBeVisible()
    await expect(page.getByTestId('input-agent')).not.toBeFocused()
  })
})

test.describe('the two things that make it worth having', () => {
  test.use({ viewport: PHONE })

  /**
   * Place lookup, end to end through the same geocoder the site search uses.
   *
   * This is the one intent that reaches the network, and it's the first thing anybody says, so
   * a failure here is a failure of the whole surface
   */
  test('looks a place up and works from there, crediting whoever answered', async ({ page }) => {
    await openApp(page)
    await openChat(page)
    await say(page, 'i live in Amherst, Massachusetts')
    await expect(lastReply(page)).toContainText('Amherst')
    // the geocoder's attribution rides along with the answer, as it does everywhere else
    await expect(lastReply(page).locator('[data-tone="caveat"]')).toContainText(/OpenStreetMap/i)
  })

  /**
   * The money path: five real annual bakes in the browser, ranked, reported.
   *
   * Slow on purpose and worth every second of it. Everything else the agent does is a way of
   * getting here, and if the search can't be reached by talking then the surface is a toy. The
   * timeout matches `DESIGN_TIMEOUT_MS` in the shared fixtures
   */
  test('runs the real design search from a sentence, and keeps its caveats', async ({ page }) => {
    test.setTimeout(300_000)
    await openApp(page)
    await openChat(page)
    await say(page, 'i live in Amherst, Massachusetts')
    const before = await page.getByTestId('item-agent-turn-us').count()
    await page.getByTestId('input-agent').fill('design it for me')
    await page.getByTestId('action-agent-send').click()
    await expect(page.getByTestId('item-agent-turn-us')).toHaveCount(before + 1, {
      timeout: 240_000,
    })
    await expect(lastReply(page)).toContainText('layouts')
    /*
      The search's own account of what it didn't look at, which is the sentence that keeps five
      geometries from reading as every geometry. It's the first thing any summarizer would drop and
      the agent is forbidden from composing prose at all, so its survival here is the rule behind
      `Cited`, that a caveat is never hidden, holding on a conversational surface
    */
    const caveats = lastReply(page).locator('[data-tone="caveat"]')
    await expect(caveats.first()).toBeVisible()
    await expect(lastReply(page)).toContainText(/geometries were evaluated/i)
  })
})

test.describe('the cold start', () => {
  test.use({ viewport: PHONE })

  /**
   * A novice facing an empty box with a blinking cursor is the population this exists for.
   * Telling them what they could type isn't the same as giving them something to press
   */
  test('offers something to press before anything has been said', async ({ page }) => {
    await openApp(page)
    await openChat(page)
    const chips = page.getByTestId('readout-agent-opening').locator('.agent-chip')
    await expect(chips).toHaveCount(4)
    await chips.first().click()
    // a chip that needs something answers by asking for it
    await expect(lastReply(page)).toContainText(/town or an address/i)
  })

  /**
   * A chip dispatches its intent directly: it doesn't send its own label back through the router.
   * "Where the garden is" is a label, the kind nobody actually says as a sentence, and it scores
   * against the place exemplars about as well as any offhand phrase would, so the label sent back
   * as text could land elsewhere
   */
  test('presses mean what they say, without being re-read as text', async ({ page }) => {
    await openApp(page)
    await openChat(page)
    await page.getByTestId('action-agent-chip-list-crops').click()
    // list-crops answers from the ranking when there's one, and is blocked on the light,
    // saying so, when there isn't
    await expect(lastReply(page)).toContainText(/design|ranked for the light/i)
  })
})

/**
 * A conversation, where each utterance depends on the ones before it.
 *
 * Every test above sends one sentence into a fresh surface, and that shape can't catch an agent
 * that forgets the question it asked: bare replies then route at only 53%, where one that remembers
 * reaches 98%. One sentence at a time never notices
 */
test.describe('a whole conversation', () => {
  test.use({ viewport: PHONE })

  /**
   * The whole point of the surface, in one test: a question asked at the end of the task gets an
   * answer, with no loop back to the start.
   *
   * `applyDesign` clears the compliance checks and nothing re-bakes them, so after a design is
   * applied the agent has to start the run itself. Telling the asker the sun hadn't been run would
   * be a permanent dead end worded as a next step
   */
  test('answers a question about a finished garden instead of sending it round again', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    await openApp(page)
    await openChat(page)
    await say(page, 'im in Amherst, Massachusetts')
    await say(page, 'its 8 by 5')
    await say(page, 'design it for me')
    await say(page, 'use that one')
    await say(page, 'is this legal')
    // it starts the run it needs, and the answer itself is what has to arrive
    await expect
      .poll(
        async () => {
          await say(page, 'is this legal')
          return (await lastReply(page).innerText()).includes('determination')
        },
        { timeout: 180_000, intervals: [4_000] },
      )
      .toBe(true)
  })

  /**
   * And it finishes the sentence itself.
   *
   * A reply that starts a run and ends "ask me again in a moment" asks somebody who can't see a
   * progress bar to guess how long a year of light simulation takes. Nothing is pressed here after
   * the question: the answer has to arrive on its own
   */
  test('answers when the run it started lands, without being asked again', async ({ page }) => {
    test.setTimeout(240_000)
    await openApp(page)
    await openChat(page)
    await say(page, 'im in Amherst, Massachusetts')
    await say(page, 'its 8 by 5')
    await say(page, 'design it for me')
    await say(page, 'use that one')
    await say(page, 'is this legal')
    await expect(lastReply(page)).toContainText(/started running the sun/i)
    const before = await page.getByTestId('item-agent-turn-us').count()
    await expect(page.getByTestId('item-agent-turn-us')).toHaveCount(before + 1, {
      timeout: 180_000,
    })
    await expect(lastReply(page)).toContainText(/determination/i)
    // and nothing was typed to get it: the visitor's side of the transcript didn't move
    await expect(page.getByTestId('item-agent-turn-them')).toHaveCount(5)
  })

  test('carries a garden from nothing to a design in fragments', async ({ page }) => {
    test.setTimeout(300_000)
    await openApp(page)
    await openChat(page)

    // the first exchange: a bare place name scores 0.00 against everything in the table, so without
    // the question behind it the reply would be "I didn't follow that"
    await page.getByTestId('action-agent-chip-set-place').click()
    await expect(lastReply(page)).toContainText(/town or an address/i)
    await say(page, 'Amherst, Massachusetts')
    await expect(lastReply(page)).toContainText('Amherst')

    // and then fragments, each meaningful only because of the question standing behind it
    await say(page, '6 by 4')
    await expect(lastReply(page)).toContainText('Got it')
    await say(page, 'trees on one side')
    await expect(lastReply(page)).toContainText('Got it')
    await say(page, 'salad')
    await expect(lastReply(page)).toContainText('Got it')
    await say(page, 'half and half')
    await expect(lastReply(page)).toContainText('Got it')
    await say(page, 'overhead')
    await expect(lastReply(page)).toContainText('Got it')
    await say(page, '2 meters')
    await expect(lastReply(page)).toContainText('Got it')
    await say(page, 'i have a hose')
    await expect(lastReply(page)).toContainText('Got it')
    // the two wildlife questions, natives and pollinators, come last
    await say(page, 'yes')
    await expect(lastReply(page)).toContainText('Got it')
    await say(page, 'no')
    await expect(lastReply(page)).toContainText('Got it')

    // interrupted mid-path with something out of turn, which a guided conversation has to survive
    await say(page, 'i want beans')
    await expect(lastReply(page)).toContainText(/bean/i)

    // and the whole thing lands on a real design
    const before = await page.getByTestId('item-agent-turn-us').count()
    await page.getByTestId('input-agent').fill('design it for me')
    await page.getByTestId('action-agent-send').click()
    await expect(page.getByTestId('item-agent-turn-us')).toHaveCount(before + 1, {
      timeout: 240_000,
    })
    await expect(lastReply(page)).toContainText('layouts')
  })

  /**
   * The answers reach the same store the column writes to, which is what makes the agent a way
   * IN: each one is read back off the step that asks it
   */
  test('writes each answer into the step that asks it', async ({ page }) => {
    await openApp(page)
    await openChat(page)
    await say(page, '6 by 4')
    await say(page, 'wide open')
    // two answered out of order, both on the ground step
    await page.getByTestId('action-tab-edit').click()
    await step(page, 'ground')
    await expect(page.getByTestId('control-plot-width-m')).toHaveValue('6')
    await expect(page.getByTestId('control-onboarding-exposure-open')).toBeChecked()

    await page.getByTestId('action-tab-chat').click()
    await say(page, 'Amherst, Massachusetts')
    await page.getByTestId('action-tab-edit').click()
    await step(page, 'place')
    await expect(page.getByTestId('readout-site-label')).toContainText('Amherst')
  })
})

test.describe('answering why', () => {
  test.use({ viewport: PHONE })

  const designed = async (page: import('@playwright/test').Page): Promise<void> => {
    await openApp(page)
    await openChat(page)
    await say(page, 'Amherst, Massachusetts')
    const before = await page.getByTestId('item-agent-turn-us').count()
    await page.getByTestId('input-agent').fill('design it for me')
    await page.getByTestId('action-agent-send').click()
    await expect(page.getByTestId('item-agent-turn-us')).toHaveCount(before + 1, {
      timeout: 240_000,
    })
    await say(page, 'yes do that')
  }

  /**
   * "Why not tomatoes" routes correctly, and the reply must never be "I didn't follow that", even
   * with nothing in `planRefusals`, which is only written for a crop the planner was ASKED to
   * plant. The ranking has an opinion about every crop in the catalog
   */
  test("gives the ranking own reason a crop isn't there", async ({ page }) => {
    test.setTimeout(300_000)
    await designed(page)
    await say(page, 'why not tomatoes')
    await expect(lastReply(page)).toContainText(/tomato/i)
    await expect(lastReply(page)).not.toContainText("didn't follow")
    // an engine-authored reason: one of the limiting factors the app already puts into words
    await expect(lastReply(page)).toContainText(/soil|light|room|short|cold|shade|water|deep/i)
  })

  /**
   * And when there's nothing, it says so, without inventing one or pretending not
   * to have understood. This is the single place a language model would most want to help
   */
  test('admits to having no recorded answer instead of making one up', async ({ page }) => {
    test.setTimeout(300_000)
    await designed(page)
    await say(page, 'why is the sky blue')
    await expect(lastReply(page)).toContainText(/nothing recorded/i)
    await expect(lastReply(page)).not.toContainText("didn't follow")
  })

  /**
   * What is NOT a caveat may not be drawn as one.
   *
   * The energy answer carries the PV model chain. One of its entries is about a cell-temperature
   * model that wasn't used, so under "What that answer does not cover" and a warning rule,
   * "available but not the default" would read as a claim nobody made about the figure, and seven
   * alarms on one answer teach a reader to skip all of them, including the one that says a term is
   * unverifiable
   */
  test('draws the model chain as how it was computed, and never as a warning', async ({ page }) => {
    test.setTimeout(300_000)
    await openApp(page)
    await openChat(page)
    await say(page, 'Amherst, Massachusetts')
    await say(page, 'design it for me')
    // named explicitly, because this test needs a design WITH PANELS and which of the five wins
    // turns on scores a hair apart. The winner can be `no-array-control`, and a garden with no
    // panels has no PV chain to show, which is the right answer to the wrong question for a test
    // about provenance
    await say(page, 'use the balanced one')
    await expect
      .poll(
        async () => {
          await say(page, 'how many kwh will it make')
          return (await lastReply(page).innerText()).includes('kWh a year')
        },
        { timeout: 240_000, intervals: [4_000] },
      )
      .toBe(true)
    const how = lastReply(page).getByTestId('readout-agent-provenances')
    await expect(how).toBeVisible()
    await expect(how).toContainText('How this was computed')
    // nothing folded away, and the entry that IS a real doubt is still there in full
    await expect(how.locator('details')).toHaveCount(0)
    await expect(how).toContainText(/unverifiable/i)
    // and it's not wearing the warning heading that belongs to what an answer doesn't cover
    await expect(lastReply(page).getByTestId('readout-agent-caveats')).toHaveCount(0)
  })

  /**
   * A citation the reader can act on, which is the point of having one.
   *
   * This app carries a `Cited` for every figure it prints and a Sources panel holding the works.
   * The agent reproduces the caveat off each of those records and carries the citation beside it,
   * so the source reaches the reader along with the hedge. The marker is the app's own
   * `SourceLink`: it opens Sources on that work's row and highlights it
   */
  test('cites the works behind an answer, and the marker goes to the work', async ({ page }) => {
    test.setTimeout(300_000)
    await openApp(page)
    await openChat(page)
    await say(page, 'Amherst, Massachusetts')
    await say(page, 'design it for me')
    // named explicitly, because this test needs a design WITH PANELS and which of the five wins
    // turns on scores a hair apart. The winner can be `no-array-control`, and a garden with no
    // panels has no PV chain to show, which is the right answer to the wrong question for a test
    // about provenance
    await say(page, 'use the balanced one')
    await expect
      .poll(
        async () => {
          await say(page, 'how many kwh will it make')
          return (await lastReply(page).innerText()).includes('kWh a year')
        },
        { timeout: 240_000, intervals: [4_000] },
      )
      .toBe(true)
    const marker = lastReply(page).getByTestId('action-source-jump-faiman2008-module-temperature')
    await expect(marker).toBeVisible()
    // short enough to run inside a sentence, and named in full to a screen reader
    await expect(marker).toHaveText('Faiman 2008')
    await expect(marker).toHaveAttribute('aria-label', /show this work in Sources/)
    // drawn as a marker, so the brackets are never in the copied text
    const bracket = await marker.evaluate(
      (el) => getComputedStyle(el, '::before').content + getComputedStyle(el, '::after').content,
    )
    expect(bracket).toContain('[')
    expect(bracket).toContain(']')

    await marker.click()
    // it leaves the conversation, because Sources is on the surface the conversation replaced
    await expect(page.getByTestId('panel-step-sources')).not.toHaveAttribute('hidden', '')
    await expect(page.locator('#source-faiman2008-module-temperature')).toBeVisible()
  })

  /**
   * The caveats are grouped and never folded. Four or more full-width paragraphs each with its own
   * warning rule is a wall, and a wall is read as carefully as no caveat at all. A disclosure
   * would be the one shortcut this feature isn't allowed to take
   */
  test('keeps every caveat on screen, in one block', async ({ page }) => {
    test.setTimeout(300_000)
    await openApp(page)
    await openChat(page)
    await say(page, 'Amherst, Massachusetts')
    const before = await page.getByTestId('item-agent-turn-us').count()
    await page.getByTestId('input-agent').fill('design it for me')
    await page.getByTestId('action-agent-send').click()
    await expect(page.getByTestId('item-agent-turn-us')).toHaveCount(before + 1, {
      timeout: 240_000,
    })
    const caveats = lastReply(page).getByTestId('readout-agent-caveats')
    await expect(caveats).toBeVisible()
    // nothing behind a control, and the one that qualifies every number is among them
    await expect(caveats.locator('details')).toHaveCount(0)
    await expect(caveats).toContainText(/geometries were evaluated/i)
    expect(await caveats.locator('li').count()).toBeGreaterThan(3)
  })
})

/**
 * The upgraded router, in a browser, against the real weights.
 *
 * Every other agent test here would pass with the lexical router alone, which is the point: the
 * surface works without the download. These are the sentences that separate the two, and the
 * failure they guard against is the quiet one: the model loading, every request succeeding, and
 * the agent still answering from the phrase table because the two were wired together wrongly. From
 * the outside, that failure looks identical to working
 */
test.describe('the sentence embedder', () => {
  test.use({ viewport: PHONE })

  test('is fetched from this origin and from nowhere else', async ({ page }) => {
    test.setTimeout(180_000)
    const off: string[] = []
    const bad: string[] = []
    page.on('request', (request) => {
      const url = request.url()
      if (/huggingface|jsdelivr|unpkg|cdn\./i.test(url)) off.push(url)
    })
    /*
      Any failed request, not only one under `/models/`.

      The build drops the copy of the ONNX runtime that vite emits into `assets/`, on the grounds
      that `wasmPaths` points every runtime URL at `/models/ort/` and nothing ever asks for the
      other one. If that reasoning is ever wrong the browser asks for a file that is not there,
      the runtime fails silently, and the agent answers from the phrase table while looking
      upgraded. That's the failure mode this whole surface has hit twice, and a 404 anywhere on
      the page is the cheapest possible tripwire for it
    */
    page.on('response', (response) => {
      if (!response.ok() && response.status() !== 304) {
        bad.push(`${String(response.status())} ${response.url()}`)
      }
    })
    await openApp(page)
    await openChat(page)
    await expect
      .poll(async () => (await page.locator('[data-agent-router="embedding"]').count()) > 0, {
        timeout: 120_000,
      })
      .toBe(true)
    // no third party, and nothing 404ing: a missing runtime variant fails silently and falls back
    expect(off).toEqual([])
    expect(bad).toEqual([])
  })

  /**
   * Forty-five megabytes is somebody's data plan, and this surface works without it.
   *
   * Playwright's Chromium reports a fast unmetered connection, which is the branch that downloads
   * unasked. The offer is what everything else gets, and `agent/connection.test.ts` holds the rule
   * that decides between them. What is checked here is that the size is on screen either way and
   * that the press works, because an offer nobody can act on is worse than no offer
   */
  test('offers the download rather than taking it, on a connection that says to ask', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    // the browser says data is being saved, which is the whole population this offer exists for
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'connection', {
        configurable: true,
        value: { saveData: true, effectiveType: '4g' },
      })
    })
    await openApp(page)
    await openChat(page)
    const offer = page.getByTestId('action-agent-download-model')
    await expect(offer).toBeVisible()
    await expect(page.getByTestId('readout-agent-router')).toContainText('45 MB')
    // and it's an offer: the surface answers perfectly well before it's taken
    await say(page, 'i want to grow tomatoes')
    await expect(lastReply(page)).toContainText(/tomato/i)
    await offer.click()
    await expect
      .poll(async () => (await page.locator('[data-agent-router="embedding"]').count()) > 0, {
        timeout: 120_000,
      })
      .toBe(true)
    // taken once, remembered: a reload doesn't ask again
    await page.reload()
    await openChat(page)
    await expect(page.getByTestId('action-agent-download-model')).toHaveCount(0)
  })

  /**
   * The window between opening this surface and the weights landing is the window in which the
   * agent is at its worst, and it's where a first impression is formed. It says so while it
   * waits, and stops saying so the moment it stops being true: a permanent note about a model
   * that has already loaded is a nag, and a silent thirty seconds is a surface that looks broken
   */
  test('says which router is answering, and stops once the better one has landed', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    await openApp(page)
    await openChat(page)
    await expect
      .poll(async () => (await page.locator('[data-agent-router="embedding"]').count()) > 0, {
        timeout: 120_000,
      })
      .toBe(true)
    await expect(page.getByTestId('readout-agent-router')).toHaveCount(0)
  })

  /**
   * The failure to guard against here is a confident wrong move. "Scratch that" puts three readings
   * inside five hundredths of each other, and one of them forgets the design, so the agent offers
   * the choice back and changes nothing while it asks
   */
  test('offers the readings when nothing separates them, and changes nothing', async ({ page }) => {
    test.setTimeout(180_000)
    await openApp(page)
    await openChat(page)
    await expect
      .poll(async () => (await page.locator('[data-agent-router="embedding"]').count()) > 0, {
        timeout: 120_000,
      })
      .toBe(true)
    await say(page, 'scratch that')
    await expect(lastReply(page)).toContainText(/could mean a couple of things/i)
    // and every candidate is a control that says what it would do
    expect(await page.locator('[data-testid^="action-agent-chip-"]').count()).toBeGreaterThan(1)
  })

  test("answers a paraphrase the phrase table can't reach", async ({ page }) => {
    test.setTimeout(180_000)
    await openApp(page)
    await openChat(page)
    await expect
      .poll(async () => (await page.locator('[data-agent-router="embedding"]').count()) > 0, {
        timeout: 120_000,
      })
      .toBe(true)
    /*
      "Summarize it for me" reaches `propose-designs` on bigrams alone, which starts a five-bake
      search nobody asked for, and "give me a month by month plan" reaches the geocoder through the
      place question's catch-all. Both are in the held-out set and both are fixed by meaning
    */
    await say(page, 'summarize it for me')
    await expect(lastReply(page)).toContainText(/bed/i)
    await say(page, 'give me a month by month plan')
    await expect(lastReply(page)).toContainText(/beds to plant|things to do|dates/i)
  })

  test('still leaves a bare answer to the question on screen alone', async ({ page }) => {
    test.setTimeout(180_000)
    await openApp(page)
    await openChat(page)
    await expect
      .poll(async () => (await page.locator('[data-agent-router="embedding"]').count()) > 0, {
        timeout: 120_000,
      })
      .toBe(true)
    await say(page, 'Amherst, Massachusetts')
    await expect(lastReply(page)).toContainText('Amherst')
  })
})

test.describe('a sentence that asks for two things', () => {
  test.use({ viewport: PHONE })

  /**
   * The shape that separates an agent from a search box. Answering the first half and silently
   * dropping the second is worse than understanding neither, because nothing on screen says the
   * second half was ignored
   */
  test('carries out both halves, in the order they were said', async ({ page }) => {
    test.setTimeout(180_000)
    await openApp(page)
    await openChat(page)
    await say(page, 'i want tomatoes then tell me what i have got')
    // the preference, and then the summary, in one reply
    await expect(lastReply(page)).toContainText(/tomato/i)
    await expect(lastReply(page)).toContainText(/bed/i)
  })

  test('keeps a list of crops together, because a list is one request', async ({ page }) => {
    test.setTimeout(180_000)
    await openApp(page)
    await openChat(page)
    await say(page, 'i want tomatoes and courgettes')
    // both crops in one reply. Courgette comes back as summer squash, which is what the
    // catalog calls it: `squash-summer` answers to "summer squash", "zucchini" and "courgette"
    await expect(lastReply(page)).toContainText(/tomato/i)
    await expect(lastReply(page)).toContainText(/squash/i)
  })
})

test.describe('coming back', () => {
  test.use({ viewport: PHONE })

  /**
   * The answers survive a reload: they go into the store through the same actions the wizard uses
   * and are persisted with the design. The conversation about them is kept too, or a visitor comes
   * back to a garden nobody has described to them and an agent that greets them as if new to it,
   * which reads as the agent having forgotten
   */
  test('remembers the conversation across a reload', async ({ page }) => {
    test.setTimeout(180_000)
    await openApp(page)
    await openChat(page)
    await say(page, 'i want to grow tomatoes')
    await expect(lastReply(page)).toContainText(/tomato/i)

    await page.reload()
    await expect(page.getByTestId('app-root')).toBeVisible()
    await page.getByTestId('action-tab-chat').click()
    await expect(page.getByTestId('panel-agent')).toBeVisible()
    // what was said, and what was answered, both still there
    await expect(page.getByTestId('item-agent-turn-them').last()).toContainText(
      'i want to grow tomatoes',
    )
    await expect(lastReply(page)).toContainText(/tomato/i)
  })

  /**
   * Forgetting the garden forgets the conversation, on screen as well as in storage.
   *
   * `removeDesign` takes `TRANSCRIPT_KEY` with the design and the storage panel says so in the
   * sentence it makes somebody read before the second press. The agent panel also holds the turns
   * in React state, so it clears them too, or the conversation would stay on screen and the next
   * reply would write it straight back out. A disclosure true of the bytes and false of the screen
   * isn't one
   */
  test('forgets the conversation when the garden is forgotten', async ({ page }) => {
    test.setTimeout(180_000)
    await openApp(page)
    await openChat(page)
    await say(page, 'i want to grow tomatoes')
    await expect(page.getByTestId('item-agent-turn-them')).toHaveCount(1)
    // the storage panel lives in the editor, which on a phone is the other surface
    await page.getByTestId('action-tab-edit').click()
    /*
      The panel's own two presses, without the `forgetDesign` helper. That helper reopens the Check
      step afterward to read the outcome, which this test has no use for: forgetting leaves no
      saved design and puts the plan back on its first step
    */
    await step(page, 'check')
    await forgetTheDesign(page)
    await page.getByTestId('action-tab-chat').click()
    await expect(page.getByTestId('item-agent-turn-them')).toHaveCount(0)
    await expect(page.getByTestId('readout-agent-opening')).toBeVisible()
    // and it's gone from storage too, so a reload doesn't bring it back
    await page.reload()
    await openChat(page)
    await expect(page.getByTestId('item-agent-turn-them')).toHaveCount(0)
  })

  test("doesn't greet a returning visitor as a stranger", async ({ page }) => {
    test.setTimeout(180_000)
    await openApp(page)
    await openChat(page)
    await say(page, 'what have i got')
    await page.reload()
    await expect(page.getByTestId('app-root')).toBeVisible()
    await page.getByTestId('action-tab-chat').click()
    // exactly one opening, the one from the first visit
    await expect(page.getByTestId('readout-agent-opening')).toHaveCount(1)
  })
})
