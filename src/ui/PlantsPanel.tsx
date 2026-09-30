import { useEffect, useRef, useState, type ReactElement } from 'react'
import { ARCHETYPE_LABEL } from '../recommend/design'
import { soilWaterStage } from '../recommend/stages/soil-water'
import { AMBITION_CLASSES } from '../recommend/suggest'
import { FINAL_OPTIONS } from '../sim/pipeline'
import { bedLightSummary } from '../state/bed-light'
import { growingWindowOf } from '../state/growing-window'
import { EMPTY_LIST, type AppState } from '../state/slices'
import { selectedBedOf, useAppStore } from '../state/store'
import type { Crop, DliClass } from '../types/crop'
import type { Bed } from '../types/garden'
import type { BedId, CropId } from '../types/ids'
import type { GrowingWindow } from '../types/light'
import type { PolycultureSuggestion, PreferenceKind } from '../types/polyculture'
import type { Site } from '../types/site'
import { prefersReducedMotion } from '../state/motion'
import { SelectedBedPlanting } from './BedPanel'
import { Action, Toggle } from './controls'
import { approxCount, bedName, cropName } from './format'
import { GardenPlanPanel } from './GardenPlanPanel'
import { Panel } from './Panel'
import { CHOICES_EFFECT_TOP_N, choicesEffectSentence } from './plants-effect'
import { CONFIDENCE_LABEL, joinWords, PREFERENCE_KINDS } from './polyculture'
import { Combinations, MoreChoices } from './PolyculturePanel'
import { RankingSection } from './RecommendationPanel'
import { regionNote } from './region'
import { firstUnmet, rankingChain, rankingRequirement, requirementKey } from './requirement'
import { RequirementNotice } from './RequirementNotice'
import { autoRunReady } from './useAutoRecommend'

/**
 * What goes in each bed: the step most visitors arrive at with every bed already planted by
 * "Use this layout and plant it", so it is built for that arrival. First what each bed holds and
 * the two presses that change it, then the chips that say what you like to eat, then the
 * combinations computed for the selected bed, and the rest behind folds: picking one plant at
 * a time, the whole ranking with its reasons, and what the layout search decided
 */

/**
 * The chips in the groups a gardener already thinks in. Every food class in the catalogue lands
 * in exactly one group, and a class this table does not name (there is none today) would land
 * in the last
 */
const LIKE_GROUPS: readonly {
  readonly id: string
  readonly label: string
  readonly classes: readonly DliClass[]
}[] = [
  {
    id: 'fruiting',
    label: 'Fruiting vegetables and berries',
    classes: ['solanaceae', 'cucurbits', 'strawberry', 'cane-bush-berries'],
  },
  { id: 'leaves', label: 'Leaves and herbs', classes: ['leafy-greens', 'understory-herbs'] },
  {
    id: 'roots',
    label: 'Roots, onions and cabbages',
    classes: ['root-tuber', 'alliums', 'brassicas'],
  },
  {
    id: 'beans',
    label: 'Beans, grains and the rest',
    classes: ['grain-legumes', 'c3-cereals', 'maize-c4', 'forages-c3-pasture'],
  },
]

const sameSet = (left: readonly CropId[], right: readonly CropId[]): boolean => {
  const wanted = new Set<string>(left)
  return wanted.size === new Set<string>(right).size && right.every((id) => wanted.has(id))
}

const cropIdsOf = (bed: Bed): readonly CropId[] => bed.plantings.map((planting) => planting.cropId)

/**
 * The zone word on a card, read off the bed's own growing-season shade at the thresholds the layout
 * search itself places beds by (under 15% is a gap between rows, over 40% is under one), the same
 * rounded percent and thresholds the light step prints
 */
const shadeWord = (openSkyPercent: number): string =>
  openSkyPercent >= 85 ? 'sunny' : openSkyPercent >= 60 ? 'part shade' : 'shady'

const zoneWordOf = (
  bedLight: AppState['bedLight'],
  bed: Bed,
  window: GrowingWindow,
): string | null => {
  const light = bedLight.find((entry) => entry.bedId === bed.id)
  if (light === undefined) return null
  const lost = Math.round(bedLightSummary(light, window).shadeRatio * 100)
  return shadeWord(100 - lost)
}

/* ------------------------------- replanting after a chip ------------------------------- */

/** The likes, flattened: a chip or a wildlife switch changing is a change to this string */
const likesKeyOf = (s: AppState): string =>
  [
    s.preferences.entries.map((entry) => `${entry.cropId as string}:${entry.kind}`).join(','),
    s.wildlife.favourNative,
    s.wildlife.favourPollinators,
  ].join('|')

/** Each bed's crops as one comparable string, so two plantings of a bed can be told apart */
const cropSetsOf = (s: AppState): ReadonlyMap<BedId, string> =>
  new Map(
    (s.plot?.beds ?? EMPTY_LIST).map((bed) => [
      bed.id,
      [...cropIdsOf(bed)].sort((a, b) => a.localeCompare(b)).join('+'),
    ]),
  )

/** True while every bed still holds exactly what the last run put in it */
const engineHoldsEveryBed = (s: AppState): boolean =>
  s.generated !== null &&
  (s.plot?.beds ?? EMPTY_LIST).every((bed) =>
    sameSet(
      cropIdsOf(bed),
      s.generated?.beds.find((entry) => entry.bedId === bed.id)?.cropIds ?? [],
    ),
  )

const anythingPlanted = (s: AppState): boolean =>
  (s.plot?.beds ?? EMPTY_LIST).some((bed) => bed.plantings.length > 0)

type ReplantStatus =
  | { readonly kind: 'updating' }
  | { readonly kind: 'changed'; readonly count: number }
  | { readonly kind: 'by-hand' }

/**
 * Replants every bed when a like changes and the beds are still the engine's.
 *
 * A chip press re-ranks (the auto-run key reads the same entries), and the combinations follow the
 * ranking, but left alone the beds themselves would sit there holding the old mix: a grower who
 * said "prefer cucumber" would watch the cards move and the garden stay put. So when every bed
 * still holds what the last run planted, the change is carried through to the beds by the same
 * press a grower would have made, once the ranking the change started has landed; a bed changed by
 * hand is left alone, and the fill press is offered instead.
 *
 * A store subscription here, because the answer depends on the
 * transition (what the beds held BEFORE the change) and on a later one (the ranking landing),
 * and both are read off consecutive states. Nothing here sets state during a render
 */
const useReplantOnLikes = (): readonly [ReplantStatus | null, () => void] => {
  const [status, setStatus] = useState<ReplantStatus | null>(null)
  const plantEveryBed = useAppStore((s) => s.plantEveryBed)

  useEffect(() => {
    let waiting = false
    let before: ReadonlyMap<BedId, string> = new Map()
    const replant = (): void => {
      waiting = false
      const snapshot = before
      void plantEveryBed().then(() => {
        const after = cropSetsOf(useAppStore.getState())
        let count = 0
        for (const [bedId, crops] of after) if (snapshot.get(bedId) !== crops) count += 1
        setStatus({ kind: 'changed', count })
      })
    }
    const unsubscribe = useAppStore.subscribe((state, previous) => {
      if (likesKeyOf(state) !== likesKeyOf(previous)) {
        // nothing to carry a change through to until something has been planted
        if (!anythingPlanted(state)) return
        if (!engineHoldsEveryBed(state)) {
          waiting = false
          setStatus({ kind: 'by-hand' })
          return
        }
        waiting = true
        before = cropSetsOf(state)
        setStatus({ kind: 'updating' })
        // the automatic ranking will run on this change; wait for it to land. Off, or held by a
        // light run, nothing else is coming, and the planting ranks for itself
        if (!(state.autoRun && autoRunReady(state))) replant()
        return
      }
      if (waiting && previous.ranking && !state.ranking) replant()
    })
    return unsubscribe
  }, [plantEveryBed])

  return [status, () => setStatus(null)]
}

/* ------------------------------------ the soil pH notice ---------------------------------- */

/** A typed value is the grower's own word and the assumed loam already says it's a guess, so only
 * these two source ids are an actual reading off the soil map */
const MAP_SOIL_SOURCES: ReadonlySet<Bed['soil']['sourceId']> = new Set(['soilgrids', 'ssurgo'])

/** A map pH earns a notice once it rules out at least this share of what the climate allows */
const SOIL_PH_NOTICE_SHARE = 0.25

interface SoilPhImpact {
  readonly phUnits: number
  readonly excludedCount: number
  readonly allowedCount: number
  /** How many beds this reading applies to, for "bed is / its" against "beds are / their" */
  readonly mapBedCount: number
}

/**
 * Whether the engine's own soil stage refuses this crop on pH, computed fresh against the bed.
 * The ranked outcome can't say: a crop the light gate has already dropped from a bed never
 * reaches this stage in the real ranking, and would go uncounted there
 */
const failsOnSoilPh = (crop: Crop, bed: Bed, site: Site): boolean => {
  const outcome = soilWaterStage(crop, bed, site)
  return !outcome.passed && outcome.limiting?.cause.kind === 'soil-ph'
}

/**
 * What the map-read beds rule out of what the climate allows, or null when there is no map-read
 * bed, no ranking or catalogue yet, or the reading stays under the share above.
 *
 * `resolveSite` stamps one map answer on every bed that has not been typed over, so the map-read
 * beds share one pH, and this counts crops for one of them: the figure is the same for every bed
 * that reading applies to, because `failsOnSoilPh` reads only the crop and the bed's own pH
 */
const soilPhImpactOf = (
  beds: readonly Bed[],
  sets: AppState['sets'],
  catalog: readonly Crop[],
  site: Site | null,
): SoilPhImpact | null => {
  const mapBeds = beds.filter((bed) => MAP_SOIL_SOURCES.has(bed.soil.sourceId))
  const bed = mapBeds[0]
  if (bed === undefined || site === null || sets.status !== 'ready') return null
  const ranked = sets.value.find((set) => set.bedId === bed.id)?.ranked ?? EMPTY_LIST
  // the climate gate reads the site, never the bed, so this denominator is the same everywhere
  // in the plot
  const allowed = ranked.filter(
    (item) =>
      !(item.outcome.verdict === 'excluded' && item.outcome.limiting.stage === 'climate-gate'),
  )
  const excludedCount = allowed.filter((item) => {
    const crop = catalog.find((entry) => entry.id === item.cropId)
    return crop !== undefined && failsOnSoilPh(crop, bed, site)
  }).length
  if (allowed.length === 0 || excludedCount / allowed.length < SOIL_PH_NOTICE_SHARE) return null
  return {
    phUnits: bed.soil.phUnits,
    excludedCount,
    allowedCount: allowed.length,
    mapBedCount: mapBeds.length,
  }
}

/** One line for the step: the map-read beds' own pH, what it rules out of what the climate
 * allows, and where to change it */
const soilPhNoticeText = (impact: SoilPhImpact | null): string | null => {
  if (impact === null) return null
  const single = impact.mapBedCount === 1
  return `pH ${impact.phUnits.toFixed(1)} from the soil map rules out ${String(impact.excludedCount)} of the ${String(impact.allowedCount)} plants that suit this climate. If your ${single ? 'bed is' : 'beds are'} filled with bought soil, set ${single ? 'its' : 'their'} pH under Change the beds on the ground step.`
}

/** The one notice for the step, never one per bed card: see `soilPhNoticeText` */
const SoilPhNotice = (): ReactElement | null => {
  const beds = useAppStore((s) => s.plot?.beds ?? EMPTY_LIST)
  const sets = useAppStore((s) => s.sets)
  const catalog = useAppStore((s) => (s.catalog.status === 'ready' ? s.catalog.value : EMPTY_LIST))
  const site = useAppStore((s) => (s.site.status === 'ready' ? s.site.value : null))
  const text = soilPhNoticeText(soilPhImpactOf(beds, sets, catalog, site))
  return text === null ? null : (
    <p className="notice notice-warn" data-testid="status-plants-soil-ph">
      {text}
    </p>
  )
}

/* ---------------------------------------- the face --------------------------------------- */

const StatusLine = (): ReactElement => {
  const generated = useAppStore((s) => s.generated)
  const planted = useAppStore(anythingPlanted)
  const rasterStatus = useAppStore((s) => s.raster.status)
  // bedLightSubdivision carries what bedLight is actually baked at: a guided apply sets bedLight
  // straight from the search's own bake, always at FINAL_OPTIONS quality, without touching the
  // raster at all, and a cancelled re-bake leaves the raster idle with the last reading still
  // standing. The shipped example is the one case this actually catches, since its rasters are
  // baked coarser
  const fullCheck = useAppStore((s) => s.bedLightSubdivision === FINAL_OPTIONS.subdivision)
  const hasLight = useAppStore((s) => s.bedLight.length > 0)
  const planting = useAppStore((s) => s.planting)
  const origin = planting
    ? 'Planting your beds...'
    : !planted
      ? 'Nothing planted yet'
      : generated === null
        ? 'Planted by hand'
        : generated.archetype === null
          ? 'Planted bed by bed'
          : `Planted for you from the ${ARCHETYPE_LABEL[generated.archetype]} layout`
  const light =
    rasterStatus === 'loading'
      ? 'being computed...'
      : fullCheck
        ? 'full check done'
        : hasLight
          ? 'rough estimate'
          : 'not computed yet'
  return (
    <p
      className={`notice notice-${rasterStatus === 'loading' || planting ? 'loading' : 'idle'}`}
      data-testid="readout-plants-status"
      data-light={light}
    >
      {origin}. Light: {light}
    </p>
  )
}

const changedLine = (count: number): string =>
  count === 0 ? 'No bed changed' : count === 1 ? '1 bed changed' : `${String(count)} beds changed`

const BedCard = ({
  bed,
  catalog,
  zone,
  live,
  carried,
  selected,
  hovered,
  updating,
  onSelect,
  onEdit,
}: {
  readonly bed: Bed
  readonly catalog: readonly Crop[]
  readonly zone: string | null
  /** The combinations computed for this bed now, when it is the selected one */
  readonly live: readonly PolycultureSuggestion[]
  /**
   * The combinations the last run chose from for this bed, the first of which it planted
   */
  readonly carried: readonly PolycultureSuggestion[]
  readonly selected: boolean
  readonly hovered: boolean
  readonly updating: boolean
  onSelect(): void
  onEdit(): void
}): ReactElement => {
  const applySuggestion = useAppStore((s) => s.applySuggestion)
  const [mix, setMix] = useState<string | null>(null)
  const cropIds = cropIdsOf(bed)
  const names = cropIds.map((id) => cropName(catalog, id))
  // "24 tomato · 9 hops", so a count reads beside the crop it counts: a bare "24, 9, 42 and 4
  // plants" under four names would ask the reader to line the two lists up by eye
  const counts = bed.plantings.map(
    (planting) => `${approxCount(planting.plantCount)} ${cropName(catalog, planting.cropId)}`,
  )
  // the combination the bed holds, if it holds one of its own: matched as a set of crops, since
  // a bed planted by hand can hold the same crops as a card in a different order
  const held =
    [...live, ...carried].find((suggestion) => sameSet(suggestion.cropIds, cropIds)) ?? null
  const fitting = (live.length > 0 ? live : carried).filter((suggestion) => suggestion.fits)
  const heldAt =
    held === null ? -1 : fitting.findIndex((entry) => sameSet(entry.cropIds, held.cropIds))
  const tryNext = (): void => {
    const at = (heldAt + 1) % fitting.length
    const next = fitting[at]
    if (next === undefined) return
    applySuggestion(next)
    const refused = useAppStore
      .getState()
      .planRefusals.filter((refusal) => refusal.bedId === bed.id)
    const named = joinWords(next.cropIds.map((id) => cropName(catalog, id)))
    const notPlanted =
      refused.length === 0
        ? ''
        : `. Not planted: ${refused
            .map((refusal) => `${cropName(catalog, refusal.cropId)} (${refusal.reason})`)
            .join('; ')}`
    setMix(`Mix ${String(at + 1)} of ${String(fitting.length)}: ${named}${notPlanted}`)
  }

  return (
    <li
      className={`plants-bed${hovered ? ' panel-hovered' : ''}`}
      data-testid={`item-plants-bed-${bed.id}`}
      data-bed={bed.id}
      data-selected={selected}
      data-updating={updating}
    >
      {/* the one control that selects the bed; its hit area is stretched over the whole card in
          CSS, so pressing anywhere on the card that is not another press selects it */}
      <button
        type="button"
        className="plants-bed-head"
        data-testid={`action-plants-select-${bed.id}`}
        aria-pressed={selected}
        onClick={onSelect}
      >
        {[bed.label, zone, `${bed.areaM2.toFixed(1)} m²`]
          .filter((part) => part !== null)
          .join(' · ')}
      </button>
      <p className="plants-bed-mix" data-testid={`readout-plants-mix-${bed.id}`}>
        {names.length === 0 ? 'Nothing in it yet' : joinWords(names)}
      </p>
      {/*
        The counts, the confidence and the two presses belong to the bed being looked at. Twelve
        beds each carrying all of it would be twenty-four buttons and a screen and a half of cards
        on a phone, so a bed that is not selected is one row of what it holds, and a press on it
        opens the rest. The row itself is a list item with every id the tests read
      */}
      {selected ? (
        <>
          {counts.length === 0 ? null : (
            <p className="readout-note" data-testid={`readout-plants-counts-${bed.id}`}>
              {counts.join(' · ')}
            </p>
          )}
          {/* only the case the headline does not already make: a mix the engine computed
              repeats the names and counts above it, and a line that says the same thing twice is
              noise */}
          {names.length === 0 || held !== null ? null : (
            <p className="plants-bed-why" data-testid={`readout-plants-why-${bed.id}`}>
              Chosen by hand
            </p>
          )}
          {held === null ? null : (
            <span
              className={`badge badge-confidence-${held.confidence.band}`}
              data-testid={`badge-plants-confidence-${bed.id}`}
              data-band={held.confidence.band}
            >
              {CONFIDENCE_LABEL[held.confidence.band]}
            </span>
          )}
          {updating ? (
            <p className="readout-note" data-testid={`status-plants-updating-${bed.id}`}>
              Updating...
            </p>
          ) : null}
          <div className="row plants-bed-actions">
            <Action
              testId={`action-plants-next-mix-${bed.id}`}
              label={`Try another mix for ${bed.label}`}
              disabled={fitting.length < 2}
              onClick={tryNext}
            >
              {fitting.length < 2 ? 'No other mix fits' : 'Try another mix'}
            </Action>
            <Action
              testId={`action-plants-edit-${bed.id}`}
              label={`Change a plant in ${bed.label}`}
              onClick={onEdit}
            >
              Change a plant
            </Action>
          </div>
          {mix === null ? null : (
            <p className="notice notice-ready" data-testid={`status-plants-mix-${bed.id}`}>
              {mix}
            </p>
          )}
        </>
      ) : updating ? (
        <p className="readout-note" data-testid={`status-plants-updating-${bed.id}`}>
          Updating...
        </p>
      ) : null}
    </li>
  )
}

const BedCards = ({ onEdit }: { onEdit(bedId: BedId): void }): ReactElement => {
  const beds = useAppStore((s) => s.plot?.beds ?? EMPTY_LIST)
  const catalog = useAppStore((s) => (s.catalog.status === 'ready' ? s.catalog.value : EMPTY_LIST))
  const generated = useAppStore((s) => s.generated)
  const suggestions = useAppStore((s) => s.suggestions)
  const selected = useAppStore(selectedBedOf)
  const hovered = useAppStore((s) => s.hovered)
  const selectBed = useAppStore((s) => s.selectBed)
  const plantEveryBed = useAppStore((s) => s.plantEveryBed)
  const undoable = useAppStore((s) => s.generationUndo !== null)
  const undo = useAppStore((s) => s.undoGeneration)
  const bedLight = useAppStore((s) => s.bedLight)
  const window = useAppStore(growingWindowOf)
  const [replant, clearReplant] = useReplantOnLikes()
  // `plantEveryBed` reports nothing while it runs, so the press remembers that it pressed
  const [planting, setPlanting] = useState(false)
  const anyPlanted = beds.some((bed) => bed.plantings.length > 0)

  const fill = (): void => {
    setPlanting(true)
    clearReplant()
    const done = (): void => setPlanting(false)
    void plantEveryBed().then(done, done)
  }

  return (
    <>
      <ul className="list plants-beds" data-testid="list-plants-beds">
        {beds.map((bed) => (
          <BedCard
            key={bed.id}
            bed={bed}
            catalog={catalog}
            zone={zoneWordOf(bedLight, bed, window)}
            live={
              suggestions.status === 'ready' && suggestions.value.bedId === bed.id
                ? suggestions.value.suggestions
                : EMPTY_LIST
            }
            carried={
              generated?.suggestions.find((entry) => entry.bedId === bed.id)?.set.suggestions ??
              EMPTY_LIST
            }
            selected={selected?.id === bed.id}
            hovered={hovered !== null && hovered.kind !== 'array' && hovered.bedId === bed.id}
            updating={replant?.kind === 'updating'}
            onSelect={() => selectBed(bed.id)}
            onEdit={() => onEdit(bed.id)}
          />
        ))}
      </ul>
      <div className="row">
        <Action
          testId="action-plants-fill"
          tone={anyPlanted ? 'ghost' : 'primary'}
          disabled={planting}
          onClick={fill}
        >
          {planting
            ? 'Planting...'
            : !anyPlanted
              ? 'Plant every bed'
              : replant?.kind === 'by-hand'
                ? 'Plant every bed again for what you like'
                : 'Plant every bed again'}
        </Action>
        {undoable ? (
          <Action testId="action-plants-undo" onClick={undo}>
            Put the plot back the way it was
          </Action>
        ) : null}
      </div>
      {/* a slot that is always there, so the sentence landing in it moves nothing below it: a
          sentence appearing above the chips would push the one just pressed 57px down the
          screen */}
      <p
        className={`plants-replant notice notice-${replant?.kind === 'changed' ? 'ready' : 'idle'}`}
        data-testid="status-plants-replanted"
        data-state={replant?.kind ?? 'none'}
        aria-live="polite"
      >
        {replant === null || replant.kind === 'updating'
          ? ''
          : replant.kind === 'changed'
            ? changedLine(replant.count)
            : 'A bed was changed by hand, so the beds keep what they hold'}
      </p>
    </>
  )
}

/* ------------------------------ say what you like to eat --------------------------------- */

/**
 * The next kind a chip press writes: nothing, prefer, avoid, nothing. A must-have set in "More
 * choices" presses on to avoid the way prefer does, and a never presses back to nothing
 */
const cycle = (kind: PreferenceKind | null): PreferenceKind | null =>
  kind === null ? 'prefer' : kind === 'prefer' || kind === 'require' ? 'avoid' : null

const kindLabel = (kind: PreferenceKind): string =>
  PREFERENCE_KINDS.find((entry) => entry.kind === kind)?.label ?? kind

/**
 * What just changed, said the way its own control does: a switch names itself, on or off; a
 * preference names the crop it was set on. Never more than one of these differs between two
 * consecutive states, because a press writes one field at a time
 */
const causeOf = (state: AppState, previous: AppState, catalog: readonly Crop[]): string => {
  if (state.wildlife.favourPollinators !== previous.wildlife.favourPollinators) {
    return `Flowers for bees ${state.wildlife.favourPollinators ? 'on' : 'off'}`
  }
  if (state.wildlife.favourNative !== previous.wildlife.favourNative) {
    return `Wild plants from around here ${state.wildlife.favourNative ? 'on' : 'off'}`
  }
  const before = new Map(previous.preferences.entries.map((entry) => [entry.cropId, entry.kind]))
  const after = new Map(state.preferences.entries.map((entry) => [entry.cropId, entry.kind]))
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const kind = after.get(id)
    if (kind !== before.get(id)) {
      return kind === undefined
        ? `${cropName(catalog, id)} cleared`
        : `${kindLabel(kind)} ${cropName(catalog, id)}`
    }
  }
  return 'Your picks'
}

/** The bed's own ranked crops, capped the way the readout below counts them */
const topIdsOf = (sets: AppState['sets'], bedId: BedId | null): readonly CropId[] =>
  bedId === null || sets.status !== 'ready'
    ? EMPTY_LIST
    : (sets.value.find((set) => set.bedId === bedId)?.ranked ?? EMPTY_LIST)
        .slice(0, CHOICES_EFFECT_TOP_N)
        .map((entry) => entry.cropId)

/**
 * What a wildlife switch or a pick just did to the selected bed's own ranking, read off the
 * ranking that lands after the change: a switch can
 * move nothing. The same wait `useReplantOnLikes` above uses, since both start from "one of the
 * inputs the ranking reads just changed" and need the re-rank it starts to land before there is
 * anything to say; kept separate because one replants beds and the other only reports.
 *
 * The bed's own previous top ids live in a ref keyed by bed id, so switching beds between two
 * changes compares a bed against its own last reading
 */
const useChoicesEffect = (): string | null => {
  const [message, setMessage] = useState<string | null>(null)
  const previousTopIds = useRef<Map<BedId, readonly CropId[]>>(new Map())

  useEffect(() => {
    let waiting = false
    let cause = ''
    let bedId: BedId | null = null
    const settle = (): void => {
      waiting = false
      if (bedId === null) return
      const state = useAppStore.getState()
      const catalog = state.catalog.status === 'ready' ? state.catalog.value : EMPTY_LIST
      const bedLabel = bedName(state.plot?.beds ?? EMPTY_LIST, bedId)
      const after = topIdsOf(state.sets, bedId)
      const before = previousTopIds.current.get(bedId) ?? after
      previousTopIds.current.set(bedId, after)
      setMessage(choicesEffectSentence(cause, bedLabel, before, after, catalog))
    }
    const unsubscribe = useAppStore.subscribe((state, previous) => {
      if (likesKeyOf(state) !== likesKeyOf(previous)) {
        const catalog = state.catalog.status === 'ready' ? state.catalog.value : EMPTY_LIST
        bedId = selectedBedOf(state)?.id ?? null
        cause = causeOf(state, previous, catalog)
        waiting = true
        // the automatic ranking will run on this change; wait for it to land, the same as above
        if (!(state.autoRun && autoRunReady(state))) settle()
        return
      }
      if (waiting && previous.ranking && !state.ranking) settle()
    })
    return unsubscribe
  }, [])

  return message
}

const Likes = (): ReactElement => {
  const bed = useAppStore(selectedBedOf)
  const sets = useAppStore((s) => s.sets)
  const catalog = useAppStore((s) => (s.catalog.status === 'ready' ? s.catalog.value : EMPTY_LIST))
  const preferences = useAppStore((s) => s.preferences)
  const setPreference = useAppStore((s) => s.setPreference)
  const wildlife = useAppStore((s) => s.wildlife)
  const setWildlife = useAppStore((s) => s.setWildlife)
  const site = useAppStore((s) => s.site)
  const locationLabel = useAppStore((s) => s.locationLabel)
  const ambition = useAppStore((s) => s.answers.ambition)
  const region = regionNote(site, locationLabel)
  const choicesEffect = useChoicesEffect()
  const plantEveryBed = useAppStore((s) => s.plantEveryBed)

  const ranked =
    sets.status === 'ready'
      ? (sets.value.find((set) => set.bedId === bed?.id)?.ranked ?? EMPTY_LIST)
      : EMPTY_LIST
  // food crops only: the support plants (a cover crop, an insectary flower) join a combination
  // when they raise it, and nobody eats them, so nobody is asked whether they like them
  const foodIds = new Set<string>(
    catalog.filter((crop) => crop.role === null).map((crop) => crop.id),
  )
  const classOf = new Map(catalog.map((crop) => [crop.id as string, crop.dliClass]))
  const food = ranked.filter(
    (item) => item.outcome.verdict !== 'excluded' && foodIds.has(item.cropId),
  )
  /*
    Every food crop the bed can take, in the groups a gardener already thinks in, each sorted by
    name. A ranked head of sixteen, sorted alphabetically, would stop at "dill" and leave a grower
    looking for tomatoes with no chip for it. The group the growing answer asked for comes first;
    nothing in the order reads the beds, so a press that replants them does not shuffle the chips
    under the thumb that pressed one
  */
  const asked = new Set<string>(AMBITION_CLASSES[ambition])
  const groups = LIKE_GROUPS.map((group) => ({
    ...group,
    asked: group.classes.some((dliClass) => asked.has(dliClass)),
    items: food
      .filter((item) => group.classes.includes(classOf.get(item.cropId) ?? 'c3-cereals'))
      .sort((left, right) =>
        cropName(catalog, left.cropId).localeCompare(cropName(catalog, right.cropId)),
      ),
  }))
  const ordered = [...groups.filter((group) => group.asked), ...groups.filter((g) => !g.asked)]
  const kindOf = (cropId: CropId): PreferenceKind | null =>
    preferences.entries.find((entry) => entry.cropId === cropId)?.kind ?? null

  return (
    <>
      <h3>Say what you like to eat</h3>
      <p className="panel-sub">
        Press a plant once to prefer it and again to avoid it. The combinations follow what you say
      </p>
      <div data-testid="list-plants-likes">
        {ordered.map((group) =>
          group.items.length === 0 ? null : (
            <div
              key={group.label}
              className="like-group"
              data-testid={`list-plants-likes-${group.id}`}
            >
              <h4 className="like-group-title">{group.label}</h4>
              <ul className="list like-list">
                {group.items.map((item) => {
                  const kind = kindOf(item.cropId)
                  const name = cropName(catalog, item.cropId)
                  return (
                    <li key={item.cropId}>
                      <button
                        type="button"
                        className={`pref-chip like-chip${kind === null ? '' : ' pref-chip-active'}`}
                        data-testid={`control-plants-like-${item.cropId}`}
                        data-kind={kind ?? 'none'}
                        aria-pressed={kind !== null}
                        aria-label={kind === null ? name : `${kindLabel(kind)} ${name}`}
                        onClick={() => setPreference(item.cropId, cycle(kind))}
                      >
                        {name}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ),
        )}
      </div>
      <MoreChoices options={food} catalog={catalog} />
      <Toggle
        testId="control-plants-pollinators"
        label="Flowers for bees"
        checked={wildlife.favourPollinators}
        onChange={(checked) => setWildlife({ favourPollinators: checked })}
      />
      <Toggle
        testId="control-plants-natives"
        label="Wild plants from around here"
        checked={wildlife.favourNative}
        onChange={(checked) => setWildlife({ favourNative: checked })}
      />
      {/* with no region there is nothing to be native TO, and a switch that quietly does nothing
          reads exactly like one that worked: said whichever way the switch is set */}
      {region === null ? null : (
        <p className="notice notice-warn" data-testid="status-plants-natives-region">
          {region}
        </p>
      )}
      {/*
        What a switch or a pick above just did to this bed's own ranking, said once the re-rank
        it started has landed.
        A slot that is always there, the same reason `status-plants-replanted` above is: so the
        sentence landing in it moves nothing else on the step
      */}
      <p
        className="notice notice-idle"
        data-testid="readout-plants-choices-effect"
        aria-live="polite"
      >
        {choicesEffect ?? ''}
      </p>
      <Action testId="action-plants-replant" onClick={() => void plantEveryBed()}>
        Plant every bed again with these picks
      </Action>
    </>
  )
}

/* ---------------------------------------- the step --------------------------------------- */

export const PlantsPanel = (): ReactElement => {
  // the key is the subscription; the chain is built from a read, because every requirement is a
  // fresh object and a selector that returns one re-renders without end
  useAppStore(requirementKey)
  const state = useAppStore.getState()
  const blocker = firstUnmet([...rankingChain(state), rankingRequirement(state)])
  const selectBed = useAppStore((s) => s.selectBed)
  const byHand = useRef<HTMLDetailsElement | null>(null)

  /**
   * "Change a plant" on a card: the bed becomes the selected one, the fold that picks plants one
   * at a time opens, and its search field comes into view. The fold is opened on the node rather
   * than through state, because nothing else ever closes it: it is the visitor's to fold back
   */
  const edit = (bedId: BedId): void => {
    selectBed(bedId)
    const fold = byHand.current
    if (fold === null) return
    fold.open = true
    const field = fold.querySelector<HTMLElement>('[data-testid="control-bed-crop-search"]') ?? fold
    // jsdom has no `scrollIntoView`, and a browser missing it skips the scroll, without throwing
    if (typeof field.scrollIntoView !== 'function') return
    field.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }

  return (
    <Panel
      id="plants"
      title="What goes in each bed?"
      titleVisible={false}
      subtitle="Combinations computed for your beds from the light they get. Change any of it"
    >
      <StatusLine />
      {blocker !== null ? (
        <RequirementNotice requirement={blocker} testId="status-plants-blocked" />
      ) : (
        <>
          <SoilPhNotice />
          <BedCards onEdit={edit} />
          <Likes />
          <Combinations />
          <details className="wizard-advanced" data-testid="details-plants-by-hand" ref={byHand}>
            <summary>Pick plants one at a time</summary>
            <SelectedBedPlanting />
          </details>
          <details className="wizard-advanced" data-testid="details-plants-ranking">
            <summary>Every crop ranked, and why</summary>
            <RankingSection />
          </details>
          <GardenPlanPanel />
        </>
      )}
    </Panel>
  )
}
