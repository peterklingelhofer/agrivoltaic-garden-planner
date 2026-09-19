import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'bun:test'
import { Glob } from 'bun'
import { WATER_LIMITED_INDEX } from '../data/water'
import {
  bedFixture,
  bedLightFixture,
  plotFixture,
  siteFixture,
  tmyFixture,
} from '../recommend/testkit'
import { ready } from '../state/slices'
import { resetAppStore, useAppStore } from '../state/store'
import type { Site } from '../types/site'
import type { Fraction } from '../types/units'
import { SitePanel } from './SitePanel'
import { mount } from './testkit'
import { WaterPanel } from './WaterPanel'

const uiSources: Record<string, string> = {}
for (const path of new Glob('**/*.{ts,tsx}').scanSync(import.meta.dir)) {
  uiSources[`./${path}`] = readFileSync(`${import.meta.dir}/${path}`, 'utf8')
}

const seed = (index: number, humid = true, overrides: Partial<Site> = {}): void => {
  const site = siteFixture({
    ...overrides,
    waterLimitation: {
      ...siteFixture().waterLimitation,
      index: index as Fraction,
      limited: index >= WATER_LIMITED_INDEX,
      ...(overrides.waterLimitation ?? {}),
    },
  })
  useAppStore.setState({
    site: ready(site),
    weather: ready(tmyFixture(humid)),
    plot: plotFixture([bedFixture('bed-a'), bedFixture('bed-b')]),
    bedLight: [bedLightFixture('bed-a', 0.3), bedLightFixture('bed-b', 0.1)],
  })
}

beforeEach(() => {
  resetAppStore()
})

describe('water panel', () => {
  it('waits for a site, weather and a bed', async () => {
    const harness = await mount(<WaterPanel />)
    expect(harness.find('panel-water')).not.toBeNull()
    expect(harness.get('status-water').textContent).toMatch(/Look up the place/)
    expect(harness.find('readout-water-irrigation-open')).toBeNull()
    await harness.unmount()
  })

  /**
   * One sentence for each missing half, and each names only what it waits on: a single "No site or
   * bed yet" would sit under a sidebar saying "4 beds"
   */
  it('names the missing half, and not the half that is there', async () => {
    useAppStore.setState({ plot: plotFixture([bedFixture('bed-a')]) })
    const noSite = await mount(<WaterPanel />)
    expect(noSite.get('status-water').textContent).toBe(
      'No place looked up yet. Look up the place and its weather to see a water balance',
    )
    await noSite.unmount()

    useAppStore.setState({ site: ready(siteFixture()), weather: ready(tmyFixture()), plot: null })
    const noBed = await mount(<WaterPanel />)
    expect(noBed.get('status-water').textContent).toBe(
      'No bed yet. Draw a bed to see a water balance',
    )
    await noBed.unmount()
  })

  it('reports the balance, the method and both irrigation requirements as bands', async () => {
    seed(0.2)
    const harness = await mount(<WaterPanel />)
    expect(harness.get('readout-water-method').textContent).toBe('FAO-56 Penman-Monteith')
    expect(harness.get('readout-water-et0').textContent).toMatch(/open sky/)
    expect(harness.get('readout-water-irrigation-open').textContent).toMatch(
      /^[\d.]+-[\d.]+ mm\/yr$/,
    )
    expect(harness.get('readout-water-irrigation-panels').textContent).toMatch(
      /^[\d.]+-[\d.]+ mm\/yr$/,
    )
    expect(harness.get('readout-water-saving').textContent).toMatch(
      /^\d+-\d+%, \d+% (plausible range|confidence interval)$/,
    )
    expect(harness.get('readout-water-rain-split').textContent).toMatch(/rain shadow/)
    expect(harness.get('control-water-bed')).not.toBeNull()
    await harness.unmount()
  })

  it('names the substituted method when the weather ships no humidity', async () => {
    seed(0.2, false, {
      waterLimitation: {
        ...siteFixture().waterLimitation,
        fallbackReason: 'open-meteo supplies no humidity',
        method: 'hargreaves-samani',
      },
    })
    const harness = await mount(<WaterPanel />)
    expect(harness.get('readout-water-method').textContent).toBe('Hargreaves-Samani')
    expect(harness.get('readout-water-fallback').textContent).toMatch(/no humidity/)
    await harness.unmount()
  })

  it('shows the shade-benefit pathway as graded, off in a temperate garden', async () => {
    seed(0.2)
    const temperate = await mount(<WaterPanel />)
    const off = temperate.get('readout-water-shade-benefit')
    expect(off.getAttribute('data-active')).toBe('false')
    expect(Number(off.getAttribute('data-scale'))).toBe(0)
    expect(off.textContent).toMatch(/Barron-Gafford/)
    await temperate.unmount()

    seed(0.8)
    const arid = await mount(<WaterPanel />)
    const on = arid.get('readout-water-shade-benefit')
    expect(on.getAttribute('data-active')).toBe('true')
    expect(Number(on.getAttribute('data-scale'))).toBeGreaterThan(0)
    await arid.unmount()
  })

  it('shows every unsourced claim and caveat on the panel itself', async () => {
    seed(0.5)
    const harness = await mount(<WaterPanel />)
    expect(harness.get('readout-water-unsourced-texture').textContent).toMatch(/Table 19/)
    const runoff = harness.get('readout-water-unsourced-runoff').textContent
    expect(runoff).toMatch(/no source/)
    expect(runoff).toMatch(/modeling assumptions/)
    expect(harness.get('readout-water-unsourced-stages').textContent).toMatch(/Table 11/)
    expect(harness.get('readout-water-caveat-rain-shadow').textContent).toMatch(
      /winds in rain hours/,
    )
    expect(harness.get('readout-water-modeled').textContent).toMatch(/can go either way/)
    expect(harness.all('item-water-band-basis').length).toBeGreaterThan(0)
    await harness.unmount()
  })

  it('follows the selected bed', async () => {
    seed(0.2)
    useAppStore.getState().selectBed('bed-b' as never)
    const harness = await mount(<WaterPanel />)
    expect((harness.get('control-water-bed') as HTMLSelectElement).value).toBe('bed-b')
    await harness.unmount()
  })
})

describe('site panel water readout', () => {
  it('grades the index instead of answering yes or no', async () => {
    seed(0.5)
    const harness = await mount(<SitePanel />)
    const text = harness.get('readout-site-water-limited').textContent ?? ''
    expect(text).toMatch(/Rain leaves 50% of the season's water demand unmet/)
    expect(text).toMatch(/\d+% to \d+%/)
    // the band's label sits inside the sentence, ahead of the range it names
    expect(text).toMatch(/\(\d+% (plausible range|confidence interval): \d+% to \d+%\)/)
    expect(text).not.toBe('yes')
    await harness.unmount()
  })
})

describe('no point estimates leak into the UI', () => {
  it('never collapses a band to its midpoint in a rendered file', () => {
    const offenders = Object.entries(uiSources)
      .filter(([path]) => !path.includes('.test.'))
      .filter(([, source]) => source.includes('unsafeBandMidpoint'))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })
})
