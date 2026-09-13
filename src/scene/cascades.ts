import type { Material } from 'three'

/** As much of `CSM` as enrolment touches, so a test can drive this without a GL context */
export interface CascadeEnroller {
  setupMaterial(material: Material): void
}

/**
 * Enrols one material in the cascaded shadow maps.
 *
 * Two things `CSM.setupMaterial` does not do for itself, both of which fail silently.
 *
 * It writes `CSM_CASCADES` into `defines` but never bumps the material version, and three only
 * recompiles on a version change. A mesh that has already drawn one frame therefore keeps the
 * stock light loop, in which every cascade light adds its full contribution: the scene comes out
 * `cascades` times too bright and the cascade selection never happens.
 *
 * And it *assigns* `onBeforeCompile` rather than composing with it, so a material that patches
 * its own shader loses the patch the moment it is enrolled. The foliage wind is exactly that, and
 * a canopy that quietly stopped moving is not a failure anyone would trace back to here
 */
export const enrolInCascades = (cascades: CascadeEnroller, material: Material): void => {
  const own = material.onBeforeCompile
  cascades.setupMaterial(material)
  const added = material.onBeforeCompile
  material.onBeforeCompile = function chained(shader, renderer) {
    own.call(this, shader, renderer)
    added.call(this, shader, renderer)
  }
  material.needsUpdate = true
}
