/**
 * Why a frame was asked for, which decides how much of it has to be drawn.
 *
 * Under `frameloop="demand"` a frame happens because something called `invalidate()`, and the
 * two reasons that happen are not equally expensive to answer:
 *
 * - **Structural.** A store write raised the flag, the camera moved, or what the scene holds for
 *   shadows changed. The shadow cascades and the sky-occlusion estimate are both wrong until
 *   they are redrawn, because both are functions of where things are and, for the occlusion, of
 *   where the camera is looking from.
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
import type { DirectionalLight, InstancedMesh, Mesh, Object3D } from 'three'

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

/**
 * Scratch for turning a float into the 32 bits `mix` folds in, reused across every call so
 * hashing a scene allocates nothing beyond the walk itself
 */
const bits = new Float32Array(1)
const bitsAsInt = new Int32Array(bits.buffer)

/** One FNV-1a step */
const mix = (hash: number, value: number): number => {
  bits[0] = value
  return Math.imul(hash ^ bitsAsInt[0]!, 16777619) | 0
}

/**
 * A number that changes exactly when something a shadow depends on does: a caster or receiver
 * added, moved, resized or hidden, or a shadow-casting light's target moved.
 *
 * The flag above cannot know whether the commit it was raised for has landed, because the store
 * write and the scene mutation travel on separate schedules. The camera is asked, every frame,
 * for the same reason: a poll cannot fall out of step with the frames the way a flag can. This
 * asks the scene the same question, so a mesh that lands between the flag being raised and the
 * frame that consumes it still gets counted on the frame after
 */
export const shadowContentOf = (scene: Object3D): number => {
  let hash = 2166136261 // the FNV offset basis
  scene.traverse((object) => {
    if (!(object.castShadow || object.receiveShadow)) return
    hash = mix(hash, object.id)
    hash = mix(hash, object.visible ? 1 : 0)
    for (const element of object.matrixWorld.elements) hash = mix(hash, element)
    const mesh = object as Mesh
    if (mesh.isMesh) hash = mix(hash, mesh.geometry.id)
    const instances = object as InstancedMesh
    if (instances.isInstancedMesh) {
      hash = mix(hash, instances.count)
      hash = mix(hash, instances.instanceMatrix.version)
    }
    const light = object as DirectionalLight
    if (light.isDirectionalLight) {
      hash = mix(hash, light.target.position.x)
      hash = mix(hash, light.target.position.y)
      hash = mix(hash, light.target.position.z)
    }
  })
  return hash
}
