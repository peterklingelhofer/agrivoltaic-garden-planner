import { expect, type Locator, type Page, type Route } from '@playwright/test'
import {
  dailyNormalsBody,
  elevationBody,
  geocodeBody,
  hourlyArchiveBody,
  soilBody,
} from './weather.ts'

export const LAT = 42.37
export const LON = -72.52
export const LABEL = 'Amherst, Massachusetts'
export const SITE_TIMEOUT_MS = 120_000

/**
 * Whether the build under test carries the conversational agent.
 *
 * The webServer builds without it (see `playwright.config.ts`), so the specs that drive it skip
 * rather than fail. One variable decides both halves: `VITE_AGENT=on bunx playwright test` puts
 * the panel in the build AND un-skips the tests, because Playwright's webServer inherits this
 * process's environment and the specs read the same variable
 */
export const AGENT_IN_BUILD = process.env.VITE_AGENT === 'on'
export const BAKE_TIMEOUT_MS = 180_000

export interface Upstreams {
  readonly daily?: unknown
  readonly hourly?: unknown
  readonly soil?: unknown
  /** the EIA retail-sales answer, in the shape `fetchRetailPrice` decodes */
  readonly price?: unknown
  readonly elevation?: unknown
  readonly geocode?: unknown
  /**
   * The pre-baked example garden is served only where it's the subject. Every other spec here
   * asserts something about a design the test itself builds, and an example loading underneath
   * would change the plot, the DOM and every visual baseline. It's refused rather than cleared
   * after the fact, because clearing it races the fetch, and refusing it exercises the documented
   * fallback: a build with no `public/data` opens on the starting plot. See e2e/example.spec.ts.
   *
   * The glob has to cover every band: the assets are `example-garden-<band>.{json,raster}`, and a
   * pattern that missed them would let the example load underneath every spec in this suite without
   * anything failing loudly
   */
  readonly exampleGarden?: boolean
  /**
   * Puts the weather upstreams out of reach, so the site can't resolve at all.
   *
   * Needed because "no site" stopped being a state a visitor arrives at by doing nothing: the app
   * now looks up the place it is already naming, on mount, by every route into the editor. The
   * refusals that depend on having no site are still worth holding, since inventing weather is
   * the failure they exist to prevent, so the specs that hold them ask for this instead of
   * relying on the app having failed to fetch anything yet
   */
  readonly siteUnreachable?: boolean
}

const json = (route: Route, body: unknown): Promise<void> =>
  route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })

/**
 * Every upstream is stubbed and anything else off-origin is aborted, so a test that starts
 * reaching Nominatim or Open-Meteo for real fails here instead of flaking in CI
 */
/** One annual residential row, the way EIA's API v2 answers `electricity/retail-sales` */
const retailPriceBody = (): unknown => ({
  response: {
    total: '1',
    data: [
      {
        period: '2025',
        stateid: 'MA',
        sectorid: 'RES',
        price: '30.48',
        'price-units': 'cents per kilowatthour',
      },
    ],
  },
})

export const stubUpstreams = async (page: Page, over: Upstreams = {}): Promise<void> => {
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/i, (route) => route.abort())
  // NASA POWER is the daily normals' fallback, reached from the browser when Open-Meteo has no
  // answer: answered with an empty body the reader refuses, rather than aborted or given an
  // error status would make Chromium prints a console error, and the specs assert none.
  // A spec that serves bad normals on purpose then sees the Open-Meteo refusal it asked for
  await page.route(/power\.larc\.nasa\.gov/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  )
  /**
   * `fetchTmy` falls back from Open-Meteo through PVGIS, NASA POWER and NSRDB in turn when the
   * preferred source throws, and PVGIS and NSRDB are same-origin (`WORKER_PROXY_BASE`), so the
   * blanket external-abort above never sees them. Unstubbed, they reach Vite's own dev proxy,
   * which forwards them to the Worker on 127.0.0.1:8787. The Worker isn't running here, and a
   * refused connection there is not a fast failure from the browser's side, so a test that makes
   * Open-Meteo insufficient without this hangs on a fallback chain aimed at a port nothing is
   * listening on rather than reaching the error state it is actually after
   */
  await page.route('**/api/proxy/**', (route) => route.abort())
  /**
   * The weather and the elevation are SAME-ORIGIN now.
   *
   * They used to be fetched straight from `open-meteo.com` and `open-elevation.com`, and the two
   * host routes below were the whole stub. Then both moved behind `/api/proxy/` so the edge cache
   * could hold them, which put them squarely inside the blanket abort above: the host patterns
   * stopped matching anything, every weather request was aborted, and the failure showed up as
   * four `net::ERR_FAILED` console lines and a site that never resolved. Registered AFTER the
   * abort on purpose, because Playwright gives the most recently registered matching route the
   * request.
   *
   * `pvgis` and `nsrdb` are deliberately still aborted by the rule above: they're the fallback
   * chain, and the comment on it explains why letting them reach a dev proxy aimed at a Worker
   * that is not running turns a fast failure into a hang
   */
  const weather = (route: Route): Promise<void> =>
    over.siteUnreachable === true
      ? route.abort()
      : json(
          route,
          route.request().url().includes('daily=')
            ? (over.daily ?? dailyNormalsBody(LAT, LON))
            : (over.hourly ?? hourlyArchiveBody(LAT, LON)),
        )
  const elevation = (route: Route): Promise<void> =>
    json(route, over.elevation ?? elevationBody(52))

  await page.route(/open-meteo\.com/, weather)
  await page.route('**/api/proxy/open-meteo/**', weather)
  await page.route(/open-elevation\.com/, elevation)
  await page.route('**/api/proxy/open-elevation/**', elevation)
  await page.route(/isric\.org/, (route) => json(route, over.soil ?? soilBody()))
  /*
   * The electricity price, same-origin behind the proxy like the weather, and stubbed for the
   * same reason: aborted, it showed up as `net::ERR_FAILED` console lines on every US site the
   * moment the simulation started asking for it. Stubbed with a Massachusetts price, the
   * "What it costs" block renders in full here, which is the only place it does without a key
   */
  await page.route('**/api/proxy/eia/**', (route) => json(route, over.price ?? retailPriceBody()))
  /*
   * The place-name lookup, on both legs. It went behind `/api/proxy` for the User-Agent the OSM
   * policy asks for and a browser may not set, which puts it inside the blanket abort above: the
   * proxy patterns are registered here, after it, because Playwright gives the request to the
   * most recently registered matching route. The host patterns stay because `bun run dev` forwards
   * these two straight to their upstreams and a spec run against that build would otherwise get
   * an unstubbed geocoder
   */
  const geocoder = (route: Route): Promise<void> =>
    json(route, over.geocode ?? geocodeBody(LABEL, LAT, LON))

  await page.route(/nominatim\.openstreetmap\.org|photon\.komoot\.io/, geocoder)
  await page.route('**/api/proxy/nominatim/**', geocoder)
  await page.route('**/api/proxy/photon/**', geocoder)
  // the bundled rasters aren't in the repo. Serving an empty collection keeps the loader on
  // its documented Open-Meteo derivation without a 404 in the console
  await page.route('**/data/*.geojson', (route) =>
    json(route, { type: 'FeatureCollection', features: [] }),
  )
  // an unreadable body rather than a 404: both end in the same refusal, and a 404 puts a console
  // error on every page in this suite, which is a thing several specs assert the absence of
  if (over.exampleGarden !== true) {
    await page.route('**/data/example-garden-*', (route) => json(route, {}))
  }
}

export const watchConsole = (page: Page): readonly string[] => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

export interface App {
  readonly page: Page
  readonly errors: readonly string[]
}

/**
 * A cold visit: no saved design, so the column opens on the place step, and the app looks up the
 * place it is already naming by itself. The questions are the first four steps of the one column,
 * and nothing flies the camera while they're open, so the ground under a fixed canvas fraction is
 * a fact about the design alone
 */
export const openApp = async (page: Page, over: Upstreams = {}): Promise<App> => {
  await stubUpstreams(page, over)
  const errors = watchConsole(page)
  await page.goto('/')
  await expect(page.getByTestId('app-root')).toBeVisible()
  await waitForCanvas(page)
  return { page, errors }
}

/**
 * r3f measures its host before it takes the canvas off its 300x150 intrinsic size.
 * The visual project rasterizes in software, where first paint takes several seconds,
 * so expect.poll's 5 s default expires while the canvas is still intrinsic
 */
export const CANVAS_TIMEOUT_MS = 45_000

/**
 * The width the canvas has before r3f has measured its host, and the only thing this wait is
 * actually about. A literal threshold such as 400 means the same thing on a 1280px viewport and
 * excludes every phone: at 375 or 390 wide the canvas is correct, fully measured, and narrower than
 * 400. Naming the intrinsic width says what is being ruled out
 */
const INTRINSIC_CANVAS_WIDTH = 300

export const waitForCanvas = async (page: Page): Promise<void> => {
  await expect(canvas(page)).toBeVisible({ timeout: CANVAS_TIMEOUT_MS })
  await expect
    .poll(async () => (await canvas(page).boundingBox())?.width ?? 0, {
      timeout: CANVAS_TIMEOUT_MS,
    })
    .toBeGreaterThan(INTRINSIC_CANVAS_WIDTH)
}

/**
 * The ten steps of the one column, in the order the garden depends on them. The first four are the
 * questions, and `plants` carries the combinations for the selected bed itself
 */
export type Step =
  | 'place'
  | 'ground'
  | 'wants'
  | 'panels'
  | 'light'
  | 'plants'
  | 'calendar'
  | 'seasons'
  | 'check'
  | 'sources'

/**
 * Opens one step of the sidebar. Each panel sits in one of the ten steps, so every caller names the
 * step it actually needs
 */
export const step = async (page: Page, id: Step): Promise<void> => {
  await page.getByTestId(`action-step-${id}`).click()
  await expect(page.getByTestId(`panel-step-${id}`)).not.toHaveAttribute('hidden', '')
}

/**
 * The Next at the foot of the open step, which is how the column is walked forward: it names
 * the step it opens, so the caller says which one it expects to land on
 */
export const nextStep = async (page: Page, id: Step): Promise<void> => {
  await page.getByTestId('action-step-next').click()
  await expect(page.getByTestId(`panel-step-${id}`)).not.toHaveAttribute('hidden', '')
}

/**
 * Opens one `details` fold by its summary, when it's not already open. Half of what the specs
 * reach for sits behind one now: the bed tools on the ground step, the coordinate fields on the
 * place step, the picker and the ranking on the plants step
 */
export const openFold = async (page: Page, testId: string): Promise<void> => {
  const fold = page.getByTestId(testId)
  if ((await fold.getAttribute('open')) === null) await fold.locator('summary').first().click()
  await expect(fold).toHaveAttribute('open', '')
}

export const resolveSite = async (page: Page, lat = LAT, lon = LON): Promise<void> => {
  await step(page, 'place')
  // the coordinate fields sit behind the site panel's "More about this place" fold, with the rest
  // of what a newcomer never needs; a spec typing coordinates opens it the way a person does
  await openFold(page, 'details-site-more')
  await page.getByTestId('control-site-latitude').fill(String(lat))
  await page.getByTestId('control-site-longitude').fill(String(lon))
  await page.getByTestId('action-site-resolve').click()
  await expect(page.getByTestId('status-site')).toBeHidden({ timeout: SITE_TIMEOUT_MS })
}

export const canvas = (page: Page): Locator => page.getByTestId('canvas-root').locator('canvas')

/** Ground-plane clicks as fractions of the canvas box, then close the ring */
export const drawPolygon = async (
  page: Page,
  mode: 'plot' | 'bed',
  points: readonly (readonly [number, number])[],
): Promise<void> => {
  // the draw actions live on the Ground step, behind its "Change the beds" fold
  await step(page, 'ground')
  await openFold(page, 'details-ground-beds')
  await page.getByTestId(mode === 'plot' ? 'action-bed-draw-plot' : 'action-bed-draw').click()
  const box = await canvas(page).boundingBox()
  expect(box).not.toBeNull()
  const at = (point: readonly [number, number]): readonly [number, number] => [
    box!.x + box!.width * point[0],
    box!.y + box!.height * point[1],
  ]
  const undo = page.getByTestId('action-bed-undo-vertex')
  const [first, ...rest] = points
  expect(first).toBeDefined()
  /**
   * The scene is behind a Suspense boundary, so r3f can have sized the canvas before the
   * ground it raycasts against exists and the first click lands on nothing. A click that
   * misses leaves no vertex and leaves Undo disabled, which is exactly the retry condition
   */
  await expect(async () => {
    await page.mouse.click(...(at(first!) as [number, number]))
    await expect(undo).toBeEnabled({ timeout: 2_000 })
  }).toPass({ timeout: 60_000, intervals: [400] })
  for (const point of rest) await page.mouse.click(...(at(point) as [number, number]))
  const close = page.getByTestId('action-bed-close-polygon')
  await expect(close).toBeEnabled()
  await close.click()
}

/**
 * The light, computed and ready, for the garden as it stands.
 *
 * Nothing is pressed on the way to it any more. Since 2026-09-10 `useAutoLight` runs the full
 * check by itself, the first time once the place has resolved and there's a bed, and again after
 * every settled change to the geometry, so this waits rather than asks: for `ready` AND for the
 * absence of `data-sim-stale`, together in one reading. Read apart they lie, because a bake that
 * is redoing a stale field passes through `loading`, where the stale mark is off by definition.
 * The one state nothing restarts by itself is a failed run, and that is the one case the press
 * on the light step is still for.
 *
 * The timeouts are sized against the full bake, the one quality the app bakes at
 */
export const runLightCheck = async (page: Page): Promise<void> => {
  await step(page, 'light')
  const status = page.getByTestId('status-simulation')
  const reading = (): Promise<string> =>
    status.evaluate(
      (el) => `${el.getAttribute('data-sim-state') ?? ''}:${el.hasAttribute('data-sim-stale')}`,
    )
  await expect.poll(reading, { timeout: BAKE_TIMEOUT_MS }).toMatch(/^(ready:false|error:false)$/)
  if ((await reading()) === 'error:false') {
    await page.getByTestId('action-sim-final').click()
    await expect.poll(reading, { timeout: BAKE_TIMEOUT_MS }).toBe('ready:false')
  }
}

/**
 * A production build exposes no handle on the r3f store, so scene assertions go through what
 * the user can see: the drawing buffer r3f allocated and the pixels it puts there
 */
export const drawingBuffer = (page: Page): Promise<readonly [number, number]> =>
  canvas(page).evaluate((node) => [
    (node as HTMLCanvasElement).width,
    (node as HTMLCanvasElement).height,
  ])

export const canvasPixels = async (page: Page): Promise<string> =>
  (await canvas(page).screenshot()).toString('base64')

/**
 * A bed drawn by canvas fractions lands wherever the camera puts that ground, so this ring is a
 * claim about the framing as much as about the bed. Re-cut on 2026-09-11 evening, when the plot
 * started being framed by projecting its corners: the old ring (x 0.42 to 0.58, y 0.62 to 0.74)
 * had come to land under the front row at 34 percent season shade, which is above the design
 * ceiling for blueberry and took the polyculture specs down with it. This one lands east of the
 * row ends at the Desktop Chrome viewport, x 6.7 to 14.3 and y -1.5 to 7.5 in plot meters, 35.6
 * square meters in 7.5 percent season shade, measured through the store handle on a local build
 */
export const BED_RING: readonly (readonly [number, number])[] = [
  [0.64, 0.55],
  [0.76, 0.55],
  [0.76, 0.66],
  [0.64, 0.66],
]

export const PLOT_RING: readonly (readonly [number, number])[] = [
  [0.2, 0.55],
  [0.8, 0.55],
  [0.8, 0.9],
  [0.2, 0.9],
]

export const AUTORUN_TIMEOUT_MS = 120_000

/**
 * The ranking for the garden as it stands, landed. `status-autorun` sits inside the plants
 * step's "Every crop ranked, and why" fold, which is closed: an attribute is read through a
 * closed fold, so nothing is opened here
 */
export const waitForRanking = async (page: Page): Promise<void> => {
  await step(page, 'plants')
  await expect(page.getByTestId('status-autorun')).toHaveAttribute('data-state', 'ready', {
    timeout: AUTORUN_TIMEOUT_MS,
  })
}

/**
 * Site, bed, the automatic light and the automatic ranking that follows: the state most journeys
 * start from. The bed is drawn first and the light waited for second, because drawing it makes
 * whatever light the place lookup already started stale, and the ranking holds until the light
 * on screen is the light for this bed
 */
export const rankedBed = async (page: Page, over: Upstreams = {}): Promise<App> => {
  const app = await openApp(page, over)
  await resolveSite(page)
  await drawPolygon(page, 'bed', BED_RING)
  await runLightCheck(page)
  await waitForRanking(page)
  return app
}

export interface SowDate {
  /** bed and crop together, because every bed dates the whole ranked head */
  readonly key: string
  readonly method: string
  readonly basis: string
  readonly day: string
}

/**
 * Every rendered planting with the date, the method and the rule the panel says
 * produced it. Read per row so the marker and the basis line at the same index
 * belong to the same planting, and keyed by bed so two beds don't collide
 */
export const calendarSowDates = (page: Page): Promise<readonly SowDate[]> =>
  page.evaluate(() => {
    const out: { key: string; method: string; basis: string; day: string }[] = []
    for (const bed of document.querySelectorAll('[data-testid^="item-calendar-bed-"]')) {
      const bedId = (bed.getAttribute('data-testid') ?? '').replace('item-calendar-bed-', '')
      for (const row of bed.querySelectorAll('[data-testid^="item-calendar-crop-"]')) {
        const cropId = (row.getAttribute('data-testid') ?? '').replace('item-calendar-crop-', '')
        const markers = [...row.querySelectorAll('[data-testid^="marker-calendar-recommended-"]')]
        const plantings = [...row.querySelectorAll('[data-testid^="item-calendar-planting-"]')]
        for (const [index, planting] of plantings.entries()) {
          const basis = planting.querySelector('[data-testid^="readout-calendar-basis-"]')
          out.push({
            key: `${bedId}/${cropId}/${String(index)}`,
            method: planting.getAttribute('data-method') ?? '',
            basis: basis?.getAttribute('data-basis') ?? '',
            day: markers[index]?.getAttribute('data-day') ?? '',
          })
        }
      }
    }
    return out
  })

export const dayByKey = (dates: readonly SowDate[]): ReadonlyMap<string, string> =>
  new Map(dates.map((date) => [date.key, date.day]))
