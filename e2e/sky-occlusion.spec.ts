import { expect, test, type Page } from '@playwright/test'
import { sceneLuminance } from '../src/scene/agx.ts'
import { TONE_MAPPING_EXPOSURE } from '../src/scene/lighting.ts'
import { canvas, openApp, resolveSite, step } from './fixtures/app.ts'
import { decodePng, pixelAt } from './fixtures/png.ts'

/**
 * How bright shaded ground is, in scene radiance, read off the pixels a real GPU produced.
 *
 * This is the pass-3 measurement kept as a test. The renderer lights everything the sky reaches
 * from one environment map, and an environment map hands every point the whole hemisphere: under
 * a panel that is not what the point can see, and the picture came out saying deep shade is
 * brighter than the sky model's own diffuse fraction, which is impossible. `ambientOcclusion.ts`
 * multiplies the sky term by an estimate of the view factor. What follows is the number that
 * justifies it, measured through `agx.ts` because a screenshot is display-referred and the claim
 * is about radiance.
 *
 * Three assertions, and the middle one is the point:
 *
 * 1. the estimate moves shaded ground at all, which is the self-test: without it, an occlusion
 *    pass that silently failed to run would leave this file green
 * 2. shaded ground lands under the unoccluded diffuse-to-global ratio, because a point that
 *    cannot see the whole sky cannot be lit as though it could
 * 3. sunlit ground does not move, because occlusion belongs to the sky term and the beam is a
 *    shadow test the cascades already answer. An AO composited over the finished frame, which
 *    is the usual wiring, fails this one
 *
 * On the shipped build the band reads 0.131 of sunlit with the effect off and 0.069 with it on,
 * against the 0.126 ceiling. Pass 1 measured 0.168 for the same quantity before the pass-2 scene
 * changes and pass 3 read 0.130 and 0.084 at the old framing, so the size of the gap has moved;
 * which side of the ceiling it fell on has not
 */

/**
 * The Preetham sky's own diffuse share of global irradiance at high sun, from `lighting.ts`:
 * the ceiling for any point that sees nothing but sky, and therefore a ceiling that ground under
 * a panel has to be below
 */
const DIFFUSE_TO_GLOBAL = 0.126

/**
 * A strip of open ground crossed by one row's shadow, in canvas pixels at the project's viewport.
 * Ground only: no panel, no bed, no plant is inside it, so the two clusters in it are the same
 * surface lit two ways.
 *
 * Re-cut on 2026-09-11, when a visitor's own plot started being framed whole: the camera stands
 * higher and further off than it did, the noon shadows are a few dozen pixels each, and the old
 * strip (y 490 to 530, x 200 to 700) had come to cross the front row's panels, whose tops are
 * dark and which the sky term never touches. Re-cut again the same evening, when the framing
 * started projecting the plot's corners through the real fov and standing back until all four
 * fit: the plot is smaller in the picture again and the previous strip (y 405 to 445, x 480 to
 * 820) read 1.05 for a shaded cluster that no longer had ground in it. This one sits under the
 * middle row's low end, east of the first bed, across that row's shadow and out over the open
 * ground; measured with a grid search over the two captures `SKY_DUMP` writes, 91 percent of
 * its shaded cluster moves when the occlusion is switched on, which is what says it is ground.
 * The canvas is 900 by 676 at this project's Desktop Chrome viewport, which any re-cut has to
 * measure at: a capture taken at 1920 by 1080 is a different picture
 */
const BAND = { top: 380, bottom: 420, left: 500, right: 660 }

/** The split between them. Any threshold between the clusters works: they differ by 7x */
const SHADED_BELOW = 0.6

interface GroundLuminance {
  readonly shaded: number
  readonly sunlit: number
  readonly ratio: number
}

const median = (values: readonly number[]): number =>
  values.length === 0 ? 0 : (values.slice().sort((a, b) => a - b)[values.length >> 1] ?? 0)

const groundLuminance = async (page: Page, occlusion: boolean): Promise<GroundLuminance> => {
  await page.getByTestId('control-overlay-occlusion').setChecked(occlusion)
  // the enrolment sweep runs every fifteenth frame, so the first frame after the toggle is not
  // necessarily the frame that has it
  await page.waitForTimeout(1000)
  const shot = await canvas(page).screenshot()
  // `SKY_DUMP=<dir>` keeps both captures, which is how the band above gets re-cut
  if (process.env.SKY_DUMP !== undefined)
    await import('node:fs').then((fs) =>
      fs.writeFileSync(`${process.env.SKY_DUMP}/sky-${occlusion ? 'on' : 'off'}.png`, shot),
    )
  const image = decodePng(shot)
  const band: number[] = []
  for (let y = BAND.top; y <= BAND.bottom; y += 2)
    for (let x = BAND.left; x <= BAND.right; x += 2)
      band.push(sceneLuminance(pixelAt(image, x, y), TONE_MAPPING_EXPOSURE))
  const split = (band.reduce((total, value) => total + value, 0) / band.length) * SHADED_BELOW
  const shaded = median(band.filter((value) => value < split))
  const sunlit = median(band.filter((value) => value >= split))
  expect(shaded, 'no shaded ground in the sample band').toBeGreaterThan(0)
  expect(sunlit, 'no sunlit ground in the sample band').toBeGreaterThan(1)
  return { shaded, sunlit, ratio: shaded / sunlit }
}

test('shaded ground is lit by the sky it can see and not by the whole hemisphere', async ({
  page,
}) => {
  test.setTimeout(240_000)
  await openApp(page)
  await resolveSite(page)
  /*
   * The band below is stated in canvas pixels, so it is a claim about one camera as well as one
   * geometry: nothing here touches the camera, and nothing in the column flies it, so the pose
   * is the one the starting plot is framed at
   */
  await step(page, 'light')
  // a fixed sun, because the ratio is a statement about one geometry
  await page.getByTestId('control-time-day').fill('172')
  await page.getByTestId('control-time-minutes').fill('720')
  await expect(page.getByTestId('readout-sun-elevation')).toContainText('71')
  // the ground itself, not the ground under a model readout
  await page.getByTestId('control-overlay-visible').setChecked(false)

  const unoccluded = await groundLuminance(page, false)
  const occluded = await groundLuminance(page, true)

  expect(occluded.shaded, 'the occlusion pass did not reach shaded ground').toBeLessThan(
    unoccluded.shaded * 0.85,
  )
  expect(occluded.ratio, 'shaded ground sees more sky than there is').toBeLessThan(
    DIFFUSE_TO_GLOBAL,
  )
  // and it is an estimate of a view factor, not a darkening: a panel does not black out the sky
  expect(occluded.ratio).toBeGreaterThan(0.03)
  expect(
    occluded.sunlit / unoccluded.sunlit,
    'the occlusion reached the direct beam',
  ).toBeGreaterThan(0.95)
})
