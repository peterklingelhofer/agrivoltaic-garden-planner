import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { vi } from '../../test/vi'
import { makeBed } from '../state/defaults'
import { lightGeometryKey } from '../state/light-freshness'
import { ready } from '../state/slices'
import { resetAppStore, useAppStore } from '../state/store'
import { mount, type Harness } from './testkit'
import { AUTO_LIGHT_DELAY_MS, useAutoLight } from './useAutoLight'

const Probe = (): null => {
  useAutoLight()
  return null
}

const state = (): ReturnType<typeof useAppStore.getState> => useAppStore.getState()

/** Puts a light field on the store as though a bake had just finished over the current plot */
const bakeHappened = (): void => {
  const plot = state().plot
  useAppStore.setState((s) => ({
    ...s,
    raster: ready({} as never),
    lightGeometry: plot ? lightGeometryKey(plot) : null,
  }))
}

/**
 * Held so it can be unmounted. Every one of these mounts a component that subscribes to a store
 * shared by the whole file, so a harness left mounted goes on answering the NEXT test's edits: one
 * leaked per test reads as the hook firing two and three times, which looks exactly like a debounce
 * that doesn't work
 */
let harness: Harness | null = null
const probe = async (): Promise<void> => {
  harness = await mount(<Probe />)
}

const runFinal = vi.fn(async () => {})

beforeEach(() => {
  resetAppStore()
  runFinal.mockClear()
  useAppStore.setState((s) => ({ ...s, runFinal }))
  vi.useFakeTimers()
})

afterEach(async () => {
  vi.useRealTimers()
  await harness?.unmount()
  harness = null
})

const tick = (ms: number): void => {
  act(() => void vi.advanceTimersByTime(ms))
}

describe('re-running the light after the garden moves', () => {
  it("doesn't run while the light still describes the garden", async () => {
    bakeHappened()
    await probe()
    tick(AUTO_LIGHT_DELAY_MS * 3)
    expect(runFinal).not.toHaveBeenCalled()
  })

  it('runs once the garden has moved out from under it', async () => {
    bakeHappened()
    await probe()
    act(() => state().upsertBed(makeBed(1, { label: 'moved' })))
    tick(AUTO_LIGHT_DELAY_MS + 20)
    expect(runFinal).toHaveBeenCalledTimes(1)
  })

  /** A nudge, then another before the first has fired, is one bake */
  it('waits for the last change rather than baking each one', async () => {
    bakeHappened()
    await probe()
    act(() => state().upsertBed(makeBed(1, { label: 'first nudge' })))
    tick(AUTO_LIGHT_DELAY_MS / 2)
    act(() => state().upsertBed(makeBed(1, { label: 'second nudge' })))
    tick(AUTO_LIGHT_DELAY_MS / 2 + 20)
    expect(runFinal).not.toHaveBeenCalled()
    tick(AUTO_LIGHT_DELAY_MS)
    expect(runFinal).toHaveBeenCalledTimes(1)
  })

  /** Nothing to read the light against yet: the place hasn't resolved */
  it("doesn't start the first bake before the place has been looked up", async () => {
    await probe()
    act(() => state().upsertBed(makeBed(1, { label: 'drawn' })))
    tick(AUTO_LIGHT_DELAY_MS * 3)
    expect(runFinal).not.toHaveBeenCalled()
  })

  /**
   * The first light follows the place, since 2026-09-10: a looked-up town and a bed are enough,
   * and nobody has to find a button. The site and weather are stubbed ready with empty values
   * because the hook reads their status and nothing else
   */
  it("starts the first bake once the place has resolved and there's a bed", async () => {
    useAppStore.setState((s) => ({
      ...s,
      site: ready({} as never),
      weather: ready({} as never),
    }))
    await probe()
    tick(AUTO_LIGHT_DELAY_MS + 20)
    expect(runFinal).toHaveBeenCalledTimes(1)
  })

  /** A run that failed isn't retried on a timer: the light step keeps the press for that */
  it('leaves a failed run alone', async () => {
    useAppStore.setState((s) => ({
      ...s,
      site: ready({} as never),
      weather: ready({} as never),
      raster: { status: 'error', message: 'no worker' },
    }))
    await probe()
    tick(AUTO_LIGHT_DELAY_MS * 3)
    expect(runFinal).not.toHaveBeenCalled()
  })

  /** Cancel means cancel: the same arrangement isn't started again until something moves */
  it("doesn't restart a run the grower canceled until the garden changes", async () => {
    useAppStore.setState((s) => ({
      ...s,
      site: ready({} as never),
      weather: ready({} as never),
      raster: { status: 'loading' },
    }))
    await probe()
    act(() => state().cancel())
    tick(AUTO_LIGHT_DELAY_MS * 3)
    expect(runFinal).not.toHaveBeenCalled()
    act(() => state().upsertBed(makeBed(1, { label: 'moved after the cancel' })))
    tick(AUTO_LIGHT_DELAY_MS + 20)
    expect(runFinal).toHaveBeenCalledTimes(1)
  })

  /** The layout search bakes its own candidates, and the editor waits for it to finish */
  it('waits while the layout search is running', async () => {
    useAppStore.setState((s) => ({
      ...s,
      site: ready({} as never),
      weather: ready({} as never),
      onboarding: { ...s.onboarding, designs: { status: 'loading' } },
    }))
    await probe()
    tick(AUTO_LIGHT_DELAY_MS * 3)
    expect(runFinal).not.toHaveBeenCalled()
  })
})
