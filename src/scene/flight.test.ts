import { describe, expect, it } from 'bun:test'
import {
  clampPose,
  easeInOutCubic,
  type OrbitPose,
  poseAt,
  poseOf,
  positionOf,
  shortArc,
} from './flight'
import type { Triple } from './framing'

const DEG = Math.PI / 180

const poseFixture = (patch: Partial<OrbitPose> = {}): OrbitPose => ({
  target: [0, 1.5, 0],
  theta: 0,
  phi: Math.PI / 3,
  radiusM: 20,
  ...patch,
})

describe('orbit poses', () => {
  it('round trips a position through the spherical the controls would derive', () => {
    const position: Triple = [12, 9, -7]
    const target: Triple = [1, 1.5, 2]
    const [x, y, z] = positionOf(poseOf(position, target))
    expect(x).toBeCloseTo(position[0], 10)
    expect(y).toBeCloseTo(position[1], 10)
    expect(z).toBeCloseTo(position[2], 10)
  })

  it('measures the polar angle down from straight up, as three does', () => {
    expect(poseOf([0, 10, 0], [0, 0, 0]).phi).toBeCloseTo(0, 10)
    expect(poseOf([10, 0, 0], [0, 0, 0]).phi).toBeCloseTo(Math.PI / 2, 10)
    // theta is atan2(x, z), so +z is zero and +x is a quarter turn
    expect(poseOf([0, 0, 10], [0, 0, 0]).theta).toBeCloseTo(0, 10)
    expect(poseOf([10, 0, 0], [0, 0, 0]).theta).toBeCloseTo(Math.PI / 2, 10)
  })

  it('holds a destination inside the limits the controls would otherwise impose', () => {
    const clamped = clampPose(poseFixture({ phi: 3, radiusM: 400 }), {
      minPolarAngle: 0,
      maxPolarAngle: Math.PI / 2.05,
      minDistance: 4,
      maxDistance: 120,
    })
    expect(clamped.phi).toBeCloseTo(Math.PI / 2.05, 12)
    expect(clamped.radiusM).toBe(120)
    expect(
      clampPose(poseFixture({ radiusM: 1 }), {
        minPolarAngle: 0,
        maxPolarAngle: Math.PI,
        minDistance: 4,
        maxDistance: 120,
      }).radiusM,
    ).toBe(4)
  })
})

describe('the flight interpolation', () => {
  const from = poseFixture({ theta: 20 * DEG, phi: 40 * DEG, radiusM: 12, target: [0, 1.5, 0] })
  const to = poseFixture({ theta: 90 * DEG, phi: 70 * DEG, radiusM: 60, target: [4, 1.5, -8] })

  it('starts at the pose it left and ends at the pose it was aimed at', () => {
    const start = poseAt(from, to, 0)
    expect(start.theta).toBeCloseTo(from.theta, 12)
    expect(start.phi).toBeCloseTo(from.phi, 12)
    expect(start.radiusM).toBeCloseTo(from.radiusM, 12)
    expect(start.target).toEqual(from.target)

    const end = poseAt(from, to, 1)
    expect(end.theta).toBeCloseTo(to.theta, 12)
    expect(end.phi).toBeCloseTo(to.phi, 12)
    expect(end.radiusM).toBeCloseTo(to.radiusM, 12)
    expect(end.target[0]).toBeCloseTo(to.target[0], 12)
    expect(end.target[2]).toBeCloseTo(to.target[2], 12)
  })

  /** A 12 m to 60 m flight: linearly that is 36 m at the halfway mark, geometrically 26.8 m */
  it('closes the distance geometrically rather than linearly', () => {
    expect(poseAt(from, to, 0.5).radiusM).toBeCloseTo(Math.sqrt(12 * 60), 10)
    expect(poseAt(from, to, 0.5).radiusM).toBeCloseTo(26.83, 2)
    expect(poseAt(from, to, 0.5).radiusM).not.toBeCloseTo(36, 1)
  })

  it('takes the short way round rather than a lap of the garden', () => {
    expect(shortArc(170 * DEG, -170 * DEG)).toBeCloseTo(20 * DEG, 10)
    expect(shortArc(-170 * DEG, 170 * DEG)).toBeCloseTo(-20 * DEG, 10)
    const halfway = poseAt(
      poseFixture({ theta: 170 * DEG }),
      poseFixture({ theta: -170 * DEG }),
      0.5,
    )
    // 180 degrees, which is the point BETWEEN the two, not the -0 degrees a lerp would give
    expect(halfway.theta).toBeCloseTo(180 * DEG, 10)
  })

  it('interpolates a degenerate radius linearly rather than to NaN', () => {
    const collapsed = poseAt(poseFixture({ radiusM: 0 }), poseFixture({ radiusM: 10 }), 0.5)
    expect(collapsed.radiusM).toBeCloseTo(5, 10)
  })
})

describe('easeInOutCubic', () => {
  it('is still at both ends and fastest through the middle', () => {
    expect(easeInOutCubic(0)).toBe(0)
    expect(easeInOutCubic(1)).toBe(1)
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 12)
    expect(easeInOutCubic(0.1)).toBeLessThan(0.1)
    expect(easeInOutCubic(0.9)).toBeGreaterThan(0.9)
  })

  it('holds still outside the flight rather than overshooting it', () => {
    expect(easeInOutCubic(-1)).toBe(0)
    expect(easeInOutCubic(4)).toBe(1)
  })
})
