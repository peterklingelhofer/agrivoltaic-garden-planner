import { useFrame, useThree } from '@react-three/fiber'
import { CANCEL_EVENTS, prefersReducedMotion } from '../state/motion'
import { requestStructuralRedraw } from './redraw'
import { attended } from './useInvalidate'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Camera } from 'three'
import { scenePlot, useAppStore } from '../state/store'
import { clampPose, type OrbitLimits, poseOf, positionOf } from './flight'
import { DEFAULT_TARGET, framingFor, framingForSubject, type Framing, type Triple } from './framing'

/**
 * Slow enough to read the scene by. Held in degrees a second rather than in OrbitControls'
 * `autoRotateSpeed`, which steps per frame: on the software rasterizer the e2e suite runs, that
 * would be a tenth of the speed a visitor with a GPU sees, and an orbit whose speed is a
 * property of the machine isn't an orbit anyone chose
 */
export const TOUR_DEGREES_PER_SECOND = 2.4

/**
 * The second axis, which is what makes this an orbit rather than a turntable.
 *
 * Azimuth alone is the motion a model on a rotating plinth has, and it says the object is the
 * subject. What the example is actually about is a shade band on the ground, and a shade band is
 * only legible from a camera that is willing to change how obliquely it is looking at it: rising
 * flattens the band and shows how far it reaches, dropping lengthens it and shows how deep it is.
 *
 * Held small and slow on purpose. Four degrees is under a tenth of the elevation the framing
 * chooses, so the shot never argues with the composition, and one rise and fall every 26 seconds is
 * quicker than the 150 seconds a full revolution takes, so the two are never in step and the motion
 * doesn't read as a repeating loop.
 *
 * The angle is set ABSOLUTELY from the pose the orbit started at, so nothing accumulates from frame
 * to frame. A drift of a hundredth of a degree a frame is invisible and puts the camera on the
 * ground inside a minute, and this file has already been bitten once by a pose accumulating
 * instead of being stated
 */
const TOUR_RISE_DEGREES = 4
const TOUR_RISE_SECONDS = 26

/**
 * How long the example's slow orbit runs before it settles.
 *
 * With no timeout it would run until the visitor clicked, which on a tab left open on the example
 * means forever. That's the most expensive state this app has: the camera moves, so every frame is
 * structural and pays for four shadow cascades and the occlusion pass, at the display's refresh
 * rate, which on a recent MacBook is 120 a second. Measured at **98.5 percent of a GPU-process
 * core**, against 5.4 percent once the orbit stops.
 *
 * The orbit exists to keep the shot alive while the opening panel is read. Twenty-five seconds is
 * longer than that takes, and it's deliberately short: every second of it is the most expensive
 * state this app has, and it can't be made cheaper per frame, only shorter. Past it the garden
 * sits still, which is what somebody who hasn't touched it is being shown anyway
 */
const TOUR_ORBIT_MAX_SECONDS = 25

/** A tab that was in the background must not come back and spin a third of a turn in one frame */
const MAX_STEP_SECONDS = 0.1

/**
 * Every way a visitor can say "I am driving now". Wheel and touch are here because neither
 * produces a pointerdown on every browser, and a tour that keeps turning under a scroll is the
 * complaint this exists to avoid.
 *
 * Exported because the cold-open narration answers the same question and must answer it the same
 * way: two lists of "the visitor took over" that could drift apart would show up as a caption
 * still being read out over a scene the visitor is already dragging
 */
export { CANCEL_EVENTS, prefersReducedMotion } from '../state/motion'

export interface GuidedTour {
  /**
   * OrbitControls' own `start`, which drei exposes as `onStart`. It fires for pointer, wheel and
   * touch on the canvas and means exactly "the visitor grabbed the camera", which a listener on
   * `globalThis` can't tell apart from answering a question in the sidebar
   */
  onControlsStart(): void
}

/**
 * OrbitControls, structurally. Taken off the frame state rather than imported, because
 * `three-stdlib` is drei's dependency rather than ours, and because the hook has to work when
 * there are no controls at all, which is how the unit tests render it
 */
interface OrbitControlsLike extends OrbitLimits {
  readonly target: { set(x: number, y: number, z: number): void; x: number; y: number; z: number }
}

const orbitControlsOf = (controls: unknown): OrbitControlsLike | null => {
  const candidate = controls as Partial<OrbitControlsLike> | null
  return candidate?.target !== undefined && typeof candidate.minDistance === 'number'
    ? (candidate as OrbitControlsLike)
    : null
}

const DEFAULT_LIMITS: OrbitLimits = {
  minPolarAngle: 0,
  maxPolarAngle: Math.PI,
  minDistance: 0,
  maxDistance: Number.POSITIVE_INFINITY,
}

const limitsOf = (controls: OrbitControlsLike | null): OrbitLimits => controls ?? DEFAULT_LIMITS

/**
 * The one place a pose reaches the camera. `lookAt` is aimed at the same point that goes into
 * `controls.target`, which is what `update()` will aim it at on the next frame, so the two writers
 * agree by construction rather than by luck
 */
const applyPose = (
  camera: Camera,
  controls: OrbitControlsLike | null,
  position: Triple,
  target: Triple,
): void => {
  camera.position.set(...position)
  controls?.target.set(...target)
  camera.lookAt(...target)
}

/**
 * Frames the baked example on its shade band and turns it slowly under the shot. Frames any other
 * plot whole, from higher up, whenever its outline changes.
 *
 * The orbit is the example's alone: a grower's own design isn't a display. The framing applies to
 * every plot. With no framing at all the camera would sit at its declared pose whatever the plot
 * is, and on a phone that is one row of panels filling the screen after a layout is applied, with
 * the rest of the garden off the edge. This is a placement, keyed on the plot's outline, so the
 * same plot puts the camera in the same place every run. A hand on the camera holds its pose until
 * the outline changes again.
 *
 * The orbit never restarts: `driven` is a one-way latch with nothing that clears it, so a
 * re-render, a tab change or the example being cleared can't bring the motion back. Under
 * `prefers-reduced-motion` the framing still happens and nothing is animated: the camera is
 * placed and the orbit never starts, because the framing is where to stand and only the movement
 * is motion
 */
export const useGuidedTour = (): GuidedTour => {
  const example = useAppStore((s) => s.example)
  const plot = useAppStore(scenePlot)
  const showing = example === 'showing'

  // the picture's shape, so "the whole plot" is the whole plot on a phone as well as a laptop
  const aspect = useThree((s) => s.size.width / s.size.height)
  const fovDeg = useThree((s) => ('fov' in s.camera ? (s.camera.fov as number) : 45))
  const framing = useMemo(
    (): Framing | null =>
      showing ? framingFor(plot) : framingForSubject(plot, 'plot', { aspect, fovDeg }),
    [showing, plot, aspect, fovDeg],
  )

  /**
   * The pose itself is the key. `framing` is rebuilt on every render that recomputes it, so the
   * only thing that says whether the camera actually has somewhere new to be is the numbers it
   * would be sent to: a scenario preview that swaps `plot` for an equal one must not re-place it
   */
  const framingKey = framing ? [...framing.position, ...framing.target].join(',') : null

  const [driven, setDriven] = useState(false)
  const [reducedMotion] = useState(prefersReducedMotion)
  // Holds the key of the pose last aimed at, cleared whenever there's nothing to frame, so that
  // the next time there is, the camera is placed fresh rather than left wherever it drifted to
  const framedKey = useRef<string | null>(null)
  const grabbed = useRef(false)
  /**
   * Where the orbit's rise and fall is measured from, and how far into it we are. Both are
   * rewritten every time the camera is authoritatively placed by a teleport, so the bob is always
   * relative to the pose the framing chose
   */
  const orbitPhi = useRef(0)
  const orbitSeconds = useRef(0)

  // The orbit point has one writer, which is this callback, so the default one is written here
  // too rather than by drei: see the note beside `OrbitControls` in `GardenScene`
  const started = useRef(false)

  useEffect(() => {
    if (driven) return undefined
    const stop = (): void => setDriven(true)
    for (const name of CANCEL_EVENTS) globalThis.addEventListener?.(name, stop, { passive: true })
    return () => {
      for (const name of CANCEL_EVENTS) globalThis.removeEventListener?.(name, stop)
    }
  }, [driven])

  /**
   * Grabbing the camera leaves it exactly where the grab caught it and latches the orbit off for
   * good, because a hand on the camera is the one thing that means "I am driving" beyond doubt
   */
  const onControlsStart = useCallback((): void => {
    grabbed.current = true
    setDriven(true)
  }, [])

  /**
   * The pose is written in a frame callback rather than an effect: r3f owns the camera, and this
   * runs after OrbitControls' own update at priority -1, so the two never fight over one frame.
   * The camera comes off the frame state rather than out of `useThree`, because the React
   * Compiler's immutability rule refuses a write into anything a hook returned, and it's right
   * to: the render body isn't where a camera is moved
   */
  useFrame((state, delta) => {
    const { camera } = state
    const controls = orbitControlsOf(state.controls)
    if (!started.current) {
      started.current = true
      if (framing === null) controls?.target.set(...DEFAULT_TARGET)
    }
    if (grabbed.current) {
      grabbed.current = false
      // the pose the visitor grabbed is now the pose that counts as framed, so nothing pulls the
      // camera back
      framedKey.current = framingKey
      return
    }
    if (framing === null) {
      framedKey.current = null
      return
    }
    const stepSeconds = Math.min(delta, MAX_STEP_SECONDS)
    if (framedKey.current !== framingKey) {
      framedKey.current = framingKey
      // the example framing is the camera's first placement, with nothing on screen yet to fly
      // away from, and its teleport is what the orbit starts from
      applyPose(camera, controls, framing.position, framing.target)
      orbitPhi.current = poseOf(framing.position, framing.target).phi
      orbitSeconds.current = 0
      return
    }
    /**
     * The slow orbit belongs to the example: it's what keeps the shot alive while the opening
     * panel is read. A grower's own design gets no drift, because nothing about it is a display
     */
    if (driven || reducedMotion || !showing) return
    /**
     * Three ways this stops, and only the first was here before.
     *
     * It latches off for good the moment a visitor touches the scene. It stands down while the
     * window isn't both visible and in front, because a shot nobody can see isn't being kept
     * alive by anything. And it settles after `TOUR_ORBIT_MAX_SECONDS`, because with no end an
     * untouched tab on the example would orbit at the display's refresh rate indefinitely, every
     * frame of it structural, which is the single most expensive thing this app can do, and it
     * would do it while nobody is there
     */
    if (orbitSeconds.current >= TOUR_ORBIT_MAX_SECONDS) return
    if (!attended()) return
    /**
     * Marked structural, but NOT invalidated here, on purpose.
     *
     * The orbit moves the camera through `OrbitControls`, and drei's wrapper calls `invalidate()`
     * itself on the controls' `change` event. So this branch gets its next frame whatever it does,
     * and it gets it at the display's refresh rate. Throttling the request from this side measures
     * 10,822 draws a second against 11,267 unthrottled, because the controls ask for every frame
     * regardless. The lever that works on this state is `TOUR_ORBIT_MAX_SECONDS`, which ends it
     */
    requestStructuralRedraw()
    orbitSeconds.current += stepSeconds
    /*
     * Written through the same pose coordinates the flights use, rather than by turning
     * `camera.position` about y and calling `lookAt`. That older form could only ever move one
     * axis, since a rotation about y is what azimuth IS, and it also left `controls.target`
     * unwritten: harmless while the target never moved, and the exact shape the comment on
     * `OrbitPose` describes being erased by `update()` the moment it does.
     *
     * Read against `framing.target`, because `currentPose` answers against the CONTROLS' target.
     * The two agree once `applyPose` has written one, and before that they don't:
     * measuring a radius from one point and then rebuilding the position around another adds
     * the gap between them to the radius every frame, which walked the camera from 29.6 m out to
     * 41.9 m over six seconds the first time this was written
     */
    const pose = poseOf([camera.position.x, camera.position.y, camera.position.z], framing.target)
    const rise = (TOUR_RISE_DEGREES * Math.PI) / 180
    const phase = (2 * Math.PI * orbitSeconds.current) / TOUR_RISE_SECONDS
    const orbited = clampPose(
      {
        target: framing.target,
        // negative, because the old rotation about y decreased the azimuth and which way the
        // garden turns is a thing somebody chose to look at
        theta: pose.theta - ((TOUR_DEGREES_PER_SECOND * Math.PI) / 180) * stepSeconds,
        phi: orbitPhi.current + rise * Math.sin(phase),
        radiusM: pose.radiusM,
      },
      limitsOf(controls),
    )
    applyPose(camera, controls, positionOf(orbited), orbited.target)
  })

  return { onControlsStart }
}
