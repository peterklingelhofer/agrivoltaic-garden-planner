/**
 * Drives a real headless browser against the deployed site with nothing stubbed: a real place
 * lookup, a real geocoder search, a real bake, a real layout search, a real ranking.
 *
 * CI stubs every weather, elevation, soil and geocoding request (see e2e/fixtures/app.ts), and
 * `bun run verify-deploy` only reads the deployed HTML and JS over HTTP. Neither reaches a live
 * upstream, so a build can be green everywhere while a fresh place lookup fails against a real
 * one. This is the check that reaches one.
 *
 * Run it before any outreach that points someone at the site, and after any deploy.
 *
 * Cost: the coordinate lookup below picks a random town and jitters it to a point nobody has looked
 * up, so the Worker's cache can't hide an outage. Every run spends about one fresh lookup of the
 * pooled Open-Meteo allowance (600/min, 5,000/h, 10,000/day, shared across every address this app
 * resolves), and up to five SoilGrids calls from the Worker's address against ISRIC's fair-use
 * limit of 5 a minute: the point and, where it's built-up ground, a ring of four. Manual check only
 *
 *   bun run verify-live
 *   bun run verify-live https://some-other-host/
 */
import { chromium } from '@playwright/test'
import {
  AUTORUN_TIMEOUT_MS,
  resolveSite,
  runLightCheck,
  SITE_TIMEOUT_MS,
  step,
  waitForCanvas,
  waitForRanking,
} from '../e2e/fixtures/app.ts'

const DEFAULT_URL = 'https://garden.peterklingelhofer.com/'
const url = process.argv[2] ?? DEFAULT_URL

const LAUNCH_ARGS = ['--use-gl=angle', '--use-angle=metal']
const VIEWPORT = { width: 1440, height: 900 }
const NAVIGATION_TIMEOUT_MS = 60_000
const GEOCODER_TIMEOUT_MS = 30_000
const RESPONSE_URL_MAX = 160
const JITTER_DEG = 0.03

// a point no visitor has looked up, so a cached answer can't stand in for a live one
const TOWNS = [
  { label: 'Bridgeton, New Jersey', lat: 39.427, lon: -75.234 },
  { label: 'New Brunswick, New Jersey', lat: 40.4862, lon: -74.4518 },
  { label: 'Amherst, Massachusetts', lat: 42.3736, lon: -72.5199 },
  { label: 'Ames, Iowa', lat: 42.0308, lon: -93.6319 },
  { label: 'Davis, California', lat: 38.5449, lon: -121.7405 },
]

const round4 = (value) => Number(value.toFixed(4))
const jittered = (value) => round4(value + (Math.random() * 2 - 1) * JITTER_DEG)
const firstLine = (error) => String(error?.message ?? error).split('\n')[0]
const truncate = (text, max) => (text.length > max ? `${text.slice(0, max)}...` : text)

const town = TOWNS[Math.floor(Math.random() * TOWNS.length)]
const lat = jittered(town.lat)
const lon = jittered(town.lon)

console.log(`verify-live: ${url}`)
console.log(
  `point: ${town.label}, jittered to ${String(lat)}, ${String(lon)} (base ${String(town.lat)}, ${String(town.lon)})`,
)

const consoleErrors = []
const failedRequests = []
const badResponses = []
const timings = {}

const timed = async (label, fn) => {
  const t0 = Date.now()
  await fn()
  timings[label] = Date.now() - t0
}

/** Reads an element's text when it's on the page, and answers at once when it isn't */
const readIfPresent = async (page, testId) => {
  const locator = page.getByTestId(testId)
  if ((await locator.count()) === 0) return null
  return (await locator.textContent())?.trim() || null
}

const browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS })
const context = await browser.newContext({ viewport: VIEWPORT })
const page = await context.newPage()

page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})
page.on('pageerror', (error) => consoleErrors.push(error.message))
page.on('requestfailed', (request) => {
  failedRequests.push(`${request.url()} - ${request.failure()?.errorText ?? 'unknown error'}`)
})
page.on('response', (response) => {
  const status = response.status()
  if (status >= 400) badResponses.push({ status, url: response.url() })
})

let landed = false
let siteResolved = false
let bakeLanded = false
let searchLanded = false
let rankingLanded = false

try {
  try {
    await timed('landing', async () => {
      await page.goto(url, { timeout: NAVIGATION_TIMEOUT_MS })
      await waitForCanvas(page)
    })
    landed = true
    console.log('[landing] the canvas is up')
  } catch (error) {
    console.log(`[landing] the canvas never came up: ${firstLine(error)}`)
  }

  if (landed) {
    try {
      await timed('resolve', () => resolveSite(page, lat, lon))
      siteResolved = true
      console.log('[resolve] the site resolved')
    } catch (error) {
      console.log(
        `[resolve] the site didn't resolve within ${String(SITE_TIMEOUT_MS)}ms: ${firstLine(error)}`,
      )
      const notice = await readIfPresent(page, 'status-site')
      console.log(`[resolve] status-site says: ${notice ?? "(couldn't read it)"}`)
    }
  } else {
    console.log('[resolve] skipped, the page never landed')
  }

  // the geocoder's own search path, run whether or not the coordinate path above resolved: it
  // spends no lookup (the option is never clicked), and when the coordinate path is down, this
  // says whether the geocoder is one of the reasons or a healthy path on its own
  if (landed) {
    try {
      await page.getByTestId('control-site-search').fill('Bridgeton, New Jersey')
      await page.getByTestId('action-site-search').click()
      await page
        .locator('#site-search-results [role="option"]')
        .first()
        .waitFor({ state: 'visible', timeout: GEOCODER_TIMEOUT_MS })
      console.log('[geocoder] an option appeared for "Bridgeton, New Jersey"')
    } catch (error) {
      console.log(
        `[geocoder] no option appeared within ${String(GEOCODER_TIMEOUT_MS)}ms: ${firstLine(error)}`,
      )
    }
  } else {
    console.log('[geocoder] skipped, the page never landed')
  }

  if (siteResolved) {
    try {
      await timed('first bake', () => runLightCheck(page))
      bakeLanded = true
      console.log('[first bake] landed')
    } catch (error) {
      console.log(`[first bake] didn't land: ${firstLine(error)}`)
    }
  } else {
    console.log('[first bake] skipped, the site never resolved')
  }

  if (bakeLanded) {
    try {
      await timed('layout search', async () => {
        await step(page, 'panels')
        await page.getByTestId('action-layouts-search').click()
        await page
          .getByTestId('list-onboarding-scenarios')
          .waitFor({ state: 'visible', timeout: AUTORUN_TIMEOUT_MS })
      })
      searchLanded = true
      console.log('[layout search] landed')
    } catch (error) {
      console.log(`[layout search] didn't land: ${firstLine(error)}`)
    }

    try {
      await timed('ranking', () => waitForRanking(page))
      rankingLanded = true
      console.log('[ranking] landed')
    } catch (error) {
      console.log(`[ranking] didn't appear: ${firstLine(error)}`)
    }
  } else {
    console.log('[layout search] skipped, the first bake never landed')
    console.log('[ranking] skipped, the first bake never landed')
  }

  const siteLabel = await readIfPresent(page, 'readout-site-label')
  const elevation = await readIfPresent(page, 'readout-site-elevation')

  console.log('')
  console.log('--- phase timings ---')
  for (const label of ['landing', 'resolve', 'first bake', 'layout search', 'ranking']) {
    console.log(
      `  ${label.padEnd(14)} ${label in timings ? `${String(timings[label])}ms` : 'skipped'}`,
    )
  }

  console.log('')
  console.log('--- site ---')
  console.log(`  label: ${siteLabel ?? '(none)'}`)
  console.log(`  elevation: ${elevation ?? '(not present)'}`)

  console.log('')
  console.log(`--- console errors (${String(consoleErrors.length)}) ---`)
  for (const message of consoleErrors) console.log(`  ${message}`)

  console.log('')
  console.log(`--- failed requests (${String(failedRequests.length)}) ---`)
  for (const failure of failedRequests) console.log(`  ${failure}`)

  console.log('')
  console.log(`--- responses >= 400 (${String(badResponses.length)}) ---`)
  for (const { status, url: responseUrl } of badResponses) {
    console.log(`  ${String(status)} ${truncate(responseUrl, RESPONSE_URL_MAX)}`)
  }

  const hasServerError = badResponses.some(({ status }) => status >= 500)
  const hasConsoleErrors = consoleErrors.length > 0
  const failed =
    !siteResolved || !bakeLanded || !rankingLanded || hasServerError || hasConsoleErrors

  console.log('')
  if (failed) {
    const reasons = []
    if (!siteResolved) reasons.push("the site didn't resolve")
    if (siteResolved && !bakeLanded) reasons.push("the first bake didn't land")
    if (bakeLanded && !rankingLanded) reasons.push("the ranking didn't appear")
    if (hasServerError) reasons.push('a response came back 500 or above')
    if (hasConsoleErrors)
      reasons.push(`${String(consoleErrors.length)} console error(s) were logged`)
    console.error(`FAIL ${url}: ${reasons.join(', ')}`)
    process.exitCode = 1
  } else {
    console.log(
      `OK ${url}: the site resolved, the first bake landed, the ranking landed (layout search ${searchLanded ? 'landed' : "didn't land"})`,
    )
  }
} finally {
  await context.close()
  await browser.close()
}
