// A persistent browser you drive one command at a time, from the shell.
//
//   node scripts/persona-drive.mjs --dir <dir> serve                  # start Chromium (ANGLE Metal), poll <dir>/cmd.json
//   node scripts/persona-drive.mjs --dir <dir> <op> [args...]         # send one command, print the result
//   node scripts/persona-drive.mjs --dir <dir> --weather <wdir> serve # answer the weather archives from <wdir>/{hourly,daily}.json
//   node scripts/persona-drive.mjs --dir <dir> --phone serve          # a 375x812 touch screen instead of a 1440x900 laptop
//
// Ops:
//   open <url>                 load the page in a fresh context (cold visitor: no saved design)
//   look                       what is on screen: visible text, and the controls you could press
//   click <testid>             press a control by its data-testid
//   clicktext <text>           press the first visible button/link/label whose text contains <text>
//   type <testid> <text...>    type into a field
//   select <testid> <value>    pick an option of a <select> by value or by visible label
//   set <testid> <value>      write a slider or range value (day of year, minutes)
//   press <key>                keyboard key (Enter, Tab, Escape, ArrowDown...)
//   hover <testid>
//   scroll <dy>                scroll the sidebar column by dy px (negative = up)
//   canvas <fx> <fy>           click the 3D view at a fraction of its width/height, a finger's tap on a phone
//   read <testid>              the text of one element
//   wait <ms>
//   quit
//
// Every op saves a screenshot to <dir>/shots/NNN-<op>.png and appends to <dir>/log.jsonl
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  appendFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const argv = process.argv.slice(2)
const dirIndex = argv.indexOf('--dir')
if (dirIndex === -1) {
  console.error('need --dir <dir>')
  process.exit(2)
}
const dir = argv[dirIndex + 1]
/*
  `--weather <dir>` answers the two Open-Meteo archive requests from <dir>/hourly.json and
  <dir>/daily.json instead of the upstream. One site lookup weighs about 600 of Open-Meteo's
  calls against 600 a minute and 5,000 an hour from one address, and every fresh context here is
  a fresh lookup: three of six persona visits on 2026-09-05 were spent inside the rate limit
  instead of the app. Capture the bodies once with curl (the URLs are in src/data/tmy.ts and
  src/data/static-layers.ts) and every browser gets the same real weather, whatever address it
  types. Elevation, soil and the place-name search stay live: they're light
*/
const weatherIndex = argv.indexOf('--weather')
const weatherDir = weatherIndex === -1 ? null : argv[weatherIndex + 1]
// `--phone` is a 375x812 touch screen that reports itself as a phone, the way the mobile e2e
// project does, so a persona meets the tab bar and the one-surface layout rather than a narrow
// laptop window
const phoneIndex = argv.indexOf('--phone')
const phone = phoneIndex !== -1
const rest = argv.filter(
  (_, i) =>
    i !== dirIndex &&
    i !== dirIndex + 1 &&
    i !== weatherIndex &&
    i !== weatherIndex + 1 &&
    i !== phoneIndex,
)
const [op, ...args] = rest
mkdirSync(join(dir, 'shots'), { recursive: true })
const CMD = join(dir, 'cmd.json')
const RES = join(dir, 'result.json')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

if (op !== 'serve') {
  if (existsSync(RES)) unlinkSync(RES)
  writeFileSync(CMD, JSON.stringify({ op, args }))
  const deadline = Date.now() + 180_000
  while (!existsSync(RES)) {
    if (Date.now() > deadline) {
      console.error('no answer from the browser in 180 s (is `serve` running for this --dir?)')
      process.exit(1)
    }
    await sleep(150)
  }
  await sleep(50)
  console.log(readFileSync(RES, 'utf8'))
  process.exit(0)
}

const width = 1440
const height = 900
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=metal'],
})
let context = null
let page = null
let n = 0
let clicks = 0
const consoleErrors = []

const fresh = async () => {
  if (context) await context.close()
  context = await browser.newContext(
    phone
      ? {
          viewport: { width: 375, height: 812 },
          deviceScaleFactor: 1,
          isMobile: true,
          hasTouch: true,
        }
      : { viewport: { width, height }, deviceScaleFactor: 1 },
  )
  if (weatherDir !== null) {
    const served = (name) => readFileSync(join(weatherDir, name))
    await context.route(/\/v1\/archive\?/, (route) => {
      const url = route.request().url()
      const body = url.includes('daily=') ? served('daily.json') : served('hourly.json')
      return route.fulfill({ status: 200, contentType: 'application/json', body })
    })
    // and the elevation, when the directory holds one: open-elevation refuses a connection
    // after a handful of lookups a minute, and four browsers at once locked every step behind
    // "the elevation lookup has answered as many requests as it allows" for ninety seconds
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
  page = await context.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => consoleErrors.push(String(e)))
}

/** What a person can see right now, and what they could press */
const look = () =>
  page.evaluate(() => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    // inside the window, and inside every scroll box on the way up: text scrolled out of the
    // sidebar's box is still inside the window, and counting it would overstate what a persona sees
    const seen = (el) => {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return false
      const s = getComputedStyle(el)
      if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false
      if (!(r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw)) return false
      for (let p = el.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p).overflowY
        if (o === 'auto' || o === 'scroll' || o === 'hidden') {
          const b = p.getBoundingClientRect()
          if (r.bottom <= b.top || r.top >= b.bottom) return false
        }
      }
      return true
    }
    const hiddenBy = (el) => {
      for (let p = el; p; p = p.parentElement) {
        if (p.hidden || p.getAttribute('aria-hidden') === 'true') return true
        if (p.classList?.contains('visually-hidden')) return true
        // the body of a closed fold. Chromium keeps a layout box for it (content-visibility
        // rather than display none), so the rectangle test below let personas read text that was
        // behind a summary nobody had pressed
        if (p.tagName === 'DETAILS' && !p.open && !el.closest('summary')) return true
      }
      return false
    }
    const region = (el) => {
      if (el.closest('[data-testid="panel-toolbar"]')) return 'top bar'
      if (el.closest('aside.sidebar')) return 'the plan column (right sidebar on a laptop)'
      if (el.closest('[data-testid="canvas-root"]')) return 'over the 3D view'
      if (el.closest('[data-testid="panel-tabbar"]')) return 'bottom tabs'
      return 'page'
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const text = {}
    let offscreen = 0
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const t = node.textContent.replace(/\s+/g, ' ').trim()
      if (!t) continue
      const el = node.parentElement
      if (!el || hiddenBy(el)) continue
      if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue
      if (!seen(el)) {
        offscreen += t.length
        continue
      }
      const key = region(el)
      text[key] = (text[key] ?? []).concat(t)
    }
    const controls = []
    const nodes = document.querySelectorAll(
      'button, a[href], input, select, textarea, [role="button"], [role="option"], summary, label',
    )
    for (const el of nodes) {
      if (hiddenBy(el) || !seen(el)) continue
      const testid = el.getAttribute('data-testid')
      let name = el.getAttribute('aria-label') ?? el.labels?.[0]?.innerText ?? '' ?? ''
      if (!name) name = el.innerText ?? el.value ?? ''
      name = String(name).replace(/\s+/g, ' ').trim().slice(0, 90)
      const kind = el.tagName === 'INPUT' ? `input:${el.type}` : el.tagName.toLowerCase()
      const entry = { kind, name }
      if (testid) entry.testid = testid
      if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio'))
        entry.checked = el.checked
      if (el.tagName === 'SELECT') entry.value = el.options[el.selectedIndex]?.text
      if (el.tagName === 'INPUT' && !['checkbox', 'radio', 'range'].includes(el.type))
        entry.value = el.value
      if (el.tagName === 'LABEL' && !el.control) continue
      if (el.tagName === 'LABEL' && el.control && el.control.getAttribute('data-testid')) continue
      if (el.disabled) entry.disabled = true
      controls.push(entry)
    }
    const open =
      document.querySelector('.step[data-open="true"]')?.getAttribute('data-step') ?? null
    const root = document.querySelector('[data-testid="app-root"]')
    return {
      openStep: open,
      surface: root?.getAttribute('data-surface') ?? null,
      // the light run's state, which the column only prints while its own step is open
      light: root?.getAttribute('data-sim-state') ?? null,
      visibleText: Object.fromEntries(
        Object.entries(text).map(([k, v]) => [k, v.join(' | ').slice(0, 7000)]),
      ),
      offscreenChars: offscreen,
      controls: controls.slice(0, 120),
    }
  })

const byTestId = (id) => page.getByTestId(id).first()

const run = async (cmd) => {
  const { op, args } = cmd
  const t0 = Date.now()
  let note = null
  switch (op) {
    case 'open': {
      await fresh()
      await page.goto(args[0] ?? 'http://localhost:5173/', { waitUntil: 'domcontentloaded' })
      await page.getByTestId('app-root').waitFor({ timeout: 60_000 })
      await page
        .getByTestId('canvas-root')
        .locator('canvas')
        .first()
        .waitFor({ timeout: 60_000 })
        .catch(() => {})
      await sleep(3500)
      break
    }
    case 'look':
      break
    case 'click': {
      clicks += 1
      const el = byTestId(args[0])
      await el.scrollIntoViewIfNeeded().catch(() => {})
      await el.click({ timeout: 8000 })
      await sleep(900)
      break
    }
    case 'clicktext': {
      clicks += 1
      const wanted = args.join(' ')
      const el = page
        .locator('button, a, summary, label, [role="button"], [role="option"]')
        .filter({ hasText: wanted })
        .first()
      await el.scrollIntoViewIfNeeded().catch(() => {})
      await el.click({ timeout: 8000 })
      await sleep(900)
      break
    }
    case 'type': {
      clicks += 1
      const [id, ...words] = args
      const el = byTestId(id)
      await el.scrollIntoViewIfNeeded().catch(() => {})
      await el.fill(words.join(' '), { timeout: 8000 })
      await sleep(600)
      break
    }
    case 'select': {
      clicks += 1
      const [id, ...words] = args
      const value = words.join(' ')
      const el = byTestId(id)
      await el.scrollIntoViewIfNeeded().catch(() => {})
      await el.selectOption({ value }).catch(() => el.selectOption({ label: value }))
      await sleep(700)
      break
    }
    case 'set': {
      // a range input can't be filled, so its value is written through the native setter and the
      // input event React listens for is dispatched by hand
      clicks += 1
      const [id, value] = args
      const el = byTestId(id)
      await el.scrollIntoViewIfNeeded().catch(() => {})
      await el.evaluate((node, v) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
        setter?.call(node, v)
        node.dispatchEvent(new Event('input', { bubbles: true }))
        node.dispatchEvent(new Event('change', { bubbles: true }))
      }, value)
      await sleep(700)
      break
    }
    case 'press':
      clicks += 1
      await page.keyboard.press(args[0])
      await sleep(600)
      break
    case 'hover': {
      const el = byTestId(args[0])
      await el.scrollIntoViewIfNeeded().catch(() => {})
      await el.hover({ timeout: 8000 })
      await sleep(700)
      break
    }
    case 'scroll': {
      const dy = Number(args[0] ?? 600)
      await page.evaluate((d) => {
        const aside = document.querySelector('aside.sidebar')
        if (aside) aside.scrollBy(0, d)
        else window.scrollBy(0, d)
      }, dy)
      await sleep(400)
      break
    }
    case 'canvas': {
      clicks += 1
      const box = await page.getByTestId('canvas-root').boundingBox()
      const fx = Number(args[0] ?? 0.5)
      const fy = Number(args[1] ?? 0.5)
      const x = box.x + box.width * fx
      const y = box.y + box.height * fy
      // a phone visit's press has to reach the app as a touch, the way a real finger would
      if (phone) await page.touchscreen.tap(x, y)
      else await page.mouse.click(x, y)
      await sleep(900)
      break
    }
    case 'read': {
      const el = byTestId(args[0])
      note = (await el.count()) === 0 ? '(nothing with that testid)' : await el.innerText()
      break
    }
    case 'wait':
      await sleep(Number(args[0] ?? 1000))
      break
    default:
      note = `unknown op ${op}`
  }
  n += 1
  const shot = join(dir, 'shots', `${String(n).padStart(3, '0')}-${op}.png`)
  if (page) await page.screenshot({ path: shot }).catch(() => {})
  const state = page ? await look().catch((e) => ({ lookFailed: String(e) })) : {}
  const result = {
    n,
    op,
    args,
    ms: Date.now() - t0,
    clicksSoFar: clicks,
    screenshot: shot,
    note,
    ...state,
    newConsoleErrors: consoleErrors.splice(0),
  }
  appendFileSync(
    join(dir, 'log.jsonl'),
    `${JSON.stringify({ n, op, args, clicks, at: new Date().toISOString() })}\n`,
  )
  return result
}

console.log(`serving ${dir}`)
for (;;) {
  if (!existsSync(CMD)) {
    await sleep(120)
    continue
  }
  let cmd
  try {
    cmd = JSON.parse(readFileSync(CMD, 'utf8'))
  } catch {
    await sleep(100)
    continue
  }
  unlinkSync(CMD)
  if (cmd.op === 'quit') {
    writeFileSync(RES, JSON.stringify({ op: 'quit', clicks }))
    break
  }
  let result
  try {
    result = await run(cmd)
  } catch (error) {
    n += 1
    const shot = join(dir, 'shots', `${String(n).padStart(3, '0')}-${cmd.op}-failed.png`)
    if (page) await page.screenshot({ path: shot }).catch(() => {})
    result = {
      n,
      op: cmd.op,
      args: cmd.args,
      error: String(error).split('\n')[0],
      screenshot: shot,
      clicksSoFar: clicks,
    }
    try {
      Object.assign(result, page ? await look() : {})
    } catch {}
  }
  writeFileSync(RES, JSON.stringify(result, null, 1))
}
if (context) await context.close()
await browser.close()
