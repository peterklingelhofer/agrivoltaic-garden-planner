import { CylinderGeometry, Matrix4, type Mesh, type BufferGeometry } from 'three'
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg'
import { attempt } from '../state/safe'

export interface Cutter {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly radiusM: number
  readonly heightM: number
}

// CSG is only reached when a mounting post actually pierces a bed volume: an extruded
// polygon with holes covers every other case at a fraction of the cost
export const subtractPosts = (base: BufferGeometry, cutters: readonly Cutter[]): BufferGeometry => {
  if (cutters.length === 0) return base
  const result = attempt(() => {
    const evaluator = new Evaluator()
    evaluator.useGroups = false
    let accumulated = new Brush(base.clone())
    accumulated.updateMatrixWorld()
    for (const cutter of cutters) {
      const geometry = new CylinderGeometry(cutter.radiusM, cutter.radiusM, cutter.heightM, 10)
      geometry.applyMatrix4(new Matrix4().makeTranslation(cutter.x, cutter.y, cutter.z))
      const brush = new Brush(geometry)
      brush.updateMatrixWorld()
      const next = evaluator.evaluate(accumulated, brush, SUBTRACTION) as Brush
      // the geometry this evaluation superseded is never referenced again, whether it came from
      // `base.clone()` or a prior evaluate call, so it is freed the moment it is replaced; the
      // final `accumulated` survives the loop and is disposed by nobody here, since it becomes
      // the return value
      accumulated.geometry.dispose()
      geometry.dispose()
      accumulated = next
    }
    const mesh: Mesh = accumulated
    return mesh.geometry
  })
  return result.ok ? result.value : base
}
