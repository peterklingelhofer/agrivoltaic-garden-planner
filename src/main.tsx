import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ensurePhysicsCore } from './sim/rust-core-load'
import { useAppStore } from './state/store'
import { ErrorBoundary } from './ui/ErrorBoundary'

/*
  Awaited, because nothing can compute physics while the fetch is in flight, so a frame rendered
  before this resolves is a frame whose scene asks `spaPosition` where the sun is and gets a
  refusal. The cost is one fetch of about 30 kB compressed, in parallel with the JavaScript that is
  already loading.

  The worker installs its own, because a Worker has its own module graph and cannot be handed a
  `WebAssembly.Instance` through `postMessage`. See `src/sim/core.ts`.
*/
// the store, for a probe script or a devtools console on a local build: the e2e suite and the
// persona driver can only read the DOM, and a question like "how long are the previewed rows"
// has no element to ask
if (import.meta.env.DEV || location.hostname === 'localhost') {
  Object.assign(globalThis, { __agvStore: useAppStore })
}
const host = document.getElementById('root')
if (host) {
  void ensurePhysicsCore(import.meta.env).then(() => {
    // the boundaries inside `App` cover the canvas and each panel; this one covers the toolbar, the
    // plan strip, the print sheet and the app's own hooks, which would otherwise fail to a blank
    // page
    createRoot(host).render(
      <StrictMode>
        <ErrorBoundary label="Agrivoltaic garden planner" testId="panel-app-failed">
          <App />
        </ErrorBoundary>
      </StrictMode>,
    )
  })
}
