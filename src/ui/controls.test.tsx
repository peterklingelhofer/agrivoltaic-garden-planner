import { describe, expect, it } from 'bun:test'
import { Action } from './controls'
import { mount } from './testkit'

/**
 * `Action` is the one press the whole app builds on, so what these hold is that the shortcut prop
 * adds its single attribute and nothing else about the button moves
 */

const attributesOf = (element: HTMLElement): readonly string[] => element.getAttributeNames().sort()

describe('the keys an Action announces', () => {
  it('reach assistive tech as aria-keyshortcuts, in the string they were given', async () => {
    const harness = await mount(
      <Action testId="undo" keyShortcuts="Meta+Z Control+Z" onClick={() => {}}>
        Undo
      </Action>,
    )
    expect(harness.get('undo').getAttribute('aria-keyshortcuts')).toBe('Meta+Z Control+Z')
    await harness.unmount()
  })

  it('leave no attribute behind when none are named', async () => {
    const harness = await mount(
      <Action testId="plain" onClick={() => {}}>
        Plain
      </Action>,
    )
    expect(harness.get('plain').hasAttribute('aria-keyshortcuts')).toBe(false)
    await harness.unmount()
  })

  it('are the only thing the prop changes about the button', async () => {
    const without = await mount(
      <Action testId="remove" onClick={() => {}}>
        Remove
      </Action>,
    )
    const bare = attributesOf(without.get('remove'))
    const bareClass = without.get('remove').className
    await without.unmount()

    const withKeys = await mount(
      <Action testId="remove" keyShortcuts="Delete Backspace" onClick={() => {}}>
        Remove
      </Action>,
    )
    const button = withKeys.get('remove')
    expect(attributesOf(button)).toEqual([...bare, 'aria-keyshortcuts'].sort())
    expect(button.className).toBe(bareClass)
    expect(button.className).toBe('action action-ghost')
    expect(button.getAttribute('type')).toBe('button')
    expect(button.textContent).toBe('Remove')
    await withKeys.unmount()
  })

  it('sit beside the other accessible attributes without disturbing them', async () => {
    const harness = await mount(
      <Action
        testId="all"
        tone="primary"
        pressed
        describedBy="cost"
        label="Remove bed 2"
        keyShortcuts="Delete Backspace"
        onClick={() => {}}
      >
        Remove
      </Action>,
    )
    const button = harness.get('all')
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(button.getAttribute('aria-describedby')).toBe('cost')
    expect(button.getAttribute('aria-label')).toBe('Remove bed 2')
    expect(button.getAttribute('aria-keyshortcuts')).toBe('Delete Backspace')
    expect(button.className).toBe('action action-primary')
    await harness.unmount()
  })

  it('still press, and stop pressing once disabled', async () => {
    let presses = 0
    const harness = await mount(
      <Action
        testId="undo"
        disabled={false}
        keyShortcuts="Meta+Z Control+Z"
        onClick={() => {
          presses += 1
        }}
      >
        Undo
      </Action>,
    )
    await harness.click('undo')
    expect(presses).toBe(1)
    await harness.unmount()

    const dead = await mount(
      <Action
        testId="undo"
        disabled
        keyShortcuts="Meta+Z Control+Z"
        onClick={() => {
          presses += 1
        }}
      >
        Undo
      </Action>,
    )
    await dead.click('undo')
    expect(presses).toBe(1)
    expect(dead.get('undo').hasAttribute('disabled')).toBe(true)
    await dead.unmount()
  })
})
