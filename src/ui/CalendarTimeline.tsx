import { Fragment, useState, type ReactElement } from 'react'
import { EMPTY_LIST } from '../state/slices'
import type { BedCalendar, CropCalendar, PlantingWindow } from '../types/calendar'
import type { Crop } from '../types/crop'
import type { Bed } from '../types/garden'
import {
  NOTICE_CLASS,
  basisKindLabel,
  basisLabel,
  dayLabel,
  dayPercent,
  feasibilitySummary,
  methodLabel,
  timelineSegments,
  wrapsYear,
} from './calendar'
import { CropPictureFor } from './CropSprite'
import { DliEvidenceNote } from './DliEvidence'
import { useDliEvidence, type DliEvidenceLookup } from './dli'
import { bedName, cropName, MONTH_LABELS } from './format'
import { SourceLink } from './SourcesPanel'

const MethodBar = ({
  planting,
  cropId,
  index,
  plantable,
}: {
  readonly planting: PlantingWindow
  readonly cropId: string
  readonly index: number
  readonly plantable: boolean
}): ReactElement => (
  <>
    {timelineSegments(planting.earliest, planting.latest).map((piece, part) => (
      <span
        key={`${piece.leftPercent}-${piece.widthPercent}`}
        className={`cal-bar cal-bar-${planting.method}${plantable ? '' : ' cal-bar-blocked'}`}
        data-testid={`bar-calendar-sow-${cropId}-${index}${part === 0 ? '' : `-wrap`}`}
        data-start-day={planting.earliest}
        data-end-day={planting.latest}
        data-wraps={String(wrapsYear(planting.earliest, planting.latest))}
        style={{ left: `${piece.leftPercent}%`, width: `${piece.widthPercent}%` }}
        title={`${methodLabel(planting.method)} ${dayLabel(planting.earliest)} to ${dayLabel(planting.latest)}: ${basisLabel(planting.basis)}`}
      />
    ))}
    <span
      className="cal-marker"
      data-testid={`marker-calendar-recommended-${cropId}-${index}`}
      data-day={planting.recommended}
      style={{ left: `${dayPercent(planting.recommended)}%` }}
      title={`Best day to sow: ${dayLabel(planting.recommended)}`}
    />
  </>
)

/** The calendar's light gate is the crop's own DLI minimum, so that is the threshold it discloses */
const lightGated = (entry: CropCalendar): boolean =>
  entry.feasibility.kind === 'light-limited' ||
  entry.plantings.some((planting) => planting.basis.kind === 'light-window')

const CropRow = ({
  entry,
  catalog,
  shared,
  evidenceFor,
}: {
  readonly entry: CropCalendar
  readonly catalog: readonly Crop[]
  readonly shared: ReadonlySet<string>
  readonly evidenceFor: DliEvidenceLookup
}): ReactElement => {
  const feasibility = feasibilitySummary(entry.feasibility)
  const harvest = timelineSegments(entry.harvest.start, entry.harvest.end)
  const evidence = lightGated(entry) ? evidenceFor(String(entry.cropId), 'minimum') : null
  const notes = entry.notes.filter((note) => !shared.has(note))
  return (
    <article
      className="cal-row"
      data-testid={`item-calendar-crop-${entry.cropId}`}
      data-crop={entry.cropId}
      data-feasibility={feasibility.kind}
      data-plantable={String(feasibility.plantable)}
    >
      <header className="cal-head">
        {/* decorative, and the name is beside it: what it buys is a year of dated jobs that can be
            scanned for the crop you are looking for rather than read */}
        <CropPictureFor catalog={catalog} cropId={entry.cropId} />
        <strong>{cropName(catalog, entry.cropId)}</strong>
        <span
          className={`badge cal-badge-${feasibility.kind}`}
          data-testid={`badge-feasibility-${entry.cropId}`}
        >
          {feasibility.badge}
        </span>
        <span
          className="cal-percentile"
          data-testid={`readout-calendar-percentile-${entry.cropId}`}
        >
          {entry.frostRiskPercentile}% frost risk
        </span>
      </header>
      <p
        className={NOTICE_CLASS[feasibility.tone]}
        data-testid={`status-calendar-feasibility-${entry.cropId}`}
        data-feasibility={feasibility.kind}
      >
        {feasibility.detail}
      </p>
      {evidence === null ? null : (
        <DliEvidenceNote evidence={evidence} subjectId={String(entry.cropId)} prefix="calendar" />
      )}
      <div
        className="cal-track"
        data-testid={`chart-calendar-${entry.cropId}`}
        role="img"
        aria-label={`${cropName(catalog, entry.cropId)}: ${entry.plantings
          .map((p) => `${methodLabel(p.method)} ${dayLabel(p.recommended)}`)
          .join(', ')}, harvest ${dayLabel(entry.harvest.start)} to ${dayLabel(entry.harvest.end)}`}
      >
        {MONTH_LABELS.map((label, month) => (
          <span key={label} className="cal-gridline" style={{ left: `${(month / 12) * 100}%` }} />
        ))}
        {entry.plantings.map((planting, index) => (
          <MethodBar
            key={`${planting.method}-${planting.earliest}-${planting.latest}-${planting.recommended}`}
            planting={planting}
            cropId={entry.cropId}
            index={index}
            plantable={feasibility.plantable}
          />
        ))}
        {harvest.map((piece, part) => (
          <span
            key={`harvest-${piece.leftPercent}-${piece.widthPercent}`}
            className={`cal-bar cal-bar-harvest${feasibility.plantable ? '' : ' cal-bar-blocked'}`}
            data-testid={`bar-calendar-harvest-${entry.cropId}${part === 0 ? '' : '-wrap'}`}
            data-start-day={entry.harvest.start}
            data-end-day={entry.harvest.end}
            style={{ left: `${piece.leftPercent}%`, width: `${piece.widthPercent}%` }}
            title={`Harvest ${dayLabel(entry.harvest.start)} to ${dayLabel(entry.harvest.end)}: ${basisLabel(entry.harvest.basis)}`}
          />
        ))}
        {entry.successions.map((day) => (
          <span
            key={`succession-${day}`}
            className="cal-succession"
            data-testid={`marker-calendar-succession-${entry.cropId}-${day}`}
            style={{ left: `${dayPercent(day)}%` }}
            title={`Succession sowing ${dayLabel(day)}`}
          />
        ))}
      </div>
      <ol className="cal-detail">
        {entry.plantings.map((planting, index) => (
          <li
            key={`${planting.method}-${planting.earliest}-${planting.latest}-${planting.recommended}`}
            data-testid={`item-calendar-planting-${entry.cropId}-${index}`}
            data-method={planting.method}
          >
            <span className={`cal-swatch cal-bar-${planting.method}`} />
            <strong>{methodLabel(planting.method)}</strong>{' '}
            <span data-testid={`readout-calendar-recommended-${entry.cropId}-${index}`}>
              {dayLabel(planting.recommended)}
            </span>{' '}
            <span className="cal-window">
              (window {dayLabel(planting.earliest)} to {dayLabel(planting.latest)})
            </span>
            <span
              className="cal-basis"
              data-testid={`readout-calendar-basis-${entry.cropId}-${index}`}
              data-basis={planting.basis.kind}
              title={basisLabel(planting.basis)}
            >
              Basis: {basisKindLabel(planting.basis)}, {basisLabel(planting.basis)}
            </span>
          </li>
        ))}
        <li data-testid={`item-calendar-harvest-${entry.cropId}`}>
          <span className="cal-swatch cal-bar-harvest" />
          <strong>Harvest</strong>{' '}
          <span data-testid={`readout-calendar-harvest-${entry.cropId}`}>
            {dayLabel(entry.harvest.start)} to {dayLabel(entry.harvest.end)}
          </span>
          <span
            className="cal-basis"
            data-testid={`readout-calendar-harvest-basis-${entry.cropId}`}
            data-basis={entry.harvest.basis.kind}
            title={basisLabel(entry.harvest.basis)}
          >
            Basis: {basisKindLabel(entry.harvest.basis)}, {basisLabel(entry.harvest.basis)}
          </span>
        </li>
      </ol>
      {entry.successions.length > 0 ? (
        <p className="cal-note" data-testid={`readout-calendar-successions-${entry.cropId}`}>
          Successions: {entry.successions.map((day) => dayLabel(day)).join(', ')}
        </p>
      ) : null}
      {/*
        The dates and their one-line basis are the face. Where the basis came from and the notes on
        the method fold. Unfolded, every planting line would carry its source's full title
        ("Open-Meteo Historical Weather API and Satellite Radiation API n.d.") and two paragraphs on
        heat supply and soil temperature, and a bed's calendar would read as the same page repeated
      */}
      {notes.length > 0 || entry.plantings.some((planting) => planting.citations.length > 0) ? (
        <details
          className="wizard-advanced"
          data-testid={`details-calendar-sources-${entry.cropId}`}
        >
          <summary>Sources and notes</summary>
          {entry.plantings.map((planting, index) =>
            planting.citations.length === 0 ? null : (
              <p
                key={`${planting.method}-${planting.earliest}-${planting.latest}-${planting.recommended}`}
                className="cal-cites"
                data-testid={`readout-calendar-citations-${entry.cropId}-${index}`}
              >
                {methodLabel(planting.method)}:{' '}
                {planting.citations.map((id, at) => (
                  <Fragment key={id}>
                    {at > 0 ? ', ' : null}
                    <SourceLink id={id} />
                  </Fragment>
                ))}
              </p>
            ),
          )}
          {notes.map((note) => (
            <p key={note} className="cal-note">
              {note}
            </p>
          ))}
        </details>
      ) : null}
    </article>
  )
}

/**
 * How many crops a bed shows before the fold: what is planted in it, or, while it's empty, the
 * head of the ranking. The catalog dates every crop, so twelve timelines over a planted bed could
 * hold only two of the grower's. The rest are one press away
 */
const VISIBLE_PER_BED = 12
const visibleCount = (bed: BedCalendar, beds: readonly Bed[]): number => {
  const planted = new Set(
    beds.find((entry) => entry.id === bed.bedId)?.plantings.map((planting) => planting.cropId) ??
      [],
  )
  const inBed = bed.entries.filter((entry) => planted.has(entry.cropId)).length
  return inBed > 0 ? inBed : VISIBLE_PER_BED
}

/** A note every crop carries is a note about the method, so it belongs to the bed, once */
const sharedNotes = (bed: BedCalendar): ReadonlySet<string> =>
  new Set(
    (bed.entries[0]?.notes ?? []).filter((note) =>
      bed.entries.every((entry) => entry.notes.includes(note)),
    ),
  )

/** And a note every bed carries belongs to the calendar, once, under one fold at the top */
const calendarNotes = (calendars: readonly BedCalendar[]): ReadonlySet<string> => {
  const withEntries = calendars.filter((bed) => bed.entries.length > 0)
  const first = withEntries[0]
  if (first === undefined) return new Set()
  return new Set(
    [...sharedNotes(first)].filter((note) =>
      withEntries.every((bed) => sharedNotes(bed).has(note)),
    ),
  )
}

const BedSection = ({
  bed,
  catalog,
  beds,
  evidenceFor,
  said,
}: {
  readonly bed: BedCalendar
  readonly catalog: readonly Crop[]
  readonly beds: readonly Bed[]
  readonly evidenceFor: DliEvidenceLookup
  /** the notes the calendar has already printed once for every bed */
  readonly said: ReadonlySet<string>
}): ReactElement => {
  const [expanded, setExpanded] = useState(false)
  const shown = visibleCount(bed, beds)
  const rest = bed.entries.slice(shown)
  const blocked = rest.filter((entry) => !feasibilitySummary(entry.feasibility).plantable).length
  const shared = sharedNotes(bed)
  return (
    <section data-testid={`item-calendar-bed-${bed.bedId}`}>
      <h3 className="cal-bed">{bedName(beds, bed.bedId)}</h3>
      {[...shared]
        .filter((note) => !said.has(note))
        .map((note) => (
          <p key={note} className="cal-note" data-testid={`readout-calendar-note-${bed.bedId}`}>
            {note}
          </p>
        ))}
      {bed.entries.length === 0 ? (
        <p className="notice notice-idle" data-testid={`status-calendar-bed-${bed.bedId}`}>
          No dated crop for this bed
        </p>
      ) : (
        bed.entries
          .slice(0, shown)
          .map((entry) => (
            <CropRow
              key={entry.cropId}
              entry={entry}
              catalog={catalog}
              shared={shared}
              evidenceFor={evidenceFor}
            />
          ))
      )}
      {rest.length > 0 ? (
        <details
          className="experimental"
          data-testid={`details-calendar-more-${bed.bedId}`}
          onToggle={(event) => setExpanded(event.currentTarget.open)}
        >
          <summary>
            {rest.length} more crops ranked for this bed, {blocked} of them not plantable here
          </summary>
          {expanded
            ? rest.map((entry) => (
                <CropRow
                  key={entry.cropId}
                  entry={entry}
                  catalog={catalog}
                  shared={shared}
                  evidenceFor={evidenceFor}
                />
              ))
            : null}
        </details>
      ) : null}
    </section>
  )
}

export const CalendarTimeline = ({
  calendars,
  catalog = EMPTY_LIST,
  beds = EMPTY_LIST,
}: {
  readonly calendars: readonly BedCalendar[]
  /** Optional: falls back to the id when not given, same rule as `cropName` and `bedName` */
  readonly catalog?: readonly Crop[]
  readonly beds?: readonly Bed[]
}): ReactElement => {
  const evidenceFor = useDliEvidence()
  const said = calendarNotes(calendars)
  return calendars.length === 0 ? (
    <p className="notice notice-idle" data-testid="status-calendar-empty">
      No crop is plantable in any bed yet
    </p>
  ) : (
    <div className="calendar" data-testid="list-calendar">
      <div className="cal-axis" data-testid="readout-calendar-axis" aria-hidden="true">
        {MONTH_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <p className="cal-legend" data-testid="readout-calendar-legend">
        {(['start-indoors', 'direct-sow', 'transplant-out'] as const).map((method) => (
          <span key={method}>
            <span className={`cal-swatch cal-bar-${method}`} />
            {methodLabel(method)}
          </span>
        ))}
        <span>
          <span className="cal-swatch cal-bar-harvest" />
          Harvest
        </span>
        <span>
          <span className="cal-swatch cal-swatch-marker" />
          Best day to sow
        </span>
      </p>
      {said.size > 0 ? (
        <details className="wizard-advanced" data-testid="details-calendar-method">
          <summary>How these dates were computed</summary>
          {[...said].map((note) => (
            <p key={note} className="cal-note" data-testid="readout-calendar-method">
              {note}
            </p>
          ))}
        </details>
      ) : null}
      {calendars.map((bed) => (
        <BedSection
          key={bed.bedId}
          bed={bed}
          catalog={catalog}
          beds={beds}
          evidenceFor={evidenceFor}
          said={said}
        />
      ))}
    </div>
  )
}
