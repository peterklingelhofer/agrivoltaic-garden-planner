import { act } from 'react'
import { beforeEach, describe, expect, it } from 'bun:test'
import { makeArray, makeBed } from '../state/defaults'
import { ready } from '../state/slices'
import { STORAGE_KEY } from '../state/persist'
import { resetAppStore, useAppStore } from '../state/store'
import type { BedId, PlantingId } from '../types/ids'
import { bedId, cropId, plantingId } from '../types/ids'
import type { Crop } from '../types/crop'
import type { DayOfYear } from '../types/units'
import { describeHover } from './hover'
import { SceneTooltip } from './SceneTooltip'
import { mount } from './testkit'

/**
 * Hovering names a thing. It must never CHANGE one: the sidebar edits whichever bed is selected,
 * and a pointer crossing the garden that quietly moved that selection would edit the wrong bed
 */

const BED = bedId('bed-1')

beforeEach(() => {
  localStorage.clear()
  resetAppStore()
})

const plantedBed = () => ({
  ...makeBed(1),
  id: BED,
  label: 'Bed 1',
  plantings: [
    {
      id: plantingId('bed-1:lettuce-leaf:100'),
      bedId: BED,
      cropId: cropId('lettuce-leaf'),
      cultivarId: null,
      role: 'target-crop' as const,
      tier: 'herb-ground' as const,
      plantCount: 12,
      sowDay: 100 as DayOfYear,
      harvestStartDay: 160 as DayOfYear,
      harvestEndDay: 180 as DayOfYear,
    },
  ],
})

const withPlot = () => {
  const store = useAppStore.getState()
  const bed = plantedBed()
  const array = makeArray(1)
  store.upsertBed(bed)
  store.upsertArray(array)
  return { bed, array }
}

describe('naming what the pointer is over', () => {
  /**
   * The array line on the shipped example, which must never read "1 rows of 6 modules". Both halves
   * of that are wrong: the count disagrees with its noun, and "module" is the trade word for a
   * panel that no label in the PV panel uses. The tooltip is the one surface a beginner meets
   * without opening a panel at all
   */
  it('counts rows and panels in agreement, in the word the rest of the app uses', () => {
    const { array } = withPlot()
    const store = useAppStore.getState()
    const at = (rowCount: number): string => {
      store.upsertArray({ ...array, geometry: { ...array.geometry, rowCount } })
      const plot = useAppStore.getState().plot
      return describeHover(plot, [], { kind: 'array', arrayId: array.id })?.detail ?? ''
    }
    expect(at(1)).toContain('1 row of')
    expect(at(1)).not.toContain('1 rows')
    expect(at(1)).not.toContain('module')
    expect(at(3)).toContain('3 rows of')
    expect(at(3)).toMatch(/\d+ panels?/)
  })

  it('names a bed by its label, its area and what is in it', () => {
    const { bed } = withPlot()
    const plot = useAppStore.getState().plot
    const named = describeHover(plot, [], { kind: 'bed', bedId: bed.id })
    expect(named?.title).toBe('Bed 1')
    // a hover names the plant: "1 planting" alone never says what it is
    expect(named?.detail).toBe('11.2 m²: lettuce-leaf')
  })

  it('names up to four plants and counts the rest, so the tooltip stays a tooltip', () => {
    const { bed } = withPlot()
    const store = useAppStore.getState()
    for (const [index, crop] of ['tomato', 'cucumber', 'chickpea', 'basil'].entries()) {
      store.addPlanting({
        id: plantingId(`bed-1:${crop}:${String(100 + index)}`),
        bedId: BED,
        cropId: cropId(crop),
        cultivarId: null,
        role: 'target-crop' as const,
        tier: 'herb-ground' as const,
        sowDay: 100 as DayOfYear,
        harvestStartDay: 160 as DayOfYear,
        harvestEndDay: 180 as DayOfYear,
        plantCount: 1,
      })
    }
    const plot = useAppStore.getState().plot
    const catalog = ['lettuce-leaf', 'tomato', 'cucumber', 'chickpea', 'basil'].map((id) => ({
      id: cropId(id),
      taxonomy: { commonNames: [id] },
    })) as unknown as readonly Crop[]
    const named = describeHover(plot, catalog, { kind: 'bed', bedId: bed.id })
    expect(named?.detail).toBe('11.2 m²: lettuce-leaf, tomato, cucumber, chickpea and 1 more')
  })

  it('names a plant by its common name and how many of it are in the bed', () => {
    const { bed } = withPlot()
    const plot = useAppStore.getState().plot
    const lettuce = {
      id: cropId('lettuce-leaf'),
      taxonomy: { commonNames: ['leaf lettuce'] },
    } as unknown as Crop
    const named = describeHover(plot, [lettuce], {
      kind: 'planting',
      bedId: bed.id,
      plantingId: plantingId('bed-1:lettuce-leaf:100'),
    })
    expect(named?.title).toBe('leaf lettuce')
    expect(named?.detail).toBe('12 plants in Bed 1')
  })

  it('says what the last season did to a plant, off the report rather than a recomputation', () => {
    const { bed } = withPlot()
    const plot = useAppStore.getState().plot
    const lettuce = {
      id: cropId('lettuce-leaf'),
      taxonomy: { commonNames: ['leaf lettuce'] },
    } as unknown as Crop
    const target = {
      kind: 'planting' as const,
      bedId: bed.id,
      plantingId: plantingId('bed-1:lettuce-leaf:100'),
    }
    const outcome = {
      bedId: bed.id,
      plantingId: target.plantingId,
      cropId: lettuce.id,
      kind: 'harvested' as const,
      band: null,
      realized: 0.62 as never,
      pestPressure: 0 as never,
      droughtPenalty: 0 as never,
      companions: [],
      tried: [],
      explanation: '',
    }
    const report = {
      season: 3,
      year: {} as never,
      outcomes: [outcome],
      harvestIndex: 0.62 as never,
      energyKwh: null,
      energyShare: null,
      advice: { id: 'status', text: '', bedId: null },
    }
    expect(describeHover(plot, [lettuce], target, report)?.detail).toBe(
      '12 plants in Bed 1. Season 3: harvested at about 60% of full yield',
    )
    const frosted = { ...report, outcomes: [{ ...outcome, kind: 'frosted' as const }] }
    expect(describeHover(plot, [lettuce], target, frosted)?.detail).toBe(
      '12 plants in Bed 1. Season 3: lost to frost',
    )
  })

  it('names an array by the geometry the panel prints, not by a second calculation', () => {
    const { array } = withPlot()
    const plot = useAppStore.getState().plot
    const named = describeHover(plot, [], { kind: 'array', arrayId: array.id })
    expect(named?.title).toBe(array.label)
    expect(named?.detail).toContain(`${String(array.geometry.rowCount)} rows`)
  })

  it('refuses to name something that is no longer in the plot', () => {
    withPlot()
    const plot = useAppStore.getState().plot
    expect(describeHover(plot, [], { kind: 'bed', bedId: 'bed-gone' as BedId })).toBeNull()
    expect(
      describeHover(plot, [], {
        kind: 'planting',
        bedId: BED,
        plantingId: 'gone' as PlantingId,
      }),
    ).toBeNull()
  })
})

describe('the hover target in the store', () => {
  it('never moves the selection, which is what the sidebar edits', () => {
    const { bed, array } = withPlot()
    const second = { ...makeBed(2), id: bedId('bed-2'), label: 'Bed 2' }
    const store = useAppStore.getState()
    store.upsertBed(second)
    store.selectBed(bed.id)

    // the pointer crosses another bed, its plants and the array. The selection is still Bed 1
    for (const target of [
      { kind: 'bed', bedId: second.id },
      { kind: 'planting', bedId: bed.id, plantingId: plantingId('bed-1:lettuce-leaf:100') },
      { kind: 'array', arrayId: array.id },
    ] as const) {
      store.setHovered(target)
      expect(useAppStore.getState().selectedBedId).toBe(bed.id)
      expect(useAppStore.getState().selectedArrayId).toBeNull()
    }
  })

  it('drops a repeated hover, so a pointer resting on one bed is one state change', () => {
    const { bed } = withPlot()
    const store = useAppStore.getState()
    store.setHovered({ kind: 'bed', bedId: bed.id })
    const first = useAppStore.getState()
    store.setHovered({ kind: 'bed', bedId: bed.id })
    expect(useAppStore.getState()).toBe(first)
  })

  it("isn't part of the saved design", () => {
    const { bed } = withPlot()
    useAppStore.getState().setHovered({ kind: 'bed', bedId: bed.id })
    const saved = localStorage.getItem(STORAGE_KEY)
    expect(saved === null || !saved.includes('hovered')).toBe(true)
  })
})

describe('the tooltip', () => {
  it('says nothing until something is hovered, and names it once it is', async () => {
    const { bed } = withPlot()
    useAppStore.setState({ catalog: ready([]) })
    const harness = await mount(<SceneTooltip />)

    expect(harness.get('scene-tooltip').dataset.visible).toBe('false')
    expect(harness.get('scene-tooltip').textContent).toBe('')

    await act(async () => {
      useAppStore.getState().setHovered({ kind: 'bed', bedId: bed.id })
    })
    expect(harness.get('scene-tooltip').dataset.visible).toBe('true')
    expect(harness.get('scene-tooltip').textContent).toContain('Bed 1')
    await harness.unmount()
  })
})
