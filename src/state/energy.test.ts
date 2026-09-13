import { beforeEach, describe, expect, it } from 'bun:test'
import { makeArray } from './defaults'
import { ready } from './slices'
import { ENERGY_NEEDS_ARRAY, ENERGY_NEEDS_SITE, resetAppStore, useAppStore } from './store'

beforeEach(() => resetAppStore())

const state = (): ReturnType<typeof useAppStore.getState> => useAppStore.getState()

describe('annual energy state', () => {
  it('starts idle, with no substituted electricity term', () => {
    expect(state().energy.status).toBe('idle')
  })

  it('says what is missing rather than falling back to a figure', () => {
    state().runEnergy()
    const energy = state().energy
    expect(energy.status).toBe('error')
    expect(energy.status === 'error' ? energy.message : '').toBe(ENERGY_NEEDS_SITE)
  })

  it('refuses to run for a plot with no array', () => {
    const plot = state().plot
    if (plot === null) throw new Error('no default plot')
    useAppStore.setState({
      plot: { ...plot, arrays: [] },
      site: ready({} as never),
      weather: ready({} as never),
    })
    state().runEnergy()
    const energy = state().energy
    expect(energy.status === 'error' ? energy.message : '').toBe(ENERGY_NEEDS_ARRAY)
  })

  it('discards a stale report when the array geometry moves', () => {
    useAppStore.setState({ energy: ready({} as never) })
    state().upsertArray(makeArray(1))
    expect(state().energy.status).toBe('idle')
  })
})
