import { describe, expect, it } from 'bun:test'
import { cropById, loadCropCatalog } from '../data/crops'
import type { Agenda, AgendaItem } from '../types/agenda'
import type { BedCalendar } from '../types/calendar'
import type { Crop } from '../types/crop'
import type { Bed, Planting } from '../types/garden'
import { plantingId } from '../types/ids'
import type { ExceedancePercentile, Site } from '../types/site'
import type { Celsius, DayOfYear, DegreeDaysC, DegreesLatitude, SquareMeters } from '../types/units'
import { buildAgenda, fieldWindow, supplyKind, WEEK_DAYS } from './agenda'
import { bedCalendar, forwardDays } from './calendar'
import { calendarFor, derivePlanting, plantingDensity } from './planting'
import { bedFixture, bedLightFixture, FROST_EVERY_YEAR, siteFixture } from './testkit'

const catalogPromise = loadCropCatalog()

const need = async (id: string): Promise<Crop> => {
  const crop = cropById(await catalogPromise, id as Crop['id'])
  if (crop === undefined) throw new Error(`missing fixture crop ${id}`)
  return crop
}

const BED = 'bed-a'
/** Big enough that a tree's own spacing still leaves a plant count to derive */
const AREA = 200 as SquareMeters

interface Planted {
  readonly bed: Bed
  readonly calendars: readonly BedCalendar[]
}

/**
 * A bed carrying the crops it is given, dated by the same calendar the product uses and
 * planted through the same derivation the bed panel uses
 */
const plant = (
  crops: readonly Crop[],
  options: { site?: Site; rsr?: number; percentile?: ExceedancePercentile } = {},
): Planted => {
  const site = options.site ?? siteFixture()
  const percentile = options.percentile ?? 20
  const bed = bedFixture(BED, { areaM2: AREA })
  const light = bedLightFixture(BED, options.rsr ?? 0)
  const calendars = [bedCalendar(site, light, crops, percentile)]
  const plantings = crops.flatMap((crop) => {
    const derived = derivePlanting({
      id: plantingId(`${BED}:${crop.id as string}`),
      bed,
      crop,
      arrays: [],
      calendar: calendarFor(calendars, bed.id, crop.id),
    })
    return derived.ok ? [derived.value] : []
  })
  return { bed: { ...bed, plantings }, calendars }
}

const agendaOf = (
  crops: readonly Crop[],
  today: number,
  options: { site?: Site; rsr?: number; percentile?: ExceedancePercentile } = {},
): Agenda => {
  const { bed, calendars } = plant(crops, options)
  return buildAgenda({
    beds: [bed],
    calendars,
    catalog: crops,
    frostRiskPercentile: options.percentile ?? 20,
    today: today as DayOfYear,
  })
}

const flat = (agenda: Agenda): readonly AgendaItem[] =>
  agenda.groups.flatMap((group) => group.items)

const SHORT_SEASON = (): Site =>
  siteFixture({
    frost: [
      {
        ...FROST_EVERY_YEAR,
        thresholdC: 0 as Celsius,
        lastSpringFreeze: { 10: 152, 20: 150, 30: 148, 40: 146, 50: 144 } as never,
        firstFallFreeze: { 10: 208, 20: 210, 30: 212, 40: 214, 50: 216 } as never,
        frostFreeDays: { 10: 56, 20: 60, 30: 64, 40: 68, 50: 72 } as never,
      },
    ],
    seasonGdd: { base4C: 900 as DegreeDaysC, base10C: 600 as DegreeDaysC, percentile: 20 },
  })

const SOUTHERN = (): Site =>
  siteFixture({
    location: { latitudeDeg: -33.9 as DegreesLatitude, longitudeDeg: 151 as never },
    frost: [
      {
        ...FROST_EVERY_YEAR,
        thresholdC: 0 as Celsius,
        lastSpringFreeze: { 10: 288, 20: 283, 30: 278, 40: 273, 50: 268 } as never,
        firstFallFreeze: { 10: 100, 20: 105, 30: 110, 40: 115, 50: 120 } as never,
        frostFreeDays: { 10: 177, 20: 187, 30: 197, 40: 207, 50: 217 } as never,
      },
    ],
    normals: {
      ...siteFixture().normals,
      monthlyMeanTempC: [24, 23, 19, 12, 6, 0, -2, 0, 5, 11, 17, 22].map((v) => v as Celsius),
    },
  })

describe('chronological order', () => {
  it('runs forward from the reference day and never sorts on a raw day number', async () => {
    const crops = [await need('lettuce-leaf'), await need('tomato')]
    const today = 173
    const agenda = agendaOf(crops, today)
    const ahead = flat(agenda).map((item) => forwardDays(today as DayOfYear, item.day))
    expect(ahead.length).toBeGreaterThan(4)
    expect(ahead).toEqual([...ahead].sort((a, b) => a - b))
    // a date already past this year is a date next year, not a date in the past
    expect(Math.min(...ahead)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...ahead)).toBeLessThan(365)
  })

  it('keeps the grouping intact for a season that crosses the year boundary', async () => {
    const site = SOUTHERN()
    const crops = [await need('lettuce-leaf')]
    // late October: this season's sowings are behind the reference day and next season's
    // are ahead of it, so a sort on the raw day number would invert the whole agenda
    const today = 300
    const agenda = agendaOf(crops, today, { site })
    const items = flat(agenda)
    expect(items.length).toBeGreaterThan(2)
    expect(items.some((item) => item.day < today)).toBe(true)
    expect(items.some((item) => item.day > today)).toBe(true)
    expect(items[0]?.day).toBeGreaterThan(today)
    expect(items[items.length - 1]?.day).toBeLessThan(today)
    const ahead = items.map((item) => forwardDays(today as DayOfYear, item.day))
    expect(ahead).toEqual([...ahead].sort((a, b) => a - b))
    // and the groups themselves are in that same forward order
    const firsts = agenda.groups.map((group) =>
      forwardDays(today as DayOfYear, group.items[0]?.day ?? (today as DayOfYear)),
    )
    expect(firsts).toEqual([...firsts].sort((a, b) => a - b))
  })

  it('puts only the next seven days in this week', async () => {
    const crops = [await need('lettuce-leaf'), await need('tomato')]
    for (const today of [1, 90, 173, 280, 364]) {
      const agenda = agendaOf(crops, today)
      const week = agenda.groups.find((group) => group.bucket === 'this-week')
      for (const item of week?.items ?? []) {
        expect(forwardDays(today as DayOfYear, item.day)).toBeLessThanOrEqual(WEEK_DAYS)
      }
      expect(agenda.groups.filter((group) => group.bucket === 'this-week').length).toBeLessThan(2)
      expect(agenda.groups.filter((group) => group.bucket === 'this-month').length).toBeLessThan(2)
    }
  })
})

describe('the frost risk dial', () => {
  it('moves every frost-anchored date in the agenda with it', async () => {
    const crop = await need('pea-garden')
    const dayAt = (percentile: ExceedancePercentile): number => {
      const item = flat(agendaOf([crop], 1, { percentile })).find(
        (candidate) => candidate.action === 'direct-sow' || candidate.action === 'transplant-out',
      )
      expect(item?.basis.kind).toBe('frost-offset')
      return item?.day ?? 0
    }
    const days = ([10, 20, 30, 40, 50] as const).map(dayAt)
    // the fixture curve pulls the last spring freeze earlier as the accepted risk rises
    expect(days).toEqual([...days].sort((a, b) => b - a))
    expect(days[0]).toBeGreaterThan(days[4] ?? 0)
    expect(agendaOf([crop], 1, { percentile: 40 }).frostRiskPercentile).toBe(40)
  })

  it('carries the percentile the date was anchored at into the item basis', async () => {
    const item = flat(agendaOf([await need('pea-garden')], 1, { percentile: 50 })).find(
      (candidate) => candidate.basis.kind === 'frost-offset',
    )
    expect(item?.basis.kind === 'frost-offset' ? item.basis.percentile : null).toBe(50)
    expect(item?.citations).toEqual(['open-meteo'])
  })
})

describe('successions', () => {
  it('collapses a repeating sowing into one recurring item', async () => {
    const crop = await need('lettuce-leaf')
    const { calendars } = plant([crop])
    const calendar = calendarFor(calendars, bedFixture(BED).id, crop.id)
    const schedule = calendar?.successions ?? []
    expect(schedule.length).toBeGreaterThan(2)

    const recurring = flat(agendaOf([crop], 1)).filter((item) => item.action === 'succession-sow')
    expect(recurring.length).toBe(1)
    const item = recurring[0]
    // the first sowing is the sow window itself, so only the repeats are the recurrence
    expect(item?.repeats).toEqual(schedule.slice(1))
    expect(item?.day).toBe(schedule[1])
    expect(item?.intervalDays).toBe(crop.successionIntervalDays)
    for (let index = 1; index < (item?.repeats.length ?? 0); index += 1) {
      expect(
        forwardDays(
          item?.repeats[index - 1] ?? (0 as DayOfYear),
          item?.repeats[index] ?? (0 as DayOfYear),
        ),
      ).toBe(crop.successionIntervalDays)
    }
  })

  it('gives a crop with no interval no recurring item at all', async () => {
    const crop = await need('tomato')
    expect(crop.successionIntervalDays).toBeNull()
    expect(flat(agendaOf([crop], 1)).some((item) => item.action === 'succession-sow')).toBe(false)
  })
})

describe('feasibility survives the translation', () => {
  it('gives a crop that cannot finish here no sow action and a stated reason', async () => {
    const crop = await need('watermelon')
    const site = SHORT_SEASON()
    const bed = bedFixture(BED, { areaM2: AREA })
    const calendars = [bedCalendar(site, bedLightFixture(BED, 0), [crop], 20)]
    const calendar = calendarFor(calendars, bed.id, crop.id)
    expect(calendar?.feasibility.kind).toBe('season-too-short')
    expect(calendar?.plantings).toEqual([])

    // the calendar refuses to date it, so the bed is planted by hand to prove the agenda
    // refuses too rather than relying on the placement having been blocked upstream
    const planting: Planting = {
      id: plantingId('bed-a:watermelon'),
      bedId: bed.id,
      cropId: crop.id,
      cultivarId: null,
      role: 'target-crop',
      tier: 'herb-ground',
      sowDay: 150 as DayOfYear,
      harvestStartDay: 250 as DayOfYear,
      harvestEndDay: 260 as DayOfYear,
      plantCount: 4,
    }
    const agenda = buildAgenda({
      beds: [{ ...bed, plantings: [planting] }],
      calendars,
      catalog: [crop],
      frostRiskPercentile: 20,
      today: 1 as DayOfYear,
    })
    expect(flat(agenda)).toEqual([])
    expect(agenda.blocked.map((block) => String(block.cropId))).toEqual(['watermelon'])
    expect(agenda.blocked[0]?.feasibility.kind).toBe('season-too-short')
    // and nothing is ordered for a crop that cannot grow
    expect(agenda.shopping.groups).toEqual([])
  })

  it('surfaces needs-indoor-start as the action that makes the crop finish', async () => {
    const base = await need('pepper-sweet')
    const crop: Crop =
      base.thermal === null ? base : { ...base, thermal: { ...base.thermal, dtmReference: 'sow' } }
    const agenda = agendaOf([crop], 1, { site: SHORT_SEASON() })
    const indoors = flat(agenda).find((item) => item.action === 'start-indoors')
    expect(indoors).toBeDefined()
    expect(indoors?.feasibility.kind).toBe('needs-indoor-start')
    if (indoors?.feasibility.kind === 'needs-indoor-start') {
      expect(indoors.feasibility.weeksBefore).toBeGreaterThan(0)
    }
    // every action on the crop carries the same verdict, so no row reads as unconditional
    for (const item of flat(agenda)) expect(item.feasibility.kind).toBe('needs-indoor-start')
  })

  it('keeps the provenance and soil caveats the calendar wrote', async () => {
    const agenda = agendaOf([await need('lettuce-leaf'), await need('tomato')], 1)
    expect(agenda.notes.some((note) => note.includes('daily normals'))).toBe(true)
    const carried = [...agenda.notes, ...flat(agenda).flatMap((item) => item.notes)]
    expect(carried.length).toBeGreaterThan(0)
    // nothing is dropped: every note the calendars carry reaches the agenda somewhere
    const { calendars } = plant([await need('lettuce-leaf'), await need('tomato')])
    for (const entry of calendars[0]?.entries ?? []) {
      for (const note of entry.notes) expect(carried).toContain(note)
    }
  })
})

describe('the shopping list', () => {
  it('takes its quantities from the one density model and the succession schedule', async () => {
    const crops = [await need('lettuce-leaf'), await need('tomato')]
    const { bed, calendars } = plant(crops)
    const agenda = agendaOf(crops, 1)
    const lines = agenda.shopping.groups.flatMap((group) => group.lines)
    expect(lines.length).toBe(2)
    for (const crop of crops) {
      const line = lines.find((candidate) => candidate.cropId === crop.id)
      const density = plantingDensity(crop, bed.areaM2)
      expect(density.ok).toBe(true)
      if (!density.ok) continue
      const calendar = calendarFor(calendars, bed.id, crop.id)
      const sowings = Math.max(1, calendar?.successions.length ?? 1)
      expect(line?.plantsPerSowing).toBe(density.value.plantCount)
      expect(line?.sowings).toBe(sowings)
      expect(line?.quantity).toBe(density.value.plantCount * sowings)
      expect(line?.spacing?.areaPerPlantM2).toBe(density.value.areaPerPlantM2)
      expect(line?.beds).toEqual([bed.id])
    }
  })

  it('sorts seed from transplants from perennial stock', async () => {
    const seed = await need('bean-bush')
    const transplant = await need('tomato')
    const stock = await need('apple')
    const agenda = agendaOf([seed, transplant, stock], 1)
    const kindOf = (id: string): string | undefined =>
      agenda.shopping.groups
        .flatMap((group) => group.lines)
        .find((line) => String(line.cropId) === id)?.kind
    expect(kindOf('bean-bush')).toBe('seed')
    expect(kindOf('tomato')).toBe('transplant')
    expect(kindOf('apple')).toBe('perennial-stock')
    // a supplier reads the groups in that order and each is present only once
    expect(agenda.shopping.groups.map((group) => group.kind)).toEqual([
      'seed',
      'transplant',
      'perennial-stock',
    ])
  })

  it('classifies every crop in the catalogue by life cycle then planting method', async () => {
    const catalog = await catalogPromise
    const site = siteFixture()
    const light = bedLightFixture(BED, 0)
    const calendar = bedCalendar(site, light, catalog, 20)
    for (const entry of calendar.entries) {
      const crop = cropById(catalog, entry.cropId)
      if (crop === undefined || entry.plantings.length === 0) continue
      const kind = supplyKind(crop, entry)
      const perennial = crop.lifeCycle === 'perennial' || crop.lifeCycle === 'woody-perennial'
      if (perennial) expect(kind).toBe('perennial-stock')
      else if (entry.plantings.some((planting) => planting.method === 'start-indoors'))
        expect(kind).toBe('transplant')
      else {
        expect(kind).toBe('seed')
        expect(fieldWindow(entry)?.method).toBe('direct-sow')
      }
    }
  })

  it('buys perennial stock once however long the season is', async () => {
    const stock = await need('apple')
    const agenda = agendaOf([stock], 1)
    const line = agenda.shopping.groups[0]?.lines[0]
    expect(line?.kind).toBe('perennial-stock')
    expect(line?.sowings).toBe(1)
    expect(line?.quantity).toBe(line?.plantsPerSowing)
  })
})
