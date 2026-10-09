import { beforeEach, describe, expect, it } from 'bun:test'
import { loadCropCatalog } from '../data/crops'
import { frostFreeSiteFixture, siteFixture } from '../recommend/testkit'
import { ready } from '../state/slices'
import { resetAppStore, useAppStore } from '../state/store'
import type { Site } from '../types/site'
import { SiteVerdict } from './SiteVerdict'
import { mount } from './testkit'

const catalogPromise = loadCropCatalog()

const verdictFor = async (site: Site): Promise<string> => {
  useAppStore.setState({
    site: ready(site),
    catalog: ready(await catalogPromise),
    frostPercentile: 20,
  })
  const harness = await mount(<SiteVerdict />)
  const text = harness.get('readout-site-verdict').textContent ?? ''
  await harness.unmount()
  return text
}

beforeEach(() => {
  resetAppStore()
})

/**
 * The place step says where the place is and when frost comes, and two sentences say whether the
 * place as a whole is one most of the catalog could live in, so the climate doesn't first meet a
 * visitor crop by crop, six steps later
 */
describe('the place-step verdict', () => {
  it('says how much of the catalog the climate admits and whether rain covers a garden', async () => {
    const text = await verdictFor(siteFixture())
    expect(text).toMatch(/of the catalog grows in this climate: \d+ of \d+ crops\./)
    expect(text).toMatch(/Rain (is|covers|matches)/)
    // the breakdown of what the refused crops would need sits behind the i, off the sentence
    expect(text).not.toContain('The rest need')
  })

  it('says plainly that a frost-free monsoon site needs watering', async () => {
    expect(await verdictFor(frostFreeSiteFixture())).toContain('plan to water')
  })

  it('prints nothing until the place has resolved', async () => {
    useAppStore.setState({ catalog: ready(await catalogPromise) })
    const harness = await mount(<SiteVerdict />)
    expect(harness.find('readout-site-verdict')).toBeNull()
    await harness.unmount()
  })
})
