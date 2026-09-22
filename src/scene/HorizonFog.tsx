import { useMemo, type ReactElement } from 'react'
import { Color } from 'three'
import { useAppStore } from '../state/store'
import { sunAt } from '../state/sun'
import { horizonColour } from './lighting'

/** Where the fade starts and where the ground is gone, in metres from the camera */
export const FOG_NEAR_M = 120
export const FOG_FAR_M = 260

/**
 * The far ground fading into the sky, with no line where it ends.
 *
 * `Ground` is a 240 m plane and a camera pointed anywhere near the horizon saw its edge: a
 * straight seam between green and sky, which is the one thing in this scene that read as
 * unfinished. The fade begins at 120 m, well past the far corner of any plot this tool designs,
 * so nothing a grower is looking at is tinted by it and no colour the contrast audit measures
 * moves.
 *
 * It is decoration, and it says so: the light the simulation integrates comes from the raster
 * and the sky, neither of which is drawn through this. The sky dome and the light overlay are
 * shader materials and take no fog at all, so what fades is the ground, the beds, the panels
 * and the plants, and only the ones far enough away to be scenery.
 *
 * `attach="fog"`, which makes this a declaration. A write to `scene.fog` would instead mutate
 * something a hook handed back: the same rule `useGuidedTour` names
 * beside its own frame callback. It therefore has to be a direct child of the `<Canvas>`, since
 * that is the only place whose parent is the scene, which is why it is mounted in `SceneCanvas`
 * on its own, separate from `GardenScene` and the rest of the sky
 */
export const HorizonFog = (): ReactElement => {
  const location = useAppStore((s) => s.location)
  const timeUtcMillis = useAppStore((s) => s.timeUtcMillis)
  const colour = useMemo(() => {
    const [r, g, b] = horizonColour(sunAt(location, timeUtcMillis).elevationDeg)
    return new Color(r, g, b)
  }, [location, timeUtcMillis])

  return <fog attach="fog" args={[colour, FOG_NEAR_M, FOG_FAR_M]} />
}
