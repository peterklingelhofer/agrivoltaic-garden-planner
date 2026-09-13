import { beforeEach, describe, expect, it } from 'bun:test'
import { viridis } from './colormap'
import { makeArray } from './defaults'
import { arrayLayout, arrayMetrics } from './derive'
import {
  polygonAreaM2,
  polygonOf,
  pointInPolygon,
  rectangleOf,
  rectangleRing,
  toSceneXZ,
  vec2,
} from './geom'
import { overlayField } from './overlay'
import { resetAppStore, useAppStore } from './store'
import { sunVector } from './sun'
import { degrees, meters } from '../types/units'

beforeEach(() => resetAppStore())

describe('geometry helpers', () => {
  it('measures polygon area and containment', () => {
    const polygon = polygonOf(rectangleRing(vec2(0, 0), 4, 2))
    expect(polygonAreaM2(polygon)).toBeCloseTo(8, 6)
    expect(pointInPolygon(polygon, 0, 0)).toBe(true)
    expect(pointInPolygon(polygon, 9, 0)).toBe(false)
  })

  /**
   * The question anyone resizing a boundary by two numbers has to ask first, so it's answered
   * conservatively: everything a width and a depth wouldn't put back is refused
   */
  it('reads back the rectangle it wrote, and refuses every other shape', () => {
    const measured = rectangleOf(rectangleRing(vec2(2, -1), 8, 6))
    expect(measured?.widthM).toBeCloseTo(8, 6)
    expect(measured?.depthM).toBeCloseTo(6, 6)
    expect(measured?.center.xM).toBeCloseTo(2, 6)
    expect(measured?.center.yM).toBeCloseTo(-1, 6)

    // a rotated rectangle is a shape two numbers can't put back where its corners were
    expect(rectangleOf(rectangleRing(vec2(0, 0), 8, 6, 30))).toBeNull()
    // an L drawn by hand, a triangle, and a ring that crosses itself inside its own box
    expect(
      rectangleOf([vec2(0, 0), vec2(4, 0), vec2(4, 2), vec2(2, 2), vec2(2, 4), vec2(0, 4)]),
    ).toBeNull()
    expect(rectangleOf([vec2(0, 0), vec2(4, 0), vec2(0, 4)])).toBeNull()
    expect(rectangleOf([vec2(0, 0), vec2(4, 4), vec2(4, 0), vec2(0, 4)])).toBeNull()
  })

  it('maps site north onto scene -z', () => {
    const [x, z] = toSceneXZ(vec2(3, 5))
    expect(x).toBeCloseTo(3, 6)
    expect(z).toBeCloseTo(-5, 6)
  })
})

describe('sun vector', () => {
  it('points south at solar noon in the northern hemisphere', () => {
    const [x, y, z] = sunVector(45, 180)
    expect(x).toBeCloseTo(0, 6)
    expect(y).toBeCloseTo(Math.SQRT1_2, 6)
    expect(z).toBeCloseTo(Math.SQRT1_2, 6)
  })

  it('points east at sunrise', () => {
    const [x, y, z] = sunVector(0, 90)
    expect(x).toBeCloseTo(1, 6)
    expect(y).toBeCloseTo(0, 6)
    expect(z).toBeCloseTo(0, 6)
  })
})

describe('array metrics', () => {
  it('derives GCR from collector width over pitch', () => {
    const array = makeArray(1)
    const metrics = arrayMetrics(array)
    expect(metrics.groundCoverRatio).toBeCloseTo(
      array.geometry.collectorWidthM / array.geometry.pitchM,
      6,
    )
    expect(metrics.projectedGroundCoverRatio).toBeLessThanOrEqual(metrics.groundCoverRatio)
    expect(metrics.maxHeightM).toBeGreaterThan(array.geometry.clearanceHeightM)
  })

  it('lays out one module per row, column and stack level', () => {
    const array = makeArray(1)
    const layout = arrayLayout(array, 45, 180)
    expect(layout.modules.length).toBe(
      array.geometry.rowCount * array.geometry.modulesPerRow * layout.stackCount,
    )
    expect(layout.torqueTubes.length).toBe(array.geometry.rowCount)
    expect(layout.orientation.surfaceAzimuthDeg).toBeCloseTo(180, 6)
  })

  it('spaces rows by the pitch across the row axis', () => {
    const array = makeArray(1)
    const layout = arrayLayout(
      { ...array, geometry: { ...array.geometry, rowAzimuthDeg: degrees(90) } },
      45,
      180,
    )
    const first = layout.torqueTubes[0]
    const second = layout.torqueTubes[1]
    expect(first).toBeDefined()
    expect(second).toBeDefined()
    expect(
      Math.hypot((second?.[0] ?? 0) - (first?.[0] ?? 0), (second?.[2] ?? 0) - (first?.[2] ?? 0)),
    ).toBeCloseTo(array.geometry.pitchM, 6)
  })
})

describe('colormap', () => {
  it('runs viridis dark to light without a rainbow hue wrap', () => {
    const low = viridis(0)
    const high = viridis(1)
    expect(low[0]).toBeLessThan(high[0])
    expect(low[1]).toBeLessThan(high[1])
    expect(viridis(-5)[0]).toBe(low[0])
    expect(viridis(5)[0]).toBe(high[0])
  })
})

describe('overlay field', () => {
  it('reports an empty field with no raster and still names the channel', () => {
    const field = overlayField(null, 'dli', 'annual')
    expect(field.values).toBeNull()
    // the period is in the name: the bed table reads the growing season, so without it a bed can
    // seem to get more than the map's top number
    expect(field.label).toBe('Daily light integral, whole-year average')
    expect(field.unit).toBe('mol/m²/d')
  })
})

describe('store', () => {
  it('starts with a plot that renders before any site is resolved', () => {
    const state = useAppStore.getState()
    expect(state.plot?.arrays.length).toBeGreaterThan(0)
    expect(state.site.status).toBe('idle')
    expect(state.raster.status).toBe('idle')
  })

  it('reports simulation unavailable rather than throwing when the bake fails', async () => {
    await useAppStore.getState().runFinal()
    const raster = useAppStore.getState().raster
    expect(raster.status).toBe('error')
    if (raster.status === 'error') expect(raster.message.length).toBeGreaterThan(0)
  })

  it('recomputes derived metrics on every array edit', () => {
    const array = makeArray(1)
    useAppStore.getState().upsertArray({
      ...array,
      geometry: { ...array.geometry, pitchM: meters(4) },
    })
    const stored = useAppStore.getState().plot?.arrays.find((a) => a.id === array.id)
    expect(stored?.derived.groundCoverRatio).toBeCloseTo(array.geometry.collectorWidthM / 4, 6)
  })

  it('commits a drawn polygon into a new bed and returns to select mode', () => {
    const store = useAppStore.getState()
    const before = store.plot?.beds.length ?? 0
    store.setMode('draw-bed')
    store.pushDraftVertex(vec2(0, 0))
    store.pushDraftVertex(vec2(2, 0))
    store.pushDraftVertex(vec2(2, 2))
    store.commitDraft()
    const after = useAppStore.getState()
    expect(after.plot?.beds.length).toBe(before + 1)
    expect(after.mode).toBe('select')
    expect(after.draft.length).toBe(0)
  })

  /*
    The plot opens with Bed 1, 2 and 3. Removing the middle one leaves a list of length two, so a
    `beds.length + 1` rule would name the next bed "Bed 3", an id Bed 3 is still using
  */
  it('gives a drawn bed an id no surviving bed already holds', () => {
    const store = useAppStore.getState()
    const middle = store.plot?.beds[1]?.id
    expect(middle).toBeDefined()
    store.removeBed(middle as NonNullable<typeof middle>)
    const survivors = useAppStore.getState().plot?.beds ?? []
    expect(survivors.length).toBe(2)

    const drawing = useAppStore.getState()
    drawing.setMode('draw-bed')
    drawing.pushDraftVertex(vec2(0, 0))
    drawing.pushDraftVertex(vec2(2, 0))
    drawing.pushDraftVertex(vec2(2, 2))
    drawing.commitDraft()

    const beds = useAppStore.getState().plot?.beds ?? []
    expect(beds.length).toBe(3)
    // the whole point: three beds and three distinct ids
    expect(new Set(beds.map((bed) => bed.id)).size).toBe(3)
  })

  it('cancels an in-flight bake back to idle', () => {
    useAppStore.getState().cancel()
    expect(useAppStore.getState().progress).toBeNull()
  })

  // corners clicked top-left, top-right, bottom-left, bottom-right are a bow-tie in click order,
  // a self-cross whose area is near zero. The area should still be the 6 by 4 rectangle the
  // drawer meant
  it('untangles a bed drawn as a bow-tie into the rectangle it was meant to be', () => {
    const store = useAppStore.getState()
    store.setMode('draw-bed')
    store.pushDraftVertex(vec2(0, 4))
    store.pushDraftVertex(vec2(6, 4))
    store.pushDraftVertex(vec2(0, 0))
    store.pushDraftVertex(vec2(6, 0))
    store.commitDraft()
    const beds = useAppStore.getState().plot?.beds ?? []
    const bed = beds[beds.length - 1]
    expect(bed).toBeDefined()
    if (bed) expect(polygonAreaM2(bed.footprint)).toBeCloseTo(24, 6)
  })

  it('untangles a plot boundary drawn as a bow-tie into the rectangle it was meant to be', () => {
    const store = useAppStore.getState()
    store.setMode('draw-plot')
    store.pushDraftVertex(vec2(0, 4))
    store.pushDraftVertex(vec2(6, 4))
    store.pushDraftVertex(vec2(0, 0))
    store.pushDraftVertex(vec2(6, 0))
    store.commitDraft()
    const plot = useAppStore.getState().plot
    expect(plot).toBeDefined()
    if (plot) expect(polygonAreaM2(plot.boundary)).toBeCloseTo(24, 6)
  })
})
