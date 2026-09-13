import { expect, test, type Page } from '@playwright/test'
import { openApp, openFold, step, waitForCanvas } from './fixtures/app.ts'
import { QUESTION_STEPS, readNumber, searchLayouts } from './fixtures/qa.ts'

/**
 * What a phone gets. The rest of the suite runs at 1280x720, which is a laptop, and every defect
 * below survived the whole suite being green because nothing ever asked at 375 wide.
 *
 * Two surfaces, Garden and Plan, in a bottom tab bar, and a first visit opens on the plan. The
 * plan is the same column as the desktop sidebar, so its questions are the first steps and its
 * Next is at the foot of the open step; the garden keeps the scene and everything drawn over it,
 * and a pinned strip across its top is the way back.
 *
 * 375x667 rather than a taller phone on purpose: it is the smallest screen still in wide use,
 * and every one of these broke there first. The taller case is checked alongside it because the
 * two failed differently, which is the argument for having both
 */
const PHONES = [
  // the smallest screen anyone still carries, and where every measurement in the audit was
  // worst: a 153px toolbar, a 21px sideways pan, and a guided answer column of zero pixels
  { name: 'a 320x568 phone', width: 320, height: 568 },
  { name: 'a 375x667 phone', width: 375, height: 667 },
  { name: 'a 390x844 phone', width: 390, height: 844 },
]

/**
 * Reachable means a press would land on it, not that it exists. `elementFromPoint` is the whole
 * point of this helper: the control that broke was present in the DOM at its right size the
 * entire time and simply clipped out of its scroll container, so any assertion built on
 * `toBeVisible` or on a bounding box would have passed while the first question could not be
 * answered
 */
const reachable = async (page: Page, testId: string): Promise<boolean> =>
  page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`)
    if (el === null) return false
    const box = el.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) return false
    const x = box.left + box.width / 2
    const y = box.top + box.height / 2
    if (y < 0 || y > window.innerHeight || x < 0 || x > window.innerWidth) return false
    const hit = document.elementFromPoint(x, y)
    return hit === el || el.contains(hit) || (hit?.contains(el) ?? false)
  }, testId)

/** The surface on screen, off the one attribute the stylesheet reads */
const surface = (page: Page): Promise<string | null> =>
  page.getByTestId('app-root').getAttribute('data-surface')

const currentTab = (page: Page): Promise<string | null> =>
  page.locator('[data-testid^="action-tab-"][data-current="true"]').getAttribute('data-testid')

for (const phone of PHONES) {
  test.describe(phone.name, () => {
    test.use({ viewport: { width: phone.width, height: phone.height } })

    /**
     * The toolbar wanted 694px on one line, so the document was 694px wide inside a 390px window
     * and the whole app panned sideways. Asserted on the document rather than on the toolbar
     * because the symptom a visitor meets is the page sliding under their thumb, and any other
     * element that ever does this should fail here too
     */
    test('does not scroll sideways', async ({ page }) => {
      await openApp(page)
      await waitForCanvas(page)
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth)
    })

    /**
     * The one that matters most: the first question has to be answerable on a small phone. A first
     * visit opens on the plan, on its first step, with the address field and the button that
     * submits it both in reach
     */
    test('opens on the first question of the plan, with the address field in reach', async ({
      page,
    }) => {
      await openApp(page)
      await waitForCanvas(page)
      expect(await surface(page)).toBe('edit')
      expect(await currentTab(page)).toBe('action-tab-edit')
      await expect(page.getByTestId('action-step-place')).toHaveAttribute('aria-expanded', 'true')
      expect(await reachable(page, 'control-site-search')).toBe(true)
      expect(await reachable(page, 'action-site-search')).toBe(true)
    })

    /**
     * One surface at a time, and the presses that change which.
     *
     * `reachable` rather than `toBeVisible`, and the difference is the whole test. The sidebar
     * and the canvas share a grid cell so that the GL context survives a tab press, and
     * `.canvas-host` is positioned so the banner can sit inside it. A positioned element paints
     * over a static one whatever the source order, so the first version of this layout left the
     * sidebar correctly sized, correctly visible to every API that reports visibility, and
     * completely behind the 3D scene. Pressing Plan lit the tab and changed nothing on screen
     */
    test('shows the garden when it is asked for, and the strip across it leads back', async ({
      page,
    }) => {
      await openApp(page)
      await waitForCanvas(page)
      await page.getByTestId('action-tab-garden').click()
      expect(await reachable(page, 'canvas-root')).toBe(true)
      // the drawing tools belong to the garden and come with it
      expect(await reachable(page, 'action-toolbar-mode-draw-bed')).toBe(true)
      expect(await reachable(page, 'action-step-place')).toBe(false)
      // pinned across the top, naming the step the plan is open on
      const strip = page.getByTestId('action-garden-plan')
      expect(await reachable(page, 'action-garden-plan')).toBe(true)
      await expect(strip).toContainText(/back to the plan/i)
      await expect(strip).toContainText(/step 1/i)
      await strip.click()
      expect(await surface(page)).toBe('edit')
      /*
        A control, not a panel. `reachable` asks whether a press would land on an element's CENTRE,
        which is the right question for a button and the wrong one for a tall panel: the Site panel
        is taller than a 568px phone, so its centre is legitimately below the fold and a check on
        the panel fails on a layout that works perfectly
      */
      expect(await reachable(page, 'action-step-place')).toBe(true)
      await expect(page.getByTestId('action-toolbar-mode-draw-bed')).toBeHidden()
    })

    /**
     * The toolbar took 124px at 360 wide and 153px at 320, a fifth to a quarter of the screen for
     * a title and four buttons, because its contents needed 694px on one line
     */
    test('spends one row on the toolbar, not three', async ({ page }) => {
      await openApp(page)
      await waitForCanvas(page)
      const height = await page
        .getByTestId('panel-toolbar')
        .evaluate((el) => el.getBoundingClientRect().height)
      expect(height).toBeLessThanOrEqual(56)
    })

    /**
     * One surface AND NOT THE OTHER, which is the property the whole shell exists for and the
     * one a screenshot would have been reached for.
     *
     * It is not reached for: `e2e/visual.spec.ts` opens by saying a screenshot is the wrong
     * instrument for anything a selector can assert, and every claim here is selector-assertable.
     * What a picture would add over this is colour, and the phone chrome is audited for contrast
     * in both schemes in `contrast.spec.ts`
     */
    test('shows one surface at a time and marks which', async ({ page }) => {
      await openApp(page)
      await waitForCanvas(page)
      const root = page.getByTestId('app-root')

      await expect(root).toHaveAttribute('data-surface', 'edit')
      expect(await currentTab(page)).toBe('action-tab-edit')
      expect(await reachable(page, 'action-step-place')).toBe(true)
      // the drawing tools belong to the garden and stand down with it
      await expect(page.getByTestId('action-toolbar-mode-draw-bed')).toBeHidden()

      await page.getByTestId('action-tab-garden').click()
      await expect(root).toHaveAttribute('data-surface', 'garden')
      expect(await currentTab(page)).toBe('action-tab-garden')
      expect(await reachable(page, 'action-step-place')).toBe(false)
      expect(await reachable(page, 'action-toolbar-mode-draw-bed')).toBe(true)

      await page.getByTestId('action-tab-edit').click()
      await expect(root).toHaveAttribute('data-surface', 'edit')
      expect(await currentTab(page)).toBe('action-tab-edit')
      // exactly one tab is ever marked, and there are exactly the two
      await expect(page.locator('[data-testid^="action-tab-"][data-current="true"]')).toHaveCount(1)
      await expect(page.locator('[data-testid^="action-tab-"]')).toHaveCount(2)
    })

    /**
     * Next at the foot of every question, under its answers, and never a sticky bar.
     *
     * Back and Next above the answers make the thumb travel up past the field to move on after
     * typing, and a fixed action bar covers the last lines of the content with the tab bar stacking
     * under it. The press is in flow, the last child of the open step, so it is below everything
     * the step asks and is reached by scrolling to it like any other content. Walked over the four
     * questions, ending on the search, which is the panels step's own press
     */
    test('puts Next at the foot of each question, under its answers', async ({ page }) => {
      test.setTimeout(180_000)
      await openApp(page)
      await waitForCanvas(page)
      for (const [index, id] of QUESTION_STEPS.entries()) {
        await expect(page.getByTestId(`action-step-${id}`)).toHaveAttribute('aria-expanded', 'true')
        const next = page.getByTestId('action-step-next')
        await expect(next).toBeAttached()
        // below the last visible control of the step: nothing to answer sits under the press.
        // `checkVisibility`, because a control inside a closed fold is skipped by layout and can
        // still report a box from wherever it last was
        const below = await page.evaluate((stepId) => {
          const panel = document.querySelector(`[data-testid="panel-step-${stepId}"]`)
          const foot = document.querySelector('[data-testid="action-step-next"]')
          if (panel === null || foot === null) return false
          const controls = [...panel.querySelectorAll('input, select, button, summary')].filter(
            (el) =>
              el !== foot &&
              (el as HTMLElement).checkVisibility() &&
              el.getBoundingClientRect().height > 0,
          )
          const lowest = Math.max(...controls.map((el) => el.getBoundingClientRect().bottom))
          return foot.getBoundingClientRect().top >= lowest
        }, id)
        expect(below, `Next is not under the answers on ${id}`).toBe(true)
        await next.scrollIntoViewIfNeeded()
        expect(await reachable(page, 'action-step-next'), `next on ${id}`).toBe(true)
        // and not fixed: it moves with the column rather than sitting over it
        const position = await next.evaluate((el) => getComputedStyle(el).position)
        expect(position).not.toBe('fixed')
        const following = QUESTION_STEPS[index + 1]
        if (following === undefined) break
        await expect(next).toContainText(/^Next:/)
        await next.click()
        await expect(page.getByTestId(`panel-step-${following}`)).not.toHaveAttribute('hidden', '')
      }
      expect(await reachable(page, 'action-layouts-search')).toBe(true)
    })

    /**
     * The press lands on the step it opened.
     *
     * Measured on a phone, because a phone is where the column IS the screen. If the column stayed
     * where it was, a step pressed from the bottom of the ranking would open far down the window,
     * under the closed headers of the steps before it, and a step pressed from the middle of a
     * panel could land inside a bed's sow-day dropdown.
     *
     * The two assertions are a pair. The first proves the press had somewhere to travel from, so
     * that the second is not passing on a column that never moved
     */
    test('lands on the step it was asked for, not where the last one was left', async ({
      page,
    }) => {
      test.setTimeout(180_000)
      // the example is what makes the steps worth opening: without a garden they are locked and
      // hold a sentence each, and nothing here is long enough to scroll
      await openApp(page, { exampleGarden: true })
      await waitForCanvas(page)
      await page.getByTestId('action-step-plants').click()
      const sidebar = page.getByTestId('panel-sidebar')
      await expect(sidebar).toBeVisible()
      // read to the bottom of the step, which is what anybody comparing beds does
      await sidebar.evaluate((el) => {
        el.scrollTop = el.scrollHeight
      })
      const top = async (testId: string): Promise<number> =>
        page.getByTestId(testId).evaluate((el) => el.getBoundingClientRect().top)
      const sidebarTop = await sidebar.evaluate((el) => el.getBoundingClientRect().top)
      expect(Math.abs((await top('action-step-calendar')) - sidebarTop)).toBeGreaterThan(200)
      await page.getByTestId('action-step-calendar').click()
      // flush with the top of the column: the header is the only thing on screen that says which
      // step this is, so it is the element the scroll is asked of
      await expect
        .poll(async () => Math.abs((await top('action-step-calendar')) - sidebarTop), {
          timeout: 15_000,
        })
        .toBeLessThanOrEqual(4)
    })

    /**
     * On the plan nothing of the scene shows through.
     *
     * The selected-bed strip and the drawing hint are overlays of the scene, so every overlay sits
     * inside the garden's box and is not drawn while the plan is the surface on screen. Drawn over
     * the plan, they would put "Bed 1 is selected / Plant it" on the address field and the corner
     * hint over form fields on a surface with no ground to tap
     */
    test('keeps every overlay of the scene off the plan', async ({ page }) => {
      test.setTimeout(180_000)
      await openApp(page, { exampleGarden: true })
      await waitForCanvas(page)
      // on the garden the banner, the key and the strip are all drawn
      await page.getByTestId('action-tab-garden').click()
      await expect(page.getByTestId('panel-example')).toBeVisible({ timeout: 60_000 })
      await expect(page.getByTestId('readout-overlay-legend')).toBeVisible()
      await expect(page.getByTestId('action-garden-plan')).toBeVisible()
      // start a drawing there, which raises the corner hint over the ground it is about
      await page.getByTestId('action-toolbar-mode-draw-bed').click()
      await expect(page.getByTestId('status-scene-hint')).toBeVisible()
      // and on the plan none of them is on screen, the drawing hint included
      await page.getByTestId('action-tab-edit').click()
      for (const id of [
        'panel-example',
        'readout-overlay-legend',
        'action-garden-plan',
        'status-scene-hint',
      ]) {
        await expect(page.getByTestId(id), id).toBeHidden()
      }
      expect(await reachable(page, 'action-step-place')).toBe(true)
    })

    /**
     * "See it in the garden" on a layout card is the way to look at the layout the card
     * describes, on the surface that can show it: the 3D follows the tab that is open, and on a
     * phone that 3D is a tab away. On a laptop the press has no job and the stylesheet keeps it
     * out of the way
     */
    test('a layout card offers to show its layout in the garden, and does', async ({ page }) => {
      test.setTimeout(300_000)
      await openApp(page)
      await waitForCanvas(page)
      await searchLayouts(page)
      const card = page.locator('[data-testid^="item-onboarding-scenario-"]').first()
      const archetype = (await card.getAttribute('data-archetype')) ?? ''
      expect(archetype).not.toBe('')
      const see = page.getByTestId(`action-layouts-see-${archetype}`)
      await see.scrollIntoViewIfNeeded()
      expect(await reachable(page, `action-layouts-see-${archetype}`)).toBe(true)
      await see.click()
      expect(await surface(page)).toBe('garden')
      expect(await currentTab(page)).toBe('action-tab-garden')
      // and the way back names the step the card was on
      await expect(page.getByTestId('action-garden-plan')).toContainText(/step 4/i)
    })

    /**
     * The example banner is `--banner-width` across and the legend is up to 300px, which is more
     * furniture than a phone is wide, so they were drawn on top of each other and the banner's
     * text was printed under the legend
     */
    test('never draws the example banner and the legend over each other', async ({ page }) => {
      test.setTimeout(180_000)
      // both panels exist only when there is an example to describe and a baked field to key,
      // so this is the one state in which the question can be asked at all
      await openApp(page, { exampleGarden: true })
      await waitForCanvas(page)
      await page.getByTestId('action-tab-garden').click()
      await expect(page.getByTestId('panel-example')).toBeVisible({ timeout: 60_000 })
      const boxes = await page.evaluate(() => {
        const rect = (sel: string): DOMRect | null => {
          const el = document.querySelector(sel)
          if (el === null) return null
          const box = el.getBoundingClientRect()
          return box.width === 0 || box.height === 0 ? null : box
        }
        const banner = rect('.example-banner')
        const legend = rect('.legend')
        if (banner === null || legend === null) return { overlap: false, both: false }
        const overlap =
          banner.left < legend.right &&
          legend.left < banner.right &&
          banner.top < legend.bottom &&
          legend.top < banner.bottom
        return { overlap, both: true }
      })
      /**
       * Asserted FIRST, and it is the assertion that makes the next one mean anything. Two boxes
       * cannot overlap if one of them is not drawn, so `overlap` alone would pass on a page where
       * either panel is missing
       */
      expect(boxes.both).toBe(true)
      expect(boxes.overlap).toBe(false)
    })

    /**
     * And clear of the drawing tools, which is the third thing over this canvas.
     *
     * The strip back to the plan sits at the top, the tools drop under it into the top-left corner,
     * and the notice drops under the tools: a notice that starts too high prints its title under
     * the Draw bed button
     */
    test('never draws the example notice under the drawing tools', async ({ page }) => {
      test.setTimeout(180_000)
      await openApp(page, { exampleGarden: true })
      await waitForCanvas(page)
      await page.getByTestId('action-tab-garden').click()
      await expect(page.getByTestId('panel-example')).toBeVisible({ timeout: 60_000 })
      const clear = await page.evaluate(() => {
        const rect = (sel: string): DOMRect | null => {
          const el = document.querySelector(sel)
          return el === null ? null : el.getBoundingClientRect()
        }
        const tools = rect('.toolbar-modes')
        const notice = rect('.example-banner')
        const strip = rect('.garden-plan')
        if (tools === null || notice === null || strip === null) return null
        return {
          overlap:
            tools.left < notice.right &&
            notice.left < tools.right &&
            tools.top < notice.bottom &&
            notice.top < tools.bottom,
          gap: notice.top - tools.bottom,
          underStrip: tools.top >= strip.bottom,
        }
      })
      expect(clear).not.toBeNull()
      expect(clear?.overlap).toBe(false)
      expect(clear?.gap).toBeGreaterThan(0)
      expect(clear?.underStrip).toBe(true)
    })

    /**
     * The colour key can be put away, and the press that does it is a press.
     *
     * Unfolded, the key takes 88px of a 471px stage, over a garden the example notice already takes
     * 63px of. What folds is the ramp, the ticks and the range; the caption stays, so the ground is
     * still labelled with the quantity it is coloured by.
     *
     * The target is checked outside the word, because the word is 19x16. Every other control in
     * this app meets the 44px floor by being 44px tall and this one cannot, since the point of
     * the fold is that folded the key is ONE LINE. So the target is grown with a pseudo-element
     * and the ink is not, and a test that pressed the middle would never notice if that stopped
     */
    test('folds the colour key away, and back', async ({ page }) => {
      test.setTimeout(180_000)
      await openApp(page, { exampleGarden: true })
      await waitForCanvas(page)
      await page.getByTestId('action-tab-garden').click()
      const key = page.getByTestId('readout-overlay-legend')
      await expect(key).toBeVisible({ timeout: 60_000 })
      const height = async (): Promise<number> =>
        key.evaluate((el) => el.getBoundingClientRect().height)
      const open = await height()
      expect(open).toBeGreaterThan(70)

      // a thumb landing 10px outside the word still presses it
      const outside = await page.getByTestId('action-legend-fold').evaluate((el) => {
        const box = el.getBoundingClientRect()
        const hit = document.elementFromPoint(box.left - 10, box.top - 12)
        return hit === el || el.contains(hit)
      })
      expect(outside).toBe(true)

      await page.getByTestId('action-legend-fold').click()
      const folded = await height()
      expect(folded).toBeLessThan(open - 40)
      // still labelled: a folded key that does not say what the ground is coloured by is not a
      // folded key, it is a missing one
      await expect(key.locator('figcaption')).toBeVisible()

      await page.getByTestId('action-legend-fold').click()
      expect(await height()).toBe(open)
    })

    /**
     * The banner has its own close, so putting the 226px notice away leaves the garden it
     * describes, and "Clear the example and start my own" is the press that deletes it. On this
     * screen that notice and the legend covered 88% of the canvas between them
     */
    test('closes the example notice without deleting the example', async ({ page }) => {
      test.setTimeout(180_000)
      await openApp(page, { exampleGarden: true })
      await waitForCanvas(page)
      await page.getByTestId('action-tab-garden').click()
      await expect(page.getByTestId('panel-example')).toBeVisible({ timeout: 60_000 })
      expect(await reachable(page, 'action-example-dismiss')).toBe(true)
      await page.getByTestId('action-example-dismiss').click()
      await expect(page.getByTestId('panel-example')).toHaveCount(0)
      // the garden it was about is still the one on screen: the beds are still in the plot
      await expect(page.getByTestId('readout-overlay-legend')).toBeVisible()
      await page.getByTestId('action-tab-edit').click()
      await step(page, 'ground')
      expect(await readNumber(page.getByTestId('readout-ground-beds'))).toBeGreaterThan(0)
    })
  })
}

/**
 * With a finger, which nothing in this file had used.
 *
 * Every test above drives a mouse: the project runs `devices['Desktop Chrome']`, so the whole
 * mobile suite was a narrow window on a laptop. That is the right instrument for layout, and it
 * is no instrument at all for the questions a phone actually raises, which are whether the
 * gestures exist. The working notes had been carrying "the carry gesture is pointer-based and should
 * work under touch, but 'should' is doing the work in that sentence" for two sessions.
 *
 * One size and one journey rather than the full grid, because emulating touch does not change
 * layout and this is not a layout test: what it holds is that a garden can be drawn, closed and
 * selected with taps, on a build where nothing but a mouse has ever been tried.
 *
 * `isMobile` as well as `hasTouch`, because they are different claims. `hasTouch` gives the page
 * a touchscreen; `isMobile` makes it a phone, with the mobile viewport and the double-tap and
 * pinch behaviours the browser reserves for one
 */
test.describe('a phone with a finger', () => {
  test.use({
    viewport: { width: 375, height: 667 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  })

  /** How many beds the plot holds, off the ground step's own summary line */
  const countBeds = async (page: Page): Promise<number> => {
    await page.getByTestId('action-tab-edit').tap()
    await step(page, 'ground')
    return readNumber(page.getByTestId('readout-ground-beds'))
  }

  test('draws a bed by tapping, and closes it from the hint over the ground', async ({ page }) => {
    test.setTimeout(240_000)
    await openApp(page, { exampleGarden: true })
    await waitForCanvas(page)
    const before = await countBeds(page)
    expect(before).toBeGreaterThan(0)

    await page.getByTestId('action-tab-garden').tap()
    await page.getByTestId('action-toolbar-mode-draw-bed').tap()
    const box = await page.getByTestId('canvas-root').locator('canvas').boundingBox()
    expect(box).not.toBeNull()
    const at = (point: readonly [number, number]): [number, number] => [
      Math.round(box!.x + box!.width * point[0]),
      Math.round(box!.y + box!.height * point[1]),
    ]
    const ring = [
      [0.35, 0.42],
      [0.62, 0.42],
      [0.62, 0.58],
      [0.35, 0.58],
    ] as const

    /*
      The same retry the mouse fixture needs, for the same reason: the scene is behind a Suspense
      boundary, so r3f can have sized the canvas before the ground it raycasts against exists and
      the first tap lands on nothing. A tap that misses leaves no corner, which is the retry
      condition rather than a failure; the hint over the ground counts the corners as they land
    */
    const corners = page.getByTestId('readout-scene-hint-corners')
    await expect(async () => {
      await page.touchscreen.tap(...at(ring[0]))
      await expect(corners).toHaveAttribute('data-corners', /^[1-9]/, { timeout: 2_000 })
    }).toPass({ timeout: 60_000, intervals: [400] })
    for (const point of ring.slice(1)) await page.touchscreen.tap(...at(point))
    await expect(corners).toHaveAttribute('data-corners', '4')

    /*
      Closed from the hint itself, which is the only way to finish a shape without leaving the
      garden: the button that closes a polygon in the sidebar is behind a fold on a surface that
      is never on screen with the ground, and a double tap is not a thing a finger can be asked
      to know
    */
    await page.getByTestId('action-scene-close-shape').tap()
    await expect(page.getByTestId('status-scene-hint')).toHaveCount(0)
    await expect.poll(() => countBeds(page), { timeout: 30_000 }).toBe(before + 1)
  })

  /**
   * And is then told what to do with it, which was the one dead end left.
   *
   * The tap selects the bed, and the panel about it is on a surface that is not on screen, so the
   * prompt says so and offers the way there. The press has to do both halves: switching surfaces
   * alone lands on whatever step the plan was left on
   */
  test('offers the way to plant the bed it just selected', async ({ page }) => {
    test.setTimeout(240_000)
    await openApp(page, { exampleGarden: true })
    await waitForCanvas(page)
    await page.getByTestId('action-tab-garden').tap()
    const box = await page.getByTestId('canvas-root').locator('canvas').boundingBox()
    expect(box).not.toBeNull()
    // over the bed in the middle strip, which is the one a 375-wide phone can reach: the example
    // notice covers the top of the canvas and the rows hide the beds behind them. Mapped rather
    // than guessed, and it moved on 2026-09-01 when the array stopped being drawn ninety degrees
    // out of true; see `panelSnapshot`
    await page.touchscreen.tap(
      Math.round(box!.x + box!.width * 0.55),
      Math.round(box!.y + box!.height * 0.54),
    )
    const prompt = page.getByTestId('status-scene-selected')
    await expect(prompt).toBeVisible({ timeout: 30_000 })
    // it names the bed rather than saying something is selected
    await expect(prompt).toContainText(/bed/i)
    const bedId = (await prompt.getAttribute('data-bed')) ?? ''
    expect(bedId).not.toBe('')
    // and it does not cover the colour key, which lives along the same foot
    const clear = await page.evaluate(() => {
      const rect = (sel: string): DOMRect | null =>
        document.querySelector(sel)?.getBoundingClientRect() ?? null
      const one = rect('.scene-hint-select')
      const two = rect('.legend')
      if (one === null || two === null) return null
      return one.top < two.bottom && two.top < one.bottom
    })
    expect(clear).toBe(false)

    await page.getByTestId('action-scene-plant-bed').tap()
    await expect(page.getByTestId('app-root')).toHaveAttribute('data-surface', 'edit')
    await expect(page.getByTestId('action-step-plants')).toHaveAttribute('aria-expanded', 'true')
    // on the bed that was tapped, whose card is the selected one
    await expect(page.getByTestId(`item-plants-bed-${bedId}`)).toHaveAttribute(
      'data-selected',
      'true',
      { timeout: 120_000 },
    )
  })

  test('selects a bed by tapping it in the garden', async ({ page }) => {
    test.setTimeout(240_000)
    await openApp(page, { exampleGarden: true })
    await waitForCanvas(page)
    const selected = async (): Promise<string> => {
      await page.getByTestId('action-tab-edit').tap()
      await step(page, 'ground')
      await openFold(page, 'details-ground-beds')
      return page.getByTestId('control-bed-select').inputValue()
    }
    const first = await selected()
    const box = await page.getByTestId('canvas-root').locator('canvas').boundingBox()
    expect(box).not.toBeNull()

    /*
      Tapped across the plot rather than at one point, because which bed is under a given fraction
      of the canvas is a fact about the camera and the example garden, and this test is about
      whether a tap selects anything at all. One of them landing on a different bed is the whole
      assertion
    */
    const spots = [
      [0.55, 0.54],
      [0.45, 0.52],
      [0.65, 0.56],
      [0.5, 0.53],
    ] as const
    let moved = first
    for (const [fx, fy] of spots) {
      await page.getByTestId('action-tab-garden').tap()
      await page.touchscreen.tap(
        Math.round(box!.x + box!.width * fx),
        Math.round(box!.y + box!.height * fy),
      )
      moved = await selected()
      if (moved !== first) break
    }
    expect(moved).not.toBe(first)
  })
})

/**
 * The other half of the prompt above: on a laptop it does not exist.
 *
 * Selecting a bed there fills the panel beside the garden, so a prompt saying where to go would
 * point at something already in view. `display: none` rather than a width read in JavaScript, so
 * it is absent from the accessibility tree too and no reader is offered a destination they are
 * already looking at
 */
test.describe('a laptop, where the editor is already beside the garden', () => {
  test.use({ viewport: { width: 1280, height: 720 } })

  test('never offers a way to a panel that is already on screen', async ({ page }) => {
    test.setTimeout(240_000)
    await openApp(page, { exampleGarden: true })
    await waitForCanvas(page)
    /*
      Selected from the bed strip rather than by clicking the ground, because where a bed sits
      under the camera is a fact about the viewport and this test is about neither the camera nor
      the click: both routes write the same `selectedBedId`
    */
    await step(page, 'ground')
    await openFold(page, 'details-ground-beds')
    await page.locator('[data-testid^="item-bed-card-"]').first().click()
    /*
      Attached proves the click really selected a bed, because the component renders nothing at
      all without one; hidden proves the stylesheet keeps it off a screen where the panel it
      would point at is already open beside the garden. Either assertion alone passes on a page
      where nothing happened
    */
    const prompt = page.getByTestId('status-scene-selected')
    await expect(prompt).toBeAttached({ timeout: 30_000 })
    await expect(prompt).toBeHidden()
  })
})
