import { beforeEach, describe, expect, it } from 'bun:test'
import { DEFAULT_ECONOMY_INPUTS } from '../data/economy'
import { resetAppStore, useAppStore } from '../state/store'
import { EconomyFields } from './EconomyFields'
import { mount } from './testkit'

const inputs = () => useAppStore.getState().economyInputs

beforeEach(() => resetAppStore())

describe('the typed tariff, currency and cost', () => {
  it('starts with nothing typed and the currency the sources are in', async () => {
    const harness = await mount(<EconomyFields />)
    expect(inputs()).toEqual(DEFAULT_ECONOMY_INPUTS)
    expect((harness.get('control-economy-price') as HTMLInputElement).value).toBe('')
    expect((harness.get('control-economy-currency') as HTMLInputElement).value).toBe('USD')
    expect((harness.get('control-economy-cost') as HTMLInputElement).value).toBe('')
    expect(harness.find('status-economy-currency')).toBeNull()
    expect(harness.get('readout-economy-help').textContent).toMatch(
      /Outside the United States the app has no electricity price on file/,
    )
    await harness.unmount()
  })

  it('keeps a typed price and cost as numbers, and a cleared field as nothing', async () => {
    const harness = await mount(<EconomyFields />)
    await harness.type('control-economy-price', '0.30')
    expect(inputs().perKwh).toBe(0.3)
    await harness.type('control-economy-cost', '8000')
    expect(inputs().installedCost).toBe(8000)
    await harness.type('control-economy-price', '')
    expect(inputs().perKwh).toBeNull()
    await harness.type('control-economy-cost', '-5')
    expect(inputs().installedCost).toBeNull()
    await harness.unmount()
  })

  it('takes a currency only once it is three letters, upper-cased, and says so until then', async () => {
    const harness = await mount(<EconomyFields />)
    await harness.type('control-economy-currency', 'eu')
    expect(inputs().currency).toBe('USD')
    expect((harness.get('control-economy-currency') as HTMLInputElement).value).toBe('EU')
    expect(harness.get('status-economy-currency').textContent).toMatch(/three letters/)
    await harness.type('control-economy-currency', 'eur')
    expect(inputs().currency).toBe('EUR')
    expect(harness.find('status-economy-currency')).toBeNull()
    // the unit on the two money fields follows the currency
    expect(harness.container.textContent).toMatch(/EUR per kWh/)
    await harness.unmount()
  })
})
