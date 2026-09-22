/**
 * A DOM for every test file, registered by `bunfig.toml` before anything else is evaluated.
 *
 * This replaces vitest's per-file `// @vitest-environment jsdom` pragma, and it is global where
 * that was per-file. The reason is not laziness: `react-dom` decides ONCE, at module evaluation,
 * whether it is in a browser, and caches the answer in `canUseDOM` and `isInputEventSupported`
 * (see `react-dom/cjs/react-dom-client.development.js`). Load it without a DOM and its change
 * event falls back to a polyfill path that a dispatched `input` event never reaches, so every
 * controlled input in the suite silently stops responding to typing while still rendering fine.
 * A first-line `import` in the test file is not early enough to prevent that. A preload is.
 *
 * The cost is that the ~126 files that need no DOM get one anyway. Four modules branch on `typeof
 * navigator/document === 'undefined'` (`src/scene/quality.ts`, `src/agent/connection.ts`,
 * `src/scene/useInvalidate.ts`, `src/ui/SitePanel.tsx`), so a test that wants the bare-node branch
 * has to delete the global itself and say so. That is more honest than a file-header comment nobody
 * reads: it puts the requirement in the test that has it.
 */
import { JSDOM } from 'jsdom'

const { window } = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
})

/*
  Bun's own implementations win for everything that is not DOM. Timers first: bun fakes timers
  inside the runtime. The global is never swapped, so a jsdom timer copied over the top is
  one `useFakeTimers` cannot reach and `advanceTimersByTime` never fires. The rest are runtime
  primitives where bun's are the closer match to what a browser hands the app, and several tests
  stub `fetch` expecting bun's shape
*/
const BUN_OWNS = new Set([
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'setImmediate',
  'clearImmediate',
  'queueMicrotask',
  'fetch',
  'console',
  'performance',
  'crypto',
  'structuredClone',
  'TextEncoder',
  'TextDecoder',
  'URL',
  'URLSearchParams',
  'Blob',
  'File',
  'FormData',
  'Headers',
  'Request',
  'Response',
  'AbortController',
  'AbortSignal',
  'WebSocket',
  'Worker',
])

/*
  Bun defines `navigator` and `localStorage` itself, and node 22 defines `navigator`. A DOM test
  wants jsdom's, so these are copied even though the name is already taken
*/
const DOM_WINS = new Set([
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'location',
  'history',
  'getComputedStyle',
  'matchMedia',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  /*
    Bun defines `Event`, `EventTarget` and `CustomEvent`, and jsdom checks the brand of what it is
    handed: `element.dispatchEvent(new Event('x'))` built from BUN's constructor fails inside jsdom
    with "parameter 1 is not of type 'Event'". A DOM test constructs DOM events, so the DOM's
    constructors have to be the ones in scope
  */
  'Event',
  'EventTarget',
  'CustomEvent',
  'MessageChannel',
  'MessagePort',
])

/*
  `globalThis` is bun's global object, not the jsdom window, and the two are separate event
  targets. So `globalThis.dispatchEvent(new Event('pointerdown'))` reached nothing a component
  listening on `window` could hear, and threw on the way, because the Event came from jsdom and
  the target did not. Under vitest's jsdom environment the two were the same object and the
  question never came up.

  These three live on EventTarget.prototype. They are never on the window itself, so the copy below
  would not pick them up in any case
*/
for (const name of ['addEventListener', 'removeEventListener', 'dispatchEvent'] as const) {
  Object.defineProperty(globalThis, name, {
    value: window[name].bind(window),
    writable: true,
    configurable: true,
  })
}

for (const key of Object.getOwnPropertyNames(window)) {
  if (BUN_OWNS.has(key)) continue
  if (key in globalThis && !DOM_WINS.has(key)) continue
  const descriptor = Object.getOwnPropertyDescriptor(window, key)
  if (descriptor === undefined) continue
  try {
    Object.defineProperty(globalThis, key, descriptor)
  } catch {
    /* a handful of globals are non-configurable in bun; the DOM does not need to own those */
  }
}
