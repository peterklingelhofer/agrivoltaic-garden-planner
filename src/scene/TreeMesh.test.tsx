import ReactThreeTestRenderer from '@react-three/test-renderer'
import { beforeEach, describe, expect, it } from 'bun:test'
import { MeshDepthMaterial, RGBADepthPacking, Ray, Vector3 } from 'three'
import type { Mesh, MeshStandardMaterial, Object3D } from 'three'
import { siteFixture } from '../recommend/testkit'
import { leafOnMonthsFor } from '../sim/obstruction'
import { polygonOf, rectangleRing, vec2 } from '../state/geom'
import { ready } from '../state/slices'
import { resetAppStore, useAppStore } from '../state/store'
import type { Obstruction, Tree } from '../types/garden'
import { obstructionId } from '../types/ids'
import { epochMillis, fraction, meters, type EpochMillis } from '../types/units'
import { HOURS_PER_TMY, type TmySeries } from '../types/weather'
import { TreeMesh } from './TreeMesh'

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

/**
 * A synthetic typical year with a real annual and diurnal temperature cycle at the site
 * fixture's latitude (42.37), warm enough in summer and cold enough in winter that the Growing
 * Season Index (`src/sim/phenology.ts`) puts July in leaf and January bare, the same shape
 * `src/sim/phenology.test.ts` builds its temperate-north case from
 */
const weatherFixture = (): TmySeries => {
  const hours = HOURS_PER_TMY
  const start = Date.UTC(2024, 0, 1)
  const utcMillis = new Float64Array(hours)
  const dryBulbC = new Float32Array(hours)
  const dewPointC = new Float32Array(hours)
  for (let i = 0; i < hours; i += 1) {
    utcMillis[i] = start + i * 3_600_000
    const dayOfYear = Math.floor(i / 24)
    const hourOfDay = i % 24
    // the warmest day lags the solstice by about a month, as it does over land
    const annual = 8.5 + 13.5 * Math.cos((2 * Math.PI * (dayOfYear - 202)) / 365)
    const diurnal = 2.5 * Math.sin((2 * Math.PI * (hourOfDay - 6)) / 24)
    const temperature = annual + diurnal
    dryBulbC[i] = temperature
    dewPointC[i] = temperature - 3
  }
  return {
    source: 'open-meteo',
    decomposition: 'passthrough',
    utcOffsetHours: -5,
    startUtcMillis: start as EpochMillis,
    utcMillis,
    ghiWM2: new Float32Array(hours),
    dniWM2: new Float32Array(hours),
    dhiWM2: new Float32Array(hours),
    dryBulbC,
    dewPointC,
    windSpeedMS: new Float32Array(hours),
    pressureMb: new Float32Array(hours).fill(1013.25),
    provenance: {
      datasetLabel: 'synthetic-tmy',
      yearsCovered: [2024],
      licence: 'CC0',
      attribution: 'test',
      retrievedUtcMillis: start as EpochMillis,
      isTypicalMeteorologicalYear: true,
    },
  }
}

const treeFixture = (overrides: Partial<Tree> = {}): Tree => ({
  id: obstructionId('tree-1'),
  kind: 'tree',
  label: 'Tree 1',
  footprint: polygonOf(rectangleRing(vec2(0, 0), 4, 4)),
  crownBaseM: meters(2),
  heightM: meters(6),
  evergreen: true,
  transmittance: fraction(0.2),
  leaflessTransmittance: fraction(0.6),
  ...overrides,
})

describe('TreeMesh', () => {
  it('draws a trunk to crownBaseM and a crown from crownBaseM to heightM, casting its shadow', async () => {
    const tree = treeFixture()
    useAppStore.getState().upsertObstruction(tree)
    const renderer = await ReactThreeTestRenderer.create(
      <TreeMesh obstructionId={tree.id} selected={false} />,
    )
    const trunk = named(renderer.scene, `tree-${tree.id}-trunk`) as unknown as Mesh
    const crown = named(renderer.scene, `tree-${tree.id}-crown`) as unknown as Mesh
    expect(trunk).not.toBeNull()
    expect(crown).not.toBeNull()
    expect(trunk.castShadow).toBe(true)
    expect(crown.castShadow).toBe(true)
    expect(crown.receiveShadow).toBe(true)
    crown.geometry.computeBoundingBox()
    const box = crown.geometry.boundingBox
    // local z is scene y once the crown is rotated flat, the same axis `HouseMesh.test.tsx` reads
    expect(box?.min.z).toBeCloseTo(2, 6)
    expect(box?.max.z).toBeCloseTo(6, 6)
    await renderer.unmount()
  })

  /** A shadow map cannot draw partial density itself, so the crown carries its own depth pass */
  it('gives the crown a punch-through depth material for its stippled shadow', async () => {
    const tree = treeFixture()
    useAppStore.getState().upsertObstruction(tree)
    const renderer = await ReactThreeTestRenderer.create(
      <TreeMesh obstructionId={tree.id} selected={false} />,
    )
    const crown = named(renderer.scene, `tree-${tree.id}-crown`) as unknown as Mesh
    const depthMaterial = crown.customDepthMaterial as MeshDepthMaterial
    expect(depthMaterial).toBeInstanceOf(MeshDepthMaterial)
    expect(depthMaterial.depthPacking).toBe(RGBADepthPacking)
    expect(depthMaterial.alphaTest).toBeCloseTo(0.5, 6)
    expect(depthMaterial.alphaMap).not.toBeNull()
    await renderer.unmount()
  })

  it('reads the crown at 1 minus its transmittance when evergreen', async () => {
    const tree = treeFixture({ evergreen: true, transmittance: fraction(0.2) })
    useAppStore.getState().upsertObstruction(tree)
    const renderer = await ReactThreeTestRenderer.create(
      <TreeMesh obstructionId={tree.id} selected={false} />,
    )
    const crown = named(renderer.scene, `tree-${tree.id}-crown`) as unknown as Mesh
    const material = crown.material as MeshStandardMaterial
    expect(material.transparent).toBe(true)
    expect(material.opacity).toBeCloseTo(0.8, 6)
    await renderer.unmount()
  })

  /**
   * A deciduous crown's opacity is not fixed: it follows whichever months `leafOnMonthsFor` puts
   * in leaf for the standing site and weather, the same rule the bake applies (Decision Record
   * 26). The expected months are computed explicitly from that function, so this stays
   * true whatever the fixture's weather happens to say
   */
  it('takes the in-leaf transmittance in a month the site is in leaf, and the leafless one otherwise', async () => {
    const site = siteFixture()
    const weather = weatherFixture()
    const months = leafOnMonthsFor(site, weather)
    useAppStore.setState({ site: ready(site), weather: ready(weather) })
    const tree = treeFixture({
      evergreen: false,
      transmittance: fraction(0.2),
      leaflessTransmittance: fraction(0.6),
    })
    useAppStore.getState().upsertObstruction(tree)

    const opacityAt = async (atUtcMillis: EpochMillis): Promise<number> => {
      useAppStore.getState().setTime(atUtcMillis)
      const renderer = await ReactThreeTestRenderer.create(
        <TreeMesh obstructionId={tree.id} selected={false} />,
      )
      const crown = named(renderer.scene, `tree-${tree.id}-crown`) as unknown as Mesh
      const opacity = (crown.material as MeshStandardMaterial).opacity
      await renderer.unmount()
      return opacity
    }

    const JULY = epochMillis(Date.UTC(2024, 6, 15, 16, 0, 0))
    const JANUARY = epochMillis(Date.UTC(2024, 0, 15, 16, 0, 0))
    const expectedOpacity = (monthIndex: number): number =>
      1 - (months[monthIndex] ? tree.transmittance : tree.leaflessTransmittance)

    expect(await opacityAt(JULY)).toBeCloseTo(expectedOpacity(6), 6)
    expect(await opacityAt(JANUARY)).toBeCloseTo(expectedOpacity(0), 6)
  })

  /**
   * A drag across the ground in Move mode carries the tree with it and writes the footprint
   * once on release; the same gesture in Select mode is the camera's and moves nothing, the same
   * case `HouseMesh.test.tsx` pins for a house
   */
  it('moves the footprint by the ground the pointer crosses, in Move mode only', async () => {
    const tree = treeFixture()
    useAppStore.getState().upsertObstruction(tree)
    const press = (x: number, z: number): Record<string, unknown> => ({
      ray: new Ray(new Vector3(x, 10, z), new Vector3(0, -1, 0)),
      pointerId: 1,
      target: { setPointerCapture: () => {}, releasePointerCapture: () => {} },
      stopPropagation: () => {},
    })
    const dragFrom = async (mode: 'select' | 'move'): Promise<Obstruction | undefined> => {
      useAppStore.getState().setMode(mode)
      const renderer = await ReactThreeTestRenderer.create(
        <TreeMesh obstructionId={tree.id} selected={false} />,
      )
      const group = renderer.scene.findByProps({ name: `tree-${tree.id}` })
      await renderer.fireEvent(group, 'pointerDown', press(1, 1))
      await renderer.fireEvent(group, 'pointerMove', press(3, -1))
      await renderer.fireEvent(group, 'pointerUp', press(3, -1))
      await renderer.unmount()
      return useAppStore.getState().plot?.obstructions.find((entry) => entry.id === tree.id)
    }
    const looked = await dragFrom('select')
    expect(looked?.footprint.exterior[0]).toEqual(tree.footprint.exterior[0])
    const moved = await dragFrom('move')
    // 2 m east and 2 m north: scene z runs south, so a -2 in z is +2 in plot y
    expect(moved?.footprint.exterior[0]?.xM).toBeCloseTo(
      (tree.footprint.exterior[0]?.xM ?? 0) + 2,
      6,
    )
    expect(moved?.footprint.exterior[0]?.yM).toBeCloseTo(
      (tree.footprint.exterior[0]?.yM ?? 0) + 2,
      6,
    )
    expect(useAppStore.getState().dragging).toBe(false)
  })

  it('shows a corner handle per vertex in Move mode, and none while looking', async () => {
    const tree = treeFixture()
    useAppStore.getState().upsertObstruction(tree)
    useAppStore.getState().setMode('move')
    const renderer = await ReactThreeTestRenderer.create(
      <TreeMesh obstructionId={tree.id} selected={false} />,
    )
    expect(namedAll(renderer.scene, 'vertex-handle-').length).toBe(4)
    await renderer.unmount()

    useAppStore.getState().setMode('select')
    const looking = await ReactThreeTestRenderer.create(
      <TreeMesh obstructionId={tree.id} selected={false} />,
    )
    expect(namedAll(looking.scene, 'vertex-handle-').length).toBe(0)
    await looking.unmount()
  })
})
