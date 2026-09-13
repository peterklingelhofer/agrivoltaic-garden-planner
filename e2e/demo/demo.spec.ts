import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BEATS, type Cut } from './beats.ts'
import { Director, installOverlay } from './overlay.ts'

/**
 * The recording run. Not a test: nothing here is asserting that the product is correct, and a
 * failure here means the film could not be shot rather than that the app is broken.
 *
 * It is a Playwright spec anyway, and that is the whole trick. Driving a demo needs exactly what
 * driving a test needs -- a real browser, a built app, a way to wait for a control rather than
 * for a clock -- and Playwright already records video of the page it is driving. The alternative
 * was a screen recorder and a steady hand, which produces a film that is out of date the day the
 * UI moves and cannot be re-shot without a person.
 *
 * Deliberately NOT stubbed. Every other spec in this suite puts fake weather in front of the app
 * so its assertions cannot drift; this one wants the opposite. The film says the data is live,
 * so the data is live: real geocoding, real weather, real soil, for a real place
 */

const OUT = join(process.cwd(), 'demo')

/** Long: the design search runs a year of hourly weather over every candidate layout, for real */
const RUN_TIMEOUT_MS = 25 * 60 * 1000

test.describe.configure({ mode: 'serial' })

const waitForApp = async (page: Page): Promise<void> => {
  await expect(page.getByTestId('app-root')).toBeVisible({ timeout: 60_000 })
  const canvas = page.locator('canvas').first()
  await expect(canvas).toBeVisible({ timeout: 120_000 })
  // the example garden is fetched, and the cold open cannot say anything until it lands
  await page.waitForTimeout(2500)
}
const shoot = async (page: Page, cut: Cut, info: TestInfo): Promise<void> => {
  test.setTimeout(RUN_TIMEOUT_MS)
  const beats = BEATS.filter((beat) => beat.cuts.includes(cut))
  const chapters = beats.filter((beat) => beat.chapter !== undefined).length

  await installOverlay(page)
  const t0 = Date.now()
  await page.goto('/')
  await waitForApp(page)

  const director = new Director(page, t0, chapters)
  try {
    for (const beat of beats) {
      if (beat.chapter !== undefined) {
        await director.chapter(beat.chapter[0], beat.chapter[1])
      }
      const started = director.elapsed()
      if (beat.caption !== '') await director.say(beat.caption, beat.at ?? 'top')
      await beat.run?.(director)
      if (beat.caption !== '') await director.settle(beat.caption, started)
    }
    await director.hush()
    await page.waitForTimeout(900)
  } finally {
    // written even when a beat throws. A take that died two thirds of the way through is still
    // two thirds of a film, and without this the run that failed left behind footage nobody
    // could cut because the caption timings died with the exception
    writeTimeline(cut, director, t0, info)
  }
}

/**
 * Where this take's screencast will be, named from the test's own output directory.
 *
 * Emphatically NOT `page.video().path()`, which is the obvious call and is wrong. That returns a
 * path under `.playwright-artifacts-N/`, which is scratch space: Playwright moves the file to
 * `<outputDir>/video.webm` when the context closes and deletes the scratch directory, so by the
 * time anything downstream reads the timeline the recorded path is gone.
 *
 * Both cuts are recorded in one run, so a fallback such as "the only webm under demo/raw" can pick
 * the same file for both and ship the long walkthrough as the short cut
 */
const videoPath = (info: TestInfo): string => join(info.outputDir, 'video.webm')

const writeTimeline = (cut: Cut, director: Director, t0: number, info: TestInfo): void => {
  const { cues, chapters: marks } = director.finish()
  mkdirSync(OUT, { recursive: true })
  writeFileSync(
    join(OUT, `timeline-${cut}.json`),
    `${JSON.stringify(
      { cut, durationMs: Date.now() - t0, video: videoPath(info), chapters: marks, cues },
      null,
      2,
    )}\n`,
  )
}

test('the short cut', async ({ page }, info) => {
  await shoot(page, 'short', info)
})

test('the full walkthrough', async ({ page }, info) => {
  await shoot(page, 'full', info)
})
