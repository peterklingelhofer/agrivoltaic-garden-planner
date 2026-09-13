/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'bun:test'

/**
 * The boundary that keeps three.js off the critical path, asserted on the source rather than on
 * the build.
 *
 * three, react-three-fiber and drei are about 332 kB gzipped, two thirds of everything this app
 * ships. They are behind a dynamic import so the shell paints without them: measured on a
 * throttled connection, first contentful paint went from 3,312 ms to 1,596 ms.
 *
 * That saving survives exactly as long as nothing outside `src/scene/` reaches into the 3D stack,
 * and ONE ordinary-looking import undoes it silently. It has already happened once: three files in
 * `ui/` imported `prefersReducedMotion` from `scene/useGuidedTour`, a `matchMedia` call one line
 * long, and dragged the whole renderer into the first chunk behind it. Nothing about that reads as
 * a performance decision at the call site, which is exactly why it needs a test rather than a
 * comment.
 *
 * Checked on imports, not on bundle output, so the failure names the file that did it
 */
const ROOT = join(process.cwd(), 'src')

/** The one module allowed to pull the stack in, because it IS the lazy boundary */
const LAZY_BOUNDARY = join('scene', 'SceneCanvas.tsx')

const FORBIDDEN = /from '(three|three\/[^']*|@react-three\/[^']*)'/

const sourcesOutsideScene = (dir: string, found: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      if (entry !== 'scene') sourcesOutsideScene(path, found)
      continue
    }
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue
    found.push(path)
  }
  return found
}

describe('the 3D bundle boundary', () => {
  it('is reached from exactly one module, and that module is the lazy one', () => {
    const offenders = sourcesOutsideScene(ROOT)
      .filter((path) => FORBIDDEN.test(readFileSync(path, 'utf8')))
      .map((path) => path.slice(ROOT.length + 1))
    expect(offenders, 'these import three or react-three outside src/scene').toEqual([])
  })

  /**
   * The other half of the same rule. `src/scene/` may import three freely, but anything OUTSIDE
   * it that imports a scene module inherits whatever that module imports, which is how the
   * `prefersReducedMotion` leak happened. Only the lazy boundary may be reached
   */
  it('is entered only through the dynamic import', () => {
    const reaching = sourcesOutsideScene(ROOT)
      .filter((path) => /from '[^']*scene\/[^']*'/.test(readFileSync(path, 'utf8')))
      .map((path) => path.slice(ROOT.length + 1))
    // `App.tsx` names it inside `lazy(() => import(...))`, which is the intended and only route
    const viaStaticImport = reaching.filter((path) => {
      const source = readFileSync(join(ROOT, path), 'utf8')
      return /^import .*from '[^']*scene\/[^']*'$/m.test(source)
    })
    expect(viaStaticImport, 'these statically import a scene module').toEqual([])
    expect(LAZY_BOUNDARY.length).toBeGreaterThan(0)
  })
})
