import { act } from 'react'
import { beforeEach, describe, expect, it } from 'bun:test'
import { makePlot } from '../state/defaults'
import { getAppState, resetAppStore } from '../state/store'
import { SurroundingsStep } from './AnswerPanels'
import { SHADE_PERCENT_HELP } from './onboarding'
import { mount } from './testkit'

/**
 * The figure a grower can type beside the three surroundings answers. This drives the real switch
 * and field and reads the answers the store holds: the switch starts the figure at the card's own
 * share, the field writes it, the cards gray out while it stands, and the switch off hands the
 * question back to the cards
 */
beforeEach(() => {
  localStorage.clear()
  resetAppStore()
  getAppState().setPlot(makePlot())
})

const figureNow = (): number | null => getAppState().answers.surroundingsShadePercent

const checked = (element: HTMLElement): boolean => (element as HTMLInputElement).checked

describe('the shade figure on the surroundings step', () => {
  it("starts at the card's share, writes what is typed, and hands the question back", async () => {
    getAppState().answerOnboarding({ exposure: 'partly-sheltered' })
    const harness = await mount(<SurroundingsStep />)
    expect(checked(harness.get('control-onboarding-shade-known'))).toBe(false)
    expect(harness.find('control-onboarding-shade-percent')).toBeNull()
    expect(harness.get('control-onboarding-exposure').hasAttribute('disabled')).toBe(false)

    await harness.click('control-onboarding-shade-known')
    // the card's own 30 percent, so nothing the light step shows moves
    expect(figureNow()).toBe(30)
    expect(checked(harness.get('control-onboarding-shade-known'))).toBe(true)
    expect((harness.get('control-onboarding-shade-percent') as HTMLInputElement).value).toBe('30')
    expect(harness.get('control-onboarding-exposure').hasAttribute('disabled')).toBe(true)
    expect(harness.find('readout-onboarding-exposure-help')).toBeNull()
    expect(harness.get('readout-onboarding-shade-help').textContent).toBe(
      `Your figure stands in for the three answers. ${SHADE_PERCENT_HELP}`,
    )

    await harness.type('control-onboarding-shade-percent', '45')
    expect(figureNow()).toBe(45)
    // held to the range a saved design accepts at both ends
    await harness.type('control-onboarding-shade-percent', '150')
    expect(figureNow()).toBe(100)
    await harness.type('control-onboarding-shade-percent', '-5')
    expect(figureNow()).toBe(0)

    await harness.click('control-onboarding-shade-known')
    expect(figureNow()).toBeNull()
    expect(harness.find('control-onboarding-shade-percent')).toBeNull()
    expect(harness.get('control-onboarding-exposure').hasAttribute('disabled')).toBe(false)
    expect(harness.find('readout-onboarding-shade-help')).toBeNull()
    expect(harness.find('readout-onboarding-exposure-help')).not.toBeNull()
    // the card the figure stood in for is still the one chosen
    expect(getAppState().answers.exposure).toBe('partly-sheltered')
    await harness.unmount()
  })

  it('is set aside with the cards while a house is drawn, and kept for when it goes', async () => {
    getAppState().answerOnboarding({ surroundingsShadePercent: 45 })
    const harness = await mount(<SurroundingsStep />)
    expect(harness.get('control-onboarding-shade-known').hasAttribute('disabled')).toBe(false)
    expect(harness.get('control-onboarding-shade-percent').hasAttribute('disabled')).toBe(false)

    await act(async () => {
      getAppState().addHouse()
    })
    expect(harness.get('control-onboarding-exposure').hasAttribute('disabled')).toBe(true)
    expect(harness.get('control-onboarding-shade-known').hasAttribute('disabled')).toBe(true)
    expect(harness.get('control-onboarding-shade-percent').hasAttribute('disabled')).toBe(true)
    expect(harness.find('readout-onboarding-shade-help')).toBeNull()
    expect(harness.get('readout-onboarding-exposure-house').textContent).toBe(
      'With a house or tree drawn, the light check uses it and ignores this answer.',
    )
    expect(figureNow()).toBe(45)
    await harness.unmount()
  })
})
