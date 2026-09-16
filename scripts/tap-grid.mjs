// How much of a phone-sized 3D view selects a bed, and how often a finger's jitter around each
// bed's centre still lands on it.
//
//   node scripts/tap-grid.mjs --out <dir> [--weather <wdir>] [--url http://localhost:4173/]
//
// A 375 x 812 touch screen (the same context `persona-drive.mjs --phone` uses) opens the app,
// looks up Amherst when the design has no beds yet, switches to the garden, and taps a 15 x 24
// grid over the canvas, reading the selected-bed prompt after each tap. Then, for every bed the
// grid found, forty taps scattered within 20 px of its centre, which is about the reach of a
// fingertip, and the share of them that selected that bed. `--weather <wdir>` answers the two
// Open-Meteo archive requests and the elevation lookup from <wdir>/{hourly,daily,elevation}.json
// the way the persona driver does. Needs a `vite preview --port 4173` of the build to measure.
// Writes <dir>/garden.png, <dir>/result.json and prints the hit map
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const argv = process.argv.slice(2)
const flag = (name, fallback) => {
  const index = argv.indexOf(name)
  return index === -1 ? fallback : argv[index + 1]
}
const out = flag('--out', null)
if (out === null) {
  console.error('need --out <dir>')
  process.exit(2)
}
const weatherDir = flag('--weather', null)
const url = flag('--url', 'http://localhost:4173/')
mkdirSync(out, { recursive: true })

const COLS = 15
const ROWS = 24
const JITTER_PX = 20
const JITTER_TAPS = 40
const SETTLE_MS = 110

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=metal'],
})
const context = await browser.newContext({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
})
if (weatherDir !== null) {
  const served = (name) => readFileSync(join(weatherDir, name))
  await context.route(/\/v1\/archive\?/, (route) => {
    const u = route.request().url()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: u.includes('daily=') ? served('daily.json') : served('hourly.json'),
    })
  })
  if (existsSync(join(weatherDir, 'elevation.json'))) {
    await context.route(/\/api\/v1\/lookup/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: served('elevation.json'),
      }),
    )
  }
}
const page = await context.newPage()
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(url)
await page.getByTestId('app-root').waitFor()
await page.waitForTimeout(1500)

if ((await page.locator('[data-testid^="scene-bed-"]').count()) === 0) {
  await page.getByTestId('control-site-search').fill('Amherst, Massachusetts')
  await page.getByTestId('action-site-search').click()
  await page
    .getByTestId('item-site-result-Amherst, Hampshire County, Massachusetts, United States')
    .click({ timeout: 20000 })
  await page.waitForTimeout(8000)
}

await page.getByTestId('action-tab-garden').click()
await page.waitForTimeout(2500)
const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches)
const surface = () => page.getByTestId('app-root').getAttribute('data-surface')
console.log(`surface ${await surface()}, pointer coarse ${coarse}`)
await page.screenshot({ path: join(out, 'garden.png') })

const canvas = page.locator('[data-testid="canvas-root"] canvas').first()
const box = await canvas.boundingBox()
if (!box) throw new Error('no canvas box')
console.log(`canvas ${Math.round(box.width)} x ${Math.round(box.height)}`)

const onCanvas = (x, y) =>
  page.evaluate(
    ([px, py]) => {
      const hit = document.elementFromPoint(px, py)
      return hit !== null && hit.tagName === 'CANVAS'
    },
    [x, y],
  )

// the selected bed's prompt names it; nothing on the garden surface names a selected array
const readSelection = async () => {
  const prompt = page.getByTestId('status-scene-selected')
  if ((await prompt.count()) === 0) return null
  const text = (await prompt.first().textContent()) ?? ''
  const named = /^(.+?) is /.exec(text.trim())
  return named ? named[1] : text.trim().slice(0, 40)
}

const tapAndRead = async (x, y) => {
  await page.touchscreen.tap(x, y)
  await page.waitForTimeout(SETTLE_MS)
  if ((await surface()) !== 'garden') {
    await page.getByTestId('action-tab-garden').click()
    await page.waitForTimeout(800)
    return 'ui'
  }
  return readSelection()
}

const cellW = box.width / COLS
const cellH = box.height / ROWS
const grid = []
for (let r = 0; r < ROWS; r += 1) {
  const row = []
  for (let c = 0; c < COLS; c += 1) {
    const x = box.x + (c + 0.5) * cellW
    const y = box.y + (r + 0.5) * cellH
    row.push((await onCanvas(x, y)) ? await tapAndRead(x, y) : 'ui')
  }
  grid.push(row)
}

const names = [...new Set(grid.flat().filter((v) => v !== null && v !== 'ui'))]
const cells = Object.fromEntries(names.map((n) => [n, []]))
for (const [r, row] of grid.entries()) {
  for (const [c, v] of row.entries()) {
    if (v !== null && v !== 'ui') cells[v].push([c, r])
  }
}
const map = grid
  .map((row) =>
    row.map((v) => (v === 'ui' ? '#' : v === null ? '.' : String(names.indexOf(v) + 1))).join(''),
  )
  .join('\n')
console.log(
  `\nhit map (# = a control over the canvas, . = nothing selected, digit = bed)\n${map}\n`,
)
for (const [i, n] of names.entries()) {
  console.log(
    `${i + 1}: ${n}, ${cells[n].length} cells, ${Math.round(cells[n].length * cellW * cellH)} px2`,
  )
}

let seed = 7
const random = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648
  return seed / 2147483648
}
const jitter = {}
for (const n of names) {
  const sum = cells[n].reduce(
    (acc, [c, r]) => [acc[0] + (c + 0.5) * cellW, acc[1] + (r + 0.5) * cellH],
    [0, 0],
  )
  const cx = box.x + sum[0] / cells[n].length
  const cy = box.y + sum[1] / cells[n].length
  let hits = 0
  let tries = 0
  for (let i = 0; i < JITTER_TAPS; i += 1) {
    const angle = random() * Math.PI * 2
    const radius = Math.sqrt(random()) * JITTER_PX
    const x = cx + Math.cos(angle) * radius
    const y = cy + Math.sin(angle) * radius
    if (!(await onCanvas(x, y))) continue
    tries += 1
    if ((await tapAndRead(x, y)) === n) hits += 1
  }
  jitter[n] = { centre: [Math.round(cx - box.x), Math.round(cy - box.y)], hits, tries }
  console.log(`${n}: ${hits} of ${tries} taps within ${JITTER_PX} px of its centre selected it`)
}

writeFileSync(
  join(out, 'result.json'),
  JSON.stringify(
    {
      coarse,
      canvas: { width: box.width, height: box.height },
      grid: { cols: COLS, rows: ROWS, cellW, cellH },
      cells: Object.fromEntries(names.map((n) => [n, cells[n].length])),
      jitter,
      map,
      errors,
    },
    null,
    2,
  ),
)
await browser.close()
console.log(`console errors: ${errors.length}`)
