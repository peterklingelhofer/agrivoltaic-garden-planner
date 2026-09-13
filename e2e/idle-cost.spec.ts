import { expect, test } from '@playwright/test'
import { openApp, waitForCanvas } from './fixtures/app.ts'

/**
 * What a garden nobody is touching costs.
 *
 * r3f defaults to `frameloop="always"`, which redraws the scene sixty times a second for as long as
 * the tab is open, and at the high tier each of those frames carries six full-scene draws: an
 * occlusion prepass that overrides every material to collect normals and depth, four shadow
 * cascades at 2048 square, and the color pass. Measured on a 1280x800 window at device scale 2,
 * that is about 9,400 draw calls a second with nothing happening.
 *
 * Counting draw calls rather than frames per second, and counting them by patching the WebGL
 * context rather than by reading a frame counter, because the defect was never "the frame rate is
 * low". The frame rate was perfect. The defect was work being done to produce frames identical to
 * the one before, and a draw call is the unit of that work
 */
const IDLE_SECONDS = 6

/**
 * Wind is the one thing that legitimately keeps asking for frames, at 24 a second, and each of
 * those is a color pass with no cascades and no occlusion behind it. That's the floor this can
 * reach while foliage still moves. The ceiling here is set well above that floor and well below an
 * always-on loop: it catches the loop going back to always-on, or cosmetic frames starting to drag
 * the expensive passes along with them, without failing over the ordinary variation between one
 * machine and another
 */
const MAX_IDLE_DRAWS_PER_SECOND = 3_000

test('a garden nobody is touching stops paying for itself', async ({ page }) => {
  test.setTimeout(180_000)
  await openApp(page, { exampleGarden: true })
  await waitForCanvas(page)
  await expect(page.getByTestId('panel-example')).toBeVisible({ timeout: 60_000 })

  /**
   * One click on the scene, because the example opens with a slow orbit that deliberately keeps
   * the shot alive, and a camera that is moving isn't idle. The orbit latches off for good on
   * the first interaction, which is exactly the state this measures
   */
  const box = await page.locator('canvas').first().boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.waitForTimeout(4_000)

  await page.evaluate(() => {
    const proto = WebGL2RenderingContext.prototype as unknown as Record<string, unknown>
    ;(window as unknown as { __draws: number }).__draws = 0
    for (const name of [
      'drawElements',
      'drawArrays',
      'drawElementsInstanced',
      'drawArraysInstanced',
    ]) {
      const original = proto[name] as (...args: unknown[]) => unknown
      proto[name] = function patched(this: unknown, ...args: unknown[]): unknown {
        ;(window as unknown as { __draws: number }).__draws += 1
        return original.apply(this, args)
      }
    }
  })

  const read = async (): Promise<number> =>
    page.evaluate(() => (window as unknown as { __draws: number }).__draws)
  const before = await read()
  await page.waitForTimeout(IDLE_SECONDS * 1_000)
  const perSecond = ((await read()) - before) / IDLE_SECONDS

  expect(perSecond, `idle draw calls per second: ${perSecond.toFixed(0)}`).toBeLessThan(
    MAX_IDLE_DRAWS_PER_SECOND,
  )
})
