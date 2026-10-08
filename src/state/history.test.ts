import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { vi } from '../../test/vi'
import { DEFAULT_MAX_CROPS_PER_BED } from '../recommend/suggest'
import { bedId } from '../types/ids'
import type { LatLon } from '../types/geo'
import { degreesLatitude, degreesLongitude } from '../types/units'
import { makeArray, makeBed } from './defaults'
import {
  canRedo,
  canUndo,
  HISTORY_KEYS,
  MAX_HISTORY_STEPS,
  redo,
  undo,
  useHistory,
  type HistoryState,
} from './history'
import { PERSISTED_KEYS, WRITE_DELAY_MS } from './persist'
import { getAppState, resetAppStore } from './store'

/*
  Most edits below are a call to `setMaxCropsPerBed`, which moves one tracked key and nothing else,
  so what a step holds is a number the assertions can read. The pauses are fake timers: a step
  settles after the same 600 ms the autosave waits
*/

const START = DEFAULT_MAX_CROPS_PER_BED

const history = (): HistoryState => useHistory.getState()
const maxCrops = (): number => getAppState().maxCropsPerBed
const bedIds = (): readonly string[] => getAppState().plot?.beds.map((bed) => bed.id) ?? []

/** The pause that turns the edits before it into one step */
const settle = (): void => {
  vi.advanceTimersByTime(WRITE_DELAY_MS)
}

/** One edit and the pause after it */
const edit = (count: number): void => {
  getAppState().setMaxCropsPerBed(count)
  settle()
}

/**
 * Persisted keys that undo leaves alone, and why. A persisted key has to be on this list or in
 * `HISTORY_KEYS`, so a new one is classified when it is added and nobody finds out later
 */
const LEFT_OUT = [
  // a place has to be looked up again to be put back, so a new one ends the history instead
  'location',
  'locationLabel',
  // what the grower is looking at, and how
  'selectedBedId',
  'selectedArrayId',
  'sidebarStep',
  'overlay',
  'imageryEnabled',
  'lighting',
  'effects',
  'lengthUnit',
  // seasons that were run happened
  'simulation',
] as const

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  resetAppStore()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('what the history tracks', () => {
  it('is a subset of the persisted keys', () => {
    for (const key of HISTORY_KEYS) expect(PERSISTED_KEYS).toContain(key)
  })

  it('has every persisted key on one side or the other', () => {
    expect([...HISTORY_KEYS, ...LEFT_OUT].sort()).toEqual([...PERSISTED_KEYS].sort())
  })

  it('makes no step of what the grower only looked at', () => {
    const state = getAppState()
    const bed = state.plot?.beds[0]
    if (bed === undefined) throw new Error('no bed')
    state.setSidebarStep('plants')
    state.setOverlay({ opacity: 0.2 })
    state.setImagery(true)
    state.setLighting('low')
    state.setEffects({ ambientOcclusion: false })
    state.setLengthUnit('ft')
    state.selectBed(bed.id)
    state.setMode('move')
    // a season that was run is no edit of the garden
    state.setYearChoice('driest')
    settle()
    expect(history().past).toEqual([])
    expect(canUndo(history())).toBe(false)
  })

  it("isn't part of the design store, which is what gets written down", () => {
    edit(7)
    expect(Object.keys(getAppState())).not.toContain('past')
    expect(Object.keys(getAppState())).not.toContain('future')
  })
})

describe('one step for each settled change', () => {
  it('starts a session with nothing to undo or redo', () => {
    expect(canUndo(history())).toBe(false)
    expect(canRedo(history())).toBe(false)
  })

  it('groups edits less than the write delay apart into one step', () => {
    for (let count = 5; count <= 12; count += 1) {
      getAppState().setMaxCropsPerBed(count)
      vi.advanceTimersByTime(100)
    }
    // the edits are on screen and Undo is live, though nothing has settled yet
    expect(history().past).toEqual([])
    expect(canUndo(history())).toBe(true)
    settle()
    expect(history().past.length).toBe(1)
    undo()
    expect(maxCrops()).toBe(START)
    expect(canUndo(history())).toBe(false)
  })

  it('makes two steps of two edits a pause apart', () => {
    edit(7)
    edit(8)
    expect(history().past.length).toBe(2)
    undo()
    expect(maxCrops()).toBe(7)
    undo()
    expect(maxCrops()).toBe(START)
  })

  it('settles a burst that has not finished before it undoes', () => {
    getAppState().setMaxCropsPerBed(7)
    getAppState().setMaxCropsPerBed(8)
    undo()
    expect(maxCrops()).toBe(START)
    expect(history().past).toEqual([])
    expect(history().future.length).toBe(1)
    redo()
    expect(maxCrops()).toBe(8)
  })
})

describe('stepping back and forward', () => {
  it('undoes in the order the edits were made, and redoes them the other way', () => {
    edit(7)
    edit(8)
    edit(9)
    undo()
    expect(maxCrops()).toBe(8)
    undo()
    expect(maxCrops()).toBe(7)
    undo()
    expect(maxCrops()).toBe(START)
    redo()
    expect(maxCrops()).toBe(7)
    redo()
    expect(maxCrops()).toBe(8)
    redo()
    expect(maxCrops()).toBe(9)
  })

  it('does nothing at either end', () => {
    undo()
    redo()
    expect(maxCrops()).toBe(START)
    edit(7)
    redo()
    expect(maxCrops()).toBe(7)
    undo()
    undo()
    expect(maxCrops()).toBe(START)
  })

  it('empties redo the moment a new change is made', () => {
    edit(7)
    edit(8)
    undo()
    expect(canRedo(history())).toBe(true)
    getAppState().setMaxCropsPerBed(11)
    // no pause: Redo goes dead with the edit itself
    expect(canRedo(history())).toBe(false)
    settle()
    redo()
    expect(maxCrops()).toBe(11)
    undo()
    expect(maxCrops()).toBe(7)
  })

  it('makes no step of a restore, however long it waits', () => {
    edit(7)
    undo()
    vi.advanceTimersByTime(WRITE_DELAY_MS * 3)
    expect(history().past).toEqual([])
    expect(history().future.length).toBe(1)
    redo()
    vi.advanceTimersByTime(WRITE_DELAY_MS * 3)
    expect(history().past.length).toBe(1)
    expect(history().future).toEqual([])
  })

  it('keeps the last five hundred steps and lets the oldest go', () => {
    expect(MAX_HISTORY_STEPS).toBe(500)
    const first = START + 5
    for (let step = 0; step < MAX_HISTORY_STEPS + 5; step += 1) edit(first + step)
    expect(history().past.length).toBe(MAX_HISTORY_STEPS)
    for (let step = 0; step < MAX_HISTORY_STEPS; step += 1) undo()
    expect(canUndo(history())).toBe(false)
    // the five oldest designs are gone, so the oldest one left is the one before the sixth edit
    expect(maxCrops()).toBe(first + 4)
    expect(history().future.length).toBe(MAX_HISTORY_STEPS)
  })

  it('steps over the whole garden as well as a number', () => {
    const before = getAppState().plot
    expect(bedIds()).toEqual(['bed-1', 'bed-2', 'bed-3'])
    getAppState().upsertBed(makeBed(7))
    settle()
    getAppState().removeBed(bedId('bed-1'))
    settle()
    expect(bedIds()).toEqual(['bed-2', 'bed-3', 'bed-7'])
    undo()
    expect(bedIds()).toEqual(['bed-1', 'bed-2', 'bed-3', 'bed-7'])
    undo()
    expect(bedIds()).toEqual(['bed-1', 'bed-2', 'bed-3'])
    // the very object that was there, so everything that compares plots by identity agrees
    expect(getAppState().plot).toBe(before)
    redo()
    redo()
    expect(bedIds()).toEqual(['bed-2', 'bed-3', 'bed-7'])
  })
})

describe('the selection after a step', () => {
  it('clears the selected bed when undo takes the bed away', () => {
    getAppState().upsertBed(makeBed(7))
    getAppState().selectBed(bedId('bed-7'))
    settle()
    expect(getAppState().selectedBedId).toBe('bed-7')
    undo()
    expect(bedIds()).not.toContain('bed-7')
    expect(getAppState().selectedBedId).toBeNull()
  })

  it('clears the selected row of panels when undo takes it away', () => {
    getAppState().upsertArray(makeArray(2))
    getAppState().selectArray(makeArray(2).id)
    settle()
    expect(getAppState().selectedArrayId).toBe('array-2')
    undo()
    expect(getAppState().plot?.arrays.length).toBe(1)
    expect(getAppState().selectedArrayId).toBeNull()
  })

  it('clears the selected tree when undo takes it away', () => {
    getAppState().addTree()
    settle()
    expect(getAppState().selectedObstructionId).not.toBeNull()
    undo()
    expect(getAppState().plot?.obstructions).toEqual([])
    expect(getAppState().selectedObstructionId).toBeNull()
  })

  it('leaves a selection alone when the thing it points at is still there', () => {
    const bed = getAppState().plot?.beds[0]
    if (bed === undefined) throw new Error('no bed')
    getAppState().selectBed(bed.id)
    getAppState().upsertBed({ ...bed, label: 'Renamed' })
    settle()
    undo()
    expect(getAppState().plot?.beds[0]?.label).toBe(bed.label)
    expect(getAppState().selectedBedId).toBe(bed.id)
    redo()
    expect(getAppState().plot?.beds[0]?.label).toBe('Renamed')
    expect(getAppState().selectedBedId).toBe(bed.id)
  })

  it("doesn't select what a redo brings back", () => {
    getAppState().addTree()
    settle()
    undo()
    redo()
    expect(getAppState().plot?.obstructions.length).toBe(1)
    expect(getAppState().selectedObstructionId).toBeNull()
  })
})

describe('forgetting the design forgets the history', () => {
  it('empties both lists when the saved design is forgotten', () => {
    edit(7)
    edit(8)
    undo()
    expect(canUndo(history())).toBe(true)
    expect(canRedo(history())).toBe(true)
    getAppState().clearDesign()
    expect(canUndo(history())).toBe(false)
    expect(canRedo(history())).toBe(false)
    expect(maxCrops()).toBe(START)
  })

  it('drops a burst that was still settling', () => {
    getAppState().setMaxCropsPerBed(7)
    expect(canUndo(history())).toBe(true)
    getAppState().clearDesign()
    expect(canUndo(history())).toBe(false)
    settle()
    expect(history().past).toEqual([])
    undo()
    expect(maxCrops()).toBe(START)
  })

  it('makes no step of the forgetting itself', () => {
    edit(7)
    getAppState().clearDesign()
    settle()
    expect(canUndo(history())).toBe(false)
  })

  it('empties both lists when the store is reset', () => {
    edit(7)
    undo()
    resetAppStore()
    expect(canUndo(history())).toBe(false)
    expect(canRedo(history())).toBe(false)
  })

  it('goes on recording after the design is forgotten', () => {
    edit(7)
    getAppState().clearDesign()
    edit(9)
    expect(history().past.length).toBe(1)
    undo()
    expect(maxCrops()).toBe(START)
  })
})

describe('a new town ends the history', () => {
  const BOSTON: LatLon = {
    latitudeDeg: degreesLatitude(42.36),
    longitudeDeg: degreesLongitude(-71.06),
  }

  it('empties both lists when the coordinates move, so undo never crosses a town', () => {
    edit(7)
    edit(8)
    undo()
    expect(canUndo(history())).toBe(true)
    expect(canRedo(history())).toBe(true)
    getAppState().setLocation(BOSTON, 'Boston')
    expect(canUndo(history())).toBe(false)
    expect(canRedo(history())).toBe(false)
    undo()
    redo()
    expect(maxCrops()).toBe(7)
  })

  it('starts again from the design as the town change found it', () => {
    edit(7)
    getAppState().setLocation(BOSTON, 'Boston')
    edit(9)
    expect(history().past.length).toBe(1)
    undo()
    // back to the design as it stood at the town change, the furthest undo can reach
    expect(maxCrops()).toBe(7)
    expect(canUndo(history())).toBe(false)
  })

  it('drops an edit still settling when the town changes', () => {
    getAppState().setMaxCropsPerBed(7)
    expect(canUndo(history())).toBe(true)
    getAppState().setLocation(BOSTON, 'Boston')
    expect(canUndo(history())).toBe(false)
    settle()
    expect(history().past).toEqual([])
  })

  it('counts a coordinate typed into the place step', () => {
    edit(7)
    const here = getAppState().location
    getAppState().setLocation(
      { ...here, latitudeDeg: degreesLatitude(here.latitudeDeg + 0.0001) },
      '',
    )
    expect(canUndo(history())).toBe(false)
  })

  it('counts a move of the longitude alone as well', () => {
    edit(7)
    const here = getAppState().location
    getAppState().setLocation(
      { ...here, longitudeDeg: degreesLongitude(here.longitudeDeg + 0.0001) },
      '',
    )
    expect(canUndo(history())).toBe(false)
  })

  it('keeps the history through the same point under another name', () => {
    edit(7)
    getAppState().setLocation({ ...getAppState().location }, 'Home, as the grower calls it')
    expect(canUndo(history())).toBe(true)
    undo()
    expect(maxCrops()).toBe(START)
  })

  it('makes no step of the town change itself', () => {
    getAppState().setLocation(BOSTON, 'Boston')
    settle()
    expect(canUndo(history())).toBe(false)
  })
})
