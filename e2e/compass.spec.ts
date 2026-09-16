import { expect, test } from '@playwright/test'
import { canvas, openApp, waitForCanvas } from './fixtures/app.ts'

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
})
