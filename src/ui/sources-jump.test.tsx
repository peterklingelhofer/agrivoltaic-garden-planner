import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { vi } from '../../test/vi'
import { act, type ReactElement } from 'react'
import { loadCitations } from '../data/citations'
import { resetAppStore, useAppStore } from '../state/store'
import type { CitationId } from '../types/citation-ids.generated'
import { RUNKLE_CITED } from './dli'
import { SourceLink, SourcesPanel } from './SourcesPanel'
import { mount } from './testkit'
import { sourceRowId } from './useCitations'

/**
 * Why this file exists.
 *
 * A citation rendered as the plain string "Runkle 2011" leaves a reader memorising it, changing tab
 * and eye-scanning the whole list of works, with no id on a row to aim at even once they know which
 * one they want. Everything asserted here is about closing that distance: the row can be addressed,
 * the control reaches it, and arriving is both visible and said out loud
 */

beforeEach(() => {
  resetAppStore()
})

afterEach(() => {
  vi.useRealTimers()
})

const Both = ({ id }: { readonly id: CitationId }): ReactElement => (
  <>
    <SourceLink id={id} />
    <SourcesPanel />
  </>
)

/**
 * `Tabs` renders children for the selected tab alone, so in the editor the panel that has to
 * serve a jump does not exist at the moment the jump is asked for. Rebuilt here directly.
 * Not mounted through the real sidebar: that is the whole of the condition being tested
 */
const LikeTheSidebar = ({ id }: { readonly id: CitationId }): ReactElement => {
  const tab = useAppStore((s) => s.sidebarStep)
  return <>{tab === 'sources' ? <SourcesPanel /> : <SourceLink id={id} />}</>
}

describe('a source is one control away from the claim that rests on it', () => {
  it('gives every row an id derived from its citekey', async () => {
    const registry = await loadCitations()
    const harness = await mount(<SourcesPanel />)
    for (const id of registry.keys()) {
      expect(document.getElementById(sourceRowId(id)), id).not.toBeNull()
    }
    await harness.unmount()
  })

  it('labels the control with the citation and reaches Sources from a keyboard', async () => {
    const registry = await loadCitations()
    const harness = await mount(<Both id={RUNKLE_CITED} />)
    const control = harness.get(`action-source-jump-${RUNKLE_CITED}`)
    // a button. Not a styled span: Tab reaches it and Enter presses it for free
    expect(control.tagName).toBe('BUTTON')
    const label = control.textContent ?? ''
    expect(label).toContain(String(registry.get(RUNKLE_CITED)?.year))
    // the visible words lead the accessible name, without being replaced by it
    expect(control.getAttribute('aria-label')).toBe(`${label}, show this work in Sources`)

    expect(useAppStore.getState().sidebarStep).not.toBe('sources')
    await harness.click(`action-source-jump-${RUNKLE_CITED}`)
    expect(useAppStore.getState().sidebarStep).toBe('sources')
    await harness.unmount()
  })

  it('highlights the row it landed on and says so politely', async () => {
    const harness = await mount(<Both id={RUNKLE_CITED} />)
    const row = harness.get(`item-source-${RUNKLE_CITED}`)
    expect(row.getAttribute('data-arrived')).toBeNull()
    expect(harness.get('status-source-jump').textContent).toBe('')

    await harness.click(`action-source-jump-${RUNKLE_CITED}`)
    expect(row.getAttribute('data-arrived')).toBe('true')
    // a polite live region and not an alert: the reader is told, never interrupted
    const said = harness.get('status-source-jump')
    expect(said.getAttribute('role')).toBe('status')
    expect(said.textContent).toContain('Showing')
    // a dispatched click leaves focus on nothing, which is exactly what a tab change does to
    // the control that asked, so the row is where the focus is put back
    expect(document.activeElement).toBe(row)
    await harness.unmount()
  })

  it('survives the tab change that unmounts the control and mounts the panel', async () => {
    useAppStore.getState().setSidebarStep('ground')
    const harness = await mount(<LikeTheSidebar id={RUNKLE_CITED} />)
    expect(harness.find(`item-source-${RUNKLE_CITED}`)).toBeNull()

    await harness.click(`action-source-jump-${RUNKLE_CITED}`)
    // the panel that was asked did not exist when it was asked, and the row is lit all the same
    expect(harness.get(`item-source-${RUNKLE_CITED}`).getAttribute('data-arrived')).toBe('true')
    await harness.unmount()
  })

  it('lets the highlight burn down and lights up again for a second request', async () => {
    vi.useFakeTimers()
    const harness = await mount(<Both id={RUNKLE_CITED} />)
    const row = harness.get(`item-source-${RUNKLE_CITED}`)

    await harness.click(`action-source-jump-${RUNKLE_CITED}`)
    expect(row.getAttribute('data-arrived')).toBe('true')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    // it fades without sticking: a permanent tint would read as a state of the work itself
    expect(row.getAttribute('data-arrived')).toBeNull()
    expect(harness.get('status-source-jump').textContent).toBe('')

    await harness.click(`action-source-jump-${RUNKLE_CITED}`)
    expect(row.getAttribute('data-arrived')).toBe('true')
    await harness.unmount()
  })
})
