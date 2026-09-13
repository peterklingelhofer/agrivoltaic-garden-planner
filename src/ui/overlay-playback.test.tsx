import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { vi } from '../../test/vi'
import { overlaySlice, resetAppStore, useAppStore } from '../state/store'
import { OverlayPanel } from './OverlayPanel'
import { mount } from './testkit'
import { OVERLAY_PLAYBACK_MS } from './useOverlayPlayback'

/**
 * Playback runs the overlay through the year, so the grower doesn't have to assemble it in their
 * head from one slice at a time. What matters here is not that it moves but that it moves WITHOUT
 * taking anything: the month they chose is part of the persisted design, and a playback that wrote
 * to it would hand back a month they never picked and rewrite storage on a timer
 */

beforeEach(() => {
  localStorage.clear()
  resetAppStore()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('playing the light overlay through the year', () => {
  it('steps the month drawn and leaves the month chosen alone', async () => {
    vi.useFakeTimers()
    useAppStore.getState().setOverlay({ slice: 5 })
    const harness = await mount(<OverlayPanel />)

    await harness.click('action-overlay-play')
    expect(overlaySlice(useAppStore.getState())).toBe(5)

    await vi.advanceTimersByTimeAsync(OVERLAY_PLAYBACK_MS + 20)
    expect(overlaySlice(useAppStore.getState())).toBe(6)
    // what the grower picked is untouched the whole way through
    expect(useAppStore.getState().overlay.slice).toBe(5)

    await harness.click('action-overlay-play')
    expect(useAppStore.getState().overlayPlayback).toBeNull()
    expect(overlaySlice(useAppStore.getState())).toBe(5)
    await harness.unmount()
  })

  it('wraps December round to January rather than running off the end', async () => {
    vi.useFakeTimers()
    useAppStore.getState().setOverlay({ slice: 12 })
    const harness = await mount(<OverlayPanel />)
    await harness.click('action-overlay-play')
    await vi.advanceTimersByTimeAsync(OVERLAY_PLAYBACK_MS + 20)
    expect(overlaySlice(useAppStore.getState())).toBe(1)
    await harness.unmount()
  })

  it('starts at January when the annual mean is what is on screen', async () => {
    vi.useFakeTimers()
    useAppStore.getState().setOverlay({ slice: 'annual' })
    const harness = await mount(<OverlayPanel />)
    await harness.click('action-overlay-play')
    expect(overlaySlice(useAppStore.getState())).toBe(1)
    await harness.unmount()
  })

  it('drops the playback when the panel goes away, leaving nothing running', async () => {
    vi.useFakeTimers()
    const harness = await mount(<OverlayPanel />)
    await harness.click('action-overlay-play')
    expect(useAppStore.getState().overlayPlayback).not.toBeNull()
    await harness.unmount()
    expect(useAppStore.getState().overlayPlayback).toBeNull()
  })
})

describe('accumulating the overlay while it plays', () => {
  it('starts accumulating from the month on screen when flipped mid-run, and stops without stopping playback', async () => {
    vi.useFakeTimers()
    useAppStore.getState().setOverlay({ slice: 3 })
    const harness = await mount(<OverlayPanel />)

    await harness.click('action-overlay-play')
    expect(useAppStore.getState().overlayPlayback).toMatchObject({ month: 3, from: null })
    expect(harness.get('readout-overlay-playing').textContent).toBe('Showing Mar')

    // flipping the toggle while March is on screen: the run counts forward from March, not
    // from January, because there was no earlier month this run ever showed
    await harness.click('control-overlay-accumulate')
    expect(useAppStore.getState().overlayPlayback).toMatchObject({ month: 3, from: 3 })
    expect(harness.get('readout-overlay-playing').textContent).toBe('Showing Mar')

    await vi.advanceTimersByTimeAsync(OVERLAY_PLAYBACK_MS + 20)
    expect(useAppStore.getState().overlayPlayback).toMatchObject({ month: 4, from: 3 })
    expect(harness.get('readout-overlay-playing').textContent).toBe('Showing Mar to Apr')

    // flipping it back off drops to one month at a time without stopping the run
    await harness.click('control-overlay-accumulate')
    expect(useAppStore.getState().overlayPlayback).toMatchObject({ month: 4, from: null })
    expect(harness.get('readout-overlay-playing').textContent).toBe('Showing Apr')
    expect(useAppStore.getState().overlayPlayback).not.toBeNull()
    await harness.unmount()
  })

  it('wraps the span through December when the run crosses the year boundary', async () => {
    vi.useFakeTimers()
    useAppStore.getState().setOverlay({ slice: 11 })
    const harness = await mount(<OverlayPanel />)

    await harness.click('action-overlay-play')
    await harness.click('control-overlay-accumulate')
    expect(useAppStore.getState().overlayPlayback).toMatchObject({ month: 11, from: 11 })

    // Nov -> Dec -> Jan -> Feb is four months, wrapping through the turn of the year
    await vi.advanceTimersByTimeAsync((OVERLAY_PLAYBACK_MS + 20) * 3)
    expect(useAppStore.getState().overlayPlayback).toMatchObject({ month: 2, from: 11 })
    expect(harness.get('readout-overlay-playing').textContent).toBe('Showing Nov to Feb')
    await harness.unmount()
  })

  it('starts a fresh run not accumulating, matching the behaviour before accumulation existed', async () => {
    vi.useFakeTimers()
    useAppStore.getState().setOverlay({ slice: 6 })
    const harness = await mount(<OverlayPanel />)
    await harness.click('action-overlay-play')
    expect(useAppStore.getState().overlayPlayback).toMatchObject({ month: 6, from: null })
    expect(harness.get('readout-overlay-playing').textContent).toBe('Showing Jun')
    await harness.unmount()
  })
})
