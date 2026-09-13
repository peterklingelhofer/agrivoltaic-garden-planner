/**
 * Why a frame was asked for, which decides how much of it has to be drawn.
 *
 * Under `frameloop="demand"` a frame happens because something called `invalidate()`, and the
 * two reasons that happen are not equally expensive to answer:
 *
 * - **Structural.** The camera moved, the sun moved, or the design changed. The shadow cascades
 *   and the sky-occlusion estimate are both wrong until they are redrawn, because both are
 *   functions of where things are and, for the occlusion, of where the camera is looking from.
 * - **Cosmetic.** Foliage swayed. Nothing else moved, nobody's shadow meaningfully changed at
 *   the centimetre scale a leaf bends through, and the occlusion of a bed by a panel is exactly
 *   what it was a frame ago. Redrawing four 2048 square cascades and re-integrating a
 *   sixteen-sample occlusion pass to move a leaf is most of the frame's cost spent on none of
 *   its content.
 *
 * A module-level flag rather than store state on purpose: this is consumed inside the render
 * loop, once per frame, and putting it in the store would make every wind tick a React render
 * of everything subscribed to the store. It is written by whatever asked for the frame and read
 * exactly once by `RenderPipeline`, which clears it.
 *
 * It starts true so that the first frame after a mount draws everything
 */
let structural = true

/** The camera, the sun or the design moved: the next frame owes shadows and occlusion */
export const requestStructuralRedraw = (): void => {
  structural = true
}

/** Read and clear. Called once per frame by `RenderPipeline` and nowhere else */
export const consumeStructuralRedraw = (): boolean => {
  const was = structural
  structural = false
  return was
}
