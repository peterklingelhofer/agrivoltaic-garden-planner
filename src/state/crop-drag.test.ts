import { beforeEach, describe, expect, it } from 'bun:test'
import type { CropId } from '../types/ids'
import { resetAppStore, useAppStore } from './store'

/**
 * Carrying a crop from the ranked picker to a bed in the 3D.
 *
 * The gesture exists because the ranked list and the garden are two different places to be
 * looking, and a grower looking at the garden should not have to go back to the list, select the
 * right bed from a dropdown, and only then choose. What it must NOT do is plant anything: what a
 * bed can take is derived and the derivation is allowed to refuse, so a drop stages the choice
 * and leaves the writing to the press that shows the refusal
 */

const state = (): ReturnType<typeof useAppStore.getState> => useAppStore.getState()
const TOMATO = 'tomato' as CropId

beforeEach(() => resetAppStore())

describe('carrying a crop to a bed', () => {
  it('carries nothing until something is picked up', () => {
    expect(state().carrying).toBeNull()
    expect(state().dropped).toBeNull()
  })

  it('stages the crop against the bed it was let go over, and plants nothing', () => {
    const bed = state().plot!.beds[1]!
    const before = bed.plantings.length
    state().carry(TOMATO)
    expect(state().carrying).toBe(TOMATO)
    state().dropOnBed(bed.id)

    expect(state().dropped).toEqual({ bedId: bed.id, cropId: TOMATO })
    // the whole point: a drop is a proposal, and the bed is untouched until it is confirmed
    expect(state().plot!.beds[1]!.plantings.length).toBe(before)
  })

  /** Every panel means "this bed" by the selection, and the drop has just named one */
  it('selects the bed it landed on and shows the step where the choice is', () => {
    const bed = state().plot!.beds[2]!
    state().carry(TOMATO)
    state().dropOnBed(bed.id)
    expect(state().selectedBedId).toBe(bed.id)
    expect(state().sidebarStep).toBe('plants')
  })

  it('stops carrying once it lands', () => {
    const bed = state().plot!.beds[0]!
    state().carry(TOMATO)
    state().dropOnBed(bed.id)
    expect(state().carrying).toBeNull()
  })

  /** A pointer released over the sky, the sidebar or anywhere else is a crop put back down */
  it('does nothing when a bed is dropped on with empty hands', () => {
    const bed = state().plot!.beds[0]!
    state().carry(null)
    state().dropOnBed(bed.id)
    expect(state().dropped).toBeNull()
  })
})
