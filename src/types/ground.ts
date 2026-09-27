import type { Fraction } from './units'

/**
 * What is lying on the ground under and between the panels.
 *
 * This is a horticultural decision and an electrical one at the same time, which is the whole
 * reason it is a stored field and never a hidden constant. The ground's shortwave reflectance is a
 * term in three separate places in this app: the ground-reflected component of the plane-of-array
 * irradiance, the rear-side irradiance of a bifacial module, and the light that bounces off the
 * ground back up onto the underside of the panels and down again. Held at one number, it would tell
 * a grower who mulched with straw and a grower who left bare soil the same annual figure, and the
 * two are about a tenth of a year's generation apart.
 *
 * The values live here, because
 * `src/sim` may not import `src/data` (see docs/ARCHITECTURE.md) and the simulation needs the
 * number. `src/data/albedo.ts` wraps each of these with the source it came from and the words a
 * grower reads. It never restates the figure
 */
export type GroundCover = 'bare-soil' | 'grass' | 'wood-chip' | 'straw-mulch' | 'light-gravel'

export const GROUND_COVERS: readonly GroundCover[] = [
  'bare-soil',
  'grass',
  'wood-chip',
  'straw-mulch',
  'light-gravel',
]

/**
 * Mid-morning-to-mid-afternoon shortwave albedo, dry, seen from above.
 *
 * `grass` is 0.20, deliberately plain: 0.20 is the ground reflectance
 * PVWatts v5 assumes when nothing better is known, and it's what every figure this app has ever
 * printed was computed against. Making the default cover carry it exactly means introducing this
 * choice moves nobody's existing answer by a single kilowatt-hour
 */
export const GROUND_COVER_ALBEDO: Readonly<Record<GroundCover, Fraction>> = {
  'bare-soil': 0.13 as Fraction,
  grass: 0.2 as Fraction,
  'wood-chip': 0.15 as Fraction,
  'straw-mulch': 0.35 as Fraction,
  'light-gravel': 0.45 as Fraction,
}

export const DEFAULT_GROUND_COVER: GroundCover = 'grass'

export const groundAlbedoOf = (cover: GroundCover): Fraction => GROUND_COVER_ALBEDO[cover]

/**
 * Snow, a cover the weather lays on top of whichever ground cover the grower chose, for part of
 * the year.
 *
 * Old settled snow, because a seasonal weighting off monthly normals describes the lying
 * snowpack across whole months. Oke 1987 puts fresh snow near 0.80-0.90, and old and melting snow
 * at roughly 0.40-0.70. Neither Oke nor Thevenard and Haddad 2006 states 0.70: it's a point at
 * the top of the old-snow band, chosen so a modeled winter isn't flattered
 */
export const SNOW_ALBEDO = 0.7 as Fraction

/**
 * The albedo of ground that is `snowCover` covered, between the chosen cover and snow.
 *
 * Each language has its own copy: the renderer calls this one and the PV chain calls Rust's
 * `albedo_under_snow`, so the ground the camera shows and the ground the model bounces light off
 * can't disagree about how white it is today
 */
export const albedoUnderSnow = (coverAlbedo: Fraction, snowCover: number): Fraction =>
  (coverAlbedo + (SNOW_ALBEDO - coverAlbedo) * Math.min(1, Math.max(0, snowCover))) as Fraction

export const isGroundCover = (value: unknown): value is GroundCover =>
  typeof value === 'string' && (GROUND_COVERS as readonly string[]).includes(value)

/**
 * The cover a bare albedo number is closest to.
 *
 * Only one caller: a design saved before ground cover existed carries a `groundAlbedo` and no
 * cover, and discarding those designs over a field that has a defensible answer would be a
 * worse trade than picking the nearest one
 */
export const nearestGroundCover = (albedo: number): GroundCover => {
  let best: GroundCover = DEFAULT_GROUND_COVER
  let distance = Number.POSITIVE_INFINITY
  for (const cover of GROUND_COVERS) {
    const gap = Math.abs(GROUND_COVER_ALBEDO[cover] - albedo)
    if (gap < distance) {
      distance = gap
      best = cover
    }
  }
  return best
}
