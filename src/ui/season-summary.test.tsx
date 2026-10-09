import { beforeEach, describe, expect, it } from 'bun:test'
import { frostExceedanceCurve } from '../data/agronomy'
import { dailyMinimaFixture, frostFreeSiteFixture, siteFixture } from '../recommend/testkit'
import { ready } from '../state/slices'
import { resetAppStore, useAppStore } from '../state/store'
import type { Site } from '../types/site'
import type { Celsius, DegreesLatitude } from '../types/units'
import { noFrostSentence } from './calendar'
import { SeasonSummary } from './SeasonSummary'
import { mount } from './testkit'

const sentenceFor = async (site: Site): Promise<string> => {
  useAppStore.setState({ site: ready(site), frostPercentile: 20 })
  const harness = await mount(<SeasonSummary />)
  const text = harness.get('readout-onboarding-season').textContent ?? ''
  await harness.unmount()
  return text
}

beforeEach(() => {
  resetAppStore()
})

/**
 * A record with no frost in it, such as Pune's, would read "Frost here usually ends around Jan 1
 * and returns around Dec 31, which is about 364 growing days" if the curve's two sentinel days were
 * printed as dates. A record with none says so, and a record with frost in a few years says how few
 */
describe('the place-step season sentence', () => {
  it('prints the frost pair where the record holds one', async () => {
    expect(await sentenceFor(siteFixture())).toContain(
      'Frost usually ends around May 5 and returns around Oct 7, about 155 growing days.',
    )
  })

  it('keeps the odds and the record behind the i beside the sentence', async () => {
    useAppStore.setState({ site: ready(siteFixture()), frostPercentile: 20 })
    const harness = await mount(<SeasonSummary />)
    expect(harness.get('info-season-dates').getAttribute('aria-label')).toBe(
      'What is a frost date?',
    )
    expect(harness.get('readout-onboarding-season').textContent).not.toContain('one year in')
    await harness.unmount()
  })

  it('says the season is the whole year where the record holds no frost', async () => {
    expect(await sentenceFor(frostFreeSiteFixture())).toBe(
      'No frost in the thirty-year record for this place, 1991 to 2020, so the growing season is the whole year. The records come from Open-Meteo.',
    )
  })

  it('says how rare frost is where a few years had one and this setting names none', async () => {
    const melbourne = siteFixture({
      location: { latitudeDeg: -37.8 as DegreesLatitude, longitudeDeg: 145 as never },
      frost: [frostExceedanceCurve(dailyMinimaFixture(12, 8, true, 6, 5), 0 as Celsius, true)],
    })
    expect(await sentenceFor(melbourne)).toBe(
      'Frost here falls in fewer than one year in 5, so at this setting the growing season is the whole year. Play it safe in the planting calendar to see the dates for the years with frost. The records come from Open-Meteo.',
    )
    expect(noFrostSentence(6, 10)).toContain('fewer than one year in 10')
  })
})
