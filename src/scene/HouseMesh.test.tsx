import ReactThreeTestRenderer from '@react-three/test-renderer'
import { beforeEach, describe, expect, it } from 'bun:test'
import { Ray, Vector3 } from 'three'
import type { Mesh, Object3D } from 'three'
import { makePlot } from '../state/defaults'
import { polygonOf, rectangleRing, vec2 } from '../state/geom'
import { resetAppStore, useAppStore } from '../state/store'
import type { Obstruction } from '../types/garden'
import { obstructionId } from '../types/ids'
import { meters } from '../types/units'
import { HouseMesh } from './HouseMesh'
import { occluderHeightM } from './sceneMath'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

beforeEach(() => resetAppStore())

const named = (root: { instance: Object3D }, name: string): Object3D | null =>
  root.instance.getObjectByName(name) ?? null

const namedAll = (root: { instance: Object3D }, prefix: string): Object3D[] => {
  const hits: Object3D[] = []
  root.instance.traverse((object) => {
    if (object.name.startsWith(prefix)) hits.push(object)
  })
  return hits
}

const houseFixture = (heightM = 6): Obstruction => ({
  id: obstructionId('house-1'),
  kind: 'house',
  label: 'House 1',
  footprint: polygonOf(rectangleRing(vec2(0, 0), 10, 8)),
  heightM: meters(heightM),
})

describe('HouseMesh', () => {
  it('draws the same box the bake shades with, and casts and receives its shadow', async () => {
    const house = houseFixture(6)
    useAppStore.getState().upsertObstruction(house)
    const renderer = await ReactThreeTestRenderer.create(
      <HouseMesh obstructionId={house.id} selected={false} />,
    )
    const solid = named(renderer.scene, `house-${house.id}-solid`) as unknown as Mesh
    expect(solid).not.toBeNull()
    expect(solid.castShadow).toBe(true)
    expect(solid.receiveShadow).toBe(true)
    solid.geometry.computeBoundingBox()
    const box = solid.geometry.boundingBox
    expect((box?.max.z ?? 0) - (box?.min.z ?? 0)).toBeCloseTo(6, 6)
    await renderer.unmount()
  })

  /**
   * A drag across the ground in Move mode carries the house with it and writes the footprint
   * once on release; the same gesture in Select mode is the camera's and moves nothing, exactly
   * the case pinned for a bed in `scene.test.tsx`
   */
  it('moves the footprint by the ground the pointer crosses, in Move mode only', async () => {
    const house = houseFixture(6)
    useAppStore.getState().upsertObstruction(house)
    const press = (x: number, z: number): Record<string, unknown> => ({
      ray: new Ray(new Vector3(x, 10, z), new Vector3(0, -1, 0)),
      pointerId: 1,
      target: { setPointerCapture: () => {}, releasePointerCapture: () => {} },
      stopPropagation: () => {},
    })
    const dragFrom = async (mode: 'select' | 'move'): Promise<Obstruction | undefined> => {
      useAppStore.getState().setMode(mode)
      const renderer = await ReactThreeTestRenderer.create(
        <HouseMesh obstructionId={house.id} selected={false} />,
      )
      const group = renderer.scene.findByProps({ name: `house-${house.id}` })
      await renderer.fireEvent(group, 'pointerDown', press(1, 1))
      await renderer.fireEvent(group, 'pointerMove', press(3, -1))
      await renderer.fireEvent(group, 'pointerUp', press(3, -1))
      await renderer.unmount()
      return useAppStore.getState().plot?.obstructions.find((entry) => entry.id === house.id)
    }
    const looked = await dragFrom('select')
    expect(looked?.footprint.exterior[0]).toEqual(house.footprint.exterior[0])
    const moved = await dragFrom('move')
    // 2 m east and 2 m north: scene z runs south, so a -2 in z is +2 in plot y
    expect(moved?.footprint.exterior[0]?.xM).toBeCloseTo(
      (house.footprint.exterior[0]?.xM ?? 0) + 2,
      6,
    )
    expect(moved?.footprint.exterior[0]?.yM).toBeCloseTo(
      (house.footprint.exterior[0]?.yM ?? 0) + 2,
      6,
    )
    expect(useAppStore.getState().dragging).toBe(false)
  })

  it('shows a corner handle per vertex in Move mode, and none while looking', async () => {
    const house = houseFixture(6)
    useAppStore.getState().upsertObstruction(house)
    useAppStore.getState().setMode('move')
    const renderer = await ReactThreeTestRenderer.create(
      <HouseMesh obstructionId={house.id} selected={false} />,
    )
    expect(namedAll(renderer.scene, 'vertex-handle-').length).toBe(4)
    await renderer.unmount()

    useAppStore.getState().setMode('select')
    const looking = await ReactThreeTestRenderer.create(
      <HouseMesh obstructionId={house.id} selected={false} />,
    )
    expect(namedAll(looking.scene, 'vertex-handle-').length).toBe(0)
    await looking.unmount()
  })
})

describe('occluderHeightM', () => {
  it('reads a drawn house as tall as its own eaves', () => {
    const plot = { ...makePlot(), arrays: [], obstructions: [houseFixture(8)] }
    expect(occluderHeightM(plot)).toBe(8)
  })
})
