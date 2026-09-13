import { useFrame, useThree } from '@react-three/fiber'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { vi } from '../../test/vi'
import { makeArray, makePlot } from '../state/defaults'
import { withDerived } from '../state/derive'
import { resetAppStore, useAppStore } from '../state/store'
import type { GardenPlot } from '../types/garden'
import type { PvArray } from '../types/pv'
import { degrees, meters } from '../types/units'
import { poseOf, shortArc } from './flight'
import { framingFor, type Triple } from './framing'
import { TOUR_DEGREES_PER_SECOND, useGuidedTour } from './useGuidedTour'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

beforeEach(() => resetAppStore())
afterEach(() => vi.unstubAllGlobals())

const arrayFixture = (): PvArray =>
  withDerived({
    ...makeArray(1),
    geometry: {
      ...makeArray(1).geometry,
      rowAzimuthDeg: degrees(180),
      rowCount: 3,
      pitchM: meters(9),
      rowLengthM: meters(16),
    },
  })

const plotWith = (array: PvArray): GardenPlot => ({ ...makePlot(), arrays: [array] })

/** Registered after `useGuidedTour`'s own `useFrame`, so it reads the camera each frame only
 *  once the hook under test has had its chance to move it */
const makeHarness = (onFrame: (position: Triple) => void): (() => null) => {
  const Harness = (): null => {
    useGuidedTour()
    const { camera } = useThree()
    useFrame(() => {
      onFrame([camera.position.x, camera.position.y, camera.position.z])
    })
    return null
  }
  return Harness
}

describe('useGuidedTour', () => {
  it("doesn't re-teleport when a plot swap leaves the framed array numerically unchanged", async () => {
    const array = arrayFixture()
    const plot = plotWith(array)
    useAppStore.setState({ plot, example: 'showing' })

    let lastPosition: Triple | null = null
    const Harness = makeHarness((position) => {
      lastPosition = position
    })

    const renderer = await ReactThreeTestRenderer.create(<Harness />)
    const expected = framingFor(plot)
    expect(expected).not.toBeNull()

    // first frame: nothing has been framed yet, so this is the teleport
    await renderer.advanceFrames(1, 0.1)
    expect(lastPosition).toEqual(expected?.position)

    // second frame: already framed, so this is an orbit step away from the teleport point
    await renderer.advanceFrames(1, 0.1)
    expect(lastPosition).not.toEqual(expected?.position)

    // a scenario preview replaces `plot` with a different object carrying the same array
    // values: the bug this guards against was every such swap rebuilding `framing` and
    // teleporting the camera straight back to `expected`, undoing the orbit above.
    // `advanceFrames` re-invokes the last committed frame callback directly, bypassing React,
    // so the store update is wrapped in `act` to force the re-render that hands `useGuidedTour`
    // the new `plot` before the next frame runs
    await ReactThreeTestRenderer.act(async () => {
      useAppStore.setState({ previewPlot: plotWith({ ...array, geometry: { ...array.geometry } }) })
    })
    await renderer.advanceFrames(1, 0.1)

    expect(lastPosition).not.toEqual(expected?.position)
    await renderer.unmount()
  })

  it('does re-teleport when the swapped plot actually reframes the array', async () => {
    const array = arrayFixture()
    const plot = plotWith(array)
    useAppStore.setState({ plot, example: 'showing' })

    let lastPosition: Triple | null = null
    const Harness = makeHarness((position) => {
      lastPosition = position
    })

    const renderer = await ReactThreeTestRenderer.create(<Harness />)
    await renderer.advanceFrames(1, 0.1)
    await renderer.advanceFrames(1, 0.1)

    const reframed = plotWith({ ...array, geometry: { ...array.geometry, pitchM: meters(20) } })
    await ReactThreeTestRenderer.act(async () => {
      useAppStore.setState({ previewPlot: reframed })
    })
    await renderer.advanceFrames(1, 0.1)

    expect(lastPosition).toEqual(framingFor(reframed)?.position)
    await renderer.unmount()
  })

  /**
   * The orbit turned about y and nothing else, which is the motion of a model on a plinth. Both
   * halves are pinned here because each one alone passes for the wrong reason: a bob with no turn
   * and a turn with no bob would each satisfy "the camera moved", and the elevation in particular
   * would go unnoticed if it stopped, since the azimuth would still be carrying the shot
   */
  it('turns and rises, not just turns', async () => {
    const plot = plotWith(arrayFixture())
    useAppStore.setState({ plot, example: 'showing' })

    const seenPositions: Triple[] = []
    const Harness = makeHarness((position) => {
      seenPositions.push(position)
    })
    const renderer = await ReactThreeTestRenderer.create(<Harness />)
    // the first frame is the teleport, and the rise is measured from the pose it lands on
    await renderer.advanceFrames(1, 0.1)
    const target = framingFor(plot)?.target as Triple
    // a quarter of the rise period, where the sine is at its peak and the elevation has moved most
    await renderer.advanceFrames(65, 0.1)

    const start = poseOf(seenPositions[0] as Triple, target)
    const end = poseOf(seenPositions[seenPositions.length - 1] as Triple, target)
    const inDegrees = (radians: number): number => (radians * 180) / Math.PI

    // the azimuth carries on as it always did, at the rate the constant names
    expect(inDegrees(Math.abs(shortArc(start.theta, end.theta)))).toBeCloseTo(
      TOUR_DEGREES_PER_SECOND * 6.5,
      0,
    )
    // and the elevation has left where it started
    expect(inDegrees(Math.abs(end.phi - start.phi))).toBeGreaterThan(3)
    // without pulling the camera in or pushing it out: an orbit changes where it looks from, and
    // a radius that drifts is the pose being accumulated rather than stated
    expect(end.radiusM).toBeCloseTo(start.radiusM, 6)
    await renderer.unmount()
  })
})
