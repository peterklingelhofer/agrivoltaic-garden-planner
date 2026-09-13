import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { vi } from '../../test/vi'
import { makeBed } from './defaults'
import { PERSISTED_KEYS, STORAGE_KEY, TRANSCRIPT_KEY, WRITE_DELAY_MS } from './persist'
import { ready } from './slices'
import { resetAppStore, useAppStore } from './store'
import type { AppState } from './slices'
import type { DliRaster } from '../types/light'

/**
 * The wiring, not the format: that an authored edit debounces into exactly one write, that
 * a simulation result causes none, and that save and reset do what their buttons say
 */

const stored = (): Record<string, unknown> | null => {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw === null ? null : (JSON.parse(raw) as Record<string, unknown>)
}

const design = (): Record<string, unknown> => (stored()?.design ?? {}) as Record<string, unknown>

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  resetAppStore()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the store writes the design and only the design', () => {
  it('writes nothing until the edits stop, then writes once', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    for (let step = 0; step <= 20; step += 1) {
      useAppStore.getState().setOverlay({ opacity: step / 20 })
      vi.advanceTimersByTime(10)
    }
    expect(setItem).not.toHaveBeenCalled()
    vi.advanceTimersByTime(WRITE_DELAY_MS)
    expect(setItem).toHaveBeenCalledTimes(1)
    expect(useAppStore.getState().storage.outcome).toBe('saved')
    expect((design().overlay as { opacity: number }).opacity).toBe(1)
    setItem.mockRestore()
  })

  it('never writes for a simulation result, however large', () => {
    useAppStore.getState().upsertBed(makeBed(9))
    vi.advanceTimersByTime(WRITE_DELAY_MS)
    const afterEdit = localStorage.getItem(STORAGE_KEY)
    expect(afterEdit).not.toBeNull()

    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const raster = { grid: {}, skyViewFactor: new Float32Array(4) } as unknown as DliRaster
    useAppStore.setState({
      raster: ready(raster),
      bedLight: [],
      progress: { passesDone: 1, passesTotal: 4, elapsedMs: 12 },
      dragging: true,
    } as Partial<AppState>)
    vi.advanceTimersByTime(WRITE_DELAY_MS * 4)
    expect(setItem).not.toHaveBeenCalled()
    expect(localStorage.getItem(STORAGE_KEY)).toBe(afterEdit)
    setItem.mockRestore()
  })

  it('holds only the persisted keys, whatever else the store is carrying', () => {
    useAppStore.getState().setPlantYear(3)
    vi.advanceTimersByTime(WRITE_DELAY_MS)
    expect(Object.keys(design()).sort()).toEqual([...PERSISTED_KEYS].sort())
  })

  it('saves immediately when the grower asks, without waiting out the debounce', () => {
    useAppStore.getState().setMaxCropsPerBed(6)
    useAppStore.getState().saveDesign()
    expect(design().maxCropsPerBed).toBe(6)
    const status = useAppStore.getState().storage
    expect(status.outcome).toBe('saved')
    expect(status.bytes).toBeGreaterThan(0)
    expect(status.savedAtUtcMillis).not.toBeNull()
  })

  it('forgets the design and returns to the default one on reset', () => {
    useAppStore.getState().upsertBed(makeBed(9))
    useAppStore.getState().saveDesign()
    const grown = useAppStore.getState().plot?.beds.length ?? 0

    useAppStore.getState().clearDesign()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(useAppStore.getState().storage.outcome).toBe('cleared')
    expect(useAppStore.getState().plot?.beds.length).toBeLessThan(grown)

    // and the reset does not immediately write the default design back out
    vi.advanceTimersByTime(WRITE_DELAY_MS * 2)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  /**
   * The wildlife answers are the grower's, so they outlive the session the way a preference for
   * a crop does. Patched one at a time, because the two questions are asked on two steps and a
   * setter that replaced the pair would take back whichever was answered first
   */
  it('keeps each wildlife answer separately, and saves both', () => {
    // both start off, so the answer worth holding is the one that turns a switch ON: a setter
    // that replaced the pair would take the first of those back when the second was answered
    expect(useAppStore.getState().wildlife).toEqual({
      favourNative: false,
      favourPollinators: false,
    })
    useAppStore.getState().setWildlife({ favourNative: true })
    expect(useAppStore.getState().wildlife).toEqual({
      favourNative: true,
      favourPollinators: false,
    })
    useAppStore.getState().setWildlife({ favourPollinators: true })
    expect(useAppStore.getState().wildlife).toEqual({
      favourNative: true,
      favourPollinators: true,
    })
    vi.advanceTimersByTime(WRITE_DELAY_MS)
    expect(design().wildlife).toEqual({ favourNative: true, favourPollinators: true })
  })

  it('surfaces a quota failure on the status the panel reads', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('over quota', 'QuotaExceededError')
    })
    useAppStore.getState().setPlantYear(4)
    vi.advanceTimersByTime(WRITE_DELAY_MS)
    const status = useAppStore.getState().storage
    expect(status.outcome).toBe('quota-exceeded')
    expect(status.message).toContain('no room')
    setItem.mockRestore()
  })
})

describe('forgetting the garden forgets the conversation about it', () => {
  /**
   * A transcript is worthless without the design it describes. Leaving one behind means somebody
   * who cleared their garden from the editor comes back to an agent talking about a plot that no
   * longer exists
   */
  it('clears the agent transcript along with the design', () => {
    localStorage.setItem(TRANSCRIPT_KEY, '[{"from":"us","lines":[],"offer":[]}]')
    useAppStore.getState().clearDesign()
    expect(localStorage.getItem(TRANSCRIPT_KEY)).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
