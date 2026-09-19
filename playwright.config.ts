import { defineConfig, devices } from '@playwright/test'

/**
 * How the functional project asks for a GL context, which is platform-dependent and was not.
 *
 * `--use-angle=metal` names a backend that exists only on macOS, and `e2e-functional` runs on
 * `ubuntu-latest`. On a runner with no Metal and no GPU, Chromium fell back on its own and the
 * scene never settled: run 33462892651 took **2h42m** and failed 25 tests across 13 spec files,
 * nearly all of them timeouts waiting on a predicate, a camera move, or paint stability rather
 * than on a wrong value. The same specs pass on a laptop in seconds.
 *
 * So name the backend that is actually there. `swiftshader` is what a GitHub runner has, and
 * `--enable-unsafe-swiftshader` is what lets WebGL use it: without that flag current Chromium
 * refuses a software WebGL context rather than being slow about it.
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
    Two on a laptop. Playwright's default is half the logical cores, eight on a 16-core
    machine, and eight headless Chromiums each drawing the scene on Metal and baking on the same
    GPU spin the fans up for the whole run. Two costs wall clock, 5.7 minutes for the functional
    project against 3.5 at four and 2.4 at eight, which is the better trade at a desk. The
    runner keeps the default: nobody sits next to it
  */
  workers: process.env.CI ? undefined : 2,
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
  },
  use: {
    baseURL: 'http://localhost:4173',
  },
  webServer: {
    /*
      Built the way a deploy is built, which since 2026-09-07 means WITHOUT the agent.

      It used to say `VITE_AGENT=on` here, so that every spec ran against a build carrying the
      panel and could catch it disturbing something. That was the right trade while the feature
      was on its way in. It is off in production, off in `bun run dev`, and the author's judgement
      is that it is not yet useful enough to be worth the suite carrying it: the 44 tests in
      `agent.spec.ts` plus the agent halves of `a11y` and `contrast` were pinning a surface
      nobody is shipping, and the 58 MB of weights they need were being fetched in CI for it.

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
        // Playwright's own default, stated here because it is load-bearing rather than incidental:
        // a headed run puts the scene on a real display and its compositing on the machine too
        headless: true,
        launchOptions: {
          // On macOS this is ANGLE's Metal backend rather than its GL one. Measured over two
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
       * and halving the workers only stretches the same heat over 106 s instead of 83.
       *
       * `taskpolicy -c background`, which pins a process to the four efficiency cores, cuts the
       * heat exactly as hoped -- the GPU process drops from 938 to **240 percent** of a core at
       * the median -- and then **both tests fail**. The run takes 574 s instead of 83, and at that
       * speed neither screenshot can hold two identical frames inside `toHaveScreenshot`'s 5 s
       * stability window. The failures are timeouts and not pixel mismatches, so the baselines are
       * fine; the scene simply cannot settle on E-cores. Raising the timeout to cover it would
       * mean gating the render on a run whose stability is marginal by construction, which is the
       * exact condition behind the `dli-legend-ramp` flake.
       *
       * So the lever that works is not running this project while iterating:
       * `--project=functional` is 114 of the 117 tests at a tenth of the load
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
     * Registered behind an env flag rather than filtered out of the default run, because this
     * project is not a test: it drives the app against LIVE upstreams for twenty minutes and
     * writes a video. `bun run test:e2e` runs every registered project, so a demo project that
     * merely ignored itself by name would still have to be remembered by every future
     * `--project` argument. Off by default is the only version of this that stays off
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
