import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Vector3 } from 'three'
import { COMPASS_ELEMENT_ID, headingDeg } from '../state/compass'

/** Below this, a heading change is not worth a DOM write */
const MIN_DELTA_DEG = 0.25

/**
 * Turns the compass needle to face north, every frame the camera can have moved.
 *
 * The write goes straight to the element's own style, never through React state or the store:
 * an orbit drag is a stream of frames, and re-rendering the shell on each of them is the cost
 * `SceneTooltip` already turns down for a position that also moves every frame. This is the same
 * trade, here applied to a rotation.
 *
 * Read off the camera's up axis, because forward runs out:
 * looking straight down, forward has no component on the ground at all, and up still does.
 * OrbitControls holds world +Y as the camera's up throughout an orbit, so the up axis projected
 * onto the ground is exactly the bearing the screen's own "up" is pointing at, which is what the
 * needle has to show.
 *
 * `frameloop="demand"` on the canvas means this callback runs only on a frame the scene actually
 * draws, which is exactly when the camera can have moved
 */
export const CompassBridge = (): null => {
  const up = useRef(new Vector3())
  const element = useRef<HTMLElement | null>(null)
  const lastHeadingDeg = useRef<number | null>(null)

  useFrame(({ camera }) => {
    up.current.set(0, 1, 0).applyQuaternion(camera.quaternion)
    const heading = headingDeg(up.current.x, up.current.z)
    if (
      lastHeadingDeg.current !== null &&
      Math.abs(heading - lastHeadingDeg.current) < MIN_DELTA_DEG
    )
      return
    lastHeadingDeg.current = heading
    // no document in the scene tests, which render this outside a browser
    if (typeof document === 'undefined') return
    if (element.current === null) element.current = document.getElementById(COMPASS_ELEMENT_ID)
    if (element.current === null) return
    element.current.style.transform = `rotate(${String(-heading)}deg)`
    element.current.dataset.heading = String(Math.round(heading))
  })

  return null
}
