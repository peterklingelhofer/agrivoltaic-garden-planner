import { act } from 'react'
import { describe, expect, it } from 'bun:test'
import { InfoTip } from './InfoTip'
import { mount } from './testkit'

/**
 * The other half of a press that shows nothing. A pointer press arrives as pointerenter and
 * then click; the enter opened the bubble and the click toggled it shut, so a press never showed a
 * sentence and only a hover did. A press on the ⓘ beside "DLI" turned it
 * green and left nothing to read
 */

const tip = (): Promise<Awaited<ReturnType<typeof mount>>> =>
  mount(
    <InfoTip label="the ground" testId="info-test">
      What the ground is made of
    </InfoTip>,
  )

/** React's onPointerEnter is driven by pointerover, which is what a pointer arriving fires */
const arrive = async (node: HTMLElement): Promise<void> => {
  await act(async () => {
    node.dispatchEvent(new Event('pointerover', { bubbles: true }))
  })
}

const leave = async (node: HTMLElement): Promise<void> => {
  await act(async () => {
    node.dispatchEvent(new Event('pointerout', { bubbles: true }))
  })
}

describe('the info tip', () => {
  it('stays open when the pointer arrives and then presses', async () => {
    const harness = await tip()
    const button = harness.get('info-test')
    await arrive(button)
    expect(harness.find('info-test-bubble')).not.toBeNull()
    await harness.click('info-test')
    expect(harness.find('info-test-bubble')).not.toBeNull()
    // and the press pinned it: the pointer leaving no longer takes the sentence away
    await leave(button)
    expect(harness.find('info-test-bubble')).not.toBeNull()
    expect(button.getAttribute('aria-expanded')).toBe('true')
    await harness.unmount()
  })

  it('opens on a press with no hover at all, and a second press lets go', async () => {
    const harness = await tip()
    expect(harness.find('info-test-bubble')).toBeNull()
    await harness.click('info-test')
    expect(harness.find('info-test-bubble')).not.toBeNull()
    await harness.click('info-test')
    expect(harness.find('info-test-bubble')).toBeNull()
    await harness.unmount()
  })

  it('closes on Escape whichever gesture is holding it', async () => {
    const harness = await tip()
    const button = harness.get('info-test')
    await arrive(button)
    await harness.click('info-test')
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(harness.find('info-test-bubble')).toBeNull()
    expect(button.getAttribute('aria-expanded')).toBe('false')
    await harness.unmount()
  })
})
