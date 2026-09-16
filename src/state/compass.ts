/** The DOM id the compass needle is written to; `Compass.tsx` finds it, `SceneCompass.tsx` owns it */
export const COMPASS_ELEMENT_ID = 'scene-compass'

/**
 * The bearing, in degrees in [0, 360), of the direction on the ground that is "up" on screen.
 *
 * `upX`/`upZ` are the camera's own up axis, expressed in the scene's world x and z (its y, the
 * height off the ground, says nothing about which way the screen's "up" points and is left out).
 * North is -z and east is +x, so `atan2(upX, -upZ)` is 0 when up is north and turns clockwise
 * with compass bearings the way a map does
 */
export const headingDeg = (upX: number, upZ: number): number => {
  if (upX === 0 && upZ === 0) return 0
  const deg = (Math.atan2(upX, -upZ) * 180) / Math.PI
  return deg < 0 ? deg + 360 : deg
}
