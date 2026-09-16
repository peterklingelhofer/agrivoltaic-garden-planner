import ReactThreeTestRenderer from '@react-three/test-renderer'
import { StrictMode } from 'react'
import { beforeEach, describe, expect, it } from 'bun:test'
import { BackSide, FrontSide, Matrix4, PerspectiveCamera, Ray, Vector2, Vector3 } from 'three'
import type {
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  ShaderMaterial,
} from 'three'
import { siteFixture } from '../recommend/testkit'
import { makeArray, makeBed } from '../state/defaults'
import { polygonOf, rectangleRing, vec2 } from '../state/geom'
import { ready } from '../state/slices'
import { resetAppStore, useAppStore } from '../state/store'
import { sunVector } from '../state/sun'
import type { Bed } from '../types/garden'
import { bedId, cropId, plantingId } from '../types/ids'
import type { DliRaster } from '../types/light'
import {
  degrees,
  epochMillis,
  meters,
  type ByMonth,
  type Celsius,
  type EpochMillis,
  type Millimeters,
} from '../types/units'
import { BedMesh } from './BedMesh'
import { DliOverlay } from './DliOverlay'
import { Ground } from './Ground'
import { fieldUv } from './overlayMaterial'
import { sceneLabel } from './scene-label'
import { CanvasLabel } from './SceneCanvas'
import { PlantInstances } from './PlantInstances'
import { PlotBoundary } from './PlotBoundary'
import { PvArrayMesh } from './PvArrayMesh'
import { RenderPipeline } from './RenderPipeline'
import { SkyLight } from './SkyLight'
import { SunRig } from './SunRig'
import { cascadeShadowRadius, keyLight, penumbraWidthM, SKY } from './lighting'
import { qualityFor } from './quality'
import { moduleQuaternion } from './sceneMath'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const named = (root: { instance: Object3D }, name: string): Object3D | null =>
  root.instance.getObjectByName(name) ?? null

const namedAll = (root: { instance: Object3D }, prefix: string): Object3D[] => {
  const hits: Object3D[] = []
  root.instance.traverse((object) => {
    if (object.name.startsWith(prefix)) hits.push(object)
  })
  return hits
}

beforeEach(() => resetAppStore())

/** A 2x2 field peaking at 8 mol/m2/d, which `contourStep` divides into intervals of 1 */
const rasterFixture = (): DliRaster => {
  const values = new Float32Array([2, 4, 6, 8])
  const byMonth = Array.from({ length: 12 }, () => values) as unknown as ByMonth<Float32Array>
  return {
    grid: {
      extent: { minXM: meters(0), minYM: meters(0), maxXM: meters(2), maxYM: meters(2) },
      cellSizeM: meters(1),
      cols: 2,
      rows: 2,
    },
    skyViewFactor: values,
    annualUnderArrayMolM2Day: values,
    annualOpenSkyMolM2Day: values,
    monthlyUnderArrayMolM2Day: byMonth,
    monthlyOpenSkyMolM2Day: byMonth,
    windows: [],
    quality: {} as DliRaster['quality'],
  }
}

const NOON = epochMillis(Date.UTC(2024, 5, 21, 16, 0, 0))
const HIGH = qualityFor('high')
const LOW = qualityFor('low')

describe('SunRig', () => {
  it('places the key light along the sun vector and reports its source', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <SunRig atUtcMillis={NOON} castShadows={false} quality={HIGH} />,
    )
    const rig = named(renderer.scene, 'sun-rig')
    const key = named(renderer.scene, 'sun-key')
    expect(rig).not.toBeNull()
    expect(key).not.toBeNull()
    const elevation = Number(rig?.userData.elevationDeg)
    const azimuth = Number(rig?.userData.azimuthDeg)
    const [x, y, z] = sunVector(elevation, azimuth)
    expect(key?.position.x).toBeCloseTo(x * 60, 4)
    expect(key?.position.y).toBeCloseTo(Math.max(y, 0.02) * 60, 4)
    expect(key?.position.z).toBeCloseTo(z * 60, 4)
    expect(typeof rig?.userData.sunSource).toBe('string')
    await renderer.unmount()
  })

  it('carries the beam radiometry of the sky model itself, colour and all', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <SunRig atUtcMillis={NOON} castShadows={false} quality={HIGH} />,
    )
    const rig = named(renderer.scene, 'sun-rig')
    const key = named(renderer.scene, 'sun-key') as DirectionalLight | null
    const expected = keyLight(Number(rig?.userData.elevationDeg))
    expect(Number(rig?.userData.intensity)).toBeCloseTo(expected.intensity, 8)
    expect(key?.intensity).toBeCloseTo(expected.intensity, 8)
    expect(key?.color.r).toBeCloseTo(expected.colour[0], 6)
    expect(key?.color.g).toBeCloseTo(expected.colour[1], 6)
    expect(key?.color.b).toBeCloseTo(expected.colour[2], 6)
    await renderer.unmount()
  })

  it('has no ambient or hemisphere fill: the sky IBL is the whole ambient term', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <SunRig atUtcMillis={NOON} castShadows={false} quality={HIGH} />,
    )
    let fills = 0
    renderer.scene.instance.traverse((object) => {
      const light = object as AmbientLight & HemisphereLight
      if (light.isAmbientLight || light.isHemisphereLight) fills += 1
    })
    expect(fills).toBe(0)
    await renderer.unmount()
  })

  it('softens the fallback shadow to the penumbra the tallest occluder casts', async () => {
    useAppStore.getState().upsertArray(makeArray(1))
    const renderer = await ReactThreeTestRenderer.create(
      <SunRig atUtcMillis={NOON} castShadows quality={HIGH} />,
    )
    const rig = named(renderer.scene, 'sun-rig')
    const key = named(renderer.scene, 'sun-key') as DirectionalLight | null
    const heightM = Math.max(
      2.5,
      ...(useAppStore.getState().plot?.arrays.map((a) => a.derived.maxHeightM) ?? []),
    )
    const penumbraM = penumbraWidthM(heightM, Number(rig?.userData.elevationDeg))
    expect(Number(rig?.userData.penumbraM)).toBeCloseTo(penumbraM, 10)
    expect(key?.shadow.radius).toBeCloseTo(
      cascadeShadowRadius(80, HIGH.shadowMapSize, penumbraM),
      8,
    )
    await renderer.unmount()
  })

  /**
   * The cascade lights are added to the scene by the CSM constructor, so building it in a
   * `useMemo` put two full sets in the scene under StrictMode and disposed only one. Eight
   * directional shadow maps took the fragment shader past MAX_TEXTURE_IMAGE_UNITS, which is 16
   * on Apple Silicon, so every MeshStandardMaterial failed to link and the garden showed one
   * frame and then bare ground. Counting the lights is the cheap check that catches it
   */
  it('adds one set of cascade lights, even when React renders the rig twice', async () => {
    const directionalLights = (root: { instance: Object3D }): number => {
      let count = 0
      root.instance.traverse((object) => {
        if ((object as DirectionalLight).isDirectionalLight) count += 1
      })
      return count
    }

    const plain = await ReactThreeTestRenderer.create(
      <SunRig atUtcMillis={NOON} castShadows quality={HIGH} />,
    )
    const once = directionalLights(plain.scene)
    await plain.unmount()

    const strict = await ReactThreeTestRenderer.create(
      <StrictMode>
        <SunRig atUtcMillis={NOON} castShadows quality={HIGH} />
      </StrictMode>,
    )
    expect(directionalLights(strict.scene)).toBe(once)
    // the fallback key light plus one light per cascade, and nothing left over
    expect(once).toBeLessThanOrEqual(HIGH.cascades + 1)
    await strict.unmount()
  })

  it('takes the reduced settings on the low tier', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <SunRig atUtcMillis={NOON} castShadows quality={LOW} />,
    )
    const rig = named(renderer.scene, 'sun-rig')
    const key = named(renderer.scene, 'sun-key') as DirectionalLight | null
    expect(rig?.userData.tier).toBe('low')
    expect(key?.shadow.mapSize.width).toBe(LOW.shadowMapSize)
    expect(LOW.shadowMapSize).toBeLessThan(HIGH.shadowMapSize)
    await renderer.unmount()
  })
})

describe('SkyLight', () => {
  it('points the sky at the one sun vector the rig and the simulation read', async () => {
    const sky = await ReactThreeTestRenderer.create(<SkyLight atUtcMillis={NOON} quality={HIGH} />)
    const rig = await ReactThreeTestRenderer.create(
      <SunRig atUtcMillis={NOON} castShadows={false} quality={HIGH} />,
    )
    const dome = named(sky.scene, 'sky-dome') as Mesh | null
    const material = dome?.material as ShaderMaterial | undefined
    const position = material?.uniforms.sunPosition?.value as Vector3 | undefined
    const rigUserData = named(rig.scene, 'sun-rig')?.userData
    const [x, y, z] = sunVector(Number(rigUserData?.elevationDeg), Number(rigUserData?.azimuthDeg))
    expect(position?.x).toBeCloseTo(x, 10)
    expect(position?.y).toBeCloseTo(y, 10)
    expect(position?.z).toBeCloseTo(z, 10)
    await sky.unmount()
    await rig.unmount()
  })

  it('runs the Preetham model the radiometry was derived from, with no clouds', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <SkyLight atUtcMillis={NOON} quality={HIGH} />,
    )
    const dome = named(renderer.scene, 'sky-dome') as Mesh | null
    const uniforms = (dome?.material as ShaderMaterial | undefined)?.uniforms
    expect(uniforms?.turbidity?.value).toBe(SKY.turbidity)
    expect(uniforms?.rayleigh?.value).toBe(SKY.rayleigh)
    expect(uniforms?.mieCoefficient?.value).toBe(SKY.mieCoefficient)
    // procedural clouds would shade nothing and reach no model
    expect(uniforms?.cloudCoverage?.value).toBe(0)
    expect(uniforms?.showSunDisc?.value).toBe(1)
    await renderer.unmount()
  })
})

describe('Ground', () => {
  it('lies flat at the origin', async () => {
    const renderer = await ReactThreeTestRenderer.create(<Ground />)
    const ground = named(renderer.scene, 'ground')
    expect(ground?.rotation.x).toBeCloseTo(-Math.PI / 2, 6)
    expect(ground?.position.y).toBeCloseTo(0, 6)
    await renderer.unmount()
  })

  /**
   * The last link in the winter-ground chain, and the one nothing covered: the cover the site's
   * normals produce has to reach the surface the camera sees. Compared at ONE day against a site
   * with no normals rather than across two seasons, because January and June differ in sun
   * elevation far more than in albedo and a pixel that is darker in January proves nothing
   */
  it('takes its brightness from the snow the site normals put on it', async () => {
    const AMHERST_TEMP_C = [-3.9, -2.8, 1.5, 8, 14.2, 19.4, 22.5, 21.5, 17.5, 10.9, 4.9, -0.5]
    const AMHERST_PRECIP_MM = [
      86.3, 76.5, 100, 94.5, 81.7, 90.3, 82.1, 88.3, 98.5, 110.9, 83.7, 105.5,
    ]
    const JANUARY = epochMillis(Date.UTC(2024, 0, 15, 16, 0, 0))

    useAppStore.getState().setTime(JANUARY)
    const bare = await ReactThreeTestRenderer.create(<Ground />)
    const bareAlbedo = Number(named(bare.scene, 'ground')?.userData.renderedAlbedo)
    expect(Number(named(bare.scene, 'ground')?.userData.snowCover)).toBe(0)
    await bare.unmount()

    useAppStore.setState({
      site: ready(
        siteFixture({
          normals: {
            ...siteFixture().normals,
            monthlyMeanTempC: AMHERST_TEMP_C.map((value) => value as Celsius),
            monthlyPrecipMm: AMHERST_PRECIP_MM.map((value) => value as Millimeters),
          },
        }),
      ),
    })
    const snowy = await ReactThreeTestRenderer.create(<Ground />)
    const ground = named(snowy.scene, 'ground')
    expect(Number(ground?.userData.snowCover)).toBeGreaterThan(0.9)
    expect(Number(ground?.userData.renderedAlbedo)).toBeGreaterThan(bareAlbedo)
    await snowy.unmount()
  })
})

/**
 * Finishing a shape on the canvas it is being drawn on.
 *
 * A double-click closes the shape, the gesture every drawing tool has. What is pinned here is its
 * awkward half, which is that a double-click is TWO click cycles and has therefore already pushed
 * the last corner twice through `onPointerDown` by the time the double-click handler runs
 */
/**
 * Why anything in this scene can be moved at all.
 *
 * `TransformControls` and the vertex spheres draw themselves outside r3f, so r3f's raycast goes
 * straight THROUGH them to whatever is behind, which for the gizmo is almost always the ground.
 * A browser probe caught the order: `Ground`'s `onPointerDown` fired FIRST and cleared the
 * selection, `Gizmo` lost its target and unmounted in the same tick it had grabbed the axis, and
 * so no drag ever moved anything. Fifty-five attempts across the gizmo moved a bed zero times.
 *
 * `dragging` is set from HOVER rather than from the press, because by the time the gizmo raises
 * its own `mouseDown` the ground has already deselected. What is pinned here is that the
 * selection handlers ask
 */
describe('a press that belongs to a handle is not a press on the scene', () => {
  const press = { point: { x: 1, y: 0, z: 1 }, stopPropagation: () => {} }

  it('leaves the selection alone when the ground is pressed during a drag', async () => {
    resetAppStore()
    const bed = makeBed(1, { footprint: polygonOf(rectangleRing(vec2(0, 0), 4, 2)) })
    useAppStore.getState().upsertBed(bed)
    useAppStore.getState().selectBed(bed.id)
    useAppStore.getState().setDragging(true)
    const renderer = await ReactThreeTestRenderer.create(<Ground />)
    await renderer.fireEvent(renderer.scene.findByProps({ name: 'ground' }), 'pointerDown', press)
    expect(useAppStore.getState().selectedBedId).toBe(bed.id)
    await renderer.unmount()
  })

  it('still clears the selection on an ordinary press on bare ground', async () => {
    resetAppStore()
    const bed = makeBed(1, { footprint: polygonOf(rectangleRing(vec2(0, 0), 4, 2)) })
    useAppStore.getState().upsertBed(bed)
    useAppStore.getState().selectBed(bed.id)
    useAppStore.getState().setDragging(false)
    const renderer = await ReactThreeTestRenderer.create(<Ground />)
    await renderer.fireEvent(renderer.scene.findByProps({ name: 'ground' }), 'pointerDown', press)
    expect(useAppStore.getState().selectedBedId).toBeNull()
    await renderer.unmount()
  })

  it('does not let a bed under a drag steal the selection from the bed being moved', async () => {
    resetAppStore()
    const moving = makeBed(1, { footprint: polygonOf(rectangleRing(vec2(0, 0), 4, 2)) })
    const under = makeBed(2, { footprint: polygonOf(rectangleRing(vec2(6, 0), 4, 2)) })
    useAppStore.getState().upsertBed(moving)
    useAppStore.getState().upsertBed(under)
    useAppStore.getState().selectBed(moving.id)
    useAppStore.getState().setDragging(true)
    const renderer = await ReactThreeTestRenderer.create(
      <BedMesh bedId={under.id} selected={false} />,
    )
    await renderer.fireEvent(
      renderer.scene.findByProps({ name: `bed-${under.id}` }),
      'click',
      press,
    )
    expect(useAppStore.getState().selectedBedId).toBe(moving.id)
    await renderer.unmount()
  })
})

describe('a touch tap that misses a bed by a finger width still selects it', () => {
  // straight over the plot at 50 m, so a plan-metre miss becomes a screen-pixel one
  const planCamera = new PerspectiveCamera(45, 375 / 812, 0.1, 1000)
  planCamera.position.set(0, 50, 0)
  planCamera.lookAt(0, 0, 0)
  planCamera.updateMatrixWorld()
  planCamera.updateProjectionMatrix()

  const press = (x: number, z: number, pointerType: string): Record<string, unknown> => {
    const ndc = new Vector3(x, 0, z).project(planCamera)
    return {
      point: new Vector3(x, 0, z),
      pointer: new Vector2(ndc.x, ndc.y),
      camera: planCamera,
      nativeEvent: { pointerType },
      stopPropagation: () => {},
    }
  }

  // `resetAppStore` seeds the cold-open example garden, so the nearest-bed search needs the
  // beds under test standing alone, or a bed from the example could be the closer one
  const withBeds = (beds: readonly Bed[]): void => {
    useAppStore.setState((s) => (s.plot === null ? {} : { plot: { ...s.plot, beds } }))
  }

  it('selects the bed for a finger tap 0.3 m outside its edge', async () => {
    resetAppStore()
    const bed = makeBed(1, { footprint: polygonOf(rectangleRing(vec2(0, 0), 4, 2)) })
    withBeds([bed])
    const renderer = await ReactThreeTestRenderer.create(<Ground />, { width: 375, height: 812 })
    const ground = renderer.scene.findByProps({ name: 'ground' })
    // looking straight down from 50 m, a metre is about 19.6 px; 0.3 m past the east edge is
    // about 6 px, well inside the 24 px tolerance
    await renderer.fireEvent(ground, 'pointerDown', press(2.3, 0, 'touch'))
    expect(useAppStore.getState().selectedBedId).toBe(bed.id)
    await renderer.unmount()
  })

  it('leaves a mouse press at the same spot clearing the selection', async () => {
    resetAppStore()
    const bed = makeBed(1, { footprint: polygonOf(rectangleRing(vec2(0, 0), 4, 2)) })
    withBeds([bed])
    useAppStore.getState().selectBed(bed.id)
    const renderer = await ReactThreeTestRenderer.create(<Ground />, { width: 375, height: 812 })
    const ground = renderer.scene.findByProps({ name: 'ground' })
    await renderer.fireEvent(ground, 'pointerDown', press(2.3, 0, 'mouse'))
    expect(useAppStore.getState().selectedBedId).toBeNull()
    await renderer.unmount()
  })

  it('leaves a touch press 5 m from any bed clearing the selection', async () => {
    resetAppStore()
    const bed = makeBed(1, { footprint: polygonOf(rectangleRing(vec2(0, 0), 4, 2)) })
    withBeds([bed])
    useAppStore.getState().selectBed(bed.id)
    const renderer = await ReactThreeTestRenderer.create(<Ground />, { width: 375, height: 812 })
    const ground = renderer.scene.findByProps({ name: 'ground' })
    // 5 m away is about 98 px on screen, well past the 24 px tolerance
    await renderer.fireEvent(ground, 'pointerDown', press(7, 0, 'touch'))
    expect(useAppStore.getState().selectedBedId).toBeNull()
    await renderer.unmount()
  })

  it('selects the bed under a tap aimed at its own floating label', async () => {
    resetAppStore()
    const near = makeBed(1, {
      footprint: polygonOf(rectangleRing(vec2(0, 0), 4, 2)),
      raisedHeightM: meters(0.3),
    })
    const beyond = makeBed(2, { footprint: polygonOf(rectangleRing(vec2(0, 3), 4, 2)) })
    withBeds([near, beyond])
    const camera = new PerspectiveCamera(45, 375 / 812, 0.1, 1000)
    camera.position.set(0, 12, 14)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    camera.updateProjectionMatrix()
    // the tap is aimed at the label floating 0.9 m over the near bed's 0.3 m top; the label
    // takes no press of its own, so the same ray measured in plot metres would land on the
    // ground beyond the near bed, inside the second bed's own footprint
    const ndc = new Vector3(0, 0.9 + 0.3, 0).project(camera)
    const renderer = await ReactThreeTestRenderer.create(<Ground />, { width: 375, height: 812 })
    const ground = renderer.scene.findByProps({ name: 'ground' })
    await renderer.fireEvent(ground, 'pointerDown', {
      point: new Vector3(0, 0, -1.3),
      pointer: new Vector2(ndc.x, ndc.y),
      camera,
      nativeEvent: { pointerType: 'touch' },
      stopPropagation: () => {},
    })
    expect(useAppStore.getState().selectedBedId).toBe(near.id)
    await renderer.unmount()
  })
})

describe('closing a drawn shape by double-clicking it', () => {
  const corner = (x: number, z: number): Record<string, unknown> => ({
    point: { x, y: 0, z },
    stopPropagation: () => {},
  })

  it('raises a bed with the corners that were clicked, not one more', async () => {
    resetAppStore()
    useAppStore.getState().setMode('draw-bed')
    const renderer = await ReactThreeTestRenderer.create(<Ground />)
    const ground = renderer.scene.findByProps({ name: 'ground' })
    const before = useAppStore.getState().plot?.beds.length ?? 0

    for (const [x, z] of [
      [0, 0],
      [4, 0],
      [4, 3],
    ]) {
      await renderer.fireEvent(ground, 'pointerDown', corner(x ?? 0, z ?? 0))
    }
    // the fourth corner, clicked twice, which is what a double-click is
    await renderer.fireEvent(ground, 'pointerDown', corner(0, 3))
    await renderer.fireEvent(ground, 'pointerDown', corner(0, 3))
    expect(useAppStore.getState().draft).toHaveLength(5)

    await renderer.fireEvent(ground, 'doubleClick', corner(0, 3))
    const after = useAppStore.getState()
    expect(after.plot?.beds.length).toBe(before + 1)
    // four corners went in and four came out: the duplicate the gesture itself created is
    // dropped, rather than raising a bed with a zero-length edge in it
    expect(after.plot?.beds.at(-1)?.footprint.exterior).toHaveLength(4)
    expect(after.draft).toHaveLength(0)
    expect(after.mode).toBe('select')
    await renderer.unmount()
  })

  it('does nothing at all in select mode, where a double-click is not a gesture', async () => {
    resetAppStore()
    const renderer = await ReactThreeTestRenderer.create(<Ground />)
    const ground = renderer.scene.findByProps({ name: 'ground' })
    const before = useAppStore.getState().plot?.beds.length ?? 0
    await renderer.fireEvent(ground, 'doubleClick', corner(0, 0))
    expect(useAppStore.getState().plot?.beds.length).toBe(before)
    await renderer.unmount()
  })
})

describe('PvArrayMesh', () => {
  it('derives GCR live and orients modules to the surface azimuth', async () => {
    const array = makeArray(1)
    useAppStore.getState().upsertArray(array)
    const renderer = await ReactThreeTestRenderer.create(
      <PvArrayMesh arrayId={array.id} showTrackerRotation={false} />,
    )
    const group = named(renderer.scene, `array-${array.id}`)
    expect(group).not.toBeNull()
    expect(Number(group?.userData.gcr)).toBeCloseTo(
      array.geometry.collectorWidthM / array.geometry.pitchM,
      6,
    )
    expect(Number(group?.userData.tiltDeg)).toBeCloseTo(25, 6)
    expect(Number(group?.userData.surfaceAzimuthDeg)).toBeCloseTo(180, 6)
    expect(named(renderer.scene, `array-${array.id}-frames`)).not.toBeNull()
    expect(named(renderer.scene, `array-${array.id}-laminates`)).not.toBeNull()
    await renderer.unmount()
  })

  /**
   * A module has a back. The laminate is a zero-thickness plane drawn front side only, so from
   * underneath an array the glass was culled and the ground showed through the frame: the picture
   * said light passes through a module. The back faces are their own instance set over the same
   * plane, at the rear reflectance the module itself carries, and the glass in front is untouched
   */
  it('closes the back of every module without touching the glass in front', async () => {
    const array = makeArray(1)
    useAppStore.getState().upsertArray(array)
    const renderer = await ReactThreeTestRenderer.create(
      <PvArrayMesh arrayId={array.id} showTrackerRotation={false} />,
    )
    const backs = named(renderer.scene, `array-${array.id}-backsheets`) as InstancedMesh | null
    const fronts = named(renderer.scene, `array-${array.id}-laminates`) as InstancedMesh | null
    const back = backs?.material as MeshStandardMaterial
    const front = fronts?.material as MeshStandardMaterial
    expect(back.side).toBe(BackSide)
    // opaque: the defect was seeing the ground through a module, and it is not fixed by a fill
    expect(back.transparent).toBe(false)
    expect(back.opacity).toBe(1)
    // the reflectance the bifacial chain reads, not a colour picked to look right
    for (const channel of [back.color.r, back.color.g, back.color.b]) {
      expect(channel).toBeCloseTo(array.module.rearReflectance, 6)
    }
    // the same plane the glass is on, so the two can never be different modules
    expect(backs?.geometry).toBe(fronts?.geometry)
    // and it casts nothing: the laminate already casts the whole module through its `shadowSide`
    expect(backs?.castShadow).toBe(false)
    expect(front.side).toBe(FrontSide)
    await renderer.unmount()
  })

  it('rebuilds GCR when the pitch changes', async () => {
    const array = makeArray(1)
    useAppStore.getState().upsertArray({
      ...array,
      geometry: { ...array.geometry, pitchM: meters(6) },
    })
    const renderer = await ReactThreeTestRenderer.create(
      <PvArrayMesh arrayId={array.id} showTrackerRotation={false} />,
    )
    const group = named(renderer.scene, `array-${array.id}`)
    expect(Number(group?.userData.gcr)).toBeCloseTo(array.geometry.collectorWidthM / 6, 6)
    await renderer.unmount()
  })
})

describe('moduleQuaternion', () => {
  it('leaves a south facing panel unyawed', () => {
    const [x, y, z, w] = moduleQuaternion(0, 180)
    expect(y).toBeCloseTo(0, 6)
    expect(z).toBeCloseTo(0, 6)
    expect(x).toBeCloseTo(Math.sin(-Math.PI / 4), 6)
    expect(w).toBeCloseTo(Math.cos(-Math.PI / 4), 6)
  })
})

describe('BedMesh', () => {
  /**
   * A drag across the ground in Move mode carries the bed with it and writes the footprint
   * once on release; the same gesture in Select mode is the camera's and moves nothing
   */
  it('moves the bed by the ground the pointer crosses, in Move mode only', async () => {
    resetAppStore()
    const bed = makeBed(1, { footprint: polygonOf(rectangleRing(vec2(0, 0), 4, 2)) })
    useAppStore.getState().upsertBed(bed)
    const press = (x: number, z: number): Record<string, unknown> => ({
      ray: new Ray(new Vector3(x, 10, z), new Vector3(0, -1, 0)),
      pointerId: 1,
      target: { setPointerCapture: () => {}, releasePointerCapture: () => {} },
      stopPropagation: () => {},
    })
    const dragFrom = async (mode: 'select' | 'move'): Promise<Bed | undefined> => {
      useAppStore.getState().setMode(mode)
      const renderer = await ReactThreeTestRenderer.create(
        <BedMesh bedId={bed.id} selected={false} />,
      )
      const group = renderer.scene.findByProps({ name: `bed-${bed.id}` })
      await renderer.fireEvent(group, 'pointerDown', press(1, 1))
      await renderer.fireEvent(group, 'pointerMove', press(3, -1))
      await renderer.fireEvent(group, 'pointerUp', press(3, -1))
      await renderer.unmount()
      return useAppStore.getState().plot?.beds.find((entry) => entry.id === bed.id)
    }
    const looked = await dragFrom('select')
    expect(looked?.footprint.exterior[0]).toEqual(bed.footprint.exterior[0])
    const moved = await dragFrom('move')
    // 2 m east and 2 m north: scene z runs south, so a -2 in z is +2 in plot y
    expect(moved?.footprint.exterior[0]?.xM).toBeCloseTo(
      (bed.footprint.exterior[0]?.xM ?? 0) + 2,
      6,
    )
    expect(moved?.footprint.exterior[0]?.yM).toBeCloseTo(
      (bed.footprint.exterior[0]?.yM ?? 0) + 2,
      6,
    )
    expect(useAppStore.getState().dragging).toBe(false)
  })

  it('extrudes the footprint and lays it flat', async () => {
    const bed = makeBed(1, { footprint: polygonOf(rectangleRing(vec2(0, 0), 4, 2)) })
    useAppStore.getState().upsertBed(bed)
    const renderer = await ReactThreeTestRenderer.create(
      <BedMesh bedId={bed.id} selected={false} />,
    )
    const solid = named(renderer.scene, `bed-${bed.id}-solid`)
    expect(solid?.rotation.x).toBeCloseTo(-Math.PI / 2, 6)
    expect(Number(named(renderer.scene, `bed-${bed.id}`)?.userData.areaM2)).toBeCloseTo(8, 6)
    await renderer.unmount()
  })
})

describe('PlantInstances', () => {
  const plantedBed = (): Bed =>
    makeBed(2, {
      id: bedId('bed-planted'),
      footprint: polygonOf(rectangleRing(vec2(0, 0), 4, 2)),
      plantings: [
        {
          id: plantingId('planting-1'),
          bedId: bedId('bed-planted'),
          cropId: cropId('lactuca-sativa'),
          cultivarId: null,
          role: 'target-crop',
          tier: 'herb-ground',
          sowDay: 100 as never,
          harvestStartDay: 150 as never,
          harvestEndDay: 180 as never,
          plantCount: 24,
        },
      ],
    })

  /** Day of year 166 and 46: inside the planting's window and well outside it */
  const IN_SEASON = epochMillis(Date.UTC(2024, 5, 14, 16, 0, 0))
  const OUT_OF_SEASON = epochMillis(Date.UTC(2024, 1, 15, 16, 0, 0))

  it('emits one instanced mesh per canopy shape with a batched instance count', async () => {
    const bed = plantedBed()
    useAppStore.getState().upsertBed(bed)
    useAppStore.getState().setTime(IN_SEASON)
    const renderer = await ReactThreeTestRenderer.create(
      <PlantInstances bedId={bed.id} atYear={1} />,
    )
    const instances = named(renderer.scene, `plants-${bed.id}-sphere`)
    expect(instances).not.toBeNull()
    expect(Number(instances?.userData.instanceCount)).toBe(24)
    await renderer.unmount()
  })

  /** The growth stage is the scrubber's, not a constant: February has to reach the scene */
  it('draws nothing for an annual the scrubber is standing outside the window of', async () => {
    const bed = plantedBed()
    useAppStore.getState().upsertBed(bed)
    useAppStore.getState().setTime(OUT_OF_SEASON)
    const renderer = await ReactThreeTestRenderer.create(
      <PlantInstances bedId={bed.id} atYear={1} />,
    )
    expect(named(renderer.scene, `plants-${bed.id}`)?.userData.dayOfYear).toBe(46)
    expect(named(renderer.scene, `plants-${bed.id}-sphere`)).toBeNull()
    await renderer.unmount()
  })

  /**
   * The plants are the biggest and brightest objects in the scene, so a click on one selects its
   * bed: on a planted bed, bare soil is wherever the foliage is not
   */
  it('selects the bed it belongs to when a plant in it is clicked', async () => {
    const bed = plantedBed()
    useAppStore.getState().upsertBed(bed)
    useAppStore.getState().setTime(IN_SEASON)
    useAppStore.getState().selectBed(null)
    const renderer = await ReactThreeTestRenderer.create(
      <PlantInstances bedId={bed.id} atYear={1} />,
    )
    await renderer.fireEvent(renderer.scene.findByProps({ name: `plants-${bed.id}` }), 'click', {
      stopPropagation: () => {},
    })
    expect(useAppStore.getState().selectedBedId).toBe(bed.id)
    await renderer.unmount()
  })

  /** and a crop let go over the foliage lands in the bed under it, for the same reason */
  it('takes a carried crop dropped on its foliage', async () => {
    const bed = plantedBed()
    useAppStore.getState().upsertBed(bed)
    useAppStore.getState().setTime(IN_SEASON)
    useAppStore.getState().carry(cropId('lactuca-sativa'))
    const renderer = await ReactThreeTestRenderer.create(
      <PlantInstances bedId={bed.id} atYear={1} />,
    )
    await renderer.fireEvent(
      renderer.scene.findByProps({ name: `plants-${bed.id}` }),
      'pointerUp',
      { stopPropagation: () => {} },
    )
    expect(useAppStore.getState().dropped).toEqual({
      bedId: bed.id,
      cropId: cropId('lactuca-sativa'),
    })
    await renderer.unmount()
  })

  it('grows the same planting between two days inside its own window', async () => {
    const bed = plantedBed()
    useAppStore.getState().upsertBed(bed)
    const widthAt = async (at: EpochMillis): Promise<number> => {
      useAppStore.getState().setTime(at)
      const renderer = await ReactThreeTestRenderer.create(
        <PlantInstances bedId={bed.id} atYear={1} />,
      )
      const mesh = named(renderer.scene, `plants-${bed.id}-sphere`) as InstancedMesh | null
      const matrix = new Matrix4()
      mesh?.getMatrixAt(0, matrix)
      await renderer.unmount()
      return new Vector3().setFromMatrixScale(matrix).x
    }
    const sown = await widthAt(epochMillis(Date.UTC(2024, 3, 12, 16, 0, 0)))
    expect(sown).toBeGreaterThan(0)
    expect(sown).toBeLessThan(await widthAt(IN_SEASON))
  })
})

describe('RenderPipeline', () => {
  it('reaches as far as the canopy the occlusion is about', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <RenderPipeline quality={HIGH} ambientOcclusion occluderHeightM={3.2} />,
    )
    const rig = named(renderer.scene, 'render-pipeline')
    expect(rig?.userData.ambientOcclusion).toBe(true)
    expect(rig?.userData.occlusionRadiusM).toBeCloseTo(9.6, 1)
    expect(rig?.userData.occlusionSamples).toBe(HIGH.occlusionSamples)
    await renderer.unmount()
  })

  it('builds no pass at all when the grower switches the effect off', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <RenderPipeline quality={HIGH} ambientOcclusion={false} occluderHeightM={3.2} />,
    )
    expect(named(renderer.scene, 'render-pipeline')?.userData.ambientOcclusion).toBe(false)
    await renderer.unmount()
  })

  it('takes fewer samples on the low tier and still takes some', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <RenderPipeline quality={LOW} ambientOcclusion occluderHeightM={3.2} />,
    )
    const samples = named(renderer.scene, 'render-pipeline')?.userData.occlusionSamples as number
    expect(samples).toBe(LOW.occlusionSamples)
    expect(samples).toBeGreaterThan(0)
    await renderer.unmount()
  })
})

describe('DliOverlay', () => {
  it('renders nothing until a raster exists', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <DliOverlay month="annual" channel="dli" opacity={0.75} playback={null} />,
    )
    expect(named(renderer.scene, 'dli-overlay')).toBeNull()
    await renderer.unmount()
  })

  /**
   * The uniforms arrive as r3f props rather than as writes into a memoised object, so this is
   * what says the plumbing is connected: a mis-ordered pierced prop, or a renamed uniform, shows
   * up as a shader reading its default and an overlay that is a flat colour on screen
   */
  it('hands the shader the field, the opacity and the contour interval the legend prints', async () => {
    useAppStore.setState({ raster: ready(rasterFixture()) })
    const renderer = await ReactThreeTestRenderer.create(
      <DliOverlay month="annual" channel="dli" opacity={0.4} playback={null} />,
    )
    const mesh = named(renderer.scene, 'dli-overlay') as Mesh
    const uniforms = (mesh.material as ShaderMaterial).uniforms
    expect(uniforms.field?.value).not.toBeNull()
    expect(uniforms.opacity?.value).toBe(0.4)
    // 8 mol/m2/d over a step of 1 is eight intervals across the ramp, starting at zero
    expect(uniforms.contourScale?.value).toBeCloseTo(8, 9)
    expect(uniforms.contourOffset?.value).toBe(0)
    expect(mesh.userData.contourStep).toBe(1)
    await renderer.unmount()
  })

  /**
   * The raster's extent is the panels and beds plus a margin, so a plane its size would spill past
   * the plot on the side a row stands near and end before the far edge. The overlay is cut to the
   * plot's own outline, and the field is read by where each vertex stands in the raster
   */
  it('is cut to the plot outline and reads the field by where each vertex stands', async () => {
    const raster = rasterFixture()
    useAppStore.setState({ raster: ready(raster) })
    useAppStore.getState().setBoundary(polygonOf(rectangleRing(vec2(2, 1), 32, 24)))
    const renderer = await ReactThreeTestRenderer.create(
      <DliOverlay month="annual" channel="dli" opacity={0.4} playback={null} />,
    )
    const mesh = named(renderer.scene, 'dli-overlay') as Mesh
    mesh.geometry.computeBoundingBox()
    const box = mesh.geometry.boundingBox
    expect(box?.min.x).toBeCloseTo(-14, 6)
    expect(box?.max.x).toBeCloseTo(18, 6)
    expect(box?.min.y).toBeCloseTo(-11, 6)
    expect(box?.max.y).toBeCloseTo(13, 6)
    // laid flat in place: the shape is already in plot metres, so nothing offsets it
    expect(mesh.position.x).toBe(0)
    expect(mesh.position.z).toBe(0)
    expect(mesh.rotation.x).toBeCloseTo(-Math.PI / 2, 6)
    const position = mesh.geometry.getAttribute('position')
    const uv = mesh.geometry.getAttribute('uv')
    for (let i = 0; i < position.count; i += 1) {
      const [u, v] = fieldUv(position.getX(i), position.getY(i), raster.grid.extent)
      expect(uv.getX(i)).toBeCloseTo(u, 6)
      expect(uv.getY(i)).toBeCloseTo(v, 6)
    }
    await renderer.unmount()
  })
})

describe('what the canvas says it is', () => {
  it('names the plot, the beds and the rows of panels in plain words', () => {
    resetAppStore()
    useAppStore.getState().upsertBed(makeBed(1))
    useAppStore.getState().upsertBed(makeBed(2))
    useAppStore.getState().upsertBed(makeBed(3))
    useAppStore.getState().upsertArray(makeArray(1))
    const plot = useAppStore.getState().plot
    const rows = plot?.arrays[0]?.geometry.rowCount ?? 0
    expect(sceneLabel(plot)).toBe(
      `3D view of the garden: 32 by 24 m plot, 3 beds, ${String(rows)} rows of panels`,
    )
    expect(sceneLabel(null)).toBe('3D view of the garden: no plot drawn yet')
  })

  it('writes the role and the name onto the canvas element, and keeps them current', async () => {
    resetAppStore()
    const attributes = new Map<string, string>()
    const renderer = await ReactThreeTestRenderer.create(<CanvasLabel />, {
      // the test renderer's canvas is a bare object with no DOM: give it the two calls used
      beforeReturn: (canvas) => {
        Object.assign(canvas, {
          setAttribute: (name: string, value: string) => attributes.set(name, value),
        })
      },
    })
    expect(attributes.get('role')).toBe('img')
    const before = sceneLabel(useAppStore.getState().plot)
    expect(attributes.get('aria-label')).toBe(before)
    await ReactThreeTestRenderer.act(async () => {
      useAppStore.getState().upsertBed(makeBed(9))
    })
    const after = sceneLabel(useAppStore.getState().plot)
    expect(after).not.toBe(before)
    expect(attributes.get('aria-label')).toBe(after)
    await renderer.unmount()
  })
})

describe('PlotBoundary', () => {
  it('renders a draggable handle per boundary vertex in Move mode, and none while looking', async () => {
    useAppStore.getState().setBoundary(polygonOf(rectangleRing(vec2(0, 0), 10, 10, degrees(0))))
    useAppStore.getState().setMode('move')
    const renderer = await ReactThreeTestRenderer.create(<PlotBoundary />)
    const handles = namedAll(renderer.scene, 'vertex-handle-')
    expect(handles.length).toBe(4)
    expect(handles[0]?.position.y).toBeCloseTo(0.2, 6)
    await renderer.unmount()
    // none in Select mode, so a hand reaching for the camera cannot grab a corner and reshape the
    // plot
    useAppStore.getState().setMode('select')
    const looking = await ReactThreeTestRenderer.create(<PlotBoundary />)
    expect(namedAll(looking.scene, 'vertex-handle-').length).toBe(0)
    await looking.unmount()
  })
})
