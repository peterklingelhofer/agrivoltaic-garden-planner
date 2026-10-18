import { beforeEach, describe, expect, it } from 'bun:test'
import { loadCitations } from '../data/citations'
import { getAppState, resetAppStore } from '../state/store'
import { SCOPE_HEADLINE, SCOPE_STATEMENT } from './onboarding'
import { SourcesPanel } from './SourcesPanel'
import { mount } from './testkit'

/**
 * Why this file exists.
 *
 * The app disclaims narrowly and well per claim, DLI, water, compliance, and one blanket statement
 * at the top of Sources says plainly that its output is a planning estimate, which an agronomist or
 * an engineer hasn't signed off on. The one way that statement could regress is by ending up
 * behind `showsFigures`: novice is the default experience and the one most likely to see a
 * stripped-down panel, so that is the level this checks
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

  it('sits before the bibliography, outside it', async () => {
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

// A page a source cites can move or vanish, so a work with a URL carries a saved copy beside its
// title. A work cited by DOI has none on purpose, because the DOI is the durable link
describe('the archived copy of a work', () => {
  it('links the saved copy and leads its accessible name with the title', async () => {
    const registry = await loadCitations()
    const record = [...registry.values()].find((r) => r.archived !== null)
    if (record === undefined) throw new Error('no work carries an archived copy')
    const harness = await mount(<SourcesPanel />)
    const link = harness.get(`link-source-archive-${record.id}`)
    expect(link.getAttribute('href')).toBe(record.archived)
    expect(link.textContent).toBe('archived copy')
    expect(link.getAttribute('target')).toBe('_blank')
    // the title leads, so the many links that all read "archived copy" can be told apart
    expect(link.getAttribute('aria-label')).toStartWith(record.title)
    await harness.unmount()
  })

  it('draws no link for a work with no saved copy', async () => {
    const registry = await loadCitations()
    const record = [...registry.values()].find((r) => r.archived === null)
    if (record === undefined) throw new Error('every work carries an archived copy')
    const harness = await mount(<SourcesPanel />)
    // the row itself renders, so the absent link can't come from an empty list
    expect(harness.find(`item-source-${record.id}`)).not.toBeNull()
    expect(harness.find(`link-source-archive-${record.id}`)).toBeNull()
    await harness.unmount()
  })
})
