import ReactThreeTestRenderer from '@react-three/test-renderer'
import { beforeEach, describe, expect, it } from 'bun:test'
import { vi } from '../../test/vi'
import type { BufferGeometry, Mesh, Object3D } from 'three'
import { makeBed } from '../state/defaults'
import { polygonOf, rectangleRing, vec2 } from '../state/geom'
import { resetAppStore, useAppStore } from '../state/store'
import { meters } from '../types/units'
import { BedMesh } from './BedMesh'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

beforeEach(() => resetAppStore())

const named = (root: { instance: Object3D }, name: string): Object3D | null =>
  root.instance.getObjectByName(name) ?? null

describe('BedMesh geometry disposal', () => {
  it('disposes the walls and soil geometry on unmount', async () => {
    const bed = makeBed(1, { footprint: polygonOf(rectangleRing(vec2(0, 0), 4, 2)) })
    useAppStore.getState().upsertBed(bed)
    const renderer = await ReactThreeTestRenderer.create(
      <BedMesh bedId={bed.id} selected={false} />,
    )
    const solid = named(renderer.scene, `bed-${bed.id}-solid`) as unknown as Mesh
    const soil = named(renderer.scene, `bed-${bed.id}-soil`) as unknown as Mesh
    const wallsSpy = vi.spyOn(solid.geometry, 'dispose')
    const soilSpy = vi.spyOn(soil.geometry, 'dispose')

    await renderer.unmount()

    expect(wallsSpy).toHaveBeenCalledTimes(1)
    expect(soilSpy).toHaveBeenCalledTimes(1)
  })

  it('disposes the previous geometry when a bed edit replaces it, without double-freeing', async () => {
    const bed = makeBed(1, { footprint: polygonOf(rectangleRing(vec2(0, 0), 4, 2)) })
    useAppStore.getState().upsertBed(bed)
    const renderer = await ReactThreeTestRenderer.create(
      <BedMesh bedId={bed.id} selected={false} />,
    )
    const firstSolid = named(renderer.scene, `bed-${bed.id}-solid`) as unknown as Mesh
    const firstSoil = named(renderer.scene, `bed-${bed.id}-soil`) as unknown as Mesh
    const firstWallsGeometry = firstSolid.geometry as BufferGeometry
    const firstSoilGeometry = firstSoil.geometry as BufferGeometry
    const wallsSpy = vi.spyOn(firstWallsGeometry, 'dispose')
    const soilSpy = vi.spyOn(firstSoilGeometry, 'dispose')

    // a raised-height edit changes the extrusion, so the memo that owns `geometry` has to
    // rebuild it: the previous walls and soil geometry become unreachable at that instant
    useAppStore.getState().upsertBed({ ...bed, raisedHeightM: meters(0.6) })
    await renderer.update(<BedMesh bedId={bed.id} selected={false} />)

    const nextSolid = named(renderer.scene, `bed-${bed.id}-solid`) as unknown as Mesh
    expect(nextSolid.geometry).not.toBe(firstWallsGeometry)
    expect(wallsSpy).toHaveBeenCalledTimes(1)
    expect(soilSpy).toHaveBeenCalledTimes(1)

    // unmounting afterwards disposes the *current* geometry, not the one already freed: the
    // spies on the old, superseded geometry must not see a second call
    await renderer.unmount()
    expect(wallsSpy).toHaveBeenCalledTimes(1)
    expect(soilSpy).toHaveBeenCalledTimes(1)
  })
})
