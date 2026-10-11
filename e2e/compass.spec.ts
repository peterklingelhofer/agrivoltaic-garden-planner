import { expect, test, type Locator } from '@playwright/test'
import { canvas, openApp, waitForCanvas } from './fixtures/app.ts'

interface Box {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

const boxOf = async (locator: Locator): Promise<Box> => {
  const box = await locator.boundingBox()
  if (box === null) throw new Error('nothing laid out to measure')
  return box
}

const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

/**
 * The box that places the compass. The needle inside it turns with the camera, and a turned
 * square's bounding box is up to 41% wider than the square, so the needle's own box says nothing
 * about where the compass stands
 */
const placed = (needle: Locator): Locator => needle.locator('..')

/**
 * The needle in the corner names which way the camera is looking, at whatever bearing an orbit drag
 * has left it. Without it, typing where a house stands means guessing which way north runs
 */
test.describe('the scene compass', () => {
  test('reads a heading, and follows the camera through an orbit drag', async ({ page }) => {
    await openApp(page)
    await waitForCanvas(page)

    const compass = page.getByTestId('readout-compass')
    await expect(compass).toBeVisible()
    await expect.poll(() => compass.getAttribute('data-heading')).toMatch(/^\d+$/)
    const before = await compass.getAttribute('data-heading')

    const box = await canvas(page).boundingBox()
    if (box === null) throw new Error('no canvas to drag')
    const y = box.y + box.height / 2
    const startX = box.x + box.width * 0.7
    await page.mouse.move(startX, y)
    await page.mouse.down()
    await page.mouse.move(startX - 150, y, { steps: 8 })
    await page.mouse.move(startX - 300, y, { steps: 8 })
    await page.mouse.move(startX - 450, y, { steps: 8 })
    await page.mouse.up()

    await expect.poll(() => compass.getAttribute('data-heading')).not.toBe(before)
  })

  /**
   * It sat halfway down the left edge and read as stranded there. The corner is where a map keeps
   * its compass, and the drawing hint, which also lives at the foot, stands beside it
   */
  test("holds the garden's bottom-right corner, with the drawing hint beside it", async ({
    page,
  }) => {
    await openApp(page)
    const garden = await boxOf(page.getByTestId('canvas-root'))
    const compass = await boxOf(placed(page.getByTestId('readout-compass')))
    expect(garden.x + garden.width - (compass.x + compass.width)).toBeCloseTo(12, 0)
    expect(garden.y + garden.height - (compass.y + compass.height)).toBeCloseTo(12, 0)

    await page.getByTestId('action-toolbar-mode-draw-bed').click()
    const hint = page.getByTestId('status-scene-hint')
    await expect(hint).toBeVisible()
    expect(overlaps(await boxOf(hint), compass)).toBe(false)
  })
})

/**
 * No corner of the garden is free on a phone, so the compass is docked into the top bar beside the
 * place name, and goes with the garden when the plan is on screen
 */
test.describe('the scene compass on a phone', () => {
  test.use({ viewport: { width: 320, height: 568 } })

  test('sits in the top bar clear of the place name, on the garden only', async ({ page }) => {
    await openApp(page)
    const compass = page.getByTestId('readout-compass')
    // a first visit opens on the plan, where there is no view for it to describe
    await expect(compass).toBeHidden()
    await page.getByTestId('action-tab-garden').click()
    await expect(compass).toBeVisible()

    const bar = await boxOf(page.getByTestId('panel-toolbar'))
    const docked = await boxOf(placed(compass))
    expect(docked.y).toBeGreaterThanOrEqual(bar.y)
    expect(docked.y + docked.height).toBeLessThanOrEqual(bar.y + bar.height)
    expect(overlaps(docked, await boxOf(page.getByTestId('readout-toolbar-site')))).toBe(false)
  })
})
