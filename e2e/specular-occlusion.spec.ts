import { expect, test, type Page } from '@playwright/test'
import { sceneLuminance } from '../src/scene/agx.ts'
import { TONE_MAPPING_EXPOSURE } from '../src/scene/lighting.ts'
import {
  canvas,
  nextPaint,
  openApp,
  openFold,
  resolveSite,
  settledCanvas,
  step,
} from './fixtures/app.ts'
import { decodePng, pixelAt, type Bitmap } from './fixtures/png.ts'

/**
 * What the specular half of the sky occlusion is worth, in scene radiance, off a real GPU.
 *
 * `sky-occlusion.spec.ts` measures the diffuse half and cannot measure this one: it samples open
 * ground, where the diffuse term is nearly all of the surface, so the specular share is inside its
 * error margin. `ambientOcclusion.ts` also occludes `indirectSpecular`, clearcoat
 * and sheen, copied from three's own `aomap_fragment`, and no figure had ever been put on those
 * three lines. This is that figure.
 *
 * The glossy surface is the product's own: a bed's soil takes a clearcoat and drops to roughness
 * 0.55 when its irrigation wets the surface (`materials.ts`, `bedSoilRoughness` and `BedMesh`'s
 * `clearcoat={wet * 0.7}`), and dry soil at roughness 1 with no clearcoat is the same geometry
 * with almost no specular response. So the comparison is between two surfaces the grower can
 * actually put there, switched by one control, and never by reaching into a material.
 *
 * Wetting also darkens the soil, by `WET_SHARE`, and that is why every claim here is a RATIO of
 * occluded to unoccluded, with one exception, a luminance: albedo multiplies the direct and the indirect
 * terms alike, so it cancels out of the ratio, and what does not cancel is the specular.
 *
 * Measured on the shipped build from the lowered and zoomed pose, three rounds, repeating to
 * five decimal places:
 *
 * | bed | dry, roughness 1, no clearcoat | wetted, roughness 0.55, clearcoat 0.7 |
 * |---|---|---|
 * | under the middle row, 4,842 pixels | 0.395 | 0.394 |
 * | the front bed, sky barely blocked, 590 pixels | 0.963 | 0.948 |
 *
 * Under the row the specular and clearcoat lines are worth 0.002 of the 0.605 the pass removes
 * there (the first measurement, from the old declared pose, had 0.411 against 0.394). On the
 * front bed, where the diffuse occlusion is only 0.037, the same switch is worth 0.015, which is
 * two fifths of the whole effect: the specular occlusion bites hardest where the sky is barely
 * blocked at all, because `computeSpecularOcclusion` is not linear in the visibility it is
 * handed and falls away fastest at low roughness. That asymmetry is the reason this could never
 * have been read off the diffuse measurement.
 *
 * Round to round the readings repeat to five decimal places, so the margins below are wide against
 * the spread itself. The drag that lowers the view leaves the controls' damping creeping the camera
 * by under a pixel over the next hundred frames, and every toggle lets a little of it through. A
 * few hundred edge pixels of panel and grid line would then count as soil, as many as the
 * whole-plot framing gives a bed, and that noise is enough to flake under eight parallel workers.
 * So the creep is spent before the first shot and the camera brought in to half the distance. The
 * two notes in the body have the figures.
 *
 * The app frames a visitor's plot whole from 42 degrees up by default, so the test lowers the
 * view by 18 degrees with a drag before it shoots, back to the old declared
 * pose, and asserts the share on the bed that shows it most: from the framed bearing the bed
 * under the middle row reads within 0.01 of zero (its mirror direction is the row above it).
 * From 42 degrees, brought in the same way, the front bed reads a share of 0.083 and the bed
 * under the middle row a wet ratio of 0.012, the panel's underside in the mirror direction,
 * which the blackout bound below refuses. So the pose stays lowered
 */

/** The bed's soil is found by where wetting changed it: see `respondingCells` */
const CHANGED_BY_WETTING = 12

/** Well above the round-to-round spread of 0.00005 at worst, and the front bed reads 0.015 */
const MIN_SPECULAR_SHARE = 0.006

/**
 * How far past 1 a dry surface's occluded-to-unoccluded ratio may read. Every bed reads under 1
 * from the lowered pose (0.963 on the front bed, 0.395 under the row). A brightening worth
 * noticing is an order of magnitude past this
 */
const PAST_TOTAL_ALLOWANCE = 0.01

/** Rounds of ten frames the drag's creep may take to die away, about eleven measured */
const CREEP_ROUNDS = 40

/** Wheel notches after the drag, each five percent closer: fourteen halve the distance */
const ZOOM_NOTCHES = 14

const median = (values: number[]): number =>
  values.length === 0 ? 0 : (values.slice().sort((a, b) => a - b)[values.length >> 1] ?? 0)

// the frame a toggle asks for, and the tail of the drag's glide before the first one, both land
// before the shot: the picture is read until it stops changing. There is no fixed timer
// a shared GPU could outrun
const shoot = async (page: Page): Promise<Bitmap> => decodePng(await settledCanvas(page))

const lumOver = (image: Bitmap, cells: readonly (readonly [number, number])[]): number =>
  median(cells.map(([x, y]) => sceneLuminance(pixelAt(image, x, y), TONE_MAPPING_EXPOSURE)))

/**
 * A bed's soil is exactly the pixels that its OWN irrigation moved, which is a physical criterion
 * and not a hand-picked rectangle. `sky-occlusion.spec.ts` has to state its band in canvas pixels,
 * which makes it a claim about one camera as well as one geometry; this finds its subject instead,
 * so a change to the default framing moves the sample along with it
 */
const respondingCells = (dry: Bitmap, wet: Bitmap): (readonly [number, number])[] => {
  const cells: (readonly [number, number])[] = []
  for (let y = 0; y < dry.height; y += 1)
    for (let x = 0; x < dry.width; x += 1) {
      const a = pixelAt(dry, x, y)
      const b = pixelAt(wet, x, y)
      const moved = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])
      if (moved > CHANGED_BY_WETTING) cells.push([x, y])
    }
  return cells
}

test('a wetted surface loses more to the sky occlusion than the same surface dry', async ({
  page,
}) => {
  // biome-ignore lint/suspicious/noSkippedTests: waits on a settled GPU frame; GitHub macOS runners have no real GPU
  test.skip(!!process.env.CI, 'waits on a settled GPU frame; GitHub macOS runners have no real GPU')
  test.setTimeout(240_000)
  await openApp(page)
  await resolveSite(page)
  await step(page, 'light')
  // a fixed sun, because every ratio here is a statement about one geometry
  // 13:00 on the clock: the stubbed weather names no zone, so the site's clock is the nearest
  // zone on record, America/New_York, which keeps summer time; 13:00 EDT is the 12:00 EST this
  // pose was chosen at, with the sun at 71 degrees
  await page.getByTestId('control-time-day').fill('172')
  await page.getByTestId('control-time-minutes').fill('780')
  await expect(page.getByTestId('readout-sun-elevation')).toContainText('71')
  // the ground itself, not the ground under a model readout
  await page.getByTestId('control-overlay-visible').setChecked(false)
  // the clearcoat is a quality tier, and on `auto` the machine decides whether this test has a
  // glossy surface to measure at all
  await page.getByTestId('control-overlay-lighting').selectOption('high')
  /*
    A visitor's plot is framed whole from 42 degrees up by default, and a wet clearcoat reflects
    little sky towards a camera that steep (the Fresnel term falls away from grazing). The figures
    in the header were taken from a pose 24 degrees up, so the view is lowered to that by a drag
    before anything is shot. OrbitControls turns a full circle per canvas height, so 18 degrees is
    18/360 of it. The drag also latches the automatic framing off, which is what keeps the pose for
    the run
  */
  const box = await canvas(page).boundingBox()
  if (box === null) throw new Error('no canvas to pose')
  // from the top of the picture, which is sky or far ground: a drag that starts on a bed moves
  // the bed, and one that starts on a panel row is the row's
  const grabX = box.x + box.width / 2
  const grabY = box.y + box.height * 0.08
  await page.mouse.move(grabX, grabY)
  await page.mouse.down()
  await page.mouse.move(grabX, grabY - box.height * (18 / 360), { steps: 8 })
  await page.mouse.up()
  /*
    The controls damp the drag, so the camera keeps creeping after the mouse is up: under a
    pixel in all, spent five percent a frame over the next hundred or so frames, and under
    `frameloop="demand"` those frames only happen when something asks for one. Every toggle
    below asks for one, and the creep it lets through flips a few hundred edge pixels across the
    panels and the grid lines, which then read as "moved by wetting" beside the soil that did.
    An occlusion toggle pair at the framed pose changes 0 pixels, and
    straight after the drag 645, falling to 35 sixty frames later. So the creep is spent here
    on that same pair, ten frames at a time, until two pictures agree. It takes about eleven
    rounds
  */
  const nudge = page.getByTestId('control-overlay-occlusion')
  let creeping = await settledCanvas(page)
  for (let round = 0; ; round += 1) {
    if (round === CREEP_ROUNDS) throw new Error('the camera never stopped creeping')
    for (let frame = 0; frame < 5; frame += 1) {
      await nudge.setChecked(true)
      await nudge.setChecked(false)
    }
    const next = await settledCanvas(page)
    if (next.equals(creeping)) break
    creeping = next
  }
  /*
    The whole-plot framing stands far enough back that a bed is a few hundred pixels, most of
    them under a row from 24 degrees up, and the sample wants thousands. Each wheel notch
    brings the camera in by five percent (OrbitControls' zoom scale), applied whole on the next
    frame with no creep, so fourteen halve the distance: the beds read 590 (front, under its
    row) and 4,842 (middle) responding pixels from there against 200 and 899 before
  */
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let notch = 0; notch < ZOOM_NOTCHES; notch += 1) {
    await page.mouse.wheel(0, -100)
    await nextPaint(page)
  }

  // the bed cards and the selected bed's irrigation sit behind the ground step's fold
  const bedTools = async (): Promise<void> => {
    await step(page, 'ground')
    await openFold(page, 'details-ground-beds')
  }
  await bedTools()
  const cards = page.getByTestId(/^item-bed-card-/)
  const bedCount = await cards.count()
  expect(bedCount, 'no beds to wet').toBeGreaterThan(0)

  let measured = 0
  const shares: number[] = []
  for (let index = 0; index < bedCount; index += 1) {
    await bedTools()
    await cards.nth(index).click()
    await step(page, 'light')
    await page.getByTestId('control-overlay-occlusion').setChecked(false)
    await bedTools()
    await page.getByTestId('control-bed-irrigation').selectOption('subsurface-drip')
    const dryUnoccluded = await shoot(page)
    await page.getByTestId('control-bed-irrigation').selectOption('sprinkler')
    const wetUnoccluded = await shoot(page)

    // a bed off screen or behind a row moves nothing, and has nothing to say here
    const cells = respondingCells(dryUnoccluded, wetUnoccluded)
    if (cells.length < 200) continue

    await step(page, 'light')
    await page.getByTestId('control-overlay-occlusion').setChecked(true)
    const wetOccluded = await shoot(page)
    await bedTools()
    await page.getByTestId('control-bed-irrigation').selectOption('subsurface-drip')
    const dryOccluded = await shoot(page)

    const dryRatio = lumOver(dryOccluded, cells) / lumOver(dryUnoccluded, cells)
    const wetRatio = lumOver(wetOccluded, cells) / lumOver(wetUnoccluded, cells)
    const where = `bed ${String(index)}, ${String(cells.length)} cells`

    // it stays an estimate of a view factor, except at a blackout: a panel overhead does not
    // switch off the sky, and a wet surface is not darker than a black one
    expect(wetRatio, `${where}: the wetted surface was blacked out`).toBeGreaterThan(0.03)
    expect(dryRatio, `${where}: the dry surface moved past total`).toBeLessThanOrEqual(
      1 + PAST_TOTAL_ALLOWANCE,
    )
    shares.push(dryRatio - wetRatio)
    measured += 1
  }
  expect(measured, 'no bed offered a surface to measure').toBeGreaterThan(0)
  /*
    The specular lines reach the picture: a glossy surface keeps LESS of its sky than the same
    surface dry. Without them, both surfaces would be occluded by the diffuse term alone and the two
    ratios would land on top of each other. Asserted on the bed that shows it most: a wet surface
    mirrors one direction towards the camera, and the bed under the middle row reads within 0.01 of
    zero from the framed bearing at every elevation tried (its mirror direction is the row above
    it), where the open beds read 0.04 to 0.15
  */
  expect(Math.max(...shares), 'the specular occlusion reached nothing').toBeGreaterThan(
    MIN_SPECULAR_SHARE,
  )
})
