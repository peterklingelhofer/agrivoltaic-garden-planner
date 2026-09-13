import { clamp } from '../sim/math'
import type { Triple } from './framing'

/**
 * A camera pose in the coordinates OrbitControls itself thinks in: the point it orbits, plus
 * where the camera stands around that point.
 *
 * Interpolating here rather than in world space is the whole mechanic. `OrbitControls.update()`
 * runs every frame at priority -1, re-derives exactly these numbers from `position - target`,
 * clamps them to its own limits and calls `object.lookAt(target)` itself. So a flight that lerps
 * a world position and looks anywhere other than `controls.target` is erased on the very next
 * frame, while a flight that writes both target and position leaves behind a pose OrbitControls
 * would itself have produced, and handing control back to the visitor cannot snap
 */
export interface OrbitPose {
  readonly target: Triple
  /** Azimuth about the target, `atan2(x, z)`, matching three's `Spherical` */
  readonly theta: number
  /** Polar angle down from +y, matching three's `Spherical` */
  readonly phi: number
  readonly radiusM: number
}

/** The subset of OrbitControls that silently corrects a pose, and so has to be respected up front */
export interface OrbitLimits {
  readonly minPolarAngle: number
  readonly maxPolarAngle: number
  readonly minDistance: number
  readonly maxDistance: number
}

/** What `Spherical.makeSafe` allows: phi is never let all the way to a pole */
const POLAR_EPSILON = 0.000001

/** Below this a radius carries no direction, so there is nothing to interpolate geometrically */
const MIN_RADIUS_M = 0.001

/** Slow off the mark, quick through the middle, slow into the destination */
export const easeInOutCubic = (t: number): number => {
  const k = clamp(t, 0, 1)
  return k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2
}

/**
 * The signed angle from one azimuth to another taken the short way round. Without this a flight
 * from 170 degrees to -170 degrees is a 340 degree lap of the garden to cover 20 degrees
 */
export const shortArc = (fromRad: number, toRad: number): number => {
  const delta = toRad - fromRad
  return Math.atan2(Math.sin(delta), Math.cos(delta))
}

export const poseOf = (position: Triple, target: Triple): OrbitPose => {
  const dx = position[0] - target[0]
  const dy = position[1] - target[1]
  const dz = position[2] - target[2]
  const radiusM = Math.hypot(dx, dy, dz)
  return {
    target,
    theta: Math.atan2(dx, dz),
    phi: radiusM < MIN_RADIUS_M ? Math.PI / 2 : Math.acos(clamp(dy / radiusM, -1, 1)),
    radiusM,
  }
}

export const positionOf = (pose: OrbitPose): Triple => {
  const sinPhi = Math.sin(pose.phi)
  return [
    pose.target[0] + pose.radiusM * sinPhi * Math.sin(pose.theta),
    pose.target[1] + pose.radiusM * Math.cos(pose.phi),
    pose.target[2] + pose.radiusM * sinPhi * Math.cos(pose.theta),
  ]
}

/**
 * Holds the destination inside the limits once, at the start of the flight, so that no frame of
 * the flight is silently corrected by `update()` on arrival: a destination that gets clamped
 * mid-air is a destination the flight never eases into
 */
export const clampPose = (pose: OrbitPose, limits: OrbitLimits): OrbitPose => ({
  ...pose,
  phi: clamp(
    pose.phi,
    Math.max(limits.minPolarAngle, POLAR_EPSILON),
    Math.min(limits.maxPolarAngle, Math.PI - POLAR_EPSILON),
  ),
  radiusM: clamp(pose.radiusM, limits.minDistance, limits.maxDistance),
})

const lerp = (from: number, to: number, t: number): number => from + (to - from) * t

/**
 * The pose part way from one to another, at an already-eased fraction.
 *
 * The radius moves geometrically rather than linearly, because what reads as a constant rate of
 * approach is a constant proportion of the remaining distance: a linear 12 m to 60 m flight is
 * still 36 m out at the halfway mark, so it spends most of its time far away and then arrives all
 * at once, where the geometric one is at 26.8 m and closing evenly
 */
export const poseAt = (from: OrbitPose, to: OrbitPose, t: number): OrbitPose => {
  const k = clamp(t, 0, 1)
  const geometric = from.radiusM >= MIN_RADIUS_M && to.radiusM >= MIN_RADIUS_M
  return {
    target: [
      lerp(from.target[0], to.target[0], k),
      lerp(from.target[1], to.target[1], k),
      lerp(from.target[2], to.target[2], k),
    ],
    theta: from.theta + shortArc(from.theta, to.theta) * k,
    phi: lerp(from.phi, to.phi, k),
    radiusM: geometric
      ? from.radiusM * (to.radiusM / from.radiusM) ** k
      : lerp(from.radiusM, to.radiusM, k),
  }
}
