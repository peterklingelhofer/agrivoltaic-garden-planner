import { useMemo, type ReactElement } from 'react'
import { buildAgenda } from '../recommend/agenda'
import { EMPTY_LIST } from '../state/slices'
import { useAppStore } from '../state/store'
import { dayOfYearAt } from '../state/sun'
import type { AgendaBlock, AgendaGroup, AgendaItem, SupplyGroup } from '../types/agenda'
import type { Crop } from '../types/crop'
import type { Bed } from '../types/garden'
import {
  ACTION_SWATCH,
  actionLabel,
  agendaFeasibility,
  AGENDA_EMPTY,
  AGENDA_MODEL_NOTE,
  AGENDA_UNDATED,
  groupLabel,
  PLANTING_ACTIONS,
  recurrenceLabel,
  SUPPLY_LABEL,
  supplyUnit,
  windowSpansYear,
} from './agenda'
import { basisKindLabel, basisLabel, dayLabel, feasibilitySummary, NOTICE_CLASS } from './calendar'
import { CropPictureFor } from './CropSprite'
import { approxPlural, bedName, cropName, plural } from './format'
import { AsyncNotice, Panel } from './Panel'

const Item = ({
  item,
  catalog,
  beds,
}: {
  readonly item: AgendaItem
  readonly catalog: readonly Crop[]
  readonly beds: readonly Bed[]
}): ReactElement => {
  const feasibility = agendaFeasibility(item.feasibility)
  const recurrence = recurrenceLabel(item)
  // a window that covers the whole year reads as a date range otherwise, which misreads a
  // frost-free "any day works" as a deadline
  const spansYear = item.through !== null && windowSpansYear(item.day, item.through)
  return (
    <li
      className="agenda-item"
      data-testid={`item-agenda-${item.id}`}
      data-bed={item.bedId}
      data-crop={item.cropId}
      data-action={item.action}
      data-day={item.day}
    >
      <p className="agenda-line">
        {/*
          Two marks, and they say different things. The swatch is the JOB: it's the color the
          planting calendar's legend gives sowing, transplanting or harvesting, and it's what lets
          a week of jobs be read by kind. The picture below is the CROP, and it's what lets a crop
          be found in a year of dated jobs without reading them
        */}
        <span className={`cal-swatch ${ACTION_SWATCH[item.action]}`} />
        <strong data-testid={`readout-agenda-date-${item.id}`}>{dayLabel(item.day)}</strong>{' '}
        {actionLabel(item.action)} <CropPictureFor catalog={catalog} cropId={item.cropId} />
        <strong>{cropName(catalog, item.cropId)}</strong> in {bedName(beds, item.bedId)}
        {item.through === null ? null : (
          <span className="agenda-window">
            {spansYear ? ' (any time of year)' : ` (through ${dayLabel(item.through)})`}
          </span>
        )}
      </p>
      {PLANTING_ACTIONS.has(item.action) ? (
        <p className="agenda-count" data-testid={`readout-agenda-count-${item.id}`}>
          {approxPlural(item.plantCount, 'plant', 'plants')}
        </p>
      ) : null}
      {recurrence === null ? null : (
        <p className="agenda-count" data-testid={`readout-agenda-recurrence-${item.id}`}>
          {recurrence}
        </p>
      )}
      {/* an indoor start is the only thing that makes this crop finish here, so it's an
          instruction, said right on the row */}
      {item.feasibility.kind === 'fits' ? null : (
        <p
          className={NOTICE_CLASS[feasibility.tone]}
          data-testid={`status-agenda-feasibility-${item.id}`}
          data-feasibility={item.feasibility.kind}
        >
          {feasibility.badge}: {feasibility.detail}
        </p>
      )}
      {/*
        The rule behind the date, folded: every job carries four lines of method ("Basis: days to
        maturity, 126 days backed off...", the source, two notes on heat supply and soil
        temperature), and on the face a week of jobs would read as a page of the same paragraph. The
        job is the face. The fold keeps the rule one press away, and the tests still read it
      */}
      <details className="wizard-advanced" data-testid={`details-agenda-why-${item.id}`}>
        <summary>Why this date</summary>
        <span
          className="cal-basis"
          data-testid={`readout-agenda-basis-${item.id}`}
          data-basis={item.basis.kind}
        >
          Basis: {basisKindLabel(item.basis)}, {basisLabel(item.basis)}
        </span>
        {item.citations.length > 0 ? (
          <span className="cal-cites" data-testid={`readout-agenda-citations-${item.id}`}>
            {item.citations.join(', ')}
          </span>
        ) : null}
        {item.notes.map((note) => (
          <p key={note} className="cal-note">
            {note}
          </p>
        ))}
      </details>
    </li>
  )
}

const Group = ({
  group,
  catalog,
  beds,
}: {
  readonly group: AgendaGroup
  readonly catalog: readonly Crop[]
  readonly beds: readonly Bed[]
}): ReactElement => (
  <section data-testid={`item-agenda-group-${group.key}`} data-count={group.items.length}>
    <h3 className="agenda-group">
      {groupLabel(group)}
      <span className="agenda-group-count" data-testid={`readout-agenda-group-${group.key}`}>
        {plural(group.items.length, 'job', 'jobs')}
      </span>
    </h3>
    <ul className="list">
      {group.items.map((item) => (
        <Item key={item.id} item={item} catalog={catalog} beds={beds} />
      ))}
    </ul>
  </section>
)

const Blocked = ({
  block,
  catalog,
  beds,
}: {
  readonly block: AgendaBlock
  readonly catalog: readonly Crop[]
  readonly beds: readonly Bed[]
}): ReactElement => {
  const feasibility = feasibilitySummary(block.feasibility)
  return (
    <li
      data-testid={`item-agenda-blocked-${block.bedId}-${block.cropId}`}
      data-crop={block.cropId}
      data-feasibility={block.feasibility.kind}
    >
      <CropPictureFor catalog={catalog} cropId={block.cropId} />
      <strong>{cropName(catalog, block.cropId)}</strong> in {bedName(beds, block.bedId)}{' '}
      <span
        className={`badge cal-badge-${block.feasibility.kind}`}
        data-testid={`badge-agenda-${block.bedId}-${block.cropId}`}
      >
        {feasibility.badge}
      </span>
      <span className="cal-basis">{feasibility.detail}</span>
    </li>
  )
}

const Supply = ({
  group,
  catalog,
  beds,
}: {
  readonly group: SupplyGroup
  readonly catalog: readonly Crop[]
  readonly beds: readonly Bed[]
}): ReactElement => (
  <section data-testid={`item-agenda-supply-group-${group.kind}`} data-kind={group.kind}>
    <h4 className="agenda-supply-head">{SUPPLY_LABEL[group.kind]}</h4>
    <ul className="list">
      {group.lines.map((line) => (
        <li
          key={line.cropId}
          className="agenda-item"
          data-testid={`item-agenda-supply-${line.cropId}`}
          data-crop={line.cropId}
          data-kind={line.kind}
          data-quantity={line.quantity}
        >
          <p className="agenda-line">
            <strong data-testid={`readout-agenda-quantity-${line.cropId}`}>
              {line.quantity} {supplyUnit(line.kind)}
            </strong>{' '}
            of <CropPictureFor catalog={catalog} cropId={line.cropId} />
            <strong>{cropName(catalog, line.cropId)}</strong> for{' '}
            {line.beds.map((id) => bedName(beds, id)).join(', ')}
          </p>
          <p className="agenda-count">
            {approxPlural(line.plantsPerSowing, 'plant', 'plants')} per sowing,{' '}
            {plural(line.sowings, 'sowing', 'sowings')} ({line.lifeCycle}, {line.method})
            {line.spacing === null
              ? null
              : `, ${line.spacing.areaPerPlantM2.toFixed(2)} m² each at ${line.spacing.basis} spacing`}
          </p>
        </li>
      ))}
    </ul>
  </section>
)

/**
 * Placed at the head of the calendar step. The steps before it answer where things go and what
 * to grow and why. This answers when to do it, so it sits above the schedule it is derived
 * from and one press from anywhere a novice lands
 */
export const AgendaPanel = (): ReactElement => {
  const plot = useAppStore((s) => s.plot)
  const calendars = useAppStore((s) => s.calendars)
  const catalog = useAppStore((s) => s.catalog)
  const frostPercentile = useAppStore((s) => s.frostPercentile)
  // the real day, wherever the sun slider is parked. Dragging the sun changes what the
  // garden LOOKS like at a moment. It has never been a statement about what needs doing now
  const todayUtcMillis = useAppStore((s) => s.todayUtcMillis)
  // the garden's own day: an evening west of Greenwich is already tomorrow in UTC
  const site = useAppStore((s) => (s.site.status === 'ready' ? s.site.value : null))

  const agenda = useMemo(
    () =>
      buildAgenda({
        beds: plot?.beds ?? EMPTY_LIST,
        calendars: calendars.status === 'ready' ? calendars.value : EMPTY_LIST,
        catalog: catalog.status === 'ready' ? catalog.value : EMPTY_LIST,
        frostRiskPercentile: frostPercentile,
        today: dayOfYearAt(todayUtcMillis, site),
      }),
    [plot, calendars, catalog, frostPercentile, todayUtcMillis, site],
  )
  const empty = agenda.groups.length === 0 && agenda.blocked.length === 0
  const crops = catalog.status === 'ready' ? catalog.value : EMPTY_LIST
  const beds = plot?.beds ?? EMPTY_LIST
  // an empty list over planted beds is a calendar that hasn't been computed, and over bare beds
  // it's a garden with nothing in it. The two need opposite things said to them
  const undated = empty && beds.some((bed) => bed.plantings.length > 0)

  return (
    <Panel
      id="agenda"
      title="What to do next"
      subtitle="Every job your beds need, nearest first, and what to buy for them. The dates come from the planting calendar"
    >
      <AsyncNotice state={calendars} testId="status-agenda" idleLabel="No planting calendar yet" />
      {/* the jobs first. How they were dated is one fold below them, because five paragraphs of
          method landing above the first job read as unusable */}
      <p className="panel-sub" data-testid="readout-agenda-reference">
        Dated from today, {dayLabel(agenda.referenceDay)}, and running one year forward from it
      </p>
      {empty ? (
        <p
          className="notice notice-idle"
          data-testid="status-agenda-empty"
          data-reason={undated ? 'undated' : 'unplanted'}
        >
          {undated ? AGENDA_UNDATED : AGENDA_EMPTY}
        </p>
      ) : null}
      {agenda.groups.length > 0 ? (
        <div data-testid="list-agenda">
          {agenda.groups.map((group) => (
            <Group key={group.key} group={group} catalog={crops} beds={beds} />
          ))}
        </div>
      ) : null}
      <details className="wizard-advanced" data-testid="details-agenda-method">
        <summary>How these dates were computed</summary>
        <p className="panel-sub" data-testid="readout-agenda-percentile">
          In {agenda.frostRiskPercentile}% of years, a frost falls outside these dates. Change how
          cautious the dates are in the planting calendar below, and every date tied to frost here
          moves with it
        </p>
        <p className="notice notice-warn" data-testid="readout-agenda-model-note">
          {AGENDA_MODEL_NOTE}
        </p>
        {agenda.notes.map((note, index) => (
          <p key={note} className="cal-note" data-testid={`readout-agenda-note-${index}`}>
            {note}
          </p>
        ))}
      </details>
      {agenda.blocked.length > 0 ? (
        <>
          <h3 className="agenda-group">Planted, with no date the calendar can give</h3>
          <ul className="list" data-testid="list-agenda-blocked">
            {agenda.blocked.map((block) => (
              <Blocked
                key={`${block.bedId}-${block.cropId}`}
                block={block}
                catalog={crops}
                beds={beds}
              />
            ))}
          </ul>
        </>
      ) : null}
      <h3 className="agenda-group">Shopping list</h3>
      {agenda.shopping.groups.length === 0 ? (
        <p className="notice notice-idle" data-testid="status-agenda-shopping-empty">
          Nothing to order until a bed carries a plant the calendar can date
        </p>
      ) : (
        <div data-testid="list-agenda-shopping">
          {agenda.shopping.groups.map((group) => (
            <Supply key={group.kind} group={group} catalog={crops} beds={beds} />
          ))}
        </div>
      )}
      {agenda.shopping.refusals.map((refusal) => (
        <p
          key={`${refusal.bedId}-${refusal.cropId}`}
          className="notice notice-warn"
          data-testid={`status-agenda-supply-refusal-${refusal.bedId}-${refusal.cropId}`}
        >
          {cropName(crops, refusal.cropId)}: {refusal.reason}
        </p>
      ))}
    </Panel>
  )
}
