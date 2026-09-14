import type { AgendaAction, AgendaGroup, AgendaItem, SupplyKind } from '../types/agenda'
import type { CalendarFeasibility } from '../types/calendar'
import { dayLabel, feasibilitySummary, methodLabel, type FeasibilitySummary } from './calendar'
import { monthLabel } from './format'

/** The three planting methods keep the calendar's own words; only the rest are new */
export const actionLabel = (action: AgendaAction): string =>
  action === 'succession-sow'
    ? 'Sow the next succession'
    : action === 'first-harvest'
      ? 'First harvest'
      : action === 'harvest-ends'
        ? 'Harvest window closes'
        : methodLabel(action)

/** The calendar's bar colours, so one job means the same thing on both surfaces */
export const ACTION_SWATCH: Readonly<Record<AgendaAction, string>> = {
  'start-indoors': 'cal-bar-start-indoors',
  'transplant-out': 'cal-bar-transplant-out',
  'direct-sow': 'cal-bar-direct-sow',
  'succession-sow': 'cal-bar-direct-sow',
  'first-harvest': 'cal-bar-harvest',
  'harvest-ends': 'cal-bar-harvest',
}

export const PLANTING_ACTIONS: ReadonlySet<AgendaAction> = new Set([
  'start-indoors',
  'direct-sow',
  'transplant-out',
  'succession-sow',
])

/**
 * `feasibilitySummary` reads "no date can be derived", which is true of a crop with no
 * normals and false of the perennial that reaches this branch carrying dates. The agenda
 * puts the two side by side, so the perennial gets the sentence that is true of it
 */
export const NO_THERMAL_AGENDA_NOTE =
  'No days-to-maturity figure is published for this crop, so the harvest dates are the catalogue growing window'

export const agendaFeasibility = (feasibility: CalendarFeasibility): FeasibilitySummary =>
  feasibility.kind === 'no-thermal-data'
    ? { ...feasibilitySummary(feasibility), detail: NO_THERMAL_AGENDA_NOTE }
    : feasibilitySummary(feasibility)

export const groupLabel = (group: AgendaGroup): string =>
  group.bucket === 'this-week'
    ? 'This week'
    : group.bucket === 'this-month'
      ? 'Later this month'
      : group.month === null
        ? 'Later'
        : monthLabel(group.month)

export const SUPPLY_LABEL: Readonly<Record<SupplyKind, string>> = {
  seed: 'Seed, sown where it grows',
  transplant: 'Transplants, raised under cover or bought as starts',
  'perennial-stock': 'Perennial stock, bought once',
}

export const supplyUnit = (kind: SupplyKind): string => (kind === 'seed' ? 'seeds' : 'plants')

/** True when a planting or harvest window covers the whole year rather than a date range within it */
export const windowSpansYear = (day: number, through: number): boolean =>
  (through - day + 365) % 365 >= 364

/** "every 14 days, 5 more sowings to 12 Aug", never five near-identical rows */
export const recurrenceLabel = (item: AgendaItem): string | null => {
  if (item.repeats.length === 0 || item.intervalDays === null) return null
  const last = item.repeats[item.repeats.length - 1]
  return `Repeats every ${String(item.intervalDays)} days, ${String(item.repeats.length)} sowings to ${dayLabel(last ?? item.day)}`
}

export const AGENDA_MODEL_NOTE =
  'These dates are modelled. They move with the frost exceedance percentile and with anything that changes the light in a bed'

export const AGENDA_EMPTY =
  'Nothing is dated yet. Put plants in a bed on the crop step, or apply an optimised layout, and every job they need lands here'

/**
 * The same empty list, for the opposite reason, and telling them apart matters because the
 * sentence above is FALSE in this case: it tells a visitor to go and plant something in beds
 * that are already planted.
 *
 * A planting carries its own sow and harvest days and is part of the saved design, so it comes
 * back on a reload. The calendar those days were read off does not: it is derived, deliberately
 * unpersisted, and rebuilt by the ranking. So a returning visitor opens a fully planted garden
 * whose agenda has nothing in it, which is a job list that has not been computed rather than a
 * garden with no jobs
 */
export const AGENDA_UNDATED =
  "These beds are planted, and their dates haven't been computed for this visit. The plants are saved with the garden. The calendar behind them is computed again from the light and the season"
