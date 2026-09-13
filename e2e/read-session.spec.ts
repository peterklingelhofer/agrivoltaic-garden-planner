import { expect, test, type Page } from '@playwright/test'
import { openApp } from './fixtures/app.ts'

/**
 * An instrument rather than a test: it plays a session and prints every reply, word for word.
 *
 * `bun run read-session`. It asserts almost nothing on purpose, because the point is to be READ.
 * Every defect worth fixing on this surface was found this way and none of them was found by the
 * corpora, which sat at 98-100% throughout: a greeting sent to the geocoder, a question recorded
 * as the opposite preference, "thanks" answered with "Hello", the same question asked twice in a
 * row word for word, three identical sentences about three identical beds. A suite written by the
 * person who built the thing tests the path they had in mind.
 *
 * Skipped unless asked for, because it prints a wall of text and takes a model load to do it
 */
const PHONE = { width: 375, height: 667 }

/**
 * A whole task, start to finish, plus the questions somebody asks once it's done.
 *
 * `WAIT` isn't typed: it pauses, so that the sun run the agent starts has time to finish. That
 * pause is the difference between "I have started running the sun" and a compliance readout, and
 * without it the session reads as a dead end
 */
const SESSION = [
  'im in Amherst, Massachusetts',
  'its 8 by 5',
  'design it for me',
  'use that one',
  'how many kwh will it make',
  'what grows well next to tomatoes',
  'is this legal',
  'WAIT',
  'what should i do this month',
]

test.describe('read a session', () => {
  test.use({ viewport: PHONE })
  test('plays it and prints every reply', async ({ page }) => {
    // an instrument rather than a test, asked for by name: it prints a wall of text and takes a
    // 45 MB model load to do it, and it asserts almost nothing because the point is to be read
    // biome-ignore lint/suspicious/noSkippedTests: see above
    test.skip(process.env.READ_SESSION !== 'on', 'run `bun run read-session` to play and print it')
    test.setTimeout(600_000)
    // registered before anything runs, which is the only place a listener catches anything
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await openApp(page)
    await page.getByTestId('action-tab-chat').click()
    await expect(page.getByTestId('panel-agent')).toBeVisible()
    await expect
      .poll(async () => (await page.locator('[data-agent-router="embedding"]').count()) > 0, {
        timeout: 180_000,
      })
      .toBe(true)
    const readLast = async (p: Page): Promise<string> => {
      const turn = p.getByTestId('item-agent-turn-us').last()
      const lines = await turn.locator('p, li').allInnerTexts()
      const chips = await turn.locator('[data-testid^="action-agent-chip-"]').allInnerTexts()
      return `${lines.join('\n      ')}${chips.length > 0 ? `\n      [ ${chips.join(' ] [ ')} ]` : ''}`
    }
    const opening = await page.getByTestId('readout-agent-opening').locator('p').allInnerTexts()
    const out: string[] = [`OPENING\n      ${opening.join('\n      ')}`]
    for (const said of SESSION) {
      const before = await page.getByTestId('item-agent-turn-us').count()
      if (said === 'WAIT') {
        // nothing is typed: this is the pause a run needs, and whatever arrives during it is the
        // agent finishing a sentence on its own rather than answering a press
        await page.waitForTimeout(30_000)
        const after = await page.getByTestId('item-agent-turn-us').count()
        out.push(
          after > before
            ? `... waited, and it came back on its own\n      ${await readLast(page)}`
            : '... waited, and nothing came back',
        )
        continue
      }
      const at = Date.now()
      await page.getByTestId('input-agent').fill(said)
      await page.getByTestId('action-agent-send').click()
      // at least one more: a run that lands mid-turn adds its own answer
      await expect
        .poll(async () => await page.getByTestId('item-agent-turn-us').count(), {
          timeout: 60_000,
        })
        .toBeGreaterThan(before)
      out.push(`> ${said}   [${String(Date.now() - at)} ms]\n      ${await readLast(page)}`)
    }
    console.log(`\n${out.join('\n\n')}\n`)
    // the one thing it does assert: a session a person could plausibly type throws nothing
    expect(errors).toEqual([])
  })
})
