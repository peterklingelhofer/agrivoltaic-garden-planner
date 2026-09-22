import { act } from 'react'
import { beforeEach, describe, expect, it } from 'bun:test'
import { polygonOf, rectangleOf, vec2 } from '../state/geom'
import { getAppState, resetAppStore } from '../state/store'
import type { Ring2D } from '../types/geo'
import { GroundPanel } from './BedPanel'
import { mount } from './testkit'

/**
 * The ground step asks how big the space is as two numbers, in metres or in feet. The same pair of
 * fields changes them afterwards, with a unit switch, so the boundary never has to be drawn again
 * by hand on the 3D
 */

beforeEach(() => {
  localStorage.clear()
  resetAppStore()
})

const exterior = (): Ring2D => {
  const ring = getAppState().plot?.boundary.exterior
  if (ring === undefined) throw new Error('no plot')
  return ring
}

const drawnByHand = polygonOf([
  vec2(0, 0),
  vec2(10, 0),
  vec2(10, 6),
  vec2(5, 6),
  vec2(5, 12),
  vec2(0, 12),
])

describe('the size of the plot, typed rather than redrawn', () => {
  it('resizes a rectangular plot from either unit, around its own middle', async () => {
    const harness = await mount(<GroundPanel />)
    // metres first, and only the pair for the unit that is switched on is in the document
    expect(harness.get('control-plot-units').dataset.unit).toBe('m')
    expect((harness.get('control-plot-width-m') as HTMLInputElement).value).toBe('32')
    expect(harness.find('control-plot-width-ft')).toBeNull()
    expect(harness.get('readout-plot-area').textContent).toBe('768.0 m² (8267 sq ft)')

    await harness.type('control-plot-width-m', '10')
    const resized = rectangleOf(exterior())
    expect(resized?.widthM).toBeCloseTo(10, 6)
    // the other measurement, and the ground the plot sits over, are both left alone
    expect(resized?.depthM).toBeCloseTo(24, 6)
    expect(resized?.centre.xM).toBeCloseTo(0, 6)
    expect(resized?.centre.yM).toBeCloseTo(0, 6)

    await harness.click('control-plot-units-ft')
    expect((harness.get('control-plot-units-ft') as HTMLInputElement).checked).toBe(true)
    expect(harness.find('control-plot-depth-m')).toBeNull()
    expect((harness.get('control-plot-depth-ft') as HTMLInputElement).value).toBe('78.7')
    await harness.type('control-plot-depth-ft', '32.8')
    expect(rectangleOf(exterior())?.depthM).toBeCloseTo(10, 1)

    await harness.click('control-plot-units-m')
    expect((harness.get('control-plot-depth-m') as HTMLInputElement).value).toBe('10')
    await harness.unmount()
  })

  /**
   * The rest of the step: what shades the space and whether it can be watered on the face, the
   * beds as a summary row, and everything that edits a bed behind one fold with its ids intact
   */
  it('asks what shades the space and whether it can be watered, and folds the beds', async () => {
    const harness = await mount(<GroundPanel />)
    expect(harness.find('control-onboarding-exposure')).not.toBeNull()
    expect(harness.get('readout-onboarding-exposure-help').textContent).toMatch(
      /shade a space before any panel/,
    )
    expect(harness.find('control-onboarding-irrigation')).not.toBeNull()
    expect(harness.get('readout-ground-beds').textContent).toMatch(/^\d+ beds?, \d+\.\d m² /)
    const fold = harness.get('details-ground-beds')
    for (const testId of [
      'control-plot-ground-cover',
      'action-bed-add',
      'action-bed-draw',
      'action-bed-draw-plot',
      'action-bed-close-polygon',
      'control-bed-select',
      'control-bed-raised-height',
      'action-bed-remove',
    ]) {
      expect(harness.get(testId).closest('details'), testId).toBe(fold)
    }
    await harness.unmount()
  })

  /** Drawing happens on the ground, so the press that starts it shows the garden */
  it('shows the garden when a bed is about to be drawn', async () => {
    const harness = await mount(<GroundPanel />)
    getAppState().setSurface('edit')
    await harness.click('action-bed-draw')
    expect(getAppState().mode).toBe('draw-bed')
    expect(getAppState().surface).toBe('garden')
    await harness.click('action-bed-draw')
    expect(getAppState().mode).toBe('select')
    await harness.unmount()
  })

  it('holds what is typed against a shape two numbers cannot describe, and says why', async () => {
    getAppState().setBoundary(drawnByHand)
    const harness = await mount(<GroundPanel />)
    expect(harness.get('status-plot-shape').textContent).toMatch(/not a plain rectangle/i)
    // the fields start at the widest and the deepest points of what is actually there
    expect((harness.get('control-plot-width-m') as HTMLInputElement).value).toBe('10')
    expect((harness.get('control-plot-depth-m') as HTMLInputElement).value).toBe('12')
    // and the area is the shape's own, not the box drawn around it
    expect(harness.get('readout-plot-area').textContent).toContain('90.0 m²')

    await harness.type('control-plot-width-m', '4')
    expect((harness.get('control-plot-width-m') as HTMLInputElement).value).toBe('4')
    expect(exterior()).toBe(drawnByHand.exterior)

    await harness.click('action-plot-rectangle')
    const replaced = rectangleOf(exterior())
    expect(replaced?.widthM).toBeCloseTo(4, 6)
    expect(replaced?.depthM).toBeCloseTo(12, 6)
    // over the middle of the shape it replaced. Never over the origin
    expect(replaced?.centre.xM).toBeCloseTo(5, 6)
    expect(replaced?.centre.yM).toBeCloseTo(6, 6)
    expect(harness.find('status-plot-shape')).toBeNull()
    await harness.unmount()
  })

  it('forgets a size typed for a shape that is no longer on the ground', async () => {
    getAppState().setBoundary(drawnByHand)
    const harness = await mount(<GroundPanel />)
    await harness.type('control-plot-width-m', '4')
    await act(async () => {
      getAppState().setBoundary(polygonOf([vec2(0, 0), vec2(20, 0), vec2(20, 8), vec2(0, 16)]))
    })
    expect((harness.get('control-plot-width-m') as HTMLInputElement).value).toBe('20')
    await harness.unmount()
  })

  it('offers no replacement for a plot that is already a rectangle', async () => {
    const harness = await mount(<GroundPanel />)
    expect(harness.find('status-plot-shape')).toBeNull()
    expect(harness.find('action-plot-rectangle')).toBeNull()
    await harness.unmount()
  })
})
