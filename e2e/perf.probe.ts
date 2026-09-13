import { writeFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { sceneLuminance } from '../src/scene/agx.ts'
import { TONE_MAPPING_EXPOSURE } from '../src/scene/lighting.ts'
import {
  BED_RING,
  canvas,
  drawPolygon,
  openApp,
  openFold,
  resolveSite,
  runLightCheck,
  step,
} from './fixtures/app.ts'
import { decodePng, pixelAt } from './fixtures/png.ts'

/**
 * Not a spec: a measuring rig for frame times and screenshots with the occlusion on and off, run by
 * hand with a Playwright config of its own
 */

const OUT = process.env.PROBE_OUT ?? '/tmp/probe'

const setUp = async (page: Page, occlusion: boolean): Promise<void> => {
  await openApp(page)
  await resolveSite(page)
  await step(page, 'light')
  await page.getByTestId('control-time-day').fill('172')
  await page.getByTestId('control-time-minutes').fill('1020')
  await page.getByTestId('control-overlay-visible').setChecked(false)
  await page.getByTestId('control-overlay-occlusion').setChecked(occlusion)
  await page.waitForTimeout(1500)
}

const median = (values: number[]): number =>
  values.length === 0 ? 0 : (values.slice().sort((a, b) => a - b)[values.length >> 1] ?? 0)

/** rAF deltas over five seconds, with the scene doing everything it does at rest */
const frameTimes = async (page: Page): Promise<number[]> =>
  page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const deltas: number[] = []
        let last = performance.now()
        const tick = (): void => {
          const now = performance.now()
          deltas.push(now - last)
          last = now
          if (now - start < 5000) requestAnimationFrame(tick)
          else resolve(deltas)
        }
        const start = performance.now()
        requestAnimationFrame(tick)
      }),
  )

const percentile = (values: number[], p: number): number =>
  values.slice().sort((a, b) => a - b)[
    Math.min(values.length - 1, Math.floor(values.length * p))
  ] ?? 0

test('frames', async ({ page }) => {
  test.setTimeout(600_000)
  await page.setViewportSize({ width: 1280 + 380, height: 720 })
  await openApp(page)
  await resolveSite(page)
  await step(page, 'ground')
  await openFold(page, 'details-ground-beds')
  await page.getByTestId('action-bed-draw').click()
  const box = await canvas(page).boundingBox()
  for (const [fx, fy] of [
    [0.35, 0.55],
    [0.6, 0.55],
    [0.6, 0.75],
    [0.35, 0.75],
  ] as const)
    await page.mouse.click(
      (box?.x ?? 0) + (box?.width ?? 0) * fx,
      (box?.y ?? 0) + (box?.height ?? 0) * fy,
    )
  await page.getByTestId('action-bed-close-polygon').click()
  // the full check runs by itself once the bed is closed; this waits for it
  await runLightCheck(page)
  await step(page, 'plants')
  await openFold(page, 'details-plants-by-hand')
  const picker = page.getByTestId('list-bed-crops')
  await expect(picker).toBeVisible({ timeout: 300_000 })
  await picker.getByRole('option').first().click()
  await page.getByTestId('control-bed-planting-count').fill('400')
  await page.getByTestId('action-bed-add-planting').click()
  await step(page, 'light')
  await page.getByTestId('control-time-day').fill('200')
  await page.getByTestId('control-time-minutes').fill('1020')

  for (const occlusion of [false, true]) {
    await page.getByTestId('control-overlay-occlusion').setChecked(occlusion)
    await page.waitForTimeout(2000)
    const deltas = (await frameTimes(page)).slice(5)
    console.log(
      `FRAMES occlusion=${String(occlusion)} n=${String(deltas.length)} p50=${percentile(deltas, 0.5).toFixed(2)} p95=${percentile(deltas, 0.95).toFixed(2)}`,
    )
  }
  writeFileSync(`${OUT}/frames.png`, await canvas(page).screenshot())
  expect(true).toBe(true)
})

test('overlay', async ({ page }) => {
  test.setTimeout(600_000)
  await openApp(page)
  await resolveSite(page)
  await drawPolygon(page, 'bed', BED_RING)
  await runLightCheck(page)
  const legend = page.getByTestId('readout-overlay-legend')
  await expect(legend).toBeVisible()
  console.log(
    `OVERLAY min=${String(await legend.getAttribute('data-min'))} max=${String(await legend.getAttribute('data-max'))}`,
  )
  await page.getByTestId('control-overlay-opacity').fill('1')
  if (process.env.PROBE_CHANNEL)
    await page.getByTestId('control-overlay-channel').selectOption(process.env.PROBE_CHANNEL)
  await page.waitForTimeout(500)
  const tag = process.env.PROBE_TAG ?? ''
  writeFileSync(`${OUT}/overlay${tag}.png`, await canvas(page).screenshot())
  const box = await canvas(page).boundingBox()
  writeFileSync(
    `${OUT}/overlay-crop${tag}.png`,
    await page.screenshot({
      clip: {
        x: (box?.x ?? 0) + 420,
        y: (box?.y ?? 0) + 330,
        width: 440,
        height: 240,
      },
    }),
  )
  writeFileSync(`${OUT}/legend${tag}.png`, await legend.screenshot())
  expect(true).toBe(true)
})

test('shot', async ({ page }) => {
  test.setTimeout(300_000)
  for (const occlusion of [false, true]) {
    await setUp(page, occlusion)
    const shot = await canvas(page).screenshot()
    writeFileSync(`${OUT}/scene-${occlusion ? 'ao' : 'plain'}.png`, shot)
    const image = decodePng(shot)
    const elevation = await page.getByTestId('readout-sun-elevation').textContent()
    const band: number[] = []
    for (let y = 490; y <= 530; y += 2)
      for (let x = 200; x <= 700; x += 2)
        band.push(sceneLuminance(pixelAt(image, x, y), TONE_MAPPING_EXPOSURE))
    const split = (band.reduce((a, b) => a + b, 0) / band.length) * 0.6
    const dark = band.filter((v) => v < split)
    const light = band.filter((v) => v >= split)
    console.log(
      `RATIO occlusion=${String(occlusion)} shaded=${median(dark).toFixed(4)} (n=${String(dark.length)}) sunlit=${median(light).toFixed(4)} (n=${String(light.length)}) ratio=${(median(dark) / median(light)).toFixed(4)}`,
    )
    const ramp = ' .:-=+*#%@'
    const rows: string[] = []
    for (let y = 0; y < image.height; y += 20) {
      let line = ''
      for (let x = 0; x < image.width; x += 20) {
        const values: number[] = []
        for (let dy = 0; dy < 20; dy += 4)
          for (let dx = 0; dx < 20; dx += 4)
            if (x + dx < image.width && y + dy < image.height)
              values.push(sceneLuminance(pixelAt(image, x + dx, y + dy), TONE_MAPPING_EXPOSURE))
        const level = Math.min(9, Math.max(0, Math.round(median(values) * 1.2)))
        line += ramp[level] ?? '?'
      }
      rows.push(`${String(y).padStart(3, ' ')}|${line}`)
    }
    console.log(
      `occlusion=${String(occlusion)} elevation=${String(elevation)} ${String(image.width)}x${String(image.height)}`,
    )
    console.log(rows.join('\n'))
  }
  expect(true).toBe(true)
})
