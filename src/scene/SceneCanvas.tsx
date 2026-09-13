/**
 * The 3D canvas, behind a lazy boundary, and that boundary is the point of the file.
 *
 * three.js, react-three-fiber and drei are the bulk of this app's JavaScript, and in the first
 * chunk the browser would have to download, parse and compile them before it could draw anything at
 * all: a visitor would wait on a 3D engine to read a sidebar. Nothing outside `src/scene/` imports
 * any of the three, so lifting the `<Canvas>` out of `App.tsx` moves the whole stack behind a
 * dynamic import, and the shell paints without it.
 *
 * A default export, because that is what `React.lazy` takes
 */
import { Canvas, useThree } from '@react-three/fiber'
import { Suspense, useEffect, type ReactElement } from 'react'
import { scenePlot, useAppStore } from '../state/store'
import { GardenScene } from './GardenScene'
import { HorizonFog } from './HorizonFog'
import { RENDERER_SETTINGS } from './lighting'
import { sceneLabel } from './scene-label'
import { useNudgeKeys } from './useGroundDrag'

/**
 * The `<canvas>` named for assistive tech, and kept current: r3f owns the element and spreads
 * no props onto it, so the attributes are written on the element itself whenever the garden
 * changes shape. A canvas with no role is an unlabelled graphic to a screen reader
 */
export const CanvasLabel = (): null => {
  const canvas = useThree((s) => s.gl.domElement)
  const label = useAppStore((s) => sceneLabel(scenePlot(s)))
  useEffect(() => {
    canvas.setAttribute('role', 'img')
    canvas.setAttribute('aria-label', label)
  }, [canvas, label])
  return null
}

/** Move mode's arrow keys, alive only while there is a scene to move things in */
const KeyboardMoves = (): null => {
  useNudgeKeys()
  return null
}

const SceneCanvas = (): ReactElement => (
  <Canvas
    // percentage-closer, not "soft": PCFSoftShadowMap ignores shadow.radius, and
    // the radius is how the penumbra is held to the size the sun's disc supports
    shadows="percentage"
    camera={{ position: [18, 14, 22], fov: 45, near: 0.1, far: 400 }}
    gl={RENDERER_SETTINGS}
    /**
     * A garden that is not moving is not redrawn, which is the whole of the
     * performance story on this surface.
     *
     * r3f defaults to `always`, which redraws the scene 60 times a second for as long as the tab is
     * open. Each of those frames costs six full-scene draws at the high tier: the occlusion pass
     * overrides every material and redraws the graph to get normals and depth, four shadow cascades
     * redraw every caster at 2048 square, and then the colour pass draws it all again. None of that
     * buys anything between two frames where nothing has changed, which for a design tool is nearly
     * all of them.
     *
     * Nothing about how it LOOKS changes: every quality setting is untouched and each
     * of those passes still runs at full cost on the frames that are actually drawn.
     * What changed is that a frame is drawn when something moved. See `useInvalidate`
     * in `scene/useInvalidate.ts` for everything that counts as something moving
     */
    frameloop="demand"
    /**
     * The pixel count, capped below the retina ceiling. r3f's own default is `[1, 2]`,
     * which a 2x display sits exactly on, and every per-frame cost above scales with
     * it: the occlusion pass sizes its buffers off the drawing buffer, so the pixels
     * are paid for once in the AO integral, once in its denoise, and once in the
     * colour pass. 1.5 is 44 percent fewer pixels than 2.0 and is a softening most
     * people cannot see on a laptop panel at arm's length
     */
    dpr={[1, 1.5]}
  >
    {/* a direct child of the canvas, because the scene is the only thing fog attaches to */}
    <HorizonFog />
    <CanvasLabel />
    <KeyboardMoves />
    <Suspense fallback={null}>
      <GardenScene />
    </Suspense>
  </Canvas>
)

export default SceneCanvas
