import { beforeEach, describe, expect, it } from 'bun:test'
import type { OverlayChannel } from '../state/slices'
import { resetAppStore, useAppStore } from '../state/store'
import { ArrayPanel } from './ArrayPanel'
import { GroundPanel } from './BedPanel'
import { OverlayPanel } from './OverlayPanel'
import { SimPanel } from './SimPanel'
import { mount } from './testkit'

/**
 * Why this file exists.
 *
 * DLI, mol/m²/d, RSR, sky view factor, Tregenza and Reinhart mean nothing to a beginner unless
 * something on screen says what they are. What is asserted here is not the wording, which is free
 * to improve, but that the term and the words for it are on screen together, in the panel where the
 * term appears
 */

beforeEach(() => {
  resetAppStore()
})

const GLOSSED: readonly (readonly [OverlayChannel, readonly string[]])[] = [
  ['dli', ['DLI', 'mol/m²/d']],
  ['rsr', ['RSR', 'open sky']],
  ['sky-view-factor', ['Sky view factor', 'sky']],
]

describe('the editor explains its own vocabulary where the vocabulary appears', () => {
  /**
   * The gloss moved from a standing paragraph into the info tip beside the channel control: it
   * is a definition of a term, which is the one kind of thing that may be asked for rather than
   * always shown. What must not change is that it is still THERE and still says the same words,
   * so this opens the tip rather than deleting the assertion
   */
  it('says what the selected overlay channel measures, in words, when asked', async () => {
    for (const [channel, terms] of GLOSSED) {
      useAppStore.getState().setOverlay({ channel })
      const harness = await mount(<OverlayPanel />)
      expect(harness.find('info-overlay-channel-bubble')).toBeNull()
      await harness.click('info-overlay-channel')
      const help = harness.get('info-overlay-channel-bubble').textContent ?? ''
      for (const term of terms) expect(help, `${channel}: ${term}`).toContain(term)
      // the acronym is kept rather than replaced: an expert is entitled to recognise it
      expect(harness.get('control-overlay-channel').textContent).toContain('Daily light integral')
      await harness.unmount()
    }
  })

  /**
   * Every bake sets the sky subdivision, the substep count and the frame budget from a hardcoded
   * table, so the panel has no controls for them and says in a sentence what the run does. This
   * asserts the sentence is there and that the controls are not.
   *
   * The quick check went the same way on 2026-09-09, and for the same reason one rung up: it was
   * a second answer offered beside the one to trust, and a grower had to choose between them
   * without being told the choice could move a crop in or out of their plan. So the button is
   * gone and the panel offers one light check, which is asserted here
   */
  it('offers one light check, and no setting it will not honour', async () => {
    const harness = await mount(<SimPanel />)
    expect(harness.find('control-sim-subdivision')).toBeNull()
    expect(harness.find('control-sim-substeps')).toBeNull()
    expect(harness.find('control-sim-frame-budget')).toBeNull()
    expect(harness.find('action-sim-preview')).toBeNull()
    expect(harness.find('action-sim-final')).not.toBeNull()

    const quality = harness.get('readout-sim-quality').textContent ?? ''
    expect(quality).toMatch(/squares/i)
    expect(quality).toMatch(/sun's path/i)
    // and the sun-direction gloss waits for a raster, because until then no count is on screen
    expect(harness.find('readout-sim-sun-directions-help')).toBeNull()
    await harness.unmount()
  })
})

/**
 * The editor speaks the same language as the questions that lead into it.
 *
 * The guided questions read "What would you like to grow?" and "A rough rectangle is enough";
 * two inches to the right the same app said "Load catalog", "Load evidence", "Gizmo", "Row
 * pitch", "Close polygon" and "Backend: WebGL2 shadow maps (baseline)". One product, two voices,
 * and the second one is the half a beginner is left alone with.
 *
 * This asserts the rule rather than the wording, the way the tests above do: a control's LABEL is
 * in the reader's words, and the trade term it replaced is still somewhere on the panel for
 * whoever came with specs to copy from. Deleting the terms would have been the other failure
 */
describe('the editor speaks the same language as the questions that led into it', () => {
  const labelsOf = (harness: { readonly container: HTMLElement }): string =>
    [...harness.container.querySelectorAll('.field-label, .action, .panel-head h2, .panel-head h3')]
      .map((el) => el.textContent ?? '')
      .join(' | ')

  it('asks for the panels in words, and keeps the trade terms in the tip', async () => {
    const harness = await mount(<ArrayPanel />)
    const labels = labelsOf(harness)
    for (const jargon of [
      'Row pitch',
      'Collector width',
      'Clearance height',
      'Surface azimuth',
      'Module nameplate',
      'Modules per row',
      'Gizmo',
    ]) {
      expect(labels, jargon).not.toContain(jargon)
    }
    expect(labels).toContain('Row spacing, centre to centre')
    expect(labels).toContain('Headroom underneath')

    // an installer with a datasheet is still entitled to recognise every one of them
    await harness.click('info-array-gcr')
    const tip = harness.get('info-array-gcr-bubble').textContent ?? ''
    for (const term of ['module', 'collector width', 'pitch', 'clearance height', 'azimuth']) {
      expect(tip, term).toContain(term)
    }
    await harness.unmount()
  })

  it('names the drawing buttons after what they draw, not after the geometry', async () => {
    const harness = await mount(<GroundPanel />)
    const labels = labelsOf(harness)
    for (const jargon of ['Close polygon', 'Undo vertex', 'Draw plot boundary']) {
      expect(labels, jargon).not.toContain(jargon)
    }
    expect(labels).toContain('Close the shape')
    expect(labels).toContain('Undo the last corner')
    await harness.unmount()
  })
})
