import { act } from 'react'
import { beforeEach, describe, expect, it } from 'bun:test'
import { STORAGE_KEY, STORAGE_QUOTA } from '../state/persist'
import { resetAppStore, useAppStore } from '../state/store'
import { StoragePanel } from './StoragePanel'
import { FORGET_COST } from './storage-copy'
import { mount } from './testkit'

beforeEach(() => {
  localStorage.clear()
  resetAppStore()
})

describe('storage panel', () => {
  it('states what is kept, where it is kept and what is not kept', async () => {
    const harness = await mount(<StoragePanel />)
    const panel = harness.get('panel-storage').textContent ?? ''
    expect(panel).toContain('kept in this browser alone')
    /*
      The transcript is one of the things kept, and it is made of somebody's own sentences. A
      panel whose whole job is to say what is kept, listing everything except that, is the
      disclosure failing at the only thing it does. Asserted under the flag because it is only
      true of a build that carries the agent, and a deployed build does not
    */
    if (__AGENT_ENABLED__) expect(panel).toContain('said to the agent')
    expect(panel).toContain('Nothing is uploaded')
    expect(harness.get('readout-storage-scope').textContent).toContain('No simulation result')
    await harness.unmount()
  })

  it('saves on demand and reports the size and time it stored', async () => {
    const harness = await mount(<StoragePanel />)
    expect(harness.get('readout-storage-saved').textContent).toBe('not yet')
    await harness.click('action-storage-save')
    expect(harness.get('status-storage').dataset.state).toBe('saved')
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
    expect(harness.get('readout-storage-size').textContent).toMatch(/[1-9]/)
    expect(harness.get('readout-storage-saved').textContent).not.toBe('not yet')
    await harness.unmount()
  })

  it('forgets the design on reset and says it did', async () => {
    useAppStore.getState().setPlantYear(5)
    const harness = await mount(<StoragePanel />)
    await harness.click('action-storage-save')
    await harness.click('action-storage-reset')
    await harness.click('action-storage-forget-confirm')
    expect(harness.get('status-storage').dataset.state).toBe('cleared')
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(useAppStore.getState().plantYear).toBe(1)
    await harness.unmount()
  })

  /**
   * The press sits beside "Save now", and what it does is not what its label says: `clearDesign`
   * puts the whole app back to `initialData()`, so the plot, the beds and every planting go with
   * the stored copy, and there is no undo anywhere for that. One press has to arm it and a second
   * has to mean it
   */
  it('takes two presses to forget, and leaves everything alone after the first', async () => {
    useAppStore.getState().setPlantYear(5)
    const harness = await mount(<StoragePanel />)
    await harness.click('action-storage-save')
    expect(harness.find('panel-storage-confirm')).toBeNull()

    await harness.click('action-storage-reset')
    // armed and nothing done: the design and the stored copy are both still there
    expect(harness.find('panel-storage-confirm')).not.toBeNull()
    expect(useAppStore.getState().plantYear).toBe(5)
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()

    await harness.click('action-storage-forget-cancel')
    expect(harness.find('panel-storage-confirm')).toBeNull()
    expect(useAppStore.getState().plantYear).toBe(5)
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
    await harness.unmount()
  })

  /**
   * `describedBy` exists so a button whose label cannot carry the cost can point at the sentence
   * that does. This one cannot: "Forget saved design" names a browser copy and says nothing about
   * the garden going with it
   */
  it('names what the press costs, and says so to a screen reader as well as on the page', async () => {
    const harness = await mount(<StoragePanel />)
    const said = harness.get('readout-storage-forget-cost')
    expect(said.textContent).toBe(FORGET_COST)
    expect(said.textContent).toMatch(/every bed/i)
    expect(said.textContent).toMatch(/bring them back/i)
    expect(harness.get('action-storage-reset').getAttribute('aria-describedby')).toBe(said.id)
    await harness.unmount()
  })

  it('paints a refused write as an error the grower can read, never a silent failure', async () => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new DOMException('over quota', 'QuotaExceededError')
    }
    const harness = await mount(<StoragePanel />)
    await harness.click('action-storage-save')
    const notice = harness.get('status-storage')
    expect(notice.dataset.state).toBe('quota-exceeded')
    expect(notice.textContent).toBe(STORAGE_QUOTA)
    expect(notice.className).toContain('notice-error')
    Storage.prototype.setItem = original
    await harness.unmount()
  })

  /** Every outcome must land on a notice class the contrast suite already audits */
  it('never paints a state without both a colour and a background rule', async () => {
    const harness = await mount(<StoragePanel />)
    const audited = ['notice-error', 'notice-warn', 'notice-ready', 'notice-idle']
    for (const outcome of [
      'unavailable',
      'idle',
      'restored',
      'repaired',
      'discarded',
      'saved',
      'cleared',
      'quota-exceeded',
      'failed',
    ] as const) {
      await act(async () => {
        useAppStore.setState({
          storage: { outcome, message: outcome, bytes: 0, savedAtUtcMillis: null },
        })
      })
      const notice = harness.get('status-storage')
      expect(notice.dataset.state).toBe(outcome)
      expect(
        audited.some((name) => notice.className.includes(name)),
        outcome,
      ).toBe(true)
      expect(notice.style.opacity, outcome).toBe('')
    }
    await harness.unmount()
  })
})
