import { describe, expect, it } from 'bun:test'
import { overlayOffOnSeasons } from '../state/overlay'
import { DliLegend } from './DliLegend'
import { mount } from './testkit'

/**
 * The color key has one control, a fold, and it only exists on a phone.
 *
 * Measured at 320x568 it was 88px of a 471px stage, with the example notice above it, so a third
 * of the garden was furniture describing the garden and there was no way to put any of it away.
 * The notice at least had a close. This had nothing, which also meant it had nothing in the tab
 * order and a keyboard couldn't reach it at all.
 *
 * As with the notice, the fold ITSELF can't be tested here: which half is on screen is a
 * stylesheet decision that differs by width, and jsdom has neither layout nor media queries. What
 * is held here is that the press flips one state and says which way it is facing, and that the
 * caption and the staleness warning are never what folds away, since those are what a folded key
 * still has to say
 */
const legend = (
  <DliLegend
    testId="readout-overlay-legend"
    label="Daily light integral"
    unit="mol/m²/d"
    min={4}
    max={22}
    stale
  />
)

describe('the color key folds', () => {
  it('opens unfolded, because a key nobody asked to put away is a key', async () => {
    const harness = await mount(legend)
    expect(harness.get('readout-overlay-legend').getAttribute('data-folded')).toBeNull()
    expect(harness.get('action-legend-fold').getAttribute('aria-expanded')).toBe('true')
    await harness.unmount()
  })

  it('says what the press will do rather than what is on screen', async () => {
    const harness = await mount(legend)
    // the visible word is short because it shares a line with the caption on a 320px screen, so
    // the accessible name is the half carrying the sentence
    expect(harness.get('action-legend-fold').getAttribute('aria-label')).toBe('Hide the color key')
    await harness.click('action-legend-fold')
    expect(harness.get('action-legend-fold').getAttribute('aria-label')).toBe('Show the color key')
    expect(harness.get('readout-overlay-legend').getAttribute('data-folded')).toBe('true')
    expect(harness.get('action-legend-fold').getAttribute('aria-expanded')).toBe('false')
    await harness.unmount()
  })

  it('folds the key and not the sentence saying not to trust it', async () => {
    const harness = await mount(legend)
    await harness.click('action-legend-fold')
    // still says which quantity the ground is colored by
    expect(harness.container.querySelector('figcaption')?.textContent).toContain(
      'Daily light integral',
    )
    // and still says the colors are for a garden that has since changed, which is the one thing
    // on this surface that is a warning rather than a key
    expect(harness.find('readout-overlay-legend-stale')).not.toBeNull()
    await harness.unmount()
  })

  it('comes back, so the fold is a fold and not a dismissal', async () => {
    const harness = await mount(legend)
    await harness.click('action-legend-fold')
    await harness.click('action-legend-fold')
    expect(harness.get('readout-overlay-legend').getAttribute('data-folded')).toBeNull()
    expect(harness.find('readout-overlay-legend-contours')).not.toBeNull()
    await harness.unmount()
  })
})

describe('the key says what the colors mean, in words a beginner reads', () => {
  it('says which way the ramp runs and how far apart the lines are', async () => {
    const harness = await mount(legend)
    const note = harness.container.querySelector('.legend-note')?.textContent ?? ''
    expect(note).toContain('Darker is less, brighter is more')
    expect(note).toContain('Lines on the ground every')
    // the audit's defect 6: a contrast construction survived the voice sweep here
    expect(note).not.toMatch(/viridis|rainbow|, not /i)
    await harness.unmount()
  })
})

/**
 * The key over the canvas and the overlay in the scene are two components in two files, and both
 * read this one condition: with two copies of it, the seasons step could stop painting the ground
 * and leave the caption standing over it
 */
describe("the key isn't shown over ground nothing is coloring", () => {
  it('is off on the seasons step and on everywhere else', () => {
    expect(overlayOffOnSeasons({ sidebarStep: 'seasons' })).toBe(true)
    expect(overlayOffOnSeasons({ sidebarStep: 'light' })).toBe(false)
  })
})
