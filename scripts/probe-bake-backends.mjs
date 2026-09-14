// Bakes the default plot on the WebGL2 backend and on the CPU reference in a real Chromium, and
// prints the per-bed "% of open sky" each one lands, before and after the panels are lowered.
//
//   bun run build && bunx vite preview --port 4173 &
//   node scripts/probe-bake-backends.mjs [--weather <dir>]
//
// Written when lowering the panels from 3.4 m to 1.5 m
// moved the panels in 3D and changed nothing in the light. It reproduced: on this laptop's
// Chromium (headless shell 151, ANGLE Metal) the WebGL2 shadow-map bake answered 86 / 57 / 71 for
// the three default beds at every panel height, pitch and tilt tried, while the CPU reference
// answered 94 / 38 / 54 at the default geometry and 98 / 8 / 79 with the panels at 0.6 m. Removing
// the array moved both to 100. The cause was in `src/sim/gpu/webgl2.ts`: the direction texture
// was uploaded onto the texture unit the panels had just been bound to, so the shader read its
// panel corners out of the sky directions. With that fixed the two backends agree to the digit
// on both geometries, and the script now checks two more too, with a house drawn and with a
// tree (Decision Record 26)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const argv = process.argv.slice(2)
const weatherIndex = argv.indexOf('--weather')
const weatherDir = weatherIndex === -1 ? null : argv[weatherIndex + 1]
const url = argv.find((arg) => arg.startsWith('http')) ?? 'http://localhost:4173/'

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=metal'],
})
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
if (weatherDir !== null) {
  const served = (name) => readFileSync(join(weatherDir, name))
  await context.route(/\/v1\/archive\?/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: served(route.request().url().includes('daily=') ? 'daily.json' : 'hourly.json'),
    }),
  )
  await context.route(/\/api\/v1\/lookup/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: served('elevation.json') }),
  )
}
// every request the page posts to a worker, so the geometry each bake was handed is on record
await context.addInitScript(() => {
  const original = Worker.prototype.postMessage
  Worker.prototype.postMessage = function (message, ...rest) {
    const geometry = message?.plot?.arrays?.[0]?.geometry
    if (message?.type === 'run') {
      console.log(
        `PROBE run arrays=${message.plot?.arrays?.length} clearance=${geometry?.clearanceHeightM} pitch=${geometry?.pitchM} backend=${message.options?.backend} obstructions=${JSON.stringify(message.plot?.obstructions)}`,
      )
    }
    return original.call(this, message, ...rest)
  }
})
const page = await context.newPage()
page.on('console', (m) => {
  if (m.text().startsWith('PROBE')) console.log(m.text())
})

const rows = () => page.locator('[data-testid^="readout-bed-light-open-"]').allInnerTexts()
const bakeByHand = async () => {
  await page.getByTestId('action-step-light').click()
  await page.getByTestId('action-sim-final').click()
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="app-root"]')?.getAttribute('data-sim-state') ===
      'ready',
    null,
    { timeout: 240_000 },
  )
}

await page.goto(url)
await page.getByTestId('app-root').waitFor()
await page.waitForTimeout(3000)
await page.getByTestId('action-example-clear').click()
await page.waitForTimeout(9000)
// automatic runs off, so every bake below is the one this script asked for
await page.getByTestId('action-step-plants').click()
await page.getByText('Every crop ranked, and why').click()
await page.getByTestId('control-recommendation-autorun').click()

for (const backend of ['webgl2-shadowmap', 'cpu-reference']) {
  await page.getByTestId('action-step-light').click()
  const how = page.getByTestId('details-sim-how')
  if ((await how.getAttribute('open')) === null) await page.getByTestId('action-sim-how').click()
  await page.getByTestId('control-sim-backend').selectOption(backend)
  await bakeByHand()
  console.log(backend, 'default geometry', await rows())
  await page.getByTestId('action-step-panels').click()
  await page.getByText('Adjust the panels by hand').click()
  await page.getByTestId('control-array-clearance').fill('0.6')
  await bakeByHand()
  console.log(backend, 'panels at 0.6 m', await rows())
  await page.getByTestId('action-step-panels').click()
  // the fold closes with the step; open it again before putting the height back
  await page.getByText('Adjust the panels by hand').click()
  await page.getByTestId('control-array-clearance').fill('2.5')

  // a third geometry: a house standing over bed 1, the same box the ground step draws and the
  // scene shows, shading through the kernels this time
  await page.getByTestId('action-step-ground').click()
  await page.getByTestId('action-house-add').click()
  await page.getByTestId('control-house-height-house-1').fill('12')
  await page.getByTestId('control-house-north-house-1').fill('-8')
  await bakeByHand()
  console.log(backend, 'with a house', await rows())
  // bakeByHand leaves the light step open; back to ground for the button that clears the house
  await page.getByTestId('action-step-ground').click()
  // clears it so the next backend starts from the same bare plot this one did
  await page.getByTestId('action-house-remove-house-1').click()

  // a fourth geometry: a tree standing over bed 1, its crown transmitting some light rather
  // than blocking it outright the way the house's walls do
  await page.getByTestId('action-tree-add').click()
  await page.getByTestId('control-tree-width-tree-1').fill('10')
  await page.getByTestId('control-tree-depth-tree-1').fill('10')
  await page.getByTestId('control-tree-top-tree-1').fill('12')
  await page.getByTestId('control-tree-base-tree-1').fill('2')
  await page.getByTestId('control-tree-north-tree-1').fill('-6')
  await bakeByHand()
  console.log(backend, 'with a tree', await rows())
  // bakeByHand leaves the light step open; back to ground for the button that clears the tree
  await page.getByTestId('action-step-ground').click()
  // clears it so the next backend starts from the same bare plot this one did
  await page.getByTestId('action-tree-remove-tree-1').click()
}
await browser.close()
