import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  BAKE_TIMEOUT_MS,
  BED_RING,
  canvas,
  drawPolygon,
  openApp,
  resolveSite,
  runLightCheck,
  step,
} from './fixtures/app.ts'

/**
 * Three snapshots, no more. A screenshot is the wrong instrument for anything a
 * selector can assert, and it's the only instrument for these three:
 *
 * 1. the baked light overlay, which is a scene object with no DOM node at all, so
 *    nothing but pixels can show that the color ramp is applied to the right cells
 * 2. the overlay legend's RAMP, a CSS gradient whose stops carry the meaning of every
 *    color in 1 and which no attribute records
 * 3. the calendar legend, whose five swatches are the key to every bar and marker in
 *    the timeline and are pure CSS color: the DOM records the method names and
 *    nothing records which color goes with which
 *
 * The project runs on SwiftShader for a software rasterizer that is stable across
 * machines. Two determinism rules, both learned by leaving this red:
 *
 * A. a snapshot may not contain a model output. The overlay legend's whole `figure` prints the
 * raster's minimum, midpoint and MAXIMUM DLI, and that maximum differs from one bake to the next,
 * so a snapshot of it would change with no product change and pin exactly the kind of absolute DLI
 * value the rest of this suite is forbidden to assert. The snapshot is the `.legend-ramp` gradient
 * alone, which is the part carrying meaning no attribute carries, and the numbers are asserted from
 * `data-min` and `data-max`, where a number belongs. B. a snapshot's BOX may not be
 * content-derived. `.cal-legend` is a wrapping flex row whose height is a sum of line boxes, which
 * can differ by a device pixel from one run to the next, and a one pixel size difference is a hard
 * mismatch that no `maxDiffPixelRatio` can absorb. `pinned` fixes the element's own box before the
 * shot, so the wrap is decided at a known width and the image is the same size on every run and
 * every machine
 */

interface Box {
  readonly width: number
  readonly height: number
}

/**
 * Waits until an element has stopped MOVING, which is a different thing from its content having
 * arrived and is the thing `toHaveScreenshot` refuses to photograph without.
 *
 * The agenda sits above the calendar legend on the same step and settles a moment after the step
 * opens, so the legend is still traveling up the column while everything a spec would normally
 * wait for is already true. `pinned` below fixes an element's SIZE and can do nothing about its
 * position. Two consecutive equal boxes decide it, so it costs one frame when the
 * page is already still
 */
const stillFor = async (target: Locator): Promise<void> => {
  let previous = ''
  await expect
    .poll(
      async () => {
        const box = await target.boundingBox()
        const now = `${String(box?.x ?? -1)}:${String(box?.y ?? -1)}`
        const settled = now === previous
        previous = now
        return settled
      },
      { timeout: 30_000 },
    )
    .toBe(true)
}

/**
 * Fixes an element's layout box for the duration of one screenshot. The content is
 * untouched. Only the box it is laid out in stops being negotiable
 */
const pinned = async (target: Locator, box: Box): Promise<void> => {
  await target.evaluate((node, size) => {
    const style = (node as HTMLElement).style
    style.width = `${String(size.width)}px`
    style.height = `${String(size.height)}px`
    style.overflow = 'hidden'
    /**
     * Position is deliberately NOT pinned, though it's the other half of a negotiable box and
     * pinning it would end the stability flake below outright. Taking either legend out of flow
     * with `position: fixed` lands it over the app header, and both have a transparent
     * background, so the header's title and buttons print straight through the swatches: a
     * baseline recorded that way is a picture of two things at once. It also captures a 340x14
     * element as exactly 14 px, against the 15 px the recorded fractional offset produces,
     * so it can't be adopted without re-recording. Settle the layout instead
     */
  }, box)
  await expect
    .poll(async () => {
      const measured = await target.boundingBox()
      return `${String(measured?.width ?? 0)}x${String(measured?.height ?? 0)}`
    })
    .toBe(`${String(box.width)}x${String(box.height)}`)
}

const LEGEND_BOX: Box = { width: 340, height: 44 }
const RAMP_BOX: Box = { width: 340, height: 14 }

/**
 * A screenshot of an element that is still moving fails on stability. The overlay legend is pinned
 * over the canvas, out of the sidebar's flow entirely. The calendar legend is one panel among
 * several on the Calendar step, and the crop picker sits behind a fold on the plants step and
 * can't move it. These waits are the settle conditions for the async loads the automatic ranking
 * kicks off, which neither `status-simulation` nor `status-autorun` covers:
 *
 * - the crop picker fills from the catalog fetch
 * - the DLI evidence lands on every recommendation row
 *
 * stated as conditions. It's attached, because the picker
 * sits inside the closed "Pick plants one at a time" fold and the condition is that it has
 * filled, which the document knows whether or not the fold is open
 */
const catalogSettled = async (page: Page): Promise<void> => {
  await expect(page.getByTestId('list-bed-crops')).toBeAttached({ timeout: 120_000 })
}

/*
  The rows themselves, without the DLI evidence one of them may carry. A row only renders that note
  when its limiting factor IS a light gate, so whether any row has one is a fact about which crops
  the bake happened to rank first, and the panel pages its ranking, so the first page can
  legitimately contain no light-limited crop at all. Every ranked row carries
  `item-recommendation-`, whatever held it back, so its presence is the condition: the ranking has
  landed in the sidebar
*/
const rankingSettled = async (page: Page): Promise<void> => {
  await expect(page.locator('[data-testid^="item-recommendation-"]').first()).toBeAttached({
    timeout: 120_000,
  })
}

test('the baked DLI overlay and its legend ramp', async ({ page }) => {
  test.setTimeout(BAKE_TIMEOUT_MS + 240_000)
  await openApp(page)
  await resolveSite(page)
  await drawPolygon(page, 'bed', BED_RING)
  await runLightCheck(page)
  await step(page, 'plants')
  await catalogSettled(page)
  // and the ranking itself as well as the picker appearing: rows stream into the sidebar as it
  // finishes, which grows the column under the canvas beside it. A canvas whose box is still
  // moving is a canvas Playwright won't photograph, and it reports that as a timeout
  await expect(page.getByTestId('status-autorun')).toHaveAttribute('data-state', 'ready', {
    timeout: 120_000,
  })

  const legend = page.getByTestId('readout-overlay-legend')
  await expect(legend).toBeVisible()
  // the scale is a bake output: asserted as a number, and kept out of the image
  expect(Number(await legend.getAttribute('data-max'))).toBeGreaterThan(0)
  expect(Number(await legend.getAttribute('data-min'))).toBe(0)
  await expect(legend).toContainText('mol/m²/d')

  await expect(canvas(page)).toHaveScreenshot('dli-overlay.png')

  const ramp = legend.locator('.legend-ramp')
  await expect(ramp).toHaveCount(1)
  await pinned(ramp, RAMP_BOX)
  await expect(ramp).toHaveScreenshot('dli-legend-ramp.png')
})

test('the planting calendar legend', async ({ page }) => {
  test.setTimeout(BAKE_TIMEOUT_MS + 240_000)
  await openApp(page)
  await resolveSite(page)
  await drawPolygon(page, 'bed', BED_RING)
  await runLightCheck(page)
  await step(page, 'plants')
  await expect(page.getByTestId('status-autorun')).toHaveAttribute('data-state', 'ready', {
    timeout: 120_000,
  })
  await rankingSettled(page)
  await step(page, 'calendar')

  const legend = page.getByTestId('readout-calendar-legend')
  await expect(legend).toBeVisible()
  await expect(legend.locator('.cal-swatch')).toHaveCount(5)
  await stillFor(legend)
  await pinned(legend, LEGEND_BOX)
  await expect(legend).toHaveScreenshot('calendar-legend.png')
})
