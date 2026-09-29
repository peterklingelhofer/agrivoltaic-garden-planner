import { beforeEach, describe, expect, it } from 'bun:test'
import { cropById, loadCropCatalog } from '../data/crops'
import { bedCalendar } from '../recommend/calendar'
import { calendarFor, derivePlanting } from '../recommend/planting'
import {
  bedFixture,
  bedLightFixture,
  frostFreeSiteFixture,
  hotDesertSiteFixture,
  plotFixture,
  siteFixture,
} from '../recommend/testkit'
import { idle, ready } from '../state/slices'
import { resetAppStore, useAppStore } from '../state/store'
import type { Crop } from '../types/crop'
import type { Bed } from '../types/garden'
import { plantingId } from '../types/ids'
import type { Site } from '../types/site'
import { epochMillis, type DayOfYear, type SquareMeters } from '../types/units'
import { dayOfYearUtc } from '../state/sun'
import {
  actionLabel,
  groupLabel,
  NO_THERMAL_AGENDA_NOTE,
  supplyUnit,
  windowSpansYear,
} from './agenda'
import { AgendaPanel } from './AgendaPanel'
import { mount } from './testkit'

const catalogPromise = loadCropCatalog()

const need = async (id: string): Promise<Crop> => {
  const crop = cropById(await catalogPromise, id as Crop['id'])
  if (crop === undefined) throw new Error(`missing fixture crop ${id}`)
  return crop
}

/** June 21 2024, the clock the store boots with, so the reference day is the app's own */
const JUNE_21 = Date.UTC(2024, 5, 21, 16, 0, 0)

const seed = async (ids: readonly string[], site: Site = siteFixture()): Promise<void> => {
  const crops = await Promise.all(ids.map(need))
  const bed: Bed = bedFixture('bed-a', { areaM2: 200 as SquareMeters })
  // matches the site's own light. Not Amherst's: a site override (Pune, say) gets
  // dates computed against its own DLI. Never a mismatched default
  const light = bedLightFixture('bed-a', 0, 36, site.normals.monthlyMeanDliMolM2Day)
  const calendars = [bedCalendar(site, light, crops, 20)]
  const plantings = crops.flatMap((crop) => {
    const derived = derivePlanting({
      id: plantingId(`bed-a:${crop.id as string}`),
      bed,
      crop,
      arrays: [],
      calendar: calendarFor(calendars, bed.id, crop.id),
    })
    return derived.ok ? [derived.value] : []
  })
  useAppStore.setState({
    site: ready(site),
    plot: plotFixture([{ ...bed, plantings }]),
    calendars: ready(calendars),
    catalog: ready(crops),
    frostPercentile: 20,
    timeUtcMillis: epochMillis(JUNE_21),
    // the agenda dates from the real day, wherever the sun slider is parked, so this
    // is the field it reads. Held still here for the same reason every other clock in these
    // tests is: a job list that moves with the calendar can't be asserted against
    todayUtcMillis: epochMillis(JUNE_21),
  })
}

beforeEach(() => {
  resetAppStore()
})

describe('agenda labels', () => {
  it('keeps the calendar wording for a planting method and names the rest', () => {
    expect(actionLabel('start-indoors')).toBe('Start indoors')
    expect(actionLabel('direct-sow')).toBe('Direct sow')
    expect(actionLabel('transplant-out')).toBe('Transplant out')
    expect(actionLabel('succession-sow')).toBe('Sow the next succession')
    expect(actionLabel('first-harvest')).toBe('First harvest')
    expect(actionLabel('harvest-ends')).toBe('Harvest window closes')
  })

  it('names the near groups in words and the rest by month', () => {
    const group = { key: 'x', items: [], month: null, bucket: 'this-week' } as const
    expect(groupLabel(group)).toBe('This week')
    expect(groupLabel({ ...group, bucket: 'this-month' })).toBe('Later this month')
    expect(groupLabel({ ...group, bucket: 'month', month: 5 })).toBe('May')
  })

  it('counts seed in seeds and everything else in plants', () => {
    expect(supplyUnit('seed')).toBe('seeds')
    expect(supplyUnit('transplant')).toBe('plants')
    expect(supplyUnit('perennial-stock')).toBe('plants')
  })

  it('reads the app clock as a day of year', () => {
    expect(dayOfYearUtc(Date.UTC(2024, 0, 1))).toBe(1 as DayOfYear)
    expect(dayOfYearUtc(JUNE_21)).toBe(173 as DayOfYear)
  })

  it('reads a window as spanning the year only when it wraps almost all the way round', () => {
    expect(windowSpansYear(1, 365)).toBe(true)
    expect(windowSpansYear(335, 334)).toBe(true)
    expect(windowSpansYear(100, 200)).toBe(false)
    expect(windowSpansYear(1, 364)).toBe(false)
  })
})

describe('agenda panel', () => {
  it('asks for a planted bed rather than showing an empty year', async () => {
    const harness = await mount(<AgendaPanel />)
    expect(harness.find('panel-agenda')).not.toBeNull()
    expect(harness.get('status-agenda-empty').textContent).toMatch(/Put plants in a bed/)
    expect(harness.get('status-agenda-empty').getAttribute('data-reason')).toBe('unplanted')
    expect(harness.find('list-agenda')).toBeNull()
    await harness.unmount()
  })

  /**
   * The same empty list for the opposite reason, and the panel has to say which. A planting is part
   * of the saved design and carries its own sow and harvest days, and the calendar those days came
   * off is derived and deliberately not saved. So every reload of a planted garden would show "Put
   * plants in a bed on the crop step" to somebody looking at planted beds, which is worse than
   * unhelpful: the instruction is impossible to act on, because it's already done
   */
  it("says the dates aren't computed yet, and never that the beds are empty, over a planted garden", async () => {
    await seed(['arugula'])
    // exactly the shape a reload leaves behind: the design restored, the calendar not
    useAppStore.setState({ calendars: idle() })
    const harness = await mount(<AgendaPanel />)
    const notice = harness.get('status-agenda-empty')
    expect(notice.getAttribute('data-reason')).toBe('undated')
    expect(notice.textContent).toMatch(/already planted|are planted/)
    expect(notice.textContent).not.toMatch(/Put plants in a bed/)
    await harness.unmount()
  })

  it('groups dated jobs and shows the rule behind every date', async () => {
    await seed(['lettuce-leaf', 'tomato'])
    const harness = await mount(<AgendaPanel />)
    expect(harness.find('list-agenda')).not.toBeNull()
    const groups = harness.container.querySelectorAll('[data-testid^="item-agenda-group-"]')
    expect(groups.length).toBeGreaterThan(0)
    const items = [...harness.container.querySelectorAll('[data-testid^="item-agenda-bed-a-"]')]
    expect(items.length).toBeGreaterThan(3)

    for (const item of items) {
      const basis = item.querySelector('[data-testid^="readout-agenda-basis-"]')
      expect(basis?.getAttribute('data-basis')).toBeTruthy()
      expect(basis?.textContent).toMatch(/^Basis: /)
    }
    // the provenance caveat the calendar wrote reaches the panel
    expect(harness.get('readout-agenda-note-0').textContent).toMatch(/daily climate normals/)
    expect(harness.get('readout-agenda-percentile').textContent).toMatch(
      /In 20% of years, a frost falls outside these dates/,
    )
    // the product dates a 365 day circle, so the clock's day 173 is read on a common year
    expect(harness.get('readout-agenda-reference').textContent).toMatch(/Jun 22/)
    await harness.unmount()
  })

  /**
   * 1:06 UTC on September 29 is still the evening of September 28 in Phoenix, seven hours behind.
   * The UTC calendar day would date a job due that evening a year out
   */
  it("dates the reference day on the garden's own clock", async () => {
    useAppStore.setState({
      site: ready(hotDesertSiteFixture()),
      todayUtcMillis: epochMillis(Date.UTC(2026, 8, 29, 1, 6)),
    })
    const harness = await mount(<AgendaPanel />)
    expect(harness.get('readout-agenda-reference').textContent).toMatch(/Sep 28/)
    await harness.unmount()
  })

  it("lists what to buy, separated by how it's sold", async () => {
    await seed(['lettuce-leaf', 'tomato', 'apple'])
    const harness = await mount(<AgendaPanel />)
    expect(harness.find('list-agenda-shopping')).not.toBeNull()
    const kinds = [
      ...harness.container.querySelectorAll('[data-testid^="item-agenda-supply-group-"]'),
    ].map((node) => node.getAttribute('data-kind'))
    expect(kinds).toEqual(['seed', 'transplant', 'perennial-stock'])
    const apple = harness.get('item-agenda-supply-apple')
    expect(apple.getAttribute('data-kind')).toBe('perennial-stock')
    expect(Number(apple.getAttribute('data-quantity'))).toBeGreaterThan(0)
    expect(harness.get('readout-agenda-quantity-lettuce-leaf').textContent).toMatch(/seeds$/)
    await harness.unmount()
  })

  it('says what the dates of a perennial rest on rather than that it has none', async () => {
    await seed(['apple'])
    const harness = await mount(<AgendaPanel />)
    const notice = harness.container.querySelector(
      '[data-testid^="status-agenda-feasibility-bed-a-apple-"]',
    )
    expect(notice?.getAttribute('data-feasibility')).toBe('no-thermal-data')
    expect(notice?.textContent).toContain(NO_THERMAL_AGENDA_NOTE)
    await harness.unmount()
  })

  /**
   * Pune has no frost in the record, so a crop the whole year suits (lettuce, sown at the start
   * of the coolest month) gets a window that runs the full 365 days. Printing that as "(through
   * Nov 30)" reads as a deadline. It means any day at all
   */
  it('prints "any time of year" rather than a date for a window that spans the whole year', async () => {
    await seed(['lettuce-leaf'], frostFreeSiteFixture())
    const harness = await mount(<AgendaPanel />)
    expect(harness.container.textContent).toContain('any time of year')
    await harness.unmount()
  })
})
