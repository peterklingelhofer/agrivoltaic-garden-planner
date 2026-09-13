import { BoxGeometry, BufferGeometry, CylinderGeometry } from 'three'
import { describe, expect, it } from 'bun:test'
import { vi } from '../../test/vi'
import { subtractPosts, type Cutter } from './csg'

const cutterAt = (x: number, y: number): Cutter => ({ x, y, z: 0, radiusM: 0.3, heightM: 4 })

describe('subtractPosts', () => {
  it('disposes the base clone, but neither `base` nor its own result', () => {
    const base = new BoxGeometry(2, 2, 2)
    const original = BufferGeometry.prototype.dispose
    const disposed: BufferGeometry[] = []
    // call through to the real implementation rather than swallowing it: the geometries three-bvh-csg
    // builds internally still need their own bookkeeping to run, this just also records who was disposed
    const disposeSpy = vi.spyOn(BufferGeometry.prototype, 'dispose').mockImplementation(function (
      this: BufferGeometry,
    ) {
      disposed.push(this)
      return original.call(this)
    })
    // capture the exact clone `subtractPosts` makes of `base`, so the test can assert on that
    // object specifically rather than guessing at it from the disposed list
    let clone: BoxGeometry | undefined
    const cloneSpy = vi.spyOn(base, 'clone').mockImplementation(function (this: BoxGeometry) {
      clone = BoxGeometry.prototype.clone.call(this)
      return clone
    })

    const result = subtractPosts(base, [cutterAt(0, 0)])

    expect(clone).toBeDefined()
    expect(disposed).toContain(clone)
    expect(disposed).not.toContain(base)
    expect(disposed).not.toContain(result)
    disposeSpy.mockRestore()
    cloneSpy.mockRestore()
  })

  it('disposes exactly one cutter cylinder per cutter, whatever three-bvh-csg does internally', () => {
    const base = new BoxGeometry(2, 2, 2)
    const cutters = [cutterAt(0, 0), cutterAt(0.5, 0.5), cutterAt(-0.5, 0.2)]
    // three-bvh-csg disposes some scratch `BufferGeometry`s of its own while evaluating; a
    // `CylinderGeometry`-specific spy isolates the cutter geometries this function itself made,
    // which are the only `CylinderGeometry` instances anywhere in this call
    const spy = vi.spyOn(CylinderGeometry.prototype, 'dispose')

    subtractPosts(base, cutters)

    expect(spy).toHaveBeenCalledTimes(cutters.length)
    spy.mockRestore()
  })

  it('returns `base` untouched and disposes nothing when there is nothing to cut', () => {
    const base = new BoxGeometry(2, 2, 2)
    const spy = vi.spyOn(BufferGeometry.prototype, 'dispose')

    const result = subtractPosts(base, [])

    expect(result).toBe(base)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
