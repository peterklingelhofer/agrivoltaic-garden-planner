import { afterEach, describe, expect, it } from 'bun:test'
import { vi } from '../../test/vi'
import { bringIntoView } from './scroll-into-view'

/** A node that records the options `scrollIntoView` was given */
const recorder = (): { readonly node: HTMLElement; readonly asked: ScrollIntoViewOptions[] } => {
  const asked: ScrollIntoViewOptions[] = []
  const node = {
    scrollIntoView: (options: ScrollIntoViewOptions) => asked.push(options),
  } as unknown as HTMLElement
  return { node, asked }
}

afterEach(() => vi.unstubAllGlobals())

describe('bringIntoView', () => {
  it('puts the node in the middle of the view, with an animation', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    const { node, asked } = recorder()
    bringIntoView(node)
    expect(asked).toEqual([{ block: 'center', behavior: 'smooth' }])
  })

  it('jumps there when the visitor asked for less motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const { node, asked } = recorder()
    bringIntoView(node)
    expect(asked).toEqual([{ block: 'center', behavior: 'auto' }])
  })

  it('puts a node taller than the window at the top of the view, so its start shows', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    vi.stubGlobal('innerHeight', 800)
    const asked: ScrollIntoViewOptions[] = []
    const node = {
      getBoundingClientRect: () => ({ height: 1200 }),
      scrollIntoView: (options: ScrollIntoViewOptions) => asked.push(options),
    } as unknown as HTMLElement
    bringIntoView(node)
    expect(asked).toEqual([{ block: 'start', behavior: 'smooth' }])
  })

  it('does nothing without a node, or where the node cannot scroll', () => {
    expect(() => bringIntoView(null)).not.toThrow()
    expect(() => bringIntoView({} as unknown as HTMLElement)).not.toThrow()
  })
})
