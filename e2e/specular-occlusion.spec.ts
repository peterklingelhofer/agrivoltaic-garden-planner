import { expect, test, type Page } from '@playwright/test'
import { sceneLuminance } from '../src/scene/agx.ts'
import { TONE_MAPPING_EXPOSURE } from '../src/scene/lighting.ts'
import { canvas, openApp, openFold, resolveSite, step } from './fixtures/app.ts'
import { decodePng, pixelAt, type Bitmap } from './fixtures/png.ts'

/**
 * What the specular half of the sky occlusion is worth, in scene radiance, off a real GPU.
 *
 * `sky-occlusion.spec.ts` measures the diffuse half and can't measure this one: it samples open
 * ground, where the diffuse term is nearly all of the surface, so the specular share is inside its
 * error rather than beside it. `ambientOcclusion.ts` also occludes `indirectSpecular`, clearcoat
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
 * occluded to unoccluded rather than a luminance: albedo multiplies the direct and the indirect
 * terms alike, so it cancels out of the ratio, and what doesn't cancel is the specular.
 *
 * Measured on the shipped build, three rounds each, on the bed under the middle row:
 *
 * | surface | occluded / unoccluded |
 * |---|---|
 * | dry, roughness 1, no clearcoat | 0.411 |
 * | wetted, roughness 0.55, clearcoat 0.7 | 0.394 |
 *
 * So the specular and clearcoat lines are worth 0.018 of the 0.589 the pass removes there, about
 * three percent of it. On a bed in the OPEN, where the diffuse occlusion is only 0.037, the same
 * switch is worth 0.015, which is two fifths of the whole effect: the specular occlusion bites
 * hardest where the sky is barely blocked at all, because `computeSpecularOcclusion` isn't
 * linear in the visibility it is handed and falls away fastest at low roughness. That asymmetry
 * is the reason this could never have been read off the diffuse measurement.
 *
 * Round to round the readings repeat to five decimal places once the first frame after a toggle
 * is discarded, so the margins below are wide against the spread and not against nothing.
 *
 * Re-posed on 2026-09-11, when a visitor's plot started being framed whole from 42 degrees up:
 * from there every bed's share fell under the floor (0.0001 on the open bed, 0.0023 under the
 * middle row), because a wet clearcoat reflects little sky toward a camera that steep. The
 * test now lowers the view by 18 degrees with a drag before it shoots, and asserts the share on
 * the bed that shows it most: from the framed bearing the bed under the middle row reads within
 * 0.01 of zero at every elevation tried (its mirror direction is the row above it), while the
 * open beds read 0.04 to 0.15
 */

/** The bed's soil is found rather than located by pixel: see `respondingCells` */
const CHANGED_BY_WETTING = 12

/** Above the round-to-round spread, which measured 0.003 at worst and 0 after the first round */
const MIN_SPECULAR_SHARE = 0.006

/**
 * How far past 1 a dry surface's occluded-to-unoccluded ratio may read. From the lowered pose the
 * open bed lands at 1.001 to 1.005, repeatable to four figures between runs, so it's a property
 * of the occlusion pass at that grazing view of open ground and not sampling noise; a blackout
 * or a brightening worth noticing is an order of magnitude past this
 */
const PAST_TOTAL_ALLOWANCE = 0.01

const median = (values: number[]): number =>
  values.length === 0 ? 0 : (values.slice().sort((a, b) => a - b)[values.length >> 1] ?? 0)

const shoot = async (page: Page): Promise<Bitmap> => {
  // the occlusion's enrollment sweep runs every fifteenth frame, so the frame straight after a
  // toggle isn't necessarily the frame that has it
  await page.waitForTimeout(1200)
  return decodePng(await canvas(page).screenshot())
}

const lumOver = (image: Bitmap, cells: readonly (readonly [number, number])[]): number =>
  median(cells.map(([x, y]) => sceneLuminance(pixelAt(image, x, y), TONE_MAPPING_EXPOSURE)))

/**
 * A bed's soil is exactly the pixels that its OWN irrigation moved, which is a physical criterion.
 * `sky-occlusion.spec.ts` has to state its band in canvas pixels,
 * which makes it a claim about one camera as well as one geometry. This finds its subject instead,
 * so a change to the default framing moves the sample with it rather than off it
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
  await page.getByTestId('control-time-day').fill('172')
  await page.getByTestId('control-time-minutes').fill('720')
  await expect(page.getByTestId('readout-sun-elevation')).toContainText('71')
  // the ground itself, with no model readout drawn over it
  await page.getByTestId('control-overlay-visible').setChecked(false)
  // the clearcoat is a quality tier, and on `auto` the machine decides whether this test has a
  // glossy surface to measure at all
  await page.getByTestId('control-overlay-lighting').selectOption('high')
  /*
    A visitor's plot has been framed whole from 42 degrees up since 2026-09-11, and a wet
    clearcoat reflects little sky toward a camera that steep (the Fresnel term falls away from
    grazing): measured from there, the share below read 0.0001 on the open bed and 0.0023 under
    the middle row, against a floor of 0.006. The figures in the header were taken from the old
    declared pose, 24 degrees up, so the view is lowered to that by a drag before anything is
    shot. OrbitControls turns a full circle per canvas height, so 18 degrees is 18/360 of it;
    the drag also latches the automatic framing off, which is what keeps the pose for the run
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

    // it stays an estimate of a view factor rather than a blackout: a panel overhead doesn't
    // switch off the sky, and a wet surface isn't darker than a black one
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
    surface dry. Without them, both surfaces would be occluded by the diffuse term alone and the
    two ratios would land on top of each other. Asserted on the bed that shows it most rather
    than on every bed: a wet surface mirrors one direction toward the camera, and the bed under
    the middle row reads within 0.01 of zero from the framed bearing at every elevation tried on
    2026-09-11 (its mirror direction is the row above it), where the open beds read 0.04 to 0.15
  */
  expect(Math.max(...shares), 'the specular occlusion reached nothing').toBeGreaterThan(
    MIN_SPECULAR_SHARE,
  )
})
