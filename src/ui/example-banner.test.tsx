/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { vi } from '../../test/vi'
import { exampleDesignPath, exampleRasterPath } from '../state/example'
import { getAppState, resetAppStore, showingExample, useAppStore } from '../state/store'
import { ExampleBanner } from './ExampleBanner'
import { mount } from './testkit'

/**
 * The banner's close puts away only the notice, and its destructive press is a second control.
 *
 * "Clear the example and start my own" was the only way to stop reading a 226px card, so putting
 * the notice away and deleting the garden it described were the same press. On a 360x640 phone
 * that card and the legend covered 88% of the canvas between them and the garden got 47px, which
 * is what made a missing close a real problem rather than a tidiness one.
 *
 * The fold itself cannot be tested here: which of the two halves is on screen is a stylesheet
 * decision that differs by width, and jsdom has neither layout nor media queries. What is tested
 * is that the two presses do two different things, and that the destructive one still exists
 */

/**
 * The bytes that really deploy, off disk: `public/` is not transformed by Vite, so serving the
 * shipped files is the only way to exercise the banner against the provenance it actually reads
 */
const shipped = (path: string): Buffer => readFileSync(`public${path}`)

beforeEach(() => {
  localStorage.clear()
  resetAppStore()
  vi.stubGlobal('fetch', (input: string) => {
    if (input === exampleDesignPath('temperate')) {
      return Promise.resolve(new Response(shipped(input).toString('utf8')))
    }
    if (input === exampleRasterPath('temperate')) {
      // a fresh ArrayBuffer rather than a view onto Node's pooled one: `Buffer` may sit on a
      // SharedArrayBuffer, which `Response` does not accept
      const bytes = shipped(input)
      const copy = new ArrayBuffer(bytes.byteLength)
      new Uint8Array(copy).set(bytes)
      return Promise.resolve(new Response(copy))
    }
    return Promise.resolve(new Response('', { status: 404 }))
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const withExample = async () => {
  await getAppState().loadExample()
  return mount(<ExampleBanner />)
}

describe('closing the notice', () => {
  it('is a separate control from the one that deletes the garden', async () => {
    const harness = await withExample()
    expect(harness.find('action-example-dismiss')).not.toBeNull()
    expect(harness.find('action-example-clear')).not.toBeNull()
  })

  it('takes the notice off the screen', async () => {
    const harness = await withExample()
    expect(harness.find('panel-example')).not.toBeNull()
    await harness.click('action-example-dismiss')
    expect(harness.find('panel-example')).toBeNull()
  })

  /** The whole point of it existing: the garden the notice was about is untouched */
  it('leaves the example garden exactly where it was', async () => {
    const harness = await withExample()
    const before = getAppState().plot
    await harness.click('action-example-dismiss')
    expect(getAppState().plot).toBe(before)
    expect(showingExample(useAppStore.getState())).toBe(true)
    expect(getAppState().exampleNoticeDismissed).toBe(true)
  })

  it('says what it does, because a bare cross beside a delete button is a coin toss', async () => {
    const harness = await withExample()
    expect(harness.get('action-example-dismiss').getAttribute('aria-label')).toMatch(
      /keep the example/i,
    )
  })
})

describe('clearing the example', () => {
  it('still does what it always did, and the notice goes with it', async () => {
    const harness = await withExample()
    await harness.click('action-example-clear')
    expect(showingExample(useAppStore.getState())).toBe(false)
    expect(harness.find('panel-example')).toBeNull()
  })
})

describe('the fold', () => {
  it('starts closed and says which way it faces', async () => {
    const harness = await withExample()
    expect(harness.get('panel-example').dataset.expanded).toBeUndefined()
    expect(harness.get('action-example-expand').getAttribute('aria-expanded')).toBe('false')
  })

  it('opens and closes again on the same control', async () => {
    const harness = await withExample()
    await harness.click('action-example-expand')
    expect(harness.get('panel-example').dataset.expanded).toBe('true')
    expect(harness.get('action-example-expand').getAttribute('aria-expanded')).toBe('true')
    await harness.click('action-example-expand')
    expect(harness.get('panel-example').dataset.expanded).toBeUndefined()
  })

  /**
   * Folded or not, the body is in the document: the provenance of a DLI field is not something
   * to render conditionally, and a reader who never presses anything still gets the sentence
   */
  it('keeps the body and the provenance in the document either way', async () => {
    const harness = await withExample()
    expect(harness.find('readout-example-provenance')).not.toBeNull()
    expect(harness.get('panel-example').textContent).toMatch(/worked example/i)
  })

  /**
   * What folds is the reading matter. The press that starts a garden of your own is the one control
   * a visitor arrives wanting, so it stays outside the fold at every width
   */
  it('folds the reading matter and not the press that clears the example', async () => {
    const harness = await withExample()
    expect(harness.get('action-example-clear').closest('.example-banner-body-wrap')).toBeNull()
    expect(
      harness.get('readout-example-provenance').closest('.example-banner-body-wrap'),
    ).not.toBeNull()
    expect(harness.find('action-example-expand')).not.toBeNull()
  })
})
