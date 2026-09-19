/**
 * The frame, in the order the picture is assembled.
 *
 * r3f renders once per frame for you until something subscribes at a non-zero priority; from
 * then on the subscriber owns the frame. This one does, because the sky-occlusion estimate has
 * to be finished before the lit pass that samples it, and because the overlay is composited
 * after that pass rather than inside it.
 *
 * Nothing here is a screen-space filter over the finished image. The occlusion reaches the
 * scene as a term in the lighting equation of every lit material (`ambientOcclusion.ts`), which
 * is what keeps it off the direct beam and off the overlay
 */

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type ReactElement } from 'react'
import { Matrix4, Vector2, type Material, type Mesh } from 'three'
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js'
import { attempt } from '../state/safe'
import {
  enrolInSkyOcclusion,
  occludable,
  occlusionRadiusM,
  SKY_OCCLUSION,
} from './ambientOcclusion'
import { OVERLAY_LAYER } from './layers'
import type { RenderQuality } from './quality'
import { consumeStructuralRedraw } from './redraw'

export interface RenderPipelineProps {
  readonly quality: RenderQuality
  readonly ambientOcclusion: boolean
  /** Metres to the top of the tallest thing that can stand between the ground and the sky */
  readonly occluderHeightM: number
}

/** Frames between sweeps for materials the scene has grown since the last one */
const SWEEP_INTERVAL = 15

const materialsOf = (mesh: Mesh): Material[] =>
  Array.isArray(mesh.material) ? mesh.material : [mesh.material]

export const RenderPipeline = ({
  quality,
  ambientOcclusion,
  occluderHeightM,
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
       * or it is not, and by what distance does not enter. `scale` is an exponent on the
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

  // a camera sees layer 0 and nothing else until told otherwise, and the overlay is not on it
  useEffect(() => {
    camera.layers.enable(OVERLAY_LAYER)
  }, [camera])

  const drawingSize = useMemo(() => new Vector2(), [])
  const enrolled = useRef(new WeakSet<Material>())
  const sweep = useRef(0)
  /**
   * Where the camera was on the last frame this pass actually drew, so that "did it move" can be
   * ASKED rather than announced. See the note beside `structural` below for why announcing it is
   * not enough
   */
  const drawnFrom = useRef(new Matrix4())
  const drawnThrough = useRef(new Matrix4())
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
   * The cascades are redrawn when this pass says so, not on every frame three would otherwise
   * redraw them on. `autoUpdate` defaults to true, which at the high tier is four full depth
   * passes over every caster at 2048 square, every frame, whether or not the sun or anything
   * casting had moved. Set once, on the renderer, because it is a property of the renderer and
   * not of a frame.
   *
   * The three `react-hooks/immutability` disables below are one false positive with one cause.
   * That rule treats anything a hook returned as immutable React state. `gl` is three's
   * WebGLRenderer, which `useThree` hands over precisely so it can be driven imperatively, and
   * there is no other way to say "stop redrawing the cascades": the flag lives on the renderer.
   * It began failing a file that had not changed, when an eslint-plugin-react-hooks bump under
   * the caret range added the rule. Disabled at the three sites rather than for the directory,
   * because everything else that rule catches in here is still worth catching
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
     * Two sources, and the second is not redundant. `requestStructuralRedraw` is a one-shot
     * boolean that `OrbitControls` sets on every change event, which assumed one change event
     * produces one rendered frame. It does not: under `frameloop="demand"` an `invalidate()` can
     * queue more than one frame, so during a drag some frames arrive with the flag already spent
     * WHILE THE CAMERA IS STILL MOVING. On those frames the flag alone would leave the cascades
     * stale and apply the screen-space occlusion map from the previous camera position at full
     * strength to a view it does not fit.
     *
     * The note beside the occlusion block already stated the rule this broke: the estimate is
     * screen-space, so it is wrong the moment the camera moves and has to be redone then. Asking
     * the camera where it is cannot get out of step with the frames the way a flag can
     */
    const moved =
      !drawnFrom.current.equals(camera.matrixWorld) ||
      !drawnThrough.current.equals(camera.projectionMatrix)
    drawnFrom.current.copy(camera.matrixWorld)
    drawnThrough.current.copy(camera.projectionMatrix)
    const structural = consumeStructuralRedraw() || moved
    // eslint-disable-next-line react-hooks/immutability -- same renderer, same reason
    if (structural) gl.shadowMap.needsUpdate = true

    sweep.current = (sweep.current + 1) % SWEEP_INTERVAL
    // on a structural frame as well as on the interval: new geometry arrives with a design
    // change, and under demand rendering the interval alone could be minutes away
    if (sweep.current === 0 || structural) {
      const seen = enrolled.current
      attempt(() =>
        scene.traverse((object) => {
          const mesh = object as Mesh
          if (!mesh.isMesh) return
          for (const material of materialsOf(mesh)) {
            if (!material || seen.has(material) || !occludable(material)) continue
            seen.add(material)
            enrolInSkyOcclusion(material)
          }
        }),
      )
    }

    gl.getDrawingBufferSize(drawingSize)
    SKY_OCCLUSION.aoResolution.value.copy(drawingSize)

    /**
     * Re-integrated on structural frames only. The estimate is screen-space, so it is wrong the
     * moment the camera moves and has to be redone then; it is NOT wrong because a leaf bent,
     * and the map from the last frame is still the right answer for a scene whose geometry has
     * not moved. Skipping it here is the difference between wind costing a colour pass and wind
     * costing a colour pass plus a sixteen-sample integral and a sixteen-tap denoise
     */
    if (occlusion && (structural || integrated.current !== occlusion)) {
      const width = Math.max(1, Math.round(drawingSize.x * quality.occlusionScale))
      const height = Math.max(1, Math.round(drawingSize.y * quality.occlusionScale))
      // the pass's own size, not a ref beside it: a ref outlives the pass a toggle rebuilds and
      // would leave the new one at the 1x1 it was constructed with, which reads as a constant
      if (occlusion.width !== width || occlusion.height !== height) {
        attempt(() => occlusion.setSize(width, height))
      }
      // the overlay is a readout printed on the ground and the bed labels are readouts over
      // it: neither is geometry, so neither belongs in the depth and normal buffers this
      // integrates, where both would darken ground they do not occlude
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
