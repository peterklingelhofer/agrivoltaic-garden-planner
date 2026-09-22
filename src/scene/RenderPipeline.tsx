/**
 * The frame, in the order the picture is assembled.
 *
 * r3f renders once per frame for you until something subscribes at a non-zero priority. From
 * then on the subscriber owns the frame. This one does, because the sky-occlusion estimate has
 * to be finished before the lit pass that samples it, and because the overlay is composited
 * after that pass, on its own.
 *
 * Nothing here is a screen-space filter over the finished image. The occlusion reaches the
 * scene as a term in the lighting equation of every lit material (`ambientOcclusion.ts`), which
 * is what keeps it off the direct beam and off the overlay
 */

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type ReactElement, type RefObject } from 'react'
import { Matrix4, Vector2, type Material, type Mesh } from 'three'
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js'
import { attempt } from '../state/safe'
import {
  enrollInSkyOcclusion,
  occludable,
  occlusionRadiusM,
  SKY_OCCLUSION,
} from './ambientOcclusion'
import { enrollInCascades, type CascadeEnroller } from './cascades'
import { OVERLAY_LAYER } from './layers'
import type { RenderQuality } from './quality'
import { consumeStructuralRedraw, shadowContentOf } from './redraw'

export interface RenderPipelineProps {
  readonly quality: RenderQuality
  readonly ambientOcclusion: boolean
  /** Meters to the top of the tallest thing that can stand between the ground and the sky */
  readonly occluderHeightM: number
  readonly cascades?: RefObject<CascadeEnroller | null>
}

/** Frames between sweeps for materials the scene has grown since the last one */
const SWEEP_INTERVAL = 15

const materialsOf = (mesh: Mesh): Material[] =>
  Array.isArray(mesh.material) ? mesh.material : [mesh.material]

export const RenderPipeline = ({
  quality,
  ambientOcclusion,
  occluderHeightM,
  cascades,
}: RenderPipelineProps): ReactElement => {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const radiusM = occlusionRadiusM(occluderHeightM)

  const occlusion = useMemo(() => {
    if (!ambientOcclusion) return null
    const built = attempt(() => {
      const pass = new GTAOPass(scene, camera, 1, 1)
      pass.output = GTAOPass.OUTPUT.Off
      /**
       * `distanceFallOff` weights near occluders over far ones, which is a thin-occluder
       * heuristic for contact shadows and wrong for a sky view factor: a direction is blocked
       * or it is not, and by what distance doesn't enter. `scale` is an exponent on the
       * result and the one knob here that would be pure taste, so it stays at 1. What this
       * pass reports is what the geometry occludes
       */
      pass.updateGtaoMaterial({
        radius: radiusM,
        thickness: radiusM,
        distanceExponent: 1,
        distanceFallOff: 0,
        scale: 1,
        samples: quality.occlusionSamples,
      })
      pass.updatePdMaterial({ samples: quality.occlusionDenoiseSamples })
      return pass
    })
    return built.ok ? built.value : null
  }, [ambientOcclusion, scene, camera, radiusM, quality])

  useEffect(() => () => void attempt(() => occlusion?.dispose()), [occlusion])

  // a camera sees layer 0 and nothing else until told otherwise, and the overlay isn't on it
  useEffect(() => {
    camera.layers.enable(OVERLAY_LAYER)
  }, [camera])

  const drawingSize = useMemo(() => new Vector2(), [])
  const enrolled = useRef(new WeakSet<Material>())
  // What is enrolled in which cascades instance: a quality change rebuilds the CSM, and every
  // material needs enrolling again in the new one, which the instance check below catches
  const inCascades = useRef<{
    readonly of: CascadeEnroller | null
    readonly materials: WeakSet<Material>
  }>({ of: null, materials: new WeakSet() })
  const sweep = useRef(0)
  /**
   * Where the camera was on the last frame this pass actually drew, so that "did it move" can be
   * ASKED, on demand. See the note beside `structural` below for why announcing it is
   * not enough
   */
  const drawnFrom = useRef(new Matrix4())
  const drawnThrough = useRef(new Matrix4())
  /**
   * What the scene held for shadows on the last frame this pass actually drew, asked the same way
   * `drawnFrom` and `drawnThrough` ask about the camera. See the fourth paragraph of the note
   * beside `structural` below for the commit this catches
   */
  const drawnContent = useRef(0)
  /**
   * The pass whose map the materials are reading. A store write asks for a frame and marks it
   * structural in the same call, while the React commit that hands this callback a new pass
   * arrives on its own schedule, and when the frame beats the commit (a busy main thread is
   * enough) the flag is spent on the old pass. The next frame then has the new pass, no flag and
   * no camera movement, and would hand the materials a map that was never drawn: every shaded
   * pixel black until something else asked for a structural frame. So a pass is integrated on
   * its first frame whatever the flag says
   */
  const integrated = useRef<GTAOPass | null>(null)

  /**
   * The cascades are redrawn only when this pass says so. `autoUpdate` defaults to true, which at
   * the high tier is four full depth passes over every caster at 2048 square, every frame, whether
   * or not the sun or anything casting had moved. Set once, on the renderer, because the renderer
   * holds it for every frame.
   *
   * The three `react-hooks/immutability` disables below are one false positive with one cause. That
   * rule treats anything a hook returned as immutable React state. `gl` is three's WebGLRenderer,
   * which `useThree` hands over precisely so it can be driven imperatively, and there's no other
   * way to say "stop redrawing the cascades": the flag lives on the renderer. Disabled at the three
   * sites alone, because everything else that rule catches in here is still worth catching
   */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- three's renderer, driven on purpose
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
    return () => {
      gl.shadowMap.autoUpdate = true
    }
  }, [gl])

  // eslint-disable-next-line react-hooks/immutability -- same renderer, same reason
  useFrame(() => {
    /**
     * Whether this frame owes shadows and occlusion. A cosmetic frame is foliage moving and owes
     * neither, which is what makes wind affordable at all.
     *
     * Three sources, each catching a case the others miss. `requestStructuralRedraw` is a one-shot
     * boolean that `OrbitControls` sets on every change event, which assumed one change event
     * produces one rendered frame. It doesn't: under `frameloop="demand"` an `invalidate()` can
     * queue more than one frame, so during a drag some frames arrive with the flag already spent
     * WHILE THE CAMERA IS STILL MOVING. On those frames the flag alone would leave the cascades
     * stale and apply the screen-space occlusion map from the previous camera position at full
     * strength to a view it doesn't fit.
     *
     * The note beside the occlusion block already stated the rule this broke: the estimate is
     * screen-space, so it's wrong the moment the camera moves and has to be redone then. Asking
     * the camera where it is can't get out of step with the frames the way a flag can.
     *
     * The cascades have the same ordering problem the `integrated` ref above documents. A store
     * write raises the flag and asks for a frame in one call, but the commit that hands this
     * scene a new mesh (a house added on the ground step, a bed or tree changed, an array's rows
     * re-laid, the sun rig's light direction) arrives on its own schedule through React. When the
     * frame beats the commit the flag is spent on the old scene, and the commit lands after: r3f's
     * `invalidateInstance` then asks for one more frame that has the mesh, no flag and no camera
     * movement, so it draws as cosmetic. The house stands under cascades rendered without it,
     * healed only by the next store write. `held` and `changed` below ask the scene itself the
     * same question the camera is asked, so this frame gets caught too. Priority-0 callbacks run
     * before this priority-1 one, among them the sun rig's `csm.update()`, which moves the cascade
     * lights from the camera and the sun every frame, so what gets hashed here is already this
     * frame's state
     */
    scene.updateMatrixWorld()
    const held = shadowContentOf(scene)
    const changed = held !== drawnContent.current
    drawnContent.current = held
    const moved =
      !drawnFrom.current.equals(camera.matrixWorld) ||
      !drawnThrough.current.equals(camera.projectionMatrix)
    drawnFrom.current.copy(camera.matrixWorld)
    drawnThrough.current.copy(camera.projectionMatrix)
    const structural = consumeStructuralRedraw() || moved || changed
    // eslint-disable-next-line react-hooks/immutability -- same renderer, same reason
    if (structural) gl.shadowMap.needsUpdate = true

    sweep.current = (sweep.current + 1) % SWEEP_INTERVAL
    // Enrolls new materials in the cascades and the sky occlusion, on a structural frame as well
    // as on the interval: new geometry arrives with a design change, and under demand rendering
    // the interval alone could be minutes away.
    //
    // The cascades enrollment runs here, on every structural frame, because a mesh landing is one.
    // On the interval alone, fifteen frames under demand rendering is fifteen invalidations,
    // whenever that lands, so a house added on the ground step would draw un-enrolled: every
    // cascade light would give it its full contribution, `cascades` times too bright (see
    // cascades.ts), until the sweep came round to it.
    //
    // `inCascades` is keyed by the cascades instance above so a rebuilt CSM starts its WeakSet
    // over, which is what makes a quality change re-enroll everything
    if (sweep.current === 0 || structural) {
      const csm = cascades?.current ?? null
      if (inCascades.current.of !== csm) inCascades.current = { of: csm, materials: new WeakSet() }
      const seen = enrolled.current
      attempt(() =>
        scene.traverse((object) => {
          const mesh = object as Mesh
          if (!mesh.isMesh) return
          for (const material of materialsOf(mesh)) {
            if (!material) continue
            if (csm !== null && !inCascades.current.materials.has(material)) {
              inCascades.current.materials.add(material)
              enrollInCascades(csm, material)
            }
            if (seen.has(material) || !occludable(material)) continue
            seen.add(material)
            enrollInSkyOcclusion(material)
          }
        }),
      )
    }

    gl.getDrawingBufferSize(drawingSize)
    SKY_OCCLUSION.aoResolution.value.copy(drawingSize)

    /**
     * Re-integrated on structural frames only. The estimate is screen-space, so it's wrong the
     * moment the camera moves and has to be redone then. When only a leaf bent, the map from the
     * last frame is still the right answer for a scene whose geometry hasn't moved. Skipping it
     * here is the difference between wind costing a color pass and wind
     * costing a color pass plus a sixteen-sample integral and a sixteen-tap denoise
     */
    if (occlusion && (structural || integrated.current !== occlusion)) {
      const width = Math.max(1, Math.round(drawingSize.x * quality.occlusionScale))
      const height = Math.max(1, Math.round(drawingSize.y * quality.occlusionScale))
      // the pass's own size, since a ref beside it outlives the pass a toggle rebuilds and
      // would leave the new one at the 1x1 it was constructed with, which reads as a constant
      if (occlusion.width !== width || occlusion.height !== height) {
        attempt(() => occlusion.setSize(width, height))
      }
      // the overlay is a readout printed on the ground and the bed labels are readouts over
      // it: neither is geometry, so neither belongs in the depth and normal buffers this
      // integrates, where both would darken ground they don't occlude
      camera.layers.disable(OVERLAY_LAYER)
      // OUTPUT.Off leaves both composer buffers alone: this call exists for `gtaoMap`
      attempt(() => occlusion.render(gl, null as never, null as never, 0, false))
      camera.layers.enable(OVERLAY_LAYER)
      gl.setRenderTarget(null)
      integrated.current = occlusion
      SKY_OCCLUSION.aoMapScreen.value = occlusion.gtaoMap
    }
    SKY_OCCLUSION.aoStrength.value = occlusion ? 1 : 0

    gl.render(scene, camera)
  }, 1)

  return (
    <group
      name="render-pipeline"
      userData={{
        testid: 'scene-render-pipeline',
        ambientOcclusion: occlusion !== null,
        occlusionRadiusM: radiusM,
        occlusionSamples: quality.occlusionSamples,
      }}
    />
  )
}
