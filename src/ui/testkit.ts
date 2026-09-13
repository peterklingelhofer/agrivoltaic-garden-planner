import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach } from 'bun:test'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * Every root this harness has made, unmounted after each test whether the test remembered or not.
 *
 * Not tidiness. A root left mounted stays subscribed to the store, so a promise that settles after
 * the file is done -- a catalogue load, a light bake the agent started -- schedules a React render
 * into an environment the runner has already torn down, and it surfaces as `ReferenceError: window
 * is not defined` inside React's scheduler, attributed to whichever file happened to be running. It
 * is intermittent, which makes it hard to trace.
 *
 * Registered here rather than asked of each test file, because the failure is invisible in the
 * file that causes it and only appears somewhere else, which is the worst possible thing to leave
 * to a convention
 */
const live = new Set<{ readonly root: Root; readonly container: HTMLElement }>()

afterEach(async () => {
  const mounted = [...live]
  live.clear()
  for (const entry of mounted) {
    await act(async () => {
      entry.root.unmount()
    })
    entry.container.remove()
  }
})

const selector = (testId: string): string => `[data-testid="${testId}"]`

export interface Harness {
  readonly container: HTMLElement
  find(testId: string): HTMLElement | null
  get(testId: string): HTMLElement
  all(testId: string): readonly HTMLElement[]
  click(testId: string): Promise<void>
  type(testId: string, value: string): Promise<void>
  press(testId: string, key: string): Promise<void>
  unmount(): Promise<void>
}

/** Minimal DOM harness: the project has no testing-library, only jsdom and React's own act */
export const mount = async (node: ReactNode): Promise<Harness> => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const entry = { root, container }
  live.add(entry)
  await act(async () => {
    root.render(node)
  })

  const find = (testId: string): HTMLElement | null =>
    container.querySelector<HTMLElement>(selector(testId))
  const get = (testId: string): HTMLElement => {
    const found = find(testId)
    if (found === null) throw new Error(`no element with data-testid="${testId}"`)
    return found
  }
  const dispatch = async (event: Event, target: HTMLElement): Promise<void> => {
    await act(async () => {
      target.dispatchEvent(event)
    })
  }

  return {
    container,
    find,
    get,
    all: (testId) => [...container.querySelectorAll<HTMLElement>(selector(testId))],
    click: (testId) => dispatch(new MouseEvent('click', { bubbles: true }), get(testId)),
    // React installs its own value setter on the node, so assigning `.value` directly is
    // invisible to it: the prototype setter is the only way to make a controlled input see one
    type: async (testId, value) => {
      const target = get(testId) as HTMLInputElement | HTMLTextAreaElement
      // the setter belongs to the element's OWN interface: calling the input one on a textarea
      // throws "not a valid instance of HTMLInputElement", so without this the agent's composer,
      // the one multi-line box in the app, could not be typed into by this harness at all
      const setter = Object.getOwnPropertyDescriptor(
        target instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype,
        'value',
      )?.set
      setter?.call(target, value)
      await dispatch(new Event('input', { bubbles: true }), target)
    },
    press: async (testId, key) => {
      const target = get(testId)
      target.focus()
      await dispatch(new KeyboardEvent('keydown', { key, bubbles: true }), target)
    },
    unmount: async () => {
      live.delete(entry)
      await act(async () => {
        root.unmount()
      })
      container.remove()
    },
  }
}
