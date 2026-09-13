import { expect, test } from '@playwright/test'

test('renders a canvas with non-zero dimensions', async ({ page }) => {
  await page.goto('/')

  const canvasRoot = page.getByTestId('canvas-root')
  const canvas = canvasRoot.locator('canvas')
  await expect(canvas).toBeVisible()

  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.width).toBeGreaterThan(0)
  expect(box!.height).toBeGreaterThan(0)
})
