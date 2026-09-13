import { at, MONTH_LENGTH_DAYS, MONTH_START_DAY, monthOfDay } from '../data/util'
import type {
  Agenda,
  AgendaBlock,
  AgendaBucket,
  AgendaGroup,
  AgendaItem,
  ShoppingList,
  SupplyGroup,
  SupplyKind,
  SupplyLine,
  SupplyRefusal,
  SupplySpacing,
} from '../types/agenda'
import type { BedCalendar, CropCalendar, PlantingWindow } from '../types/calendar'
import type { Crop } from '../types/crop'
import type { Bed, Planting } from '../types/garden'
import type { BedId, CropId } from '../types/ids'
import type { ExceedancePercentile } from '../types/site'
import type { DayOfYear, MonthIndex } from '../types/units'
import { citationsFor, forwardDays } from './calendar'
import { calendarFor, plantingDensity } from './planting'

/**
 * The whole plot read down the year. Nothing here computes a date: every day comes from a
 * `CropCalendar`, so the frost risk percentile that moved the calendar moves the agenda
 * with it, and a crop the calendar refused to date produces no action at all
 */

/** A day of year through the same month table the calendar's own month bounds use */
export const monthOfDayOfYear = (day: DayOfYear): MonthIndex => monthOfDay(day - 1) as MonthIndex

const lastDayOfMonth = (month: MonthIndex): number =>
  at(MONTH_START_DAY, month - 1) + at(MONTH_LENGTH_DAYS, month - 1)

export const WEEK_DAYS = 7

const PERENNIAL_LIFE_CYCLES: ReadonlySet<Crop['lifeCycle']> = new Set([
  'perennial',
  'woody-perennial',
])

/** The field sowing or transplanting, as opposed to the raising period that precedes it */
export const fieldWindow = (calendar: CropCalendar): PlantingWindow | undefined =>
  calendar.plantings.find((planting) => planting.method !== 'start-indoors')

/**
 * Bought once as a plant, raised under cover from seed, or sown where it grows. The life
 * cycle settles a perennial before the method is even asked, because a shrub is nursery
 * stock however it reaches the bed
 */
export const supplyKind = (crop: Crop, calendar: CropCalendar): SupplyKind =>
  PERENNIAL_LIFE_CYCLES.has(crop.lifeCycle)
    ? 'perennial-stock'
    : calendar.plantings.some((planting) => planting.method === 'start-indoors')
      ? 'transplant'
      : 'seed'

/** A perennial is bought once; everything else is bought for every sowing the schedule asks */
const sowingsFor = (calendar: CropCalendar, kind: SupplyKind): number =>
  kind === 'perennial-stock' ? 1 : Math.max(1, calendar.successions.length)

interface Entry {
  readonly bed: Bed
  readonly planting: Planting
  readonly crop: Crop
  readonly calendar: CropCalendar
}

export interface AgendaInput {
  readonly beds: readonly Bed[]
  readonly calendars: readonly BedCalendar[]
  readonly catalog: readonly Crop[]
  readonly frostRiskPercentile: ExceedancePercentile
  /** The day the agenda is read from, which the app's own clock supplies */
  readonly today: DayOfYear
}

const entriesOf = (input: AgendaInput): readonly Entry[] =>
  input.beds.flatMap((bed) =>
    bed.plantings.flatMap((planting) => {
      const crop = input.catalog.find((candidate) => candidate.id === planting.cropId)
      const calendar = calendarFor(input.calendars, bed.id, planting.cropId)
      return crop === undefined || calendar === undefined ? [] : [{ bed, planting, crop, calendar }]
    }),
  )

/** A note every dated crop carries is a note about the method, so it belongs to the plot, once */
const sharedNotes = (entries: readonly Entry[]): ReadonlySet<string> =>
  new Set(
    (entries[0]?.calendar.notes ?? []).filter((note) =>
      entries.every((entry) => entry.calendar.notes.includes(note)),
    ),
  )

const itemsFor = (entry: Entry, shared: ReadonlySet<string>): readonly AgendaItem[] => {
  const { bed, crop, calendar, planting } = entry
  const notes = calendar.notes.filter((note) => !shared.has(note))
  const base = {
    bedId: bed.id,
    cropId: crop.id,
    feasibility: calendar.feasibility,
    notes,
    plantCount: planting.plantCount,
    repeats: [] as readonly DayOfYear[],
    intervalDays: null,
  }
  const id = (action: string, index: number): string =>
    `${bed.id as string}-${crop.id as string}-${action}-${String(index)}`

  const windows = calendar.plantings.map((window, index) => ({
    ...base,
    id: id(window.method, index),
    action: window.method,
    day: window.recommended,
    through: window.latest,
    basis: window.basis,
    citations: window.citations,
  }))

  const field = fieldWindow(calendar)
  // the first succession IS the first sowing, which the window above already stands for
  const repeats = calendar.successions.slice(1)
  const recurring: readonly AgendaItem[] =
    field === undefined || repeats.length === 0 || repeats[0] === undefined
      ? []
      : [
          {
            ...base,
            id: id('succession-sow', 0),
            action: 'succession-sow',
            day: repeats[0],
            through: repeats[repeats.length - 1] ?? repeats[0],
            repeats,
            intervalDays: crop.successionIntervalDays,
            basis: field.basis,
            citations: field.citations,
          },
        ]

  const harvestCitations = citationsFor(calendar.harvest.basis, crop)
  const harvest: readonly AgendaItem[] = [
    {
      ...base,
      id: id('first-harvest', 0),
      action: 'first-harvest',
      day: calendar.harvest.start,
      through: calendar.harvest.end,
      basis: calendar.harvest.basis,
      citations: harvestCitations,
    },
    {
      ...base,
      id: id('harvest-ends', 0),
      action: 'harvest-ends',
      day: calendar.harvest.end,
      through: null,
      basis: calendar.harvest.basis,
      citations: harvestCitations,
    },
  ]

  return [...windows, ...recurring, ...harvest]
}

interface Placed {
  readonly item: AgendaItem
  readonly ahead: number
  readonly bucket: AgendaBucket
  readonly month: MonthIndex
  readonly key: string
}

/**
 * Distance forward from today rather than a raw day number, so a southern-hemisphere
 * season that crosses 31 December orders and groups exactly as a northern one does
 */
const place = (item: AgendaItem, today: DayOfYear, daysLeftInMonth: number): Placed => {
  const ahead = forwardDays(today, item.day)
  const month = monthOfDayOfYear(item.day)
  const bucket: AgendaBucket =
    ahead <= WEEK_DAYS
      ? 'this-week'
      : month === monthOfDayOfYear(today) && ahead <= daysLeftInMonth
        ? 'this-month'
        : 'month'
  return { item, ahead, bucket, month, key: bucket === 'month' ? `month-${String(month)}` : bucket }
}

const BUCKET_ORDER: Readonly<Record<AgendaBucket, number>> = {
  'this-week': -2,
  'this-month': -1,
  month: 0,
}

const groupsOf = (items: readonly AgendaItem[], today: DayOfYear): readonly AgendaGroup[] => {
  const daysLeftInMonth = lastDayOfMonth(monthOfDayOfYear(today)) - today
  const placed = items.map((item) => place(item, today, daysLeftInMonth))
  const keys = [...new Set(placed.map((entry) => entry.key))]
  const order = (key: string): number => {
    const members = placed.filter((entry) => entry.key === key)
    const first = members[0]
    if (first === undefined) return Number.MAX_SAFE_INTEGER
    return first.bucket === 'month'
      ? Math.min(...members.map((entry) => entry.ahead))
      : BUCKET_ORDER[first.bucket]
  }
  return keys
    .sort((a, b) => order(a) - order(b))
    .map((key) => {
      const members = placed
        .filter((entry) => entry.key === key)
        .sort((a, b) => a.ahead - b.ahead || a.item.id.localeCompare(b.item.id))
      const first = members[0]
      return {
        key,
        bucket: first?.bucket ?? 'month',
        month: first?.bucket === 'month' ? first.month : null,
        items: members.map((entry) => entry.item),
      }
    })
}

const SUPPLY_ORDER: readonly SupplyKind[] = ['seed', 'transplant', 'perennial-stock']

interface Draft {
  readonly cropId: CropId
  kind: SupplyKind
  lifeCycle: Crop['lifeCycle']
  method: PlantingWindow['method']
  readonly beds: BedId[]
  plantsPerSowing: number
  sowings: number
  quantity: number
  spacing: SupplySpacing | null
}

/**
 * One line per crop, because a supplier order is per crop and not per bed. The count is
 * what the bed carries, which `plantingDensity` derived when the planting was made, and
 * the same helper supplies the spacing the line quotes: there is no second density model
 * here and no second count. A crop that is sown in succession is bought for every sowing
 */
const shoppingList = (dated: readonly Entry[]): ShoppingList => {
  const drafts = new Map<string, Draft>()
  const refusals: SupplyRefusal[] = []
  for (const { bed, crop, calendar, planting } of dated) {
    const kind = supplyKind(crop, calendar)
    const sowings = sowingsFor(calendar, kind)
    const density = plantingDensity(crop, bed.areaM2)
    if (!density.ok) refusals.push({ bedId: bed.id, cropId: crop.id, reason: density.reason })
    const key = crop.id as string
    const draft = drafts.get(key) ?? {
      cropId: crop.id,
      kind,
      lifeCycle: crop.lifeCycle,
      method: fieldWindow(calendar)?.method ?? 'direct-sow',
      beds: [],
      plantsPerSowing: 0,
      sowings: 0,
      quantity: 0,
      spacing: null,
    }
    draft.beds.push(bed.id)
    draft.plantsPerSowing += planting.plantCount
    draft.sowings = Math.max(draft.sowings, sowings)
    draft.quantity += planting.plantCount * sowings
    draft.spacing =
      draft.spacing ??
      (density.ok
        ? { basis: density.value.basis, areaPerPlantM2: density.value.areaPerPlantM2 }
        : null)
    drafts.set(key, draft)
  }
  const lines: readonly SupplyLine[] = [...drafts.values()].map((draft) => ({ ...draft }))
  const groups: readonly SupplyGroup[] = SUPPLY_ORDER.map((kind) => ({
    kind,
    lines: lines
      .filter((line) => line.kind === kind)
      .sort((a, b) => (a.cropId as string).localeCompare(b.cropId as string)),
  })).filter((group) => group.lines.length > 0)
  return { groups, refusals }
}

export const buildAgenda = (input: AgendaInput): Agenda => {
  const entries = entriesOf(input)
  const shared = sharedNotes(entries)
  const dated = entries.filter((entry) => entry.calendar.plantings.length > 0)
  const blocked: readonly AgendaBlock[] = entries
    .filter((entry) => entry.calendar.plantings.length === 0)
    .map((entry) => ({
      bedId: entry.bed.id,
      cropId: entry.crop.id,
      feasibility: entry.calendar.feasibility,
      notes: entry.calendar.notes.filter((note) => !shared.has(note)),
    }))
  return {
    referenceDay: input.today,
    frostRiskPercentile: input.frostRiskPercentile,
    groups: groupsOf(
      dated.flatMap((entry) => itemsFor(entry, shared)),
      input.today,
    ),
    blocked,
    notes: [...shared],
    shopping: shoppingList(dated),
  }
}
