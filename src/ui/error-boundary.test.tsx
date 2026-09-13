import { describe, expect, it } from 'bun:test'
import { ErrorBoundary } from './ErrorBoundary'
import { mount } from './testkit'

const Broken = (): never => {
  throw new Error('raster index 4 out of range')
}

describe('what a part of the app that threw is replaced with', () => {
  it('says what to do in plain words, with a reload press', async () => {
    const harness = await mount(
      <ErrorBoundary label="Light overlay" testId="panel-overlay-failed">
        <Broken />
      </ErrorBoundary>,
    )
    const panel = harness.get('panel-overlay-failed')
    expect(panel.dataset.state).toBe('error')
    expect(panel.textContent).toContain(
      'Something in the app broke. Reload the page; your garden is saved in this browser.',
    )
    expect(harness.get('action-app-reload').textContent).toBe('Reload')
  })

  it('keeps the raw message behind a fold for a bug report', async () => {
    const harness = await mount(
      <ErrorBoundary label="Light overlay" testId="panel-overlay-failed">
        <Broken />
      </ErrorBoundary>,
    )
    const details = harness.get('details-app-error') as HTMLDetailsElement
    expect(details.open).toBe(false)
    expect(details.querySelector('summary')?.textContent).toBe('Details for a bug report')
    expect(details.textContent).toContain('raster index 4 out of range')
    // the sentence on show says nothing a grower cannot act on
    const shown = harness.get('panel-overlay-failed').querySelector('.notice-error')
    expect(shown?.textContent).not.toContain('raster index')
  })

  it('renders its children when nothing throws', async () => {
    const harness = await mount(
      <ErrorBoundary label="Light overlay" testId="panel-overlay-failed">
        <p data-testid="readout-fine">fine</p>
      </ErrorBoundary>,
    )
    expect(harness.find('panel-overlay-failed')).toBeNull()
    expect(harness.get('readout-fine').textContent).toBe('fine')
  })
})
