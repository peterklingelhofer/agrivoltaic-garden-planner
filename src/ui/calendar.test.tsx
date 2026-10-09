import { act } from 'react'
import { describe, expect, it } from 'bun:test'
import type {
  BedCalendar,
  CalendarFeasibility,
  CropCalendar,
  PlantingWindow,
} from '../types/calendar'
import { bedId, cropId } from '../types/ids'
import { dayOfYear, days } from '../types/units'
import type { RecommendationSet } from '../types/recommend'
import {
  basisKindLabel,
  basisLabel,
  dayLabel,
  feasibilitySummary,
  orderCalendars,
  timelineSegments,
  wrapsYear,
} from './calendar'
import { CalendarTimeline } from './CalendarTimeline'
import { mount } from './testkit'

const planting = (patch: Partial<PlantingWindow> = {}): PlantingWindow => ({
  method: 'direct-sow',
  earliest: dayOfYear(100),
  recommended: dayOfYear(110),
  latest: dayOfYear(130),
  basis: {
    kind: 'frost-offset',
    anchor: 'last-spring-freeze',
    offsetDays: days(14),
    percentile: 20,
  },
  citations: [],
  ...patch,
})

const crop = (id: string, patch: Partial<CropCalendar> = {}): CropCalendar => ({
  cropId: cropId(id),
  plantings: [planting()],
  harvest: {
    start: dayOfYear(200),
    end: dayOfYear(240),
    basis: { kind: 'days-to-maturity', backedOffDays: days(75) },
  },
  successions: [],
  feasibility: { kind: 'fits', slackDays: days(21) },
  frostRiskPercentile: 20,
  notes: [],
  ...patch,
})

const bed = (entries: readonly CropCalendar[]): readonly BedCalendar[] => [
  { bedId: bedId('bed-1'), entries },
]

describe('timeline geometry', () => {
  it('places a window as one segment inside the year', () => {
    const segments = timelineSegments(100, 130)
    expect(segments.length).toBe(1)
    expect(segments[0]?.leftPercent).toBeCloseTo((99 / 365) * 100, 6)
    expect(segments[0]?.widthPercent).toBeCloseTo((30 / 365) * 100, 6)
  })

  it('splits a southern hemisphere window across the year boundary', () => {
    expect(wrapsYear(300, 40)).toBe(true)
    const segments = timelineSegments(300, 40)
    expect(segments.length).toBe(2)
    expect(segments[0]?.leftPercent).toBeCloseTo((299 / 365) * 100, 6)
    expect(segments[0]?.widthPercent).toBeCloseTo(100 - (299 / 365) * 100, 6)
    expect(segments[1]?.leftPercent).toBe(0)
    expect(segments[1]?.widthPercent).toBeCloseTo((39 / 365) * 100, 6)
  })

  it('clamps out of range days rather than drawing off the track', () => {
    expect(timelineSegments(0, 400)[0]?.leftPercent).toBe(0)
    expect(dayLabel(1)).toBe('Jan 1')
    expect(dayLabel(365)).toBe('Dec 31')
  })
})

describe('basis and feasibility', () => {
  it('spells out where every date came from', () => {
    expect(
      basisLabel({
        kind: 'frost-offset',
        anchor: 'last-spring-freeze',
        offsetDays: days(-7),
        percentile: 10,
      }),
    ).toBe('7 days before the last spring freeze, 10% frost risk')
    expect(basisLabel({ kind: 'soil-temperature', minSoilTempC: 10 })).toContain('10 °C')
    expect(basisLabel({ kind: 'soil-temperature', minSoilTempC: 10, frostFree: true })).toBe(
      'no frost here: dated by soil temperature only, soil at or above 10 °C (50 °F)',
    )
    // a frost-free site whose year-round window starts at a named wet season instead: the
    // soil-temperature reading alone would still say "dated by soil temperature only", which
    // stops being the actual reason for the date
    expect(
      basisLabel({ kind: 'soil-temperature', minSoilTempC: 10, frostFree: true, rains: true }),
    ).toBe('no frost here: dated from the start of the rains, soil at or above 10 °C (50 °F)')
    expect(basisLabel({ kind: 'light-window', firstAdequateMonth: 4 })).toContain('Apr')
    expect(basisLabel({ kind: 'days-to-maturity', backedOffDays: days(75) })).toContain('75 days')
    expect(basisLabel({ kind: 'catalog-window' })).toContain('catalog')
    expect(
      basisLabel({
        kind: 'harvest-calendar',
        afterFreezeDays: -7,
        sourceSeasonDays: 178,
        percentile: 50,
      }),
    ).toBe(
      '7 days before the last spring freeze, from an extension harvest calendar, 50% frost risk',
    )
    // 29 days of a 100 day source season: the same share lands wherever the site's own season runs
    expect(
      basisLabel({
        kind: 'harvest-calendar',
        afterFreezeDays: 29,
        sourceSeasonDays: 100,
        percentile: 50,
      }),
    ).toBe(
      '29% of the way through the frost-free season, where an extension harvest calendar places it, 50% frost risk',
    )
    // horseradish: dug 185 days off the freeze against a 178 day source season, 7 days past it
    expect(
      basisLabel({
        kind: 'harvest-calendar',
        afterFreezeDays: 185,
        sourceSeasonDays: 178,
        percentile: 50,
      }),
    ).toBe(
      '7 days after the first fall freeze, as an extension harvest calendar places it, 50% frost risk',
    )
    expect(
      basisLabel({
        kind: 'harvest-calendar',
        afterFreezeDays: null,
        sourceSeasonDays: null,
        percentile: 50,
      }),
    ).toBe('picked from the last spring freeze to the first fall freeze, 50% frost risk')
    expect(
      basisLabel({
        kind: 'harvest-calendar',
        afterFreezeDays: null,
        sourceSeasonDays: null,
        percentile: 50,
        frostFree: true,
      }),
    ).toBe('no frost here: picked through its growing season')
    expect(
      basisKindLabel({
        kind: 'harvest-calendar',
        afterFreezeDays: 53,
        sourceSeasonDays: 178,
        percentile: 50,
      }),
    ).toBe('harvest calendar')
  })

  it("refuses to call a crop plantable when it can't finish", () => {
    const short = feasibilitySummary({ kind: 'season-too-short', shortfallDays: days(18) })
    expect(short.plantable).toBe(false)
    expect(short.tone).toBe('error')
    expect(short.detail).toContain('18')
    expect(feasibilitySummary({ kind: 'no-thermal-data' }).plantable).toBe(false)
    expect(feasibilitySummary({ kind: 'fits', slackDays: days(3) }).plantable).toBe(true)
  })

  it('gives each feasibility kind its own tone and wording', () => {
    const kinds: readonly CalendarFeasibility[] = [
      { kind: 'fits', slackDays: days(5) },
      { kind: 'needs-indoor-start', weeksBefore: 6 },
      { kind: 'season-too-short', shortfallDays: days(12) },
      { kind: 'light-limited', month: 5 },
      { kind: 'no-thermal-data' },
    ]
    const summaries = kinds.map(feasibilitySummary)
    expect(new Set(summaries.map((s) => s.badge)).size).toBe(5)
    expect(new Set(summaries.map((s) => s.kind)).size).toBe(5)
    expect(summaries.map((s) => s.tone)).toEqual(['ok', 'warn', 'error', 'warn', 'unknown'])
  })
})

describe('orderCalendars', () => {
  it('reorders the dated catalog into the ranking order for that bed', () => {
    const calendars = bed([crop('zea-mays'), crop('daucus-carota'), crop('lactuca-sativa')])
    const sets: readonly RecommendationSet[] = [
      {
        bedId: bedId('bed-1'),
        ranked: [{ cropId: cropId('lactuca-sativa') }, { cropId: cropId('zea-mays') }],
        generatedAtStage: 'rank',
      } as unknown as RecommendationSet,
    ]
    expect(orderCalendars(calendars, sets)[0]?.entries.map((e) => String(e.cropId))).toEqual([
      'lactuca-sativa',
      'zea-mays',
      'daucus-carota',
    ])
  })

  /** The crops in the bed lead, whatever the ranking says: their dates are the ones wanted */
  it('puts what is planted in the bed ahead of the rest of its ranking', () => {
    const calendars = bed([crop('zea-mays'), crop('daucus-carota'), crop('lactuca-sativa')])
    const sets: readonly RecommendationSet[] = [
      {
        bedId: bedId('bed-1'),
        ranked: [{ cropId: cropId('lactuca-sativa') }, { cropId: cropId('zea-mays') }],
        generatedAtStage: 'rank',
      } as unknown as RecommendationSet,
    ]
    const beds = [
      { id: bedId('bed-1'), plantings: [{ cropId: cropId('daucus-carota') }] },
    ] as unknown as readonly import('../types/garden').Bed[]
    expect(orderCalendars(calendars, sets, beds)[0]?.entries.map((e) => String(e.cropId))).toEqual([
      'daucus-carota',
      'lactuca-sativa',
      'zea-mays',
    ])
  })

  it('leaves a bed alone when no ranking covers it', () => {
    const calendars = bed([crop('zea-mays'), crop('daucus-carota')])
    expect(orderCalendars(calendars, [])[0]?.entries.map((e) => String(e.cropId))).toEqual([
      'zea-mays',
      'daucus-carota',
    ])
  })
})

describe('CalendarTimeline', () => {
  it('draws sow and harvest bars and shows the basis for each date', async () => {
    const harness = await mount(<CalendarTimeline calendars={bed([crop('daucus-carota')])} />)
    expect(harness.get('readout-calendar-recommended-daucus-carota-0').textContent).toBe('Apr 20')
    expect(harness.get('bar-calendar-sow-daucus-carota-0').getAttribute('data-start-day')).toBe(
      '100',
    )
    expect(harness.get('bar-calendar-harvest-daucus-carota').getAttribute('data-end-day')).toBe(
      '240',
    )
    expect(harness.get('readout-calendar-basis-daucus-carota-0').getAttribute('data-basis')).toBe(
      'frost-offset',
    )
    expect(harness.get('readout-calendar-basis-daucus-carota-0').getAttribute('title')).toContain(
      '20% frost risk',
    )
    expect(harness.get('readout-calendar-harvest-basis-daucus-carota').textContent).toContain(
      'days to maturity',
    )
    // the basis lines sit behind the row's "Why these dates" fold, as the agenda's jobs do
    expect(harness.get('readout-calendar-basis-daucus-carota-0').closest('details')).toBe(
      harness.get('details-calendar-why-daucus-carota'),
    )
    await harness.unmount()
  })

  it('marks a season-too-short crop as not plantable and mutes its bars', async () => {
    const entry = crop('citrullus-lanatus', {
      feasibility: { kind: 'season-too-short', shortfallDays: days(23) },
    })
    const harness = await mount(<CalendarTimeline calendars={bed([entry])} />)
    const row = harness.get('item-calendar-crop-citrullus-lanatus')
    expect(row.getAttribute('data-plantable')).toBe('false')
    expect(row.getAttribute('data-feasibility')).toBe('season-too-short')
    expect(harness.get('badge-feasibility-citrullus-lanatus').textContent).toBe("Can't finish here")
    expect(
      harness.get('bar-calendar-sow-citrullus-lanatus-0').className.includes('cal-bar-blocked'),
    ).toBe(true)
    expect(
      harness.get('status-calendar-feasibility-citrullus-lanatus').className.includes('error'),
    ).toBe(true)
    await harness.unmount()
  })

  it('renders each feasibility kind distinctly in the same bed', async () => {
    const entries = [
      crop('a-fits'),
      crop('b-indoor', { feasibility: { kind: 'needs-indoor-start', weeksBefore: 6 } }),
      crop('c-short', { feasibility: { kind: 'season-too-short', shortfallDays: days(9) } }),
      crop('d-light', { feasibility: { kind: 'light-limited', month: 5 } }),
      crop('e-thermal', { feasibility: { kind: 'no-thermal-data' } }),
    ]
    // all five planted in the bed, so all five rows are on the face: an empty bed folds the
    // ranking past its fourth crop
    const beds = [
      { id: bedId('bed-1'), plantings: entries.map((entry) => ({ cropId: entry.cropId })) },
    ] as unknown as readonly import('../types/garden').Bed[]
    const harness = await mount(<CalendarTimeline calendars={bed(entries)} beds={beds} />)
    const states = entries.map((entry) =>
      harness.get(`item-calendar-crop-${entry.cropId}`).getAttribute('data-feasibility'),
    )
    expect(new Set(states).size).toBe(5)
    expect(
      entries.map((entry) =>
        harness.get(`item-calendar-crop-${entry.cropId}`).getAttribute('data-plantable'),
      ),
    ).toEqual(['true', 'true', 'false', 'true', 'false'])
    await harness.unmount()
  })

  /**
   * A planted bed shows its own crops and folds the rest of the ranking. An empty bed shows the
   * head of the ranking, because there's nothing else to show. The entries arrive ordered by
   * `orderCalendars`, planted first, so the head is a count
   */
  it('shows the planted crops before the fold, and the ranked head while the bed is empty', async () => {
    const entries = ['a-planted', 'b-planted', 'c-ranked', 'd-ranked'].map((id) => crop(id))
    const beds = [
      {
        id: bedId('bed-1'),
        plantings: [{ cropId: cropId('a-planted') }, { cropId: cropId('b-planted') }],
      },
    ] as unknown as readonly import('../types/garden').Bed[]
    const planted = await mount(<CalendarTimeline calendars={bed(entries)} beds={beds} />)
    expect(planted.find('item-calendar-crop-b-planted')).not.toBeNull()
    expect(planted.find('item-calendar-crop-c-ranked')).toBeNull()
    expect(planted.get('details-calendar-more-bed-1').textContent).toContain('2 more crops')
    await planted.unmount()
    const empty = await mount(<CalendarTimeline calendars={bed(entries)} />)
    expect(empty.find('item-calendar-crop-d-ranked')).not.toBeNull()
    expect(empty.find('details-calendar-more-bed-1')).toBeNull()
    await empty.unmount()
  })

  /**
   * A note on the method that every crop in every bed carries ("the soil-temperature date uses the
   * monthly mean air temperature...") is printed once, under one fold, and a bed prints only what
   * is its own. At the top of every bed it would make twelve copies for twelve beds
   */
  it('prints a note every bed shares once, under the calendar, and not per bed', async () => {
    const everywhere = 'Soil temperature is a proxy from monthly air temperature'
    const onlyHere = 'This bed sits in a frost pocket'
    const calendars = [
      { bedId: bedId('bed-1'), entries: [crop('a', { notes: [everywhere, onlyHere] })] },
      { bedId: bedId('bed-2'), entries: [crop('b', { notes: [everywhere] })] },
    ]
    const harness = await mount(<CalendarTimeline calendars={calendars} />)
    expect(harness.get('details-calendar-method').textContent).toContain(everywhere)
    expect(harness.all('readout-calendar-method').length).toBe(1)
    expect(harness.get('readout-calendar-note-bed-1').textContent).toBe(onlyHere)
    expect(harness.find('readout-calendar-note-bed-2')).toBeNull()
    await harness.unmount()
  })

  it('keeps a wrapped southern hemisphere window on the track', async () => {
    const entry = crop('solanum-tuberosum', {
      plantings: [
        planting({ earliest: dayOfYear(280), recommended: dayOfYear(300), latest: dayOfYear(20) }),
      ],
      harvest: {
        start: dayOfYear(330),
        end: dayOfYear(60),
        basis: { kind: 'catalog-window' },
      },
    })
    const harness = await mount(<CalendarTimeline calendars={bed([entry])} />)
    expect(harness.get('bar-calendar-sow-solanum-tuberosum-0').getAttribute('data-wraps')).toBe(
      'true',
    )
    expect(harness.find('bar-calendar-sow-solanum-tuberosum-0-wrap')).not.toBeNull()
    expect(harness.find('bar-calendar-harvest-solanum-tuberosum-wrap')).not.toBeNull()
    await harness.unmount()
  })

  it('lists successions and says so when a bed has no dated crop', async () => {
    const entry = crop('lactuca-sativa', { successions: [dayOfYear(120), dayOfYear(140)] })
    const harness = await mount(<CalendarTimeline calendars={bed([entry])} />)
    expect(harness.get('readout-calendar-successions-lactuca-sativa').textContent).toContain(
      'Apr 30',
    )
    expect(harness.all('marker-calendar-succession-lactuca-sativa-120').length).toBe(1)
    await harness.unmount()

    const empty = await mount(<CalendarTimeline calendars={bed([])} />)
    expect(empty.find('status-calendar-bed-bed-1')).not.toBeNull()
    await empty.unmount()
  })

  it('resolves a planting citekey to its readable label instead of printing it raw', async () => {
    const entry = crop('daucus-carota', {
      plantings: [planting({ citations: ['fao-ecocrop'] })],
    })
    const harness = await mount(<CalendarTimeline calendars={bed([entry])} />)
    const cites = harness.get('readout-calendar-citations-daucus-carota-0')

    // the registry is a real dynamic import of docs/CITATIONS.csl.json, module-cached by
    // `useCitations` across the whole test run: it may already be warm from an earlier test
    // file, in which case the label is there on the first render, or it may still be loading,
    // in which case this polls the same way `settle` does elsewhere in this codebase. Either
    // way the raw citekey, which is only the correct fallback while nothing has loaded yet,
    // must never be the final state
    for (let tick = 0; tick < 50 && cites.textContent?.includes('fao-ecocrop'); tick += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5))
      })
    }
    expect(cites.textContent).not.toContain('fao-ecocrop')
    expect(cites.textContent).toContain('FAO ECOCROP')
    await harness.unmount()
  })
})
