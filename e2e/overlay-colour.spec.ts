import { expect, test } from '@playwright/test'
import { CONTOUR_LINE_FACTOR, contourStep, contourValues, viridis } from '../src/state/colormap.ts'
import {
  BAKE_TIMEOUT_MS,
  BED_RING,
  canvas,
  drawPolygon,
  openApp,
  resolveSite,
  runLightCheck,
} from './fixtures/app.ts'
import { countNear, decodePng, type Rgb } from './fixtures/png.ts'

/**
 * The overlay is a model output, and the legend beside it is the key to reading it. This is the
 * end-to-end version of `src/scene/colour.test.ts`: not a model of the renderer but the pixels
 * a real GPU produced, checked against the same `viridis` the CSS gradient is built from.
 *
 * It is also what says the `dli-overlay.png` baseline moved for the scene around the overlay
 * and not for the overlay: the ramp colours below are on screen exactly, and the double-encoded
 * ones a lost sRGB decode would produce are absent.
 */

const encode = (linear: number): number =>
  Math.round(255 * (linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055))

const decode = (byte: number): number => {
  const c = byte / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** What the ramp becomes if the sRGB decode is lost: read as linear, then encoded as sRGB */
const doubleEncoded = ([r, g, b]: Rgb): Rgb =>
  [r, g, b].map((byte) => encode(byte / 255)) as unknown as Rgb

/** What an iso-line does to the ramp colour it is drawn over, in the shader's own linear space */
const contourLine = ([r, g, b]: Rgb): Rgb =>
  [r, g, b].map((byte) => encode(decode(byte) * CONTOUR_LINE_FACTOR)) as unknown as Rgb

/**
 * The interior of the ramp, not its ends: a bake's minimum and maximum are single cells, so
 * pure `viridis(0)` and `viridis(1)` occupy a pixel or two and would make a flaky assertion
 */
const STOPS = [0.25, 0.5, 0.75]
const TOLERANCE = 8

/**
 * These counts are also the guard on the iso-lines. A contour whose screen width outruns its
 * spacing stops being a line and becomes a wash over the reading, and that is not a subtle
 * failure: it was measured at zero pixels on any of the three stops before `LINES_MERGE_AT`
 * faded the merged lines out, against around a hundred each with the surface intact
 */
const MIN_STOP_PIXELS = 20

test('the rendered overlay is the colour its legend advertises', async ({ page }) => {
  test.setTimeout(BAKE_TIMEOUT_MS + 240_000)
  // the year's playback is one of the things the app holds still for a visitor who asked for less
  // movement, and the project asks for that, so the half of this test that plays the year asks
  // back out, before the first navigation because the preference gates the button itself
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await openApp(page)
  await resolveSite(page)
  await drawPolygon(page, 'bed', BED_RING)
  await runLightCheck(page)

  const legend = page.getByTestId('readout-overlay-legend')
  await expect(legend).toBeVisible()
  const min = Number(await legend.getAttribute('data-min'))
  const max = Number(await legend.getAttribute('data-max'))
  expect(max).toBeGreaterThan(0)

  // full opacity, so a sampled pixel is the overlay rather than the overlay over lit ground
  const opacity = page.getByTestId('control-overlay-opacity')
  await opacity.fill('1')
  await expect(opacity).toHaveValue('1')

  const image = decodePng(await canvas(page).screenshot())
  const found = STOPS.map((t) => ({
    t,
    ramp: countNear(image, viridis(t), TOLERANCE),
    doubled: countNear(image, doubleEncoded(viridis(t)), TOLERANCE),
  }))

  for (const row of found) {
    expect(row.ramp, `viridis(${String(row.t)}) on screen`).toBeGreaterThan(MIN_STOP_PIXELS)
    expect(row.doubled, `double-encoded viridis(${String(row.t)}) on screen`).toBeLessThan(3)
  }

  // the legend names every line the shader draws, and no others
  const values = contourValues(min, max)
  expect(values.length).toBeGreaterThan(0)
  await expect(page.getByTestId('readout-overlay-legend-contours')).toHaveAttribute(
    'data-step',
    String(contourStep(min, max)),
  )
  const ticks = await page
    .getByTestId('readout-overlay-legend-contours')
    .locator('.legend-tick')
    .allInnerTexts()
  expect(ticks.map(Number)).toEqual(values.map((value) => Number(value.toFixed(2))))

  // and the lines are on the ground: each is its own value's ramp colour, darkened
  const lines = values.reduce(
    (total, value) =>
      total + countNear(image, contourLine(viridis((value - min) / (max - min))), TOLERANCE),
    0,
  )
  expect(lines, 'iso-lines drawn on the overlay').toBeGreaterThan(MIN_STOP_PIXELS)

  /*
   * The accumulating playback, checked here because the bake it needs is already on screen and
   * because the unit tests can only say what `overlayField` returns, not that the pinned legend
   * over the canvas is reading it. Two claims, and the second is the one worth the round trip:
   * the caption has to name the span, since it is the only thing on screen saying that what is
   * drawn is no longer one month; and `data-max` has to hold still while the span grows, because
   * a ramp that rescales every frame turns the year converging into the year staying put
   */
  await page.getByTestId('action-overlay-play').click()
  await page.getByTestId('control-overlay-accumulate').setChecked(true)
  const caption = legend.locator('figcaption')
  await expect(caption).toContainText('Mean daily light integral,')
  const openingSpan = await caption.innerText()
  const fixedMax = await legend.getAttribute('data-max')
  // polled rather than timed off the playback interval, so this never encodes the tick length
  await expect(caption).not.toHaveText(openingSpan)
  await expect(caption).toContainText(' to ')
  await expect(legend).toHaveAttribute('data-max', String(fixedMax))
})
