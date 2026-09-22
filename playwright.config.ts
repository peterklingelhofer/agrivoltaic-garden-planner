import { defineConfig, devices } from '@playwright/test'

/**
 * How the functional project asks for a GL context, which is platform-dependent and was not.
 *
 * `--use-angle=metal` names a backend that exists only on macOS, and CI's `e2e-functional` job runs
 * on `macos-latest` for it. On a Linux machine with no Metal and no GPU, Chromium falls back on its
 * own and the scene never settles: nearly every spec times out waiting on a predicate, a camera
 * move, or paint stability. The same specs pass on a laptop in seconds.
 *
 * So name the backend that is actually there. `swiftshader` is what a GitHub runner has, and
 * `--enable-unsafe-swiftshader` is what lets WebGL use it: without that flag current Chromium
 * refuses a software WebGL context outright.
 *
 * `AGV_GL_BACKEND` overrides both, so the CI path can be reproduced on a laptop
 * (`AGV_GL_BACKEND=swiftshader bun run test:e2e --project=functional`) without editing this file.
 */
const backend =
  process.env.AGV_GL_BACKEND ?? (process.platform === 'darwin' ? 'metal' : 'swiftshader')
const functionalGlArgs =
  backend === 'swiftshader'
    ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    : ['--use-gl=angle', `--use-angle=${backend}`]

export default defineConfig({
  testDir: 'e2e',
  // one more go on the runner only: its virtual GPU can hang the renderer mid-test (Metal
  // command-buffer errors, a context that takes the whole timeout to close), and a rerun in a
  // fresh browser passes the same test. A laptop gets no retry, so a real failure stays loud
  retries: process.env.CI ? 1 : 0,
  /*
    One on a laptop, because heat costs more there than wall clock does. Playwright's
    default is half the logical cores, eight on a 16-core machine, and eight headless Chromiums
    each drawing the scene on Metal and baking on the same GPU spin the fans up for the whole
    run. Measured machine-wide, 100 percent being all 16 cores: `interaction.spec.ts` sits at a
    median 19 percent of the machine at two workers and 20 at one, since a single spec file runs
    in one worker either way, and the whole functional project halves its concurrent browsers.
    Wall clock: 5.7 minutes at two, 3.5 at four, 2.4 at eight. The runner keeps the default,
    since nobody sits next to it
  */
  workers: process.env.CI ? undefined : 1,
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
  },
  use: {
    baseURL: 'http://localhost:4173',
  },
  webServer: {
    /*
      Built the way a deploy is built, which is WITHOUT the agent.

      The agent is off in production and off in `bun run dev`, so the 44 tests in `agent.spec.ts`
      and the agent halves of `a11y` and `contrast` skip against this build, and the e2e job in CI
      does not fetch the 58 MB of weights they need.

      Nothing is deleted. `VITE_AGENT=on bunx playwright test` builds it back in and un-skips
      every one of those tests, because the same variable reaches both this build and the specs
      through `AGENT_IN_BUILD` in `e2e/fixtures/app.ts`. Turn it back on when the feature is
      worth testing again, and restore the model-fetch steps in `.github/workflows/ci.yml`
    */
    command: 'vite build && vite preview --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'functional',
      testIgnore: /(?:visual|demo)\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        // Playwright's own default, stated here because it is load-bearing:
        // a headed run puts the scene on a real display and its compositing on the machine too
        headless: true,
        /*
          The suite asks for less movement, and the app answers by holding two loops still: the
          example's slow orbit, whose every frame is structural (cascades and occlusion both), and
          the 24 fps wind ticker, which is the only loop that runs with nobody touching anything.
          Both of them ran for the whole of every test that opened the app, which is 174 tests.

          The two specs that measure the motion itself, `example.spec.ts`'s guided camera move and
          `idle-cost.spec.ts`'s idle draw count, call `emulateMedia({ reducedMotion:
          'no-preference' })` on their own page and keep what they always measured. Nothing else in
          the project asserts on movement: the scroll and sweep animations this preference also
          settles are ones the specs simply wait out
        */
        contextOptions: { reducedMotion: 'reduce' },
        launchOptions: {
          // On macOS this is ANGLE's Metal backend. Measured over two
          // runs of all 114 tests each: the GPU process drops from 89 to 40 percent of a core at
          // the median and from 107 to 60 at p95, and the whole run from 205 to 128. It costs
          // wall clock, 161.5 s to 188.6 s, so this is a heat trade and not a speed one. Nothing
          // here compares pixels, so the backend is free to differ from the visual project's.
          // Off macOS it is SwiftShader, because Metal is not there; see `functionalGlArgs`
          args: functionalGlArgs,
        },
      },
    },
    {
      /**
       * Software rasterised on purpose: the baselines are pixel comparisons and a real GPU would
       * make them machine-dependent. It is also, measured, the entire reason this suite heats a
       * laptop. Two tests, 83 s, and SwiftShader sits at 938 percent of a core through all of it
       * against 89 for the other 114 tests put together.
       *
       * Two ways of making it cheaper were measured and BOTH fail. `--workers=1` does not help:
       * SwiftShader sizes its own thread pool to the machine, so one process already saturates it
       * and halving the workers only stretches the same heat over 106 s.
       *
       * `taskpolicy -c background`, which pins a process to the four efficiency cores, cuts the
       * heat exactly as hoped -- the GPU process drops from 938 to **240 percent** of a core at
       * the median -- and then **both tests fail**. The run takes 574 s, and at that
       * speed neither screenshot can hold two identical frames inside `toHaveScreenshot`'s 5 s
       * stability window. The failures are timeouts and not pixel mismatches, so the baselines are
       * fine; the scene simply cannot settle on E-cores. Raising the timeout to cover it would
       * mean gating the render on a run whose stability is marginal by construction, which is the
       * exact condition behind the `dli-legend-ramp` flake.
       *
       * So the lever that works is leaving this project out while iterating, and `bun run test:e2e`
       * names the functional project for exactly that reason: 174 of the 176 tests at a quarter of
       * the load. Measured machine-wide over a whole run, 100 percent being all 16 cores: this
       * project's two tests sit at a median 45 percent and a peak 62, where `interaction.spec.ts`
       * on Metal sits at 20. `bun run test:e2e:visual` is how the baselines get checked, and `bun
       * run test:e2e:all` runs both.
       *
       * `bun run test:e2e:cool` is the functional project under `taskpolicy -c utility`, which is
       * the macOS scheduler's own answer to "this is background work": measured on
       * `interaction.spec.ts`, the same median 11 percent of the machine with p95 down from 21 to
       * 16 and the peak from 25 to 20, all 11 tests passing in the same 46 s. It is the desk
       * default. `bun run test:e2e:cold` is the same project under `-c background`, the harder
       * demotion to the efficiency cores that broke the screenshots above. The functional project
       * takes it: all 174 tests pass in 25.7 minutes against 10.7, and the slowest test, the a11y
       * sweep of every editor step, takes 26.9 s against its 300 s timeout. The CPU seconds go
       * up, the renderer at a mean 0.57 of a core on `interaction.spec.ts` against 0.21 under
       * `utility`, because an efficiency core does a third or so of the work per second, and
       * those are the seconds a laptop spends without the fan.
       *
       * Where the time goes at one worker, per process on `interaction.spec.ts` under `utility`:
       * the renderer 0.21 of a core, the GPU process 0.09, the browser 0.05, the Playwright
       * runner 0.06, the preview server 0.03. A lighter runner has nothing to save (the same spec
       * under `bunx --bun` measured the identical 0.06), the build is 252 ms on rolldown, and
       * what remains is the app itself and one Metal bake per test
       */
      name: 'visual',
      testMatch: /visual\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        headless: true,
        launchOptions: {
          args: ['--use-gl=swiftshader'],
        },
      },
    },
    /**
     * The explainer recording, and only when it is asked for.
     *
     * Registered behind an env flag, because this project is not a test: it drives the app against
     * LIVE upstreams for twenty minutes and writes a video. `bun run test:e2e:all` runs every
     * registered project, so a demo project that merely ignored itself by name would still have to
     * be remembered by every future `--project` argument. Off by default is the only version of
     * this that stays off
     */
    ...(process.env.DEMO === '1'
      ? [
          {
            name: 'demo',
            testMatch: /demo\.spec\.ts/,
            // one browser at a time: two of these would fight over the GPU and the frame rate
            // of a screencast is exactly what that fight shows up in
            fullyParallel: false,
            retries: 0,
            outputDir: 'demo/raw',
            use: {
              ...devices['Desktop Chrome'],
              // the recording size. Playwright otherwise scales the screencast down to fit
              // 800x800, which is unwatchable for a UI with a sidebar in it
              viewport: { width: 1920, height: 1080 },
              deviceScaleFactor: 1,
              colorScheme: 'light' as const,
              headless: true,
              video: {
                mode: 'on' as const,
                size: { width: 1920, height: 1080 },
              },
              launchOptions: {
                // the same Metal backend the functional project uses, for the same reason, and
                // here it is also what makes the scene worth filming: SwiftShader would render
                // the garden correctly and far too slowly to screencast
                args: ['--use-gl=angle', '--use-angle=metal'],
              },
            },
          },
        ]
      : []),
  ],
})
