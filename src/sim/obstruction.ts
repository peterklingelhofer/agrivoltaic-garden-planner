import type { Vec2M, Vec3M } from '../types/geo'
import type { House, Obstruction, Tree } from '../types/garden'
import type { Occluder } from '../types/pv'
import type { ExceedancePercentile, Site } from '../types/site'
import type { Meters } from '../types/units'
import { monthsInWindow } from './aggregate'
import { growingWindowFor } from './growing-window'

/**
 * A house or a tree the bake shades with, as the quads the panels already travel in: four
 * corners and nothing else (`Occluder`). A house is five quads, opaque; a tree is six, carrying
 * its own transmittance (Decision Record 26)
 */
export const houseQuads = (house: House): readonly Occluder[] => {
  const ring = house.footprint.exterior
  const n = ring.length
  const groundM = (i: number): Vec3M => {
    const corner = ring[i % n] as Vec2M
    return { xM: corner.xM, yM: corner.yM, zM: 0 as Meters }
  }
  const eaveM = (i: number): Vec3M => {
    const corner = ring[i % n] as Vec2M
    return { xM: corner.xM, yM: corner.yM, zM: house.heightM }
  }

  const top: Occluder = { corners: { vertices: Array.from({ length: n }, (_v, i) => eaveM(i)) } }
  const walls: Occluder[] = Array.from({ length: n }, (_v, i) => ({
    corners: { vertices: [groundM(i), groundM(i + 1), eaveM(i + 1), eaveM(i)] },
  }))
  return [top, ...walls]
}

/**
 * A tree's crown as six quads: the top at `heightM`, the bottom at `crownBaseM`, and four sides
 * between them, cyclic corner order like a house wall's. Every face carries both of the tree's
 * transmittance figures; an evergreen's leafless figure is its in-leaf one, so the two kernels
 * never see a season on it. The trunk below the crown is not drawn, the bake does not shade
 * with it (Decision Record 26)
 */
export const treeQuads = (tree: Tree): readonly Occluder[] => {
  const ring = tree.footprint.exterior
  const n = ring.length
  const cornerAt = (i: number, zM: Meters): Vec3M => {
    const corner = ring[i % n] as Vec2M
    return { xM: corner.xM, yM: corner.yM, zM }
  }
  const transmittance = tree.transmittance
  const leaflessTransmittance = tree.evergreen ? tree.transmittance : tree.leaflessTransmittance
  const face = (vertices: Vec3M[]): Occluder => ({
    corners: { vertices },
    transmittance,
    leaflessTransmittance,
  })

  const top = face(Array.from({ length: n }, (_v, i) => cornerAt(i, tree.heightM)))
  const bottom = face(Array.from({ length: n }, (_v, i) => cornerAt(i, tree.crownBaseM)))
  const sides: Occluder[] = Array.from({ length: n }, (_v, i) =>
    face([
      cornerAt(i, tree.crownBaseM),
      cornerAt(i + 1, tree.crownBaseM),
      cornerAt(i + 1, tree.heightM),
      cornerAt(i, tree.heightM),
    ]),
  )
  return [top, bottom, ...sides]
}

/** Every quad an obstruction shades with, house or tree, dispatched on its kind */
export const obstructionQuads = (obstruction: Obstruction): readonly Occluder[] =>
  obstruction.kind === 'house' ? houseQuads(obstruction) : treeQuads(obstruction)

/** The same quads leafless: each one's `transmittance` becomes its `leaflessTransmittance` */
export const leaflessQuads = (quads: readonly Occluder[]): readonly Occluder[] =>
  quads.map((quad) => ({ ...quad, transmittance: quad.leaflessTransmittance }))

/** Whether any quad's in-leaf and leafless figures differ, so a season would change what it blocks */
export const isSeasonal = (quads: readonly Occluder[]): boolean =>
  quads.some((quad) => quad.transmittance !== quad.leaflessTransmittance)

/**
 * Which calendar months a deciduous tree is in leaf: the site's growing window at the given
 * risk, built on the one `growingWindowFor` in `src/sim/growing-window.ts`, the same function
 * `src/data/growing-window.ts` re-exports for the rest of the app (Decision Record 26)
 */
export const leafOnMonthsFor = (
  site: Site,
  percentile: ExceedancePercentile,
): readonly boolean[] => {
  const inLeaf = new Set(monthsInWindow(growingWindowFor(site, percentile)))
  return Array.from({ length: 12 }, (_unused, month) => inLeaf.has(month))
}
