import { AxeBuilder } from '@axe-core/playwright'
import type { NodeResult, Result } from 'axe-core'
import { expect, test, type Page } from '@playwright/test'
import { AGENT_IN_BUILD, openApp, step, waitForCanvas, type Step } from './fixtures/app.ts'

/**
 * Every surface, run through axe, in the states it is actually used in.
 *
 * Biome already runs `a11y: { "preset": "all" }` and `contrast.spec.ts` already measures every
 * text pair and focus indicator in both schemes. Neither can see what only exists at runtime: a
 * region that scrolls, an `aria-controls` pointing at an id nothing rendered, a heading order
 * that only goes wrong once a notice appears. That is what this is for.
 *
 * At rest it found nothing, on any of the nine sidebar steps. What it found was in a STATE: the
 * guided dock's help paragraph scrolls on the longer questions, and a scrollbar reachable only
 * with a pointer is content a keyboard cannot read. That is why the sweep below opens things
 * rather than loading pages
 */
const PHONE = { width: 375, height: 667 }

interface Violation {
  readonly id: string
  readonly impact: string | null | undefined
  readonly help: string
  readonly nodes: readonly string[]
}

const audit = async (page: Page): Promise<readonly Violation[]> => {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze()
  return results.violations.map((violation: Result) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    // the first few are enough to find it; a wall of markup in a failure helps nobody
    nodes: violation.nodes.slice(0, 3).map((node: NodeResult) => node.html.slice(0, 200)),
  }))
}

/** Collected across a whole walk and asserted once, so one run names every surface that is wrong */
const sweep = () => {
  const found: Record<string, readonly Violation[]> = {}
  return {
    add: async (where: string, page: Page): Promise<void> => {
      found[where] = await audit(page)
    },
    settle: (): void => {
      const bad = Object.entries(found).filter(([, violations]) => violations.length > 0)
      expect(JSON.stringify(Object.fromEntries(bad), null, 1)).toBe('{}')
      // and it actually looked at something, rather than passing because it audited nothing
      expect(Object.keys(found).length).toBeGreaterThan(2)
    },
  }
}

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

test('every step of the editor, and the conversation beside it', async ({ page }) => {
  test.setTimeout(300_000)
  const found = sweep()
  await openApp(page)
  await waitForCanvas(page)
  await found.add('at rest', page)
  for (const id of STEPS) {
    await step(page, id)
    await found.add(id, page)
  }

  // the confirmation, which is markup that exists only after a press
  await step(page, 'check')
  await page.getByTestId('action-storage-reset').click()
  await expect(page.getByTestId('panel-storage-confirm')).toBeVisible()
  await found.add('forget armed', page)
  await page.getByTestId('action-storage-forget-cancel').click()

  // and every disclosure on the page at once, which is where the evidence essays live
  const summaries = page.locator('summary')
  for (let n = 0; n < (await summaries.count()); n += 1) {
    await summaries
      .nth(n)
      .click()
      .catch(() => undefined)
  }
  await found.add('disclosures open', page)

  // the conversation half only, because the build carries it only when asked for; the editor
  // sweep above is the part of this test that runs either way
  if (AGENT_IN_BUILD) {
    await page.getByTestId('action-toolbar-ask').click()
    await page.getByTestId('input-agent').fill('i want to grow tomatoes')
    await page.getByTestId('action-agent-send').click()
    await expect(page.getByTestId('item-agent-turn-us')).toHaveCount(1, { timeout: 30_000 })
    await found.add('a conversation', page)
  }
  found.settle()
})

/**
 * The questions as a first visit meets them, walked with the Next at the foot of each step
 * rather than by naming the steps, so a question added to the path is audited without this file
 * being edited: each open step with its folds shut, which is what a visitor reads, and then the
 * comparison the search lands
 */
test('every question a first visit is asked, and the comparison they lead to', async ({ page }) => {
  test.setTimeout(300_000)
  const found = sweep()
  await openApp(page)
  await waitForCanvas(page)
  await expect(page.getByTestId('panel-step-place')).not.toHaveAttribute('hidden', '')
  for (let n = 0; n < 14; n += 1) {
    const open = await page.locator('.step[data-open="true"]').getAttribute('data-step')
    await found.add(`question ${String(n)} (${String(open)})`, page)
    if (open === 'panels') break
    const next = page.getByTestId('action-step-next')
    if ((await next.count()) === 0 || !(await next.isEnabled())) break
    await next.click()
  }
  await page.getByTestId('action-layouts-search').click()
  await expect(page.getByTestId('list-onboarding-scenarios')).toBeVisible({ timeout: 240_000 })
  await found.add('the comparison', page)
  found.settle()
})

test('every surface a phone has', async ({ page }) => {
  test.setTimeout(300_000)
  await page.setViewportSize(PHONE)
  const found = sweep()
  await openApp(page)
  await waitForCanvas(page)
  await found.add('the plan', page)
  await page.getByTestId('action-tab-garden').click()
  await found.add('the garden', page)
  await page.getByTestId('action-tab-edit').click()
  await found.add('the plan again', page)
  // the chat tab exists only in a build that carries the agent; the two surfaces above are
  // every surface a phone has without it
  if (AGENT_IN_BUILD) {
    await page.getByTestId('action-tab-chat').click()
    /*
      Long enough that the transcript genuinely scrolls, which is the state that matters: a scroll
      box with nothing focusable in it is a keyboard dead end, and the last of these replies
      offers nothing to press
    */
    for (const said of ['i want to grow tomatoes', 'i want to grow kale', 'hello', 'thanks']) {
      const before = await page.getByTestId('item-agent-turn-us').count()
      await page.getByTestId('input-agent').fill(said)
      await page.getByTestId('action-agent-send').click()
      await expect
        .poll(async () => await page.getByTestId('item-agent-turn-us').count(), { timeout: 30_000 })
        .toBeGreaterThan(before)
    }
    await found.add('a conversation that scrolls', page)
  }
  found.settle()
})
