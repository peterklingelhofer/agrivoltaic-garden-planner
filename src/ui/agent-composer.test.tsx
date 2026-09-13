import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { vi } from '../../test/vi'
import { resetAppStore, useAppStore } from '../state/store'
import { AgentPanel } from './AgentPanel'
import { mount } from './testkit'

/*
  The panel starts the embedding router the moment it mounts. Stubbing `fetch` stops a model being
  DOWNLOADED, and stops nothing when the weights are already on disk: with `models/` present the
  router loads a 23 MB ONNX file through `onnxruntime-node`, natively, in a test that is about
  what the panel says while a run is pending. That native runtime is also what segfaulted a bun
  test worker on this file, twice in seventeen full runs, taking every unfinished file with it.

  With the module refused, `load` in `src/agent/embedding.ts` catches and returns null, which is the
  lexical router doing the work, which is the path these tests are written against

  This mock is why `bun test <file> <file>` by hand needs `--parallel`, which is what the
  `test:dom` script passes and what implies `--isolate`. Without isolation bun shares one module
  registry across files, this refusal leaks into `embedding.test.ts`, and the real model then
  fails to load with "the weights are on disk but did not load". Nothing is wrong when that
  happens except the command
*/
mock.module('@huggingface/transformers', () => ({
  get env(): never {
    throw new Error('no embedding model is loaded in this test')
  },
}))

/**
 * The two things a visitor meets before they have said anything, both of which can go wrong because
 * this panel is mounted at every width and hidden by CSS until the surface is opened.
 *
 * An effect that measures or scrolls on mount is therefore running against a `display: none`
 * element, where every box is zero and nothing scrolls anywhere. jsdom is that case exactly: it
 * lays nothing out, so an unguarded measurement here is the same measurement a hidden panel
 * takes in a browser, which is what makes these runnable at all
 */

const scrolled = vi.fn()

/** What `showing` reads: the chat surface, with the guided questions behind it */
const openChat = (): void => {
  useAppStore.setState({ surface: 'chat' })
}

beforeEach(() => {
  localStorage.clear()
  resetAppStore()
  scrolled.mockReset()
  Element.prototype.scrollIntoView = scrolled as unknown as typeof Element.prototype.scrollIntoView
})

afterEach(() => {
  // jsdom has none of its own; leave it as absent as it was found
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
  vi.unstubAllGlobals()
})

/**
 * First in the file on purpose. The probe that asks whether the edge can read a sentence is
 * memoised at module scope, so its answer is settled by whichever test opens the surface first
 * and every later test in this file inherits it
 */
describe('the reader that answers from the edge', () => {
  /** The route as a deployment with the binding answers it: 204 to the probe, a reading to a POST */
  const helperIsThere = (): void => {
    vi.stubGlobal('fetch', (_input: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(
        (init?.method ?? 'GET') === 'GET'
          ? new Response(null, { status: 204 })
          : new Response(JSON.stringify({ intent: 'help', confidence: 0.9, slots: {} }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
      ),
    )
  }

  it('reads the sentences, and says on screen what leaves the browser', async () => {
    helperIsThere()
    const harness = await mount(<AgentPanel />)
    await act(async () => {
      openChat()
    })
    // the probe answers on a microtask of its own, which a macrotask waits out
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(harness.get('panel-agent').dataset.agentRouter).toBe('remote')
    expect(harness.get('readout-agent-privacy').textContent).toContain('nothing is kept')
    /*
      And the 45 MB is not offered to somebody whose sentences are already being read for them.
      The whole argument for the download is that it is the best reading available on this
      machine, which it is not while the edge is answering
    */
    expect(harness.find('readout-agent-router')).toBeNull()
    expect(harness.find('action-agent-download-model')).toBeNull()
    await harness.unmount()
  })
})

describe('the box the first sentence is typed into', () => {
  it('is never pinned to the height a hidden box reports', async () => {
    const harness = await mount(<AgentPanel />)
    const box = harness.get('input-agent')
    // 0px on a border-box textarea still draws padding and border: 22px against a 44px Send
    expect(box.style.height).not.toBe('0px')
    expect(box.style.height).toBe('auto')
    await act(async () => {
      openChat()
    })
    expect(harness.get('input-agent').style.height).not.toBe('0px')
    await harness.unmount()
  })

  it('takes the measurement again once the surface is open, and grows with the sentence', async () => {
    const harness = await mount(<AgentPanel />)
    const box = harness.get('input-agent') as HTMLTextAreaElement
    // jsdom lays nothing out, so the one thing a real browser supplies is supplied here
    Object.defineProperty(box, 'scrollHeight', { configurable: true, value: 42 })
    await act(async () => {
      openChat()
    })
    expect(box.style.height).toBe('42px')

    Object.defineProperty(box, 'scrollHeight', { configurable: true, value: 84 })
    await harness.type('input-agent', 'a sentence long enough to wrap onto a second line')
    expect(box.style.height).toBe('84px')
    await harness.unmount()
  })
})

describe('the transcript follows the conversation', () => {
  it('scrolls to the newest turn when the surface opens, and on every turn after', async () => {
    const harness = await mount(<AgentPanel />)
    // hidden: there is nothing on screen to scroll, and the opening turn has not been read yet
    expect(scrolled).not.toHaveBeenCalled()

    await act(async () => {
      openChat()
    })
    const onOpen = scrolled.mock.calls.length
    expect(onOpen).toBeGreaterThan(0)
    expect(scrolled.mock.contexts[onOpen - 1]).toBe(
      harness.get('readout-agent-transcript').lastElementChild,
    )

    // and again when a turn is added, which is the reply landing below the fold
    await harness.type('input-agent', '6 by 4')
    await harness.click('action-agent-send')
    await act(async () => {
      await Promise.resolve()
    })
    expect(scrolled.mock.calls.length).toBeGreaterThan(onOpen)
    expect(scrolled.mock.contexts[scrolled.mock.calls.length - 1]).toBe(
      harness.get('readout-agent-transcript').lastElementChild,
    )
    await harness.unmount()
  })

  it('scrolls the newest turn into view rather than the foot of the box', async () => {
    const harness = await mount(<AgentPanel />)
    await act(async () => {
      openChat()
    })
    // `block: 'nearest'` puts the TOP of a reply taller than the panel on screen: a long answer
    // is read from its start, and scrolling to the bottom of the box would show its end
    expect(scrolled).toHaveBeenCalledWith({ block: 'nearest' })
    await harness.unmount()
  })
})
