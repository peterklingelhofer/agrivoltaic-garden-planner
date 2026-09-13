import { beforeEach, describe, expect, it } from 'bun:test'
import { loadCitations } from '../data/citations'
import { getAppState, resetAppStore } from '../state/store'
import { SCOPE_HEADLINE, SCOPE_STATEMENT } from './onboarding'
import { SourcesPanel } from './SourcesPanel'
import { mount } from './testkit'

/**
 * Why this file exists.
 *
 * The app disclaims narrowly and well per claim, DLI, water, compliance, but never once said
 * plainly that its output is a planning estimate rather than something an agronomist or an
 * engineer signed off on. That single blanket statement now sits at the top of Sources, and the
 * one way it could regress is by ending up behind `showsFigures`: novice is the default
 * experience and the one most likely to see a stripped-down panel, so that is the level this
 * checks
 */

beforeEach(() => {
  resetAppStore()
})

describe('the scope of the whole tool is stated once, plainly', () => {
  it('renders the caveat at the top of Sources for the plain experience level', async () => {
    expect(getAppState().answers.experience).toBe('novice')
    await loadCitations()
    const harness = await mount(<SourcesPanel />)
    const caveat = harness.get('readout-sources-scope')
    expect(caveat.textContent).toContain(SCOPE_HEADLINE)
    expect(caveat.textContent).toContain(SCOPE_STATEMENT)
    await harness.unmount()
  })

  it('renders the same caveat once the figures are switched on', async () => {
    getAppState().answerOnboarding({ experience: 'experienced' })
    await loadCitations()
    const harness = await mount(<SourcesPanel />)
    expect(harness.get('readout-sources-scope').textContent).toContain(SCOPE_HEADLINE)
    await harness.unmount()
  })

  it('sits before the bibliography rather than inside it', async () => {
    await loadCitations()
    const harness = await mount(<SourcesPanel />)
    const container = harness.container
    const scope = harness.get('readout-sources-scope')
    const list = harness.get('list-sources')
    // DOCUMENT_POSITION_FOLLOWING means `list` comes after `scope`, which is the ordering the
    // step promises: the caveat first, the works it covers below it
    expect(scope.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(container.contains(scope)).toBe(true)
    await harness.unmount()
  })
})
