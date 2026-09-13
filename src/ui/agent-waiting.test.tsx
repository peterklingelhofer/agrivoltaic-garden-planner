import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { vi } from '../../test/vi'
import { failed } from '../state/slices'
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
 * The promise this panel makes when it starts a run it cannot answer from yet: "I will answer as
 * soon as it lands." A question about how much electricity the panels would make got
 * this, and then nothing more: `runEnergy` ran in place, failed outright, and nothing
 * was watching for a run to land BADLY. The subscribe in `AgentPanel` only re-checked on a
 * transition to `ready`, so a run that settled into `error` left `waiting` set forever and the
 * turn that promised an answer was the last one anybody saw.
 *
 * `runEnergy` is stubbed here to do nothing on its own, which is what a genuinely pending run
 * looks like from this panel's side, so the store's own later transition is what the panel has
 * to notice. `fetch` is stubbed to fail at once, so the remote probe and the model download both
 * answer no without waiting on a network jsdom does not have
 */

const openChat = (): void => {
  useAppStore.setState({ surface: 'chat' })
}

beforeEach(() => {
  localStorage.clear()
  resetAppStore()
  Element.prototype.scrollIntoView = vi.fn() as unknown as typeof Element.prototype.scrollIntoView
  vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))
})

afterEach(() => {
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
  vi.unstubAllGlobals()
})

describe('a run that started reports back when it lands', () => {
  it('answers once a pending run settles into an error, instead of waiting on it forever', async () => {
    const runEnergy = vi.fn()
    useAppStore.setState({ runEnergy })

    const harness = await mount(<AgentPanel />)
    await act(async () => {
      openChat()
    })
    const lastReply = (): string => harness.all('item-agent-turn-us').at(-1)?.textContent ?? ''

    // the exact phrase `ask-energy` lists as its own exemplar, so the lexical router, which
    // needs no model and answers first, has no doubt what this sentence means
    await harness.type('input-agent', 'how much electricity will i get')
    await harness.click('action-agent-send')
    await vi.waitFor(
      () => {
        expect(lastReply()).toContain('I will answer as soon as it lands')
      },
      { timeout: 10_000, interval: 25 },
    )
    expect(runEnergy).toHaveBeenCalled()
    const started = harness.all('item-agent-turn-us').length

    // the run this panel is waiting on settles, badly, some time after the turn that started it: a
    // subscribe that watched only for `ready` would miss it
    await act(async () => {
      useAppStore.setState({ energy: failed('the chain broke') })
    })
    await vi.waitFor(
      () => {
        expect(harness.all('item-agent-turn-us').length).toBeGreaterThan(started)
      },
      { timeout: 10_000, interval: 25 },
    )
    expect(lastReply()).toContain('the chain broke')

    await harness.unmount()
  })
})
