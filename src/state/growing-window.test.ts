import { beforeEach, describe, expect, it } from 'bun:test'
import { siteFixture } from '../recommend/testkit'
import { SIM_GROWING_WINDOW } from './defaults'
import { growingWindowOf } from './growing-window'
import { ready } from './slices'
import { resetAppStore, useAppStore } from './store'

beforeEach(() => {
  resetAppStore()
})

describe('the window the app reads its season over', () => {
  it('is the fixed one until a site is resolved, then the site frost window', () => {
    expect(growingWindowOf(useAppStore.getState())).toBe(SIM_GROWING_WINDOW)
    useAppStore.setState({ site: ready(siteFixture()) })
    expect(growingWindowOf(useAppStore.getState())).toEqual({ startMonth: 5, endMonth: 10 })
  })

  it('hands back the same object until the site or the percentile moves', () => {
    useAppStore.setState({ site: ready(siteFixture()) })
    const first = growingWindowOf(useAppStore.getState())
    useAppStore.setState({ selectedBedId: null })
    expect(growingWindowOf(useAppStore.getState())).toBe(first)
    useAppStore.getState().setFrostPercentile(50)
    expect(growingWindowOf(useAppStore.getState())).not.toBe(first)
  })
})
