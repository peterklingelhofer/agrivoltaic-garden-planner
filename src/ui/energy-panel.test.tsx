import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'bun:test'
import { Glob } from 'bun'
import { ready, resetAppStore, useAppStore } from '../state/index'
import { energyReportFixture } from '../state/testkit'
import { EnergyPanel } from './EnergyPanel'
import { mount } from './testkit'

const report = energyReportFixture()

beforeEach(() => resetAppStore())

describe('energy panel', () => {
  it('shows an unavailable state rather than a substituted figure before the chain runs', async () => {
    const harness = await mount(<EnergyPanel />)
    expect(harness.get('status-energy').dataset.state).toBe('idle')
    expect(harness.find('readout-energy-annual-ac')).toBeNull()
    await harness.click('control-energy-run')
    expect(harness.get('status-energy').dataset.state).toBe('error')
    expect(harness.find('readout-energy-annual-ac')).toBeNull()
    await harness.unmount()
  })

  it('renders the headline figures, the loss stack and the stated reference system', async () => {
    useAppStore.setState({ energy: ready(report) })
    const harness = await mount(<EnergyPanel />)
    // two significant figures, the same as the money: a year's model run is not a meter reading
    expect(harness.get('readout-energy-annual-ac').textContent).toBe('about 38,000 kWh')
    // and the exact figure rides on the readout for a check that divides by it
    expect(
      harness.get('readout-energy-annual-ac').querySelector<HTMLElement>('[data-kwh]')?.dataset.kwh,
    ).toBe(String(report.annualAcKwh))
    expect(harness.get('readout-energy-specific-yield').textContent).toContain('1222 kWh/kWp')
    expect(harness.get('readout-energy-nameplate-ac').textContent).toContain('25.8 kW AC')
    expect(harness.get('readout-energy-dc-ac-ratio').textContent).toContain('1.20:1')
    expect(harness.get('readout-energy-clipping').textContent).toContain('0.3%')
    expect(harness.all('readout-energy-loss-soiling').length).toBe(1)
    expect(harness.get('readout-energy-reference-definition').textContent).toContain('Dupraz')
    await harness.unmount()
  })

  it('renders the electricity term as a band with named contributions, never a point', async () => {
    useAppStore.setState({ energy: ready(report) })
    const harness = await mount(<EnergyPanel />)
    expect(harness.get('readout-energy-ler-electricity').textContent).toBe('0.82-1.12')
    expect(harness.get('readout-energy-basis-ler-electricity').textContent).toContain(
      'plausible range',
    )
    expect(harness.get('list-energy-contributions').childElementCount).toBe(1)
    expect(harness.find('readout-energy-ler-total')).toBeNull()
    expect(harness.find('readout-energy-ler-crops-unavailable')).not.toBeNull()
    await harness.unmount()
  })
})

const uiSources: Record<string, string> = {}
for (const path of new Glob('**/*.{ts,tsx}').scanSync(import.meta.dir)) {
  uiSources[`./${path}`] = readFileSync(`${import.meta.dir}/${path}`, 'utf8')
}

const renderers = Object.entries(uiSources).filter(([path]) => !/\.test\.tsx?$/.test(path))

// unsafeBandMidpoint collapses a band to a point. Decision Record 7 allows that only inside
// the optimiser objective, which needs a scalar to compare plans; no renderer may reach for it
describe('no point estimates in the UI layer', () => {
  it('globs the ui sources', () => {
    expect(renderers.length).toBeGreaterThan(10)
  })

  it.each(renderers)('%s never collapses a band to a midpoint', (path, source) => {
    expect(source.includes('unsafeBandMidpoint'), path).toBe(false)
  })
})
