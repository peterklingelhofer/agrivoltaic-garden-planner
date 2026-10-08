import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import {
  calendarFor,
  calendarSowDay,
  derivePlanting,
  bedOccupancy,
  plantingDensity,
  plantingIdFor,
  type Derivation,
} from '../recommend/planting'
import { makeBed, nextBedIndex, soilForSite } from '../state/defaults'
import { extentOf, polygonAreaM2, polygonOf, rectangleOf, rectangleRing, vec2 } from '../state/geom'
import { rainFieldOf } from '../state/rain'
import { outOfSeason } from '../state/season'
import { EMPTY_LIST, MAX_PLANT_YEAR } from '../state/slices'
import { scenePlot, selectedBedOf, useAppStore } from '../state/store'
import { dayOfYearUtc } from '../state/sun'
import type { BedCalendar } from '../types/calendar'
import type { Crop } from '../types/crop'
import type { Bed, CanopyTier, Planting, PlantingRole } from '../types/garden'
import type { Polygon2D } from '../types/geo'
import type { BedId, CropId, PlantingId } from '../types/ids'
import type { PvArray } from '../types/pv'
import type { CropRecommendation } from '../types/recommend'
import { meters, type DayOfYear } from '../types/units'
import { calendarDate, dayLabel, dayOfYearFrom, daysInMonth, methodLabel } from './calendar'
import { BedSizeFields } from './BedSizeFields'
import { BedStrip } from './BedStrip'
import { GROUND_COVER_OPTIONS } from '../data/albedo'
import { DEFAULT_GROUND_COVER } from '../types/ground'
import { frostReading } from '../recommend/frost'
import type { BedLight } from '../types/light'
import { InfoTip } from './InfoTip'
import { TierBadge } from './EvidenceBadge'
import { Action, NumberField, SelectField, SliderField, TextField, Toggle } from './controls'
import { CropPicture } from './CropSprite'
import {
  cropName,
  cropTieNote,
  explainLimitingFactor,
  formatDli,
  formatLength,
  formatRsr,
  limitingFactorOf,
  plural,
  rootDepthRemedy,
  tiedLeadingCropCount,
  MONTH_LABELS,
  ROOT_DEPTH_RAISE_CAP_M,
  verdictLabel,
  weakestScoreTerm,
} from './format'
import { SurroundingsStep, WaterStep } from './AnswerPanels'
import { lengthStep, showLength, toMeters, useLengthUnit } from './length-units'
import { ObstructionsSection } from './ObstructionsSection'
import { formatAreaBothUnits, roundTenth } from './onboarding'
import { Panel, Readout } from './Panel'
import { bringIntoView } from './scroll-into-view'

const IRRIGATION: readonly (readonly [Bed['irrigation']['method'], string])[] = [
  ['none', 'None'],
  ['hand', 'Hand'],
  ['sprinkler', 'Sprinkler'],
  ['drip', 'Drip'],
  ['subsurface-drip', 'Subsurface drip'],
  ['flood', 'Flood'],
]

/** The ranked head, so the primary path is never a bare alphabetical list of the whole catalog */
export const PICKER_LIMIT = 12

/**
 * A planting badge shows the role and the layer the engine assigned, and a gardener can't read the
 * engine's own words for them, such as `mid-canopy`. The words change here. `Planting.role` and
 * `Planting.tier` themselves stay exactly what `recommend/planting.ts` and `stages/space.ts` write,
 * so nothing downstream of the store has to change to read this
 */
const ROLE_LABEL: Readonly<Record<PlantingRole, string>> = {
  'target-crop': 'Main crop',
  nurse: 'Nurse plant',
  insectary: 'Insect magnet',
  cover: 'Cover crop',
  trap: 'Trap crop',
}

const TIER_LABEL: Readonly<Record<CanopyTier, string>> = {
  overstory: 'Tall layer',
  'mid-canopy': 'Mid layer',
  shrub: 'Shrub layer',
  'herb-ground': 'Ground layer',
}

const PLANTING_NEEDS_RANKING =
  'Rank crops for this bed before placing a plant. The list you pick from is the ranking, so a crop the site or the light rules out says why'

interface Draft {
  readonly bedId: Bed['id']
  readonly cropId: CropId
  readonly sowDay: DayOfYear
  readonly plantCount: number
}

interface PlantingSectionProps {
  readonly bed: Bed
  readonly catalog: readonly Crop[]
  readonly arrays: readonly PvArray[]
  readonly calendars: readonly BedCalendar[]
  readonly ranked: readonly CropRecommendation[]
  readonly rankingReady: boolean
}

/**
 * How much of the free space one new crop is offered by default.
 *
 * Filling it entirely is the obvious rule and it's wrong: the first crop added would take the
 * whole bed and every later one would be refused for want of room, which is a monoculture by
 * accident. `maxCropsPerBed` is the number the grower has already set for how many crops a bed
 * should hold, so the default share is the space left divided by the slots left. A grower who does
 * want the whole bed can still type it
 */
const defaultShareM2 = (bed: Bed, freeM2: number, maxCropsPerBed: number): number =>
  freeM2 / Math.max(1, maxCropsPerBed - bed.plantings.length)

const draftDefaults = (
  bed: Bed,
  crop: Crop,
  calendars: readonly BedCalendar[],
  freeM2: number,
  maxCropsPerBed: number,
): Omit<Draft, 'cropId'> => {
  const calendar = calendarFor(calendars, bed.id, crop.id)
  const density = plantingDensity(crop, defaultShareM2(bed, freeM2, maxCropsPerBed))
  return {
    bedId: bed.id,
    sowDay: (calendar === undefined ? null : calendarSowDay(calendar)) ?? (1 as DayOfYear),
    plantCount: density.ok ? density.value.plantCount : 1,
  }
}

/**
 * Which planting a full bed offers up first when a new crop needs its room: the one this bed's
 * own ranking scores lowest now, so the swap on offer is the one the ranking itself would drop.
 * A crop the ranking excluded from this bed carries no score to compare, so when none of the
 * bed's own plantings have one, the last planting added is offered instead
 */
const lowestScoringPlanting = (
  bed: Bed,
  ranked: readonly CropRecommendation[],
): Planting | null => {
  let lowest: { readonly planting: Planting; readonly score: number } | null = null
  for (const planting of bed.plantings) {
    const outcome = ranked.find((entry) => entry.cropId === planting.cropId)?.outcome
    if (outcome === undefined || outcome.verdict === 'excluded') continue
    if (lowest === null || outcome.score.total < lowest.score) {
      lowest = { planting, score: outcome.score.total }
    }
  }
  return lowest?.planting ?? bed.plantings[bed.plantings.length - 1] ?? null
}

/**
 * What the sow day is a day OF, in the calendar's own words: a tomato in Massachusetts is started
 * indoors on its sow day and a bean is sown where it grows. Saying "Sow" for both while the
 * calendar step says "Start indoors" for the first would read as the two steps disagreeing. "Sow"
 * is what is said when the bed has no calendar for the crop yet, which is the only case the method
 * is unknown in
 */
const sowVerb = (calendar: BedCalendar['entries'][number] | undefined): string => {
  const method = calendar?.plantings[0]?.method
  return method === undefined ? 'Sow' : methodLabel(method)
}

const PlantingRow = ({
  planting,
  catalog,
  sowLabel,
  hovered,
  otherBeds,
  movable,
  onCount,
  onSow,
  onRemove,
  onMove,
}: {
  readonly planting: Planting
  readonly catalog: readonly Crop[]
  /** "Sow", "Start indoors" or "Transplant out": see `sowVerb` */
  readonly sowLabel: string
  /** True while the pointer is over one of this planting's plants in the 3D */
  readonly hovered: boolean
  /** Every other bed, so the row's own "Move this plant to" select has somewhere to send it */
  readonly otherBeds: readonly Bed[]
  /**
   * A move re-derives the planting against the destination's own calendar, so until the
   * calendars exist there is nothing to derive from and the gesture is refused. Same rule as
   * the crop picker above: a control that can't work doesn't appear
   */
  readonly movable: boolean
  onCount(value: number): void
  onSow(value: number): void
  onRemove(): void
  onMove(toBedId: BedId): void
}): ReactElement => (
  <li
    className="rec-row"
    data-hovered={hovered}
    data-testid={`item-bed-planting-${planting.id}`}
    data-crop={planting.cropId}
    /* the sow day is in the prose below as a number. The harvest window is only there as dates */
    data-harvest-start-day={planting.harvestStartDay}
    data-harvest-end-day={planting.harvestEndDay}
  >
    <div className="rec-head">
      <strong>{cropName(catalog, planting.cropId)}</strong>
      <span className="badge" data-testid={`badge-bed-planting-${planting.id}`}>
        {ROLE_LABEL[planting.role]} · {TIER_LABEL[planting.tier]}
      </span>
      <InfoTip label="role and layer" testId={`info-bed-planting-role-${planting.id}`}>
        The first part is the job this plant does in the bed. A main crop is what you're growing the
        bed for. A nurse plant shelters or feeds another plant. An insect magnet draws in
        pollinators and the insects that eat pests. A cover crop feeds and protects the soil and
        isn't harvested. A trap crop draws pests away from the main crop. The second part is the
        height layer it occupies. Tall layer is whatever grows highest here, then mid layer, then
        shrub layer. Ground layer stays low, close to the soil.
      </InfoTip>
    </div>
    <p className="rec-light" data-testid={`readout-bed-planting-${planting.id}`}>
      {sowLabel} {dayLabel(planting.sowDay)} (day {planting.sowDay}), harvest{' '}
      {dayLabel(planting.harvestStartDay)} to {dayLabel(planting.harvestEndDay)},{' '}
      {plural(planting.plantCount, 'plant', 'plants')}
    </p>
    {/*
      The controls behind one press per row. In the open, a planting's count, its two sowing
      selects, the day-of-year note, the move select and the remove press take about 480px per crop
      on a phone, and a grower who came to add one plant would scroll past a screen of forms for
      each one already there
    */}
    <details className="wizard-advanced" data-testid={`details-bed-planting-${planting.id}`}>
      <summary data-testid={`action-bed-planting-change-${planting.id}`}>Change or remove</summary>
      <div className="row">
        <NumberField
          testId={`control-bed-planting-count-${planting.id}`}
          label="Plants"
          min={1}
          step={1}
          value={planting.plantCount}
          onChange={onCount}
        />
        {/*
        The gardener picks a month and a day. The store keeps `sowDay` as a raw day of the year
        because `recommend/planting.ts` and the calendar engine both key on it, and these two
        selects read it through `calendarDate` and write it back through `dayOfYearFrom`. A field
        that asked a gardener for "130" and printed the date it meant underneath would be a
        conversion table with a text box in it.

        Two selects, on purpose: a planting recurs every year
        and carries no year at all, so a date control would have to invent one and show it
      */}
        <SelectField
          testId={`control-bed-planting-sow-month-${planting.id}`}
          label="Sow in"
          value={String(calendarDate(planting.sowDay).month)}
          options={MONTH_LABELS.map((name, index) => [String(index + 1), name] as const)}
          onChange={(value) =>
            onSow(dayOfYearFrom(Number(value), calendarDate(planting.sowDay).date))
          }
        />
        <SelectField
          testId={`control-bed-planting-sow-day-${planting.id}`}
          label="on the"
          value={String(calendarDate(planting.sowDay).date)}
          options={Array.from(
            { length: daysInMonth(calendarDate(planting.sowDay).month) },
            (_, i) => [String(i + 1), String(i + 1)],
          )}
          onChange={(value) =>
            onSow(dayOfYearFrom(calendarDate(planting.sowDay).month, Number(value)))
          }
        />
      </div>
      {/* deliberately not under the `readout-bed-planting-` prefix: several specs select that
        prefix expecting the one summary line per planting, and a second match under it is a
        strict-mode violation.

        The field above asks for the date, so the note here gives the day-of-year
        number underneath it, for anyone comparing this against the engine's own output or a
        paper that counts in days */}
      <p className="readout-note" data-testid={`readout-bed-sow-date-${planting.id}`}>
        {dayLabel(planting.sowDay)} is day {planting.sowDay} of the year
      </p>
      {otherBeds.length === 0 || !movable ? null : (
        <SelectField
          testId={`control-bed-move-planting-${planting.id}`}
          label="Move this plant to"
          value=""
          options={[
            ['', 'Move to bed…'] as const,
            ...otherBeds.map((entry) => [entry.id as string, entry.label] as const),
          ]}
          onChange={(value) => {
            if (value !== '') onMove(value as BedId)
          }}
        />
      )}
      <Action testId={`action-bed-remove-planting-${planting.id}`} onClick={onRemove}>
        Remove planting
      </Action>
    </details>
  </li>
)

const PlantingSection = ({
  bed,
  catalog,
  arrays,
  calendars,
  ranked,
  rankingReady,
}: PlantingSectionProps): ReactElement => {
  const plot = useAppStore((s) => s.plot)
  const unit = useLengthUnit()
  const planRefusals = useAppStore((s) => s.planRefusals)
  const experience = useAppStore((s) => s.answers.experience)
  const timeUtcMillis = useAppStore((s) => s.timeUtcMillis)
  const addPlanting = useAppStore((s) => s.addPlanting)
  const removePlanting = useAppStore((s) => s.removePlanting)
  const updatePlanting = useAppStore((s) => s.updatePlanting)
  // the same action the ground panel's own raised-height field writes, reused here for the
  // root-depth remedy press so there's one way a bed's height ever changes
  const upsertBed = useAppStore((s) => s.upsertBed)
  const movePlanting = useAppStore((s) => s.movePlanting)
  const hoveredTarget = useAppStore((s) => s.hovered)
  const [moveOutcome, setMoveOutcome] = useState<Derivation<Planting> | null>(null)
  const calendarsReady = useAppStore((s) => s.calendars.status === 'ready')
  const [draft, setDraft] = useState<Draft | null>(null)
  const carry = useAppStore((s) => s.carry)
  const dropped = useAppStore((s) => s.dropped)
  const clearDropped = useAppStore((s) => s.clearDropped)
  // kept in the store, because a closed step is taken out of the document and would take the answer
  // with it: a grower who checked the box, left the step and came back for the crop they had seen
  // would find the short list again. The same flag drives the ranking panel's own box, so the two
  // lists agree about how much of the ranking is on screen
  const showAllCrops = useAppStore((s) => s.showAllCrops)
  const setShowAllCrops = useAppStore((s) => s.setShowAllCrops)
  // a name typed in, which is the only way into a 209-crop ranking for somebody who came here
  // wanting one plant. Local, because it's a question about this screen
  const [search, setSearch] = useState('')
  // the planting this draft would take the place of, empty for adding alongside
  const [replaceId, setReplaceId] = useState<PlantingId | ''>('')

  const occupancy = bedOccupancy(bed, catalog)
  const maxCropsPerBed = useAppStore((s) => s.maxCropsPerBed)

  /**
   * A crop dropped on a bed in the 3D, read as the same draft a click on the list would make.
   *
   * Staged first, and that is the whole design of the gesture. What a bed can take
   * is derived, and the derivation is entitled to refuse: a bed with a tenth of a square meter
   * free can't take a squash, and the sentence explaining that is the product working
   * as intended. A drop that planted silently would either hide that refusal or, worse, plant
   * something the bed can't carry. So the drop chooses the bed and the crop, and the press
   * below, with the sow date and any refusal on screen, is still what writes it.
   *
   * Derived fresh. An effect would make the drop a state write that fires after a render, so the
   * panel would paint once without the staged crop and again with it, and would need the store
   * cleared from inside the effect to avoid re-staging itself forever. Read straight through, a
   * drop is just a draft nobody has edited yet, and the local `draft` below takes precedence the
   * moment they touch anything
   */
  const droppedHere =
    dropped !== null && dropped.bedId === bed.id
      ? (catalog.find((entry) => entry.id === dropped.cropId) ?? null)
      : null
  /*
    The drop is answered where it can be seen. "Put this in Bed 1" sits on a ranked row that can be
    a whole screen below this block, so the draft it staged, and any refusal, would arrive off the
    top of the view and the press would read as doing nothing. A tap on a row of the picker below
    has the same shape on a phone, where the picker runs under the fold and the sentence it changes
    is above it, so a tap scrolls here too. jsdom has no `scrollIntoView`
  */
  const status = useRef<HTMLParagraphElement | null>(null)
  useEffect(() => {
    if (dropped !== null && dropped.bedId === bed.id) bringIntoView(status.current)
  }, [dropped, bed.id])

  // memoized because `derived` below is memoized on it, and a fresh object every render would
  // re-derive the planting every render, even when the choice hasn't changed
  const chosen = useMemo(
    (): Draft | null =>
      draft !== null && draft.bedId === bed.id
        ? draft
        : droppedHere === null
          ? null
          : {
              cropId: droppedHere.id,
              ...draftDefaults(bed, droppedHere, calendars, occupancy.freeM2, maxCropsPerBed),
            },
    [draft, bed, droppedHere, calendars, occupancy.freeM2, maxCropsPerBed],
  )

  // looked up fresh each time: a bed that changed under the panel leaves the id behind, and
  // the select falls back to adding alongside when it can't name a planting that has gone
  const chosenReplacing = bed.plantings.find((planting) => planting.id === replaceId) ?? null

  /**
   * The bed the draft is derived against, and what it derives to, computed against nothing
   * more than the visitor's own choice of replacement (or the lack of one): a throwaway pass
   * that exists only to answer "would adding this crop alongside everything already here be
   * refused for room", which `rawRefusedForRoom` below reads off it. A swap takes the old
   * planting's room with it, so deriving against the bed as it stands would refuse the swap for
   * want of the very space the swap frees: "Bed 1 is full" is the right answer to adding
   * alongside and the wrong answer to replacing
   */
  const rawTarget = useMemo(
    (): Bed =>
      chosenReplacing === null
        ? bed
        : {
            ...bed,
            plantings: bed.plantings.filter((planting) => planting.id !== chosenReplacing.id),
          },
    [bed, chosenReplacing],
  )

  const rawDerived = useMemo((): Derivation<Planting> | null => {
    if (chosen === null) return null
    const crop = catalog.find((entry) => entry.id === chosen.cropId)
    if (crop === undefined) {
      return { ok: false, reason: "The crop catalog isn't loaded, so nothing can be derived" }
    }
    return derivePlanting({
      id: plantingIdFor(rawTarget.id, crop.id, chosen.sowDay),
      bed: rawTarget,
      crop,
      arrays,
      calendar: calendarFor(calendars, rawTarget.id, crop.id),
      sowDay: chosen.sowDay,
      plantCount: chosen.plantCount,
      catalog,
    })
  }, [chosen, rawTarget, catalog, arrays, calendars])

  /*
    Stopping at "bed 1 is full ... Use 'Put it in place of' below" would send a reader hunting for a
    select the sentence only named. When a full bed refuses the chosen crop alongside everything
    already in it, the planting this bed's own ranking would drop first is offered as the
    replacement, so the status line and the press below read the ordinary "Replaces ..." sentence.

    Read fresh every render off `rawDerived`, so
    picking "Nothing, add it alongside" on a bed that is still full isn't fought back to the
    suggestion: a full bed has nothing to offer alongside, which is exactly the gap
    this fills in until the visitor picks something else to replace
  */
  const rawRefusedForRoom = rawDerived?.ok === false && rawDerived.cause === 'room'
  const replacing =
    replaceId !== '' || !rawRefusedForRoom ? chosenReplacing : lowestScoringPlanting(bed, ranked)

  /**
   * The bed the draft is derived against. A swap takes the old planting's room with it, so
   * deriving against the bed as it stands would refuse the swap for want of the very space the
   * swap frees: "Bed 1 is full" is the right answer to adding alongside and the wrong answer to
   * replacing
   */
  const target = useMemo(
    (): Bed =>
      replacing === null
        ? bed
        : { ...bed, plantings: bed.plantings.filter((planting) => planting.id !== replacing.id) },
    [bed, replacing],
  )

  const derived = useMemo((): Derivation<Planting> | null => {
    if (chosen === null) return null
    const crop = catalog.find((entry) => entry.id === chosen.cropId)
    if (crop === undefined) {
      return { ok: false, reason: "The crop catalog isn't loaded, so nothing can be derived" }
    }
    return derivePlanting({
      id: plantingIdFor(target.id, crop.id, chosen.sowDay),
      bed: target,
      crop,
      arrays,
      calendar: calendarFor(calendars, target.id, crop.id),
      sowDay: chosen.sowDay,
      plantCount: chosen.plantCount,
      catalog,
    })
  }, [chosen, target, catalog, arrays, calendars])

  const bedRefusals = planRefusals.filter((refusal) => refusal.bedId === bed.id)
  // a search reads the whole ranking, whatever the show-all box says: somebody who typed a name
  // has already said how much of the list they want to see
  const query = search.trim()
  const matched =
    query === ''
      ? null
      : ranked.filter((item) =>
          cropName(catalog, item.cropId).toLowerCase().includes(query.toLowerCase()),
        )
  const options = matched ?? (showAllCrops ? ranked : ranked.slice(0, PICKER_LIMIT))
  // every other bed in the plot, so a row carries a keyboard route as well as the drag one.
  // Hoisted once, so it's never re-filtered per row below
  const otherBeds = (plot?.beds ?? []).filter((entry) => entry.id !== bed.id)

  // The scene draws a planting at its growth stage, so an annual outside its own window is
  // absent from the scene. Without this the grower places a plant, sees the bed
  // stay empty and is told nothing at all
  const dayOfYear = dayOfYearUtc(timeUtcMillis)
  const undrawn = outOfSeason(
    bed.plantings,
    (planting) => catalog.find((entry) => entry.id === planting.cropId),
    dayOfYear,
  )

  /*
    What the press will do, said before it's pressed.

    An "Add planting" button in primary green under a red EXCLUDED tag makes the tag read as
    decoration: the store takes the crop the gate has ruled out, the season kills it and the
    rotation rule refuses it the year after. The crop can still go in, because a grower is allowed
    to plant what they like, and the sentence and the button say so
  */
  const excluding =
    chosen === null ? null : (ranked.find((item) => item.cropId === chosen.cropId)?.outcome ?? null)
  const excludedBy = excluding?.verdict === 'excluded' ? excluding.limiting : null
  // looked up once and reused by both the exclusion sentence and the root-depth remedy below,
  // so neither has to re-derive it: the picker's own options do the same lookup for their own
  // crop, so this is the chosen crop's equivalent
  const chosenCrop =
    chosen === null ? undefined : catalog.find((entry) => entry.id === chosen.cropId)
  const swap =
    chosen === null || replacing === null
      ? null
      : `Replace ${cropName(catalog, replacing.cropId)} with ${cropName(catalog, chosen.cropId)}`
  const addLabel =
    swap === null
      ? excludedBy === null
        ? 'Add planting'
        : 'Add it anyway'
      : excludedBy === null
        ? swap
        : `${swap} anyway`
  const replaceNote = replacing === null ? '' : `. Replaces ${cropName(catalog, replacing.cropId)}`
  /*
    The same crop sown the same day is the planting already in the bed, and the store adds to it
    (see `addPlanting`). Said before the press, because a reader who adds one cucumber to
    seventeen and then reads eighteen on the row has to be told that is what happened
  */
  const joining =
    derived?.ok === true
      ? (bed.plantings.find((planting) => planting.id === derived.value.id) ?? null)
      : null
  const joinNote =
    joining === null ? '' : `. Adds to the ${String(joining.plantCount)} already sown that day`
  /**
   * A gardener told only that the soil here isn't deep enough would never find the raised bed box,
   * so the raise is offered with the sentence. `rootDepthRemedy` is the same arithmetic
   * `stages/space.ts` already ran, read back off the crop and bed the panel already has, without
   * depending on the limiting factor itself. A shallow bed limits a crop and refuses it only below
   * `ROOT_DEPTH_FLOOR_M`, so the marginal verdict's limiting factor is read as well as an
   * exclusion's: the raise is worth offering either way
   */
  const limitedBy =
    excluding === null || excluding.verdict === 'recommended' ? null : excluding.limiting
  const rootDepthIssue =
    limitedBy?.cause.kind === 'root-depth' && chosenCrop !== undefined
      ? rootDepthRemedy(chosenCrop, bed)
      : null
  const raiseToM = rootDepthIssue?.raiseToM ?? null
  // a full bed is refused with a reason alone, so this is the one signal the panel gets for whether
  // the fix on offer is the replace select. A smaller count or a later day take a different path.
  // Read off the effective replacement above, so it goes false the moment that swap resolves the
  // refusal, exactly as it already does when a visitor's own pick resolves it
  const refusedForRoom = derived?.ok === false && derived.cause === 'room'
  /*
    Without this select, swapping one crop for another is four moves in two places: find the new
    one, add it, find the old row, remove it, and often not in that order, because a full bed
    refuses the new planting for want of the room the old one is holding. Built once and placed
    twice below: right under the refusal when that is what a full bed needs, in its ordinary spot
    otherwise
  */
  const replaceSelect =
    bed.plantings.length === 0 ? null : (
      <SelectField
        testId="control-bed-planting-replace"
        label="Put it in place of"
        value={replacing?.id ?? ''}
        options={[
          ['', 'Nothing, add it alongside'] as const,
          ...bed.plantings.map(
            (planting) => [planting.id as string, cropName(catalog, planting.cropId)] as const,
          ),
        ]}
        onChange={(value) => setReplaceId(value as PlantingId | '')}
      />
    )
  // the calendar's own method for the chosen crop in this bed, which is what decides whether
  // its sow day is a day it goes into the ground or a day it goes into a tray indoors
  const chosenCalendar = chosen === null ? undefined : calendarFor(calendars, bed.id, chosen.cropId)
  const chosenSow = sowVerb(chosenCalendar)
  const draftStatus =
    chosen === null
      ? `Choose a crop below to place it in ${bed.label}`
      : derived?.ok === false
        ? `Refused: ${derived.reason}${derived.cause === 'room' ? '. Use "Put it in place of" below' : ''}`
        : excludedBy !== null
          ? `Not suited: ${explainLimitingFactor(excludedBy, experience, catalog, chosenCrop, bed)}. It can still go in, and the simulated seasons judge it by the same rules as the ranking${replaceNote}${joinNote}`
          : `${cropName(catalog, chosen.cropId)}: ${chosenSow.toLowerCase()} ${dayLabel(chosen.sowDay)}, harvest ${derived?.ok ? `${dayLabel(derived.value.harvestStartDay)} to ${dayLabel(derived.value.harvestEndDay)}` : 'undated'}${replaceNote}${joinNote}`

  return (
    <>
      {/*
        What is in the bed already, above the list to pick from. The ranking is reference and the
        plantings are the thing a grower came to change, so the plantings come first. With the
        ranking above them, "Fix Bed 1" on the seasons step would land on 209 ranked crops and never
        reach the planting it names
      */}
      {bed.plantings.length === 0 ? null : (
        <>
          <h3>In {bed.label} now</h3>
          {moveOutcome === null || moveOutcome.ok ? null : (
            <p
              className="notice notice-error"
              data-testid="status-bed-move-keyboard"
              data-state="error"
            >
              {moveOutcome.reason}
            </p>
          )}
          <ul className="list" data-testid="list-bed-plantings">
            {bed.plantings.map((planting) => (
              <PlantingRow
                key={planting.id}
                planting={planting}
                catalog={catalog}
                sowLabel={sowVerb(calendarFor(calendars, bed.id, planting.cropId))}
                hovered={
                  hoveredTarget?.kind === 'planting' && hoveredTarget.plantingId === planting.id
                }
                otherBeds={otherBeds}
                // a "Move to" select with nowhere to send a planting is a control that can't
                // work, the same rule the crop picker follows below: moving is refused when
                // there's only one bed in the plot, as well as while the calendars aren't ready
                movable={calendarsReady && otherBeds.length > 0}
                onMove={(toBedId) => {
                  setMoveOutcome(movePlanting(planting.id, bed.id, toBedId))
                }}
                onCount={(value) =>
                  updatePlanting(bed.id, planting.id, {
                    plantCount: Math.max(1, Math.round(value)),
                  })
                }
                onSow={(value) =>
                  updatePlanting(bed.id, planting.id, {
                    sowDay: Math.min(365, Math.max(1, Math.round(value))) as DayOfYear,
                  })
                }
                onRemove={() => removePlanting(bed.id, planting.id)}
              />
            ))}
          </ul>
          {undrawn.length > 0 ? (
            <p
              className="notice notice-idle"
              data-testid="status-bed-season"
              data-undrawn={undrawn.length}
            >
              On {dayLabel(dayOfYear)}{' '}
              {undrawn.length === bed.plantings.length
                ? 'nothing in this bed is drawn'
                : `${undrawn.length} of these ${bed.plantings.length} plantings aren't drawn`}
              : a planting is in the ground only between its sow and harvest dates. To see one, move
              Day of the year, on the light step, to a day between the dates on its row
            </p>
          ) : null}
        </>
      )}
      <h3>Add a plant</h3>
      {!rankingReady ? (
        <p className="notice notice-idle" data-testid="status-bed-planting">
          {PLANTING_NEEDS_RANKING}
        </p>
      ) : (
        <>
          {/* the only way into a 209-crop ranking for somebody who came here wanting one plant:
              a search field lets a visitor jump straight to the plant they came for */}
          <TextField
            testId="control-bed-crop-search"
            label="Find a plant by name"
            placeholder="tomato, basil…"
            value={search}
            onChange={setSearch}
          />
          {/*
            The draft sits directly under the search box, above the list it is drawn from. Choosing
            a crop in the picker below fills a block that is already on screen
          */}
          <p
            className={`notice notice-${chosen !== null && derived?.ok === false ? 'error' : 'idle'}`}
            data-testid="status-bed-planting"
            ref={status}
          >
            {draftStatus}
          </p>
          {/* nothing to offer once the bed already holds the roots: the badge above is the
              ranking a moment behind, and `useAutoRecommend` is what brings it up to date */}
          {rootDepthIssue === null || rootDepthIssue.shortfallM <= 0 ? null : raiseToM === null ? (
            <p className="notice notice-idle" data-testid="status-bed-raise-for-root-depth">
              This crop needs {formatLength(rootDepthIssue.shortfallM, unit)} more depth than the
              bed has now, and raising a bed adds at most{' '}
              {formatLength(ROOT_DEPTH_RAISE_CAP_M, unit)} here
            </p>
          ) : (
            <Action
              testId="action-bed-raise-for-root-depth"
              onClick={() => upsertBed({ ...bed, raisedHeightM: meters(raiseToM) })}
            >
              {/* the height the sides stand above the ground, which is what the field on the
                  ground step sets. "to 0.50 m" beside "0.95 m deep" reads as the app
                  contradicting itself, so the press names the raise and the finished height */}
              Raise the sides by {formatLength(rootDepthIssue.shortfallM, unit)}, to{' '}
              {formatLength(raiseToM, unit)} above the ground
            </Action>
          )}
          {chosen === null ? null : (
            <>
              {refusedForRoom ? replaceSelect : null}
              {/* a month and a day, the same pair the rows above use and for the same reason:
                  "Sow day for hot pepper 88" leaves a reader unable to say what 88 is. The day
                  of the year the derivation keys on is read out underneath */}
              <div className="row">
                <SelectField
                  testId="control-bed-planting-sow-month"
                  label={`${chosenSow} ${cropName(catalog, chosen.cropId)} in`}
                  value={String(calendarDate(chosen.sowDay).month)}
                  options={MONTH_LABELS.map((name, index) => [String(index + 1), name] as const)}
                  onChange={(value) =>
                    setDraft({
                      ...chosen,
                      sowDay: dayOfYearFrom(
                        Number(value),
                        calendarDate(chosen.sowDay).date,
                      ) as DayOfYear,
                    })
                  }
                />
                <SelectField
                  testId="control-bed-planting-sow-day"
                  label="on the"
                  value={String(calendarDate(chosen.sowDay).date)}
                  options={Array.from(
                    { length: daysInMonth(calendarDate(chosen.sowDay).month) },
                    (_, i) => [String(i + 1), String(i + 1)],
                  )}
                  onChange={(value) =>
                    setDraft({
                      ...chosen,
                      sowDay: dayOfYearFrom(
                        calendarDate(chosen.sowDay).month,
                        Number(value),
                      ) as DayOfYear,
                    })
                  }
                />
                <NumberField
                  testId="control-bed-planting-count"
                  label="Plants"
                  min={1}
                  step={1}
                  value={chosen.plantCount}
                  onChange={(value) => setDraft({ ...chosen, plantCount: Math.round(value) })}
                />
              </div>
              {refusedForRoom ? null : replaceSelect}
              <p className="readout-note" data-testid="readout-bed-draft-sow-date">
                {dayLabel(chosen.sowDay)} is day {chosen.sowDay} of the year
              </p>
            </>
          )}
          {chosen === null ? null : (
            <Action
              testId="action-bed-add-planting"
              // green is the app's "this is the ordinary thing to do here", and a crop the
              // ranking excluded isn't that. The press still works
              tone={excludedBy === null ? 'primary' : 'ghost'}
              disabled={derived?.ok !== true}
              onClick={() => {
                if (derived?.ok !== true) return
                // out before in: `derivePlanting` measures the room left in the bed, so adding
                // first would be refused by the space the removal is about to free
                if (replacing !== null) removePlanting(bed.id, replacing.id)
                addPlanting(derived.value)
                setDraft(null)
                setReplaceId('')
                // the drop has been answered, so it stops standing in for a draft
                clearDropped()
              }}
            >
              {addLabel}
            </Action>
          )}
          <Toggle
            testId="control-bed-crop-all"
            label={`Show all ${ranked.length} crops`}
            checked={showAllCrops}
            onChange={setShowAllCrops}
          />
          {/*
            The same disclosure the ranking panel carries, on the list a grower actually picks
            from. `rank.ts` breaks a tie on crop id alphabetically so two runs agree, which is a
            determinism guarantee and reads on screen as a ranking: the top of an open bed's list
            came out arugula, basil, bean-bush, every one of them badged Recommended and every one
            of them carrying the same sentence. Saying they are level is the difference between
            picking first and picking what you want to eat
          */}
          {tiedLeadingCropCount(ranked) > 0 ? (
            <p className="panel-sub" data-testid="readout-bed-crops-tied">
              {cropTieNote(tiedLeadingCropCount(ranked))}
            </p>
          ) : null}
          {/* a listbox owns its options directly: a ul/li wrapper breaks the required
              parent-child relationship as well as tripping the interactive-role rule */}
          <div
            className="list picker"
            role="listbox"
            aria-label="Crops ranked for this bed"
            data-testid="list-bed-crops"
          >
            {options.map((item) => {
              const limiting = limitingFactorOf(item.outcome)
              const glyph = catalog.find((entry) => entry.id === item.cropId)
              return (
                <button
                  key={item.cropId}
                  type="button"
                  role="option"
                  className={`picker-option${chosen?.cropId === item.cropId ? ' picker-option-active' : ''}`}
                  data-testid={`item-bed-crop-${item.cropId}`}
                  data-crop={item.cropId}
                  data-verdict={item.outcome.verdict}
                  aria-selected={chosen?.cropId === item.cropId}
                  onClick={() => {
                    const crop = catalog.find((entry) => entry.id === item.cropId)
                    if (crop === undefined) return
                    clearDropped()
                    setDraft({
                      cropId: crop.id,
                      ...draftDefaults(bed, crop, calendars, occupancy.freeM2, maxCropsPerBed),
                    })
                    bringIntoView(status.current)
                  }}
                  /*
                   * Picking the crop up to carry it to a bed. The click above still works and
                   * still stages it against the bed already selected, so nothing here is the
                   * only way to do anything: this is the shorter road for somebody looking at
                   * the garden, and a pointer let go anywhere that is
                   * not a bed simply puts the crop down again
                   */
                  onPointerDown={() => carry(item.cropId)}
                >
                  <span className="picker-label">
                    {/* decorative, and the crop's own name is the next thing in the line: what
                        it buys is an eye running down 209 rows and stopping on the shape it
                        wants */}
                    {glyph === undefined ? null : (
                      <CropPicture cropId={glyph.id} dliClass={glyph.dliClass} />
                    )}
                    {cropName(catalog, item.cropId)}{' '}
                    <span
                      className={`badge badge-verdict-${item.outcome.verdict}`}
                      data-testid={`badge-bed-crop-${item.cropId}`}
                    >
                      {verdictLabel(item.outcome)}
                    </span>
                  </span>
                  <span className="picker-note">
                    {/* "nothing binding, weakest term is ..." is how the solver talks about
                        itself, and a beginner can't read it at all */}
                    {limiting === null
                      ? `Nothing rules it out. Weakest part of the match: ${weakestScoreTerm(item.outcome)}`
                      : `${item.outcome.verdict === 'excluded' ? 'Not suited: ' : 'Limited by: '}${explainLimitingFactor(limiting, experience, catalog, glyph, bed)}`}
                  </span>
                </button>
              )
            })}
          </div>
          {matched?.length === 0 ? (
            <p className="notice notice-idle" data-testid="status-bed-crop-search">
              No plant called {query} in this ranking
            </p>
          ) : null}
        </>
      )}
      {/* what the last combination wouldn't plant here, and why: a refusal belongs beside the
          bed it was about, and one that vanishes into another panel reads as a silent press.
          Folded because every perennial in a catalog this size prints one of these: a bed
          that rules out fourteen trees and shrubs would show fourteen lines of orange text
          before anyone reached the plant they came for */}
      {bedRefusals.length > 0 ? (
        <details className="wizard-advanced" data-testid="details-bed-refusals">
          <summary>
            {plural(bedRefusals.length, 'plant', 'plants')}{' '}
            {bedRefusals.length === 1 ? 'was' : 'were'} left out of this bed
          </summary>
          <ul className="list" data-testid="list-bed-refusals">
            {bedRefusals.map((refusal) => (
              <li
                key={refusal.cropId}
                className="rec-limiting"
                data-testid={`item-bed-refusal-${refusal.cropId}`}
                data-crop={refusal.cropId}
              >
                {cropName(catalog, refusal.cropId)} wasn't planted: {refusal.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  )
}

interface PlotSize {
  readonly widthM: number
  readonly depthM: number
}

/** The same floor the guided setup types against, in both units it offers */
const MIN_PLOT_M = 0.5
const MIN_PLOT_FT = 2

const PLOT_SIZE_HELP =
  'The plot resizes around its own middle, so your beds and panels stay where they are'

/**
 * How big the plot is, in numbers, which is how the guided setup asked for it.
 *
 * That question is the easiest one in the guided path, and without these fields the only way to
 * change a plot afterward is to draw the whole boundary again by hand on the 3D, freehand, at
 * whatever precision a mouse gives you.
 *
 * One pair of fields and a unit switch, where there were two pairs. Four fields for one rectangle
 * crowded the step on a phone, and the switch is saved with the design: every other length field
 * and summary in the sidebar reads and writes through the same stored unit, and the boundary in
 * the store is in meters whichever pair wrote it. The test ids follow the pair that is showing.
 *
 * A boundary that is not a rectangle isn't describable by two numbers, so it's never quietly
 * rebuilt from them. What is typed is held, what it would cost is said in words, and the shape is
 * replaced only when the grower asks for that in as many words
 */
const PlotSizeSection = ({ boundary }: { readonly boundary: Polygon2D }): ReactElement => {
  const setBoundary = useAppStore((s) => s.setBoundary)
  const unit = useLengthUnit()
  const setLengthUnit = useAppStore((s) => s.setLengthUnit)
  // a size typed against a shape that is no longer on screen is a stale answer to a question
  // nobody asked, so what is held is held against the boundary it was typed for and no other
  const [pending, setPending] = useState<{
    readonly of: Polygon2D
    readonly size: PlotSize
  } | null>(null)
  const held = pending !== null && pending.of === boundary ? pending.size : null
  const rectangle = useMemo(() => rectangleOf(boundary.exterior), [boundary])
  const extent = useMemo(() => extentOf([boundary.exterior]), [boundary])

  // the center of what is there now, so a resize spreads both ways, and never drags the
  // plot off its own ground by one edge
  const center = vec2((extent.minXM + extent.maxXM) / 2, (extent.minYM + extent.maxYM) / 2)
  const size: PlotSize = rectangle ??
    held ?? { widthM: extent.maxXM - extent.minXM, depthM: extent.maxYM - extent.minYM }

  const write = (next: PlotSize): void => {
    setBoundary(polygonOf(rectangleRing(center, next.widthM, next.depthM)))
    setPending(null)
  }
  const resize = (next: PlotSize): void => {
    if (rectangle === null) setPending({ of: boundary, size: next })
    else write(next)
  }
  const typed = (value: number): number => Math.max(MIN_PLOT_M, toMeters(value, unit))

  return (
    <>
      <h3>How big</h3>
      {/* native radios under two halves of one switch, so the arrow keys and the group
          semantics are the browser's: the same reason `ChoiceGroup` is radios drawn as cards */}
      <fieldset className="segmented" data-testid="control-plot-units" data-unit={unit}>
        <legend className="visually-hidden">Measured in</legend>
        {(['m', 'ft'] as const).map((option) => (
          <label key={option} data-checked={unit === option}>
            <input
              type="radio"
              name="plot-units"
              value={option}
              checked={unit === option}
              data-testid={`control-plot-units-${option}`}
              onChange={() => setLengthUnit(option)}
            />
            {option}
          </label>
        ))}
      </fieldset>
      <div className="row">
        <NumberField
          testId={`control-plot-width-${unit}`}
          label="Across the front"
          unit={unit}
          min={unit === 'm' ? MIN_PLOT_M : MIN_PLOT_FT}
          step={lengthStep(unit, 0.1)}
          value={showLength(size.widthM, unit, roundTenth)}
          onChange={(value) => resize({ ...size, widthM: typed(value) })}
        />
        <NumberField
          testId={`control-plot-depth-${unit}`}
          label="Front to back"
          unit={unit}
          min={unit === 'm' ? MIN_PLOT_M : MIN_PLOT_FT}
          step={lengthStep(unit, 0.1)}
          value={showLength(size.depthM, unit, roundTenth)}
          onChange={(value) => resize({ ...size, depthM: typed(value) })}
        />
      </div>
      {/* one line, proportional: the mono two-column readout would break "(517 sq / ft)" across
          lines at phone width */}
      <p className="panel-sub readout-line" data-testid="readout-plot-area">
        {formatAreaBothUnits(polygonAreaM2(boundary))}
      </p>
      <p className="panel-sub" data-testid="readout-plot-size-help">
        {PLOT_SIZE_HELP}
      </p>
      {rectangle === null ? (
        <>
          <p className="notice notice-warn" data-testid="status-plot-shape" data-shape="drawn">
            This boundary isn't a plain rectangle, so a width and a depth can't describe it. The two
            figures start at the widest and the deepest points of the shape that's there. Press the
            button below to replace that shape with a rectangle of the size you typed, over the same
            middle. Your beds and panels stay where they are
          </p>
          <Action testId="action-plot-rectangle" onClick={() => write(size)}>
            Replace the shape with this rectangle
          </Action>
        </>
      ) : null}
    </>
  )
}

/**
 * What is on the ground, which is a growing decision and an electrical one at once.
 *
 * It sits with the plot's own size question, because it describes the
 * whole plot, but the sentence beneath it names the electrical half on purpose: the reason this
 * question exists at all is that the ground's brightness is a term in the rear-side irradiance
 * of a bifacial panel, and it's a large one. Between the darkest and the brightest option here
 * the modeled annual generation of the shipped default array moves by about a tenth.
 *
 * The trade is stated in the same breath because it cuts both ways: the bright covers that feed
 * the panel backs are the ones that reflect the day's heat away from the soil, which is the
 * opposite of what a grower chasing an early bed wants
 */
const GroundCoverSection = (): ReactElement => {
  const cover = useAppStore((s) => s.plot?.groundCover ?? DEFAULT_GROUND_COVER)
  const setGroundCover = useAppStore((s) => s.setGroundCover)
  const chosen = GROUND_COVER_OPTIONS.find((option) => option.id === cover)

  return (
    <>
      <SelectField
        testId="control-plot-ground-cover"
        label="Under and between the panels"
        value={cover}
        options={GROUND_COVER_OPTIONS.map((option) => [option.id, option.label] as const)}
        onChange={setGroundCover}
      />
      <p className="panel-sub" data-testid="readout-plot-ground-cover-help">
        {chosen?.help}
      </p>
      <InfoTip label="why the ground matters to the panels" testId="info-plot-ground-cover">
        Panels with cells on both faces pick up whatever the ground reflects. A bright surface
        underneath is worth real generation (via albedo), a dark one is worth little. Across the
        choices above, the modeled year moves by about a tenth. The soil works the other way. A
        bright cover sends the day's warmth back at the sky, so the bed under it runs cooler and
        starts later. A dark cover holds that warmth. No option here is best at both, so the choice
        is yours.
      </InfoTip>
    </>
  )
}

/**
 * What the bed's sky view factor means for frost, in words.
 *
 * The number above it is geometry the bake has always had. This is the one consequence of it that
 * a grower can act on, and why it takes the form of prose is set out at length in
 * `src/recommend/frost.ts`. The short version: the mechanism is textbook and nobody has published
 * a magnitude for a garden under panels, so the honest output is a direction and a caveat
 */
const FrostShelterNote = ({ light }: { readonly light: BedLight }): ReactElement => {
  const reading = frostReading(light)
  return (
    <p
      className="readout-note"
      data-testid="readout-bed-frost-shelter"
      data-shelter={reading.shelter}
    >
      {reading.claim.value}.
      {reading.shelter === 'open' ? null : (
        <>
          {' '}
          <TierBadge tier={reading.claim.tier} testId="badge-bed-frost-shelter" />{' '}
          <span data-testid="readout-bed-frost-caveat">{reading.claim.caveat}</span>
        </>
      )}
    </p>
  )
}

/** The bed summary row: "3 beds, 8.4 m² each", or the mean when the beds differ in size */
const bedsSummary = (beds: readonly Bed[]): string => {
  const count = `${String(beds.length)} ${beds.length === 1 ? 'bed' : 'beds'}`
  if (beds.length === 0) return count
  const areas = beds.map((bed) => bed.areaM2)
  const mean = areas.reduce((total, area) => total + area, 0) / areas.length
  const alike = areas.every((area) => Math.abs(area - mean) < 0.05)
  return `${count}, ${mean.toFixed(1)} m² ${alike || beds.length === 1 ? 'each' : 'on average'}`
}

/**
 * The second step, as one panel: how big the space is, what already shades it, whether it can
 * be watered, and the beds behind a fold.
 *
 * The face carries the four questions a beginner can answer standing in the space. Everything that
 * edits a bed is one press away and keeps its ids, because the drawing and planting specs drive it
 */
export const GroundPanel = (): ReactElement => {
  const plot = useAppStore((s) => s.plot)
  const unit = useLengthUnit()
  // the selection, falling back to the only bed there is: `selectedBedOf` is the store's own
  // definition of "this bed", so Ground and Planting agree with each other and with every other
  // panel that reads it, even though each reads the store for itself
  const bed = useAppStore(selectedBedOf)
  const bedLight = useAppStore((s) => s.bedLight)
  const plantYear = useAppStore((s) => s.plantYear)
  const mode = useAppStore((s) => s.mode)
  const draftLength = useAppStore((s) => s.draft.length)
  const catalog = useAppStore((s) => s.catalog)
  const selectBed = useAppStore((s) => s.selectBed)
  const upsertBed = useAppStore((s) => s.upsertBed)
  const removeBed = useAppStore((s) => s.removeBed)
  const setMode = useAppStore((s) => s.setMode)
  const setSurface = useAppStore((s) => s.setSurface)
  const commitDraft = useAppStore((s) => s.commitDraft)
  const cancelDraft = useAppStore((s) => s.cancelDraft)
  const undoDraftVertex = useAppStore((s) => s.undoDraftVertex)
  const setPlantYear = useAppStore((s) => s.setPlantYear)
  const hoveredTarget = useAppStore((s) => s.hovered)
  const rainPlot = useAppStore(scenePlot)
  const weather = useAppStore((s) => (s.weather.status === 'ready' ? s.weather.value : null))
  const site = useAppStore((s) => (s.site.status === 'ready' ? s.site.value : null))

  const light = useMemo(
    () => bedLight.find((entry) => entry.bedId === bed?.id) ?? null,
    [bedLight, bed],
  )
  const bedRain = useMemo(() => {
    const field = rainFieldOf(rainPlot, weather)
    return field?.beds.find((entry) => entry.bedId === bed?.id) ?? null
  }, [rainPlot, weather, bed])

  const bedIsHovered =
    bed !== null && hoveredTarget !== null && hoveredTarget.kind !== 'array'
      ? hoveredTarget.bedId === bed.id
      : false

  /**
   * Drawing happens on the ground, so entering a drawing mode shows the garden. On a phone the two
   * surfaces take turns, and otherwise "Draw bed" pressed on the plan would pop the corner hint
   * over the form fields. Above the breakpoint the surface attribute changes nothing the sidebar
   * reads, so the same call is safe at every width and there's no second definition of "narrow"
   * here
   */
  const draw = (target: 'draw-bed' | 'draw-plot'): void => {
    if (mode === target) {
      setMode('select')
      return
    }
    setMode(target)
    setSurface('garden')
  }

  return (
    <Panel
      id="ground"
      // the panel edits ONE bed, so it only lights up for the bed it is actually showing:
      // highlighting it for a bed it is not displaying would point at the wrong numbers
      className={bedIsHovered ? 'panel-hovered' : undefined}
      title="How big is the space, and what shades it?"
      titleVisible={false}
    >
      {/* the plot outlives every bed in it, so its own size isn't filed under the selected
          bed and doesn't disappear with the last one */}
      {plot === null ? null : <PlotSizeSection boundary={plot.boundary} />}
      <h3>What shades it</h3>
      <SurroundingsStep />
      <ObstructionsSection />
      <h3>Water</h3>
      <WaterStep />
      <h3>The beds</h3>
      <p className="panel-sub readout-line" data-testid="readout-ground-beds">
        {bedsSummary(plot?.beds ?? [])}
      </p>
      <details className="wizard-advanced" data-testid="details-ground-beds">
        <summary data-testid="action-ground-beds">Change the beds</summary>
        {plot === null ? null : <GroundCoverSection />}
        <div className="row">
          {/*
            A bed without drawing one, in the row the defaults lay out, because drawing one isn't
            something everybody can do. A corner is placed by a press on the ground and by nothing
            else: see `Ground.tsx`, where `pushDraftVertex` has exactly one call site, inside
            `onPointerDown`. So without this press a keyboard, a switch or a voice control could
            add a bed only through the conversational agent's `add-bed`, which ships switched off.

            It makes the same bed by the same call, so there's one answer to where an undrawn
            bed goes. Shaping it afterward still wants a pointer, which is the part of this that
            is still open
          */}
          <Action
            testId="action-bed-add"
            disabled={plot === null}
            onClick={() => {
              if (plot === null) return
              const bed = makeBed(nextBedIndex(plot.beds), { soil: soilForSite(site) })
              upsertBed(bed)
              selectBed(bed.id)
            }}
          >
            Add bed
          </Action>
          <Action
            testId="action-bed-draw"
            tone={mode === 'draw-bed' ? 'primary' : 'ghost'}
            onClick={() => draw('draw-bed')}
          >
            {mode === 'draw-bed' ? 'Drawing' : 'Draw bed'}
          </Action>
        </div>
        <div className="row">
          <Action
            testId="action-bed-draw-plot"
            tone={mode === 'draw-plot' ? 'primary' : 'ghost'}
            onClick={() => draw('draw-plot')}
          >
            Draw the plot outline
          </Action>
          <Action
            testId="action-bed-undo-vertex"
            disabled={draftLength === 0}
            onClick={undoDraftVertex}
          >
            Undo the last corner
          </Action>
          <Action
            testId="action-bed-close-polygon"
            disabled={draftLength < 3}
            onClick={commitDraft}
            tone="primary"
          >
            Close the shape
          </Action>
          <Action
            testId="action-bed-cancel-draw"
            disabled={draftLength === 0}
            onClick={cancelDraft}
          >
            Cancel
          </Action>
        </div>
        {!bed ? (
          <p className="notice notice-idle" data-testid="status-bed">
            No beds yet
          </p>
        ) : (
          <>
            <BedStrip />
            <SelectField
              testId="control-bed-select"
              label="Bed"
              value={bed.id}
              options={(plot?.beds ?? []).map((b) => [b.id, b.label] as const)}
              onChange={(value) => selectBed(value as typeof bed.id)}
            />
            <BedSizeFields bed={bed} />
            <div className="row">
              <NumberField
                testId="control-bed-raised-height"
                label="How high the bed stands"
                unit={unit}
                min={0}
                step={lengthStep(unit, 0.05)}
                value={showLength(bed.raisedHeightM, unit, (value) => value)}
                onChange={(value) =>
                  upsertBed({ ...bed, raisedHeightM: meters(Math.max(0, toMeters(value, unit))) })
                }
              />
              <NumberField
                testId="control-bed-soil-ph"
                label="Soil pH"
                min={3}
                max={10}
                step={0.1}
                value={bed.soil.phUnits}
                onChange={(value) =>
                  // typed by hand, so a later site lookup leaves it alone: see `resolveSite`
                  upsertBed({ ...bed, soil: { ...bed.soil, phUnits: value, sourceId: 'user' } })
                }
              />
            </div>
            {/* hidden only for a value the gardener typed. An assumed default says it is one */}
            {bed.soil.sourceId === 'user' ? null : (
              <p className="readout-note" data-testid="readout-bed-ph-source">
                {bed.soil.sourceId === 'default'
                  ? `Assumed pH ${String(bed.soil.phUnits)} ${bed.soil.textureClass.replace('-', ' ')}: the soil map has no answer for this place yet. Change it if you know your soil.`
                  : "From the soil map for this place, change it if you've tested your soil"}
              </p>
            )}
            <InfoTip label="soil pH" testId="info-bed-soil-ph">
              Most vegetables want soil between pH 6.0 and 7.0. Below 5.5 or above 7.5, nutrients
              get harder for roots to take up. Growth suffers even when everything else about the
              bed is right.
            </InfoTip>
            <SelectField
              testId="control-bed-irrigation"
              label="Irrigation"
              value={bed.irrigation.method}
              options={IRRIGATION}
              onChange={(method) =>
                upsertBed({ ...bed, irrigation: { ...bed.irrigation, method } })
              }
            />
            <Toggle
              testId="control-bed-drip-basin"
              label="A basin or swale along the drip line"
              checked={bed.waterHarvesting.length > 0}
              onChange={(checked) =>
                upsertBed({
                  ...bed,
                  waterHarvesting: checked
                    ? [{ scale: 'micro-basin', footprint: bed.footprint }]
                    : [],
                })
              }
            />
            <p className="readout-note" data-testid="readout-bed-drip">
              {bedRain !== null && bedRain.crossings[0] !== undefined
                ? `Row ${bedRain.crossings[0].rowIndex + 1} of ${bedRain.crossings[0].rowCount} sheds onto this bed's ${bedRain.crossings[0].side} edge: the rain that runs off its panels lands in a strip of ground there`
                : 'No panel sheds its rain onto this bed'}
            </p>
            <SliderField
              testId="control-bed-plant-year"
              label="Show the garden at"
              min={1}
              max={MAX_PLANT_YEAR}
              step={1}
              value={plantYear}
              display={`year ${plantYear}`}
              onChange={setPlantYear}
            />
            <div className="readouts">
              <Readout id="bed-area" label="Area" value={`${bed.areaM2.toFixed(1)} m²`} />
              <Readout id="bed-plantings" label="Plantings" value={bed.plantings.length} />
              <Readout
                id="bed-space"
                label="Space still free"
                value={`${bedOccupancy(bed, catalog.status === 'ready' ? catalog.value : EMPTY_LIST).freeM2.toFixed(1)} m² of ${bed.areaM2.toFixed(1)}`}
              />
              <Readout
                id="bed-annual-dli"
                label="Daily light integral (DLI), year-round average"
                value={light ? formatDli(light.annualMeanDliMolM2Day) : 'run the simulation'}
              />
              <Readout
                id="bed-homogeneity"
                label="How even the light is across the bed"
                value={
                  light
                    ? `min/mean ${light.homogeneity.minOverMean.toFixed(2)}`
                    : 'run the simulation'
                }
              />
              <Readout
                id="bed-sky-view"
                label="Sky view factor: how much of the sky this bed can see"
                value={
                  light
                    ? `${Math.round(light.skyViewFactor * 100).toString()}%`
                    : 'run the simulation'
                }
              />
            </div>
            {light === null ? null : <FrostShelterNote light={light} />}
            {light ? (
              <>
                {/*
                  The two figures on every row of the table below are the whole light story for this
                  bed, and without a definition "1% shade (RSR)" reads as a typo. Both are
                  definitions of a term, so they sit behind an InfoTip on the column heading itself,
                  one tap from the twelve rows of figures it explains
                */}
                <div className="row">
                  <span className="field-label">
                    DLI
                    <InfoTip label="daily light integral, DLI" testId="info-bed-month-dli">
                      Daily light integral: all the usable light landing on this bed on an average
                      day that month, in mol/m²/d. The bigger the number, the more light a plant
                      here has to work with.
                    </InfoTip>
                  </span>
                  <span className="field-label">
                    RSR
                    <InfoTip label="relative shade ratio, RSR" testId="info-bed-month-rsr">
                      Relative shade ratio: the share of full-sun light the panels block. 30% shade
                      means about seven tenths of the open-sky light still reaches the soil.
                    </InfoTip>
                  </span>
                </div>
                <ul className="list" data-testid="list-bed-months">
                  {MONTH_LABELS.map((label, index) => (
                    <li key={label} data-testid={`item-bed-month-${index + 1}`}>
                      {label}: {formatDli(light.monthlyMeanDliMolM2Day[index] ?? (0 as never))},{' '}
                      {formatRsr(light.monthlyRsr[index] ?? (0 as never))}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <Action testId="action-bed-remove" onClick={() => removeBed(bed.id)}>
              Remove bed
            </Action>
          </>
        )}
      </details>
    </Panel>
  )
}

/**
 * The selected bed's plantings and the picker for it, read off the store. The plants step mounts
 * this inside its "Pick plants one at a time" fold. `PlantingPanel` below wraps it in a panel of
 * its own for the tests that still mount the bed panel whole
 */
export const SelectedBedPlanting = (): ReactElement => {
  const plot = useAppStore((s) => s.plot)
  // same selection rule the ground panel reads: see the comment there
  const bed = useAppStore(selectedBedOf)
  const catalog = useAppStore((s) => s.catalog)
  const sets = useAppStore((s) => s.sets)
  const calendars = useAppStore((s) => s.calendars)

  const ranked = useMemo(
    () =>
      sets.status === 'ready'
        ? (sets.value.find((set) => set.bedId === bed?.id)?.ranked ?? EMPTY_LIST)
        : EMPTY_LIST,
    [sets, bed],
  )

  return !bed ? (
    <p className="notice notice-idle" data-testid="status-bed">
      No beds yet
    </p>
  ) : (
    <PlantingSection
      bed={bed}
      catalog={catalog.status === 'ready' ? catalog.value : EMPTY_LIST}
      arrays={plot?.arrays ?? EMPTY_LIST}
      calendars={calendars.status === 'ready' ? calendars.value : EMPTY_LIST}
      ranked={ranked}
      rankingReady={
        sets.status === 'ready' && calendars.status === 'ready' && catalog.status === 'ready'
      }
    />
  )
}

export const PlantingPanel = (): ReactElement => {
  const bed = useAppStore(selectedBedOf)
  const hoveredTarget = useAppStore((s) => s.hovered)
  const bedIsHovered =
    bed !== null && hoveredTarget !== null && hoveredTarget.kind !== 'array'
      ? hoveredTarget.bedId === bed.id
      : false

  return (
    <Panel
      id="planting"
      // same highlight rule as the ground panel: this panel is about one bed's plantings, so it
      // only lights up for the bed it is actually showing
      className={bedIsHovered ? 'panel-hovered' : undefined}
      title="What to plant"
      subtitle="Crops ranked for the bed you've selected. Pick one to place it"
    >
      <SelectedBedPlanting />
    </Panel>
  )
}

// both panels in one, for the tests that mount the bed panel whole
export const BedPanel = (): ReactElement => (
  <>
    <GroundPanel />
    <PlantingPanel />
  </>
)
