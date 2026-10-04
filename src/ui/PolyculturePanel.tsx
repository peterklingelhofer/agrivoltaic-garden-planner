import { Fragment, useEffect, useState, type ReactElement } from 'react'
import { EMPTY_LIST } from '../state/slices'
import { selectedBedOf, useAppStore } from '../state/store'
import type { Crop } from '../types/crop'
import type { CropId } from '../types/ids'
import type {
  CompatibilityTerm,
  CompatibilityTermKind,
  PairCompatibility,
  PolycultureSuggestion,
  PreferenceKind,
  SuggestionRefusal,
} from '../types/polyculture'
import type { CropRecommendation } from '../types/recommend'
import type { TekDesignRule, TekRuleKey } from '../types/tek'
import type { Fraction } from '../types/units'
import { Action, NumberField, SliderField } from './controls'
import { CropPictureFor } from './CropSprite'
import { EvidenceBadge } from './EvidenceBadge'
import { InfoTip } from './InfoTip'
import {
  assertBanded,
  bandBasisLabel,
  cropName,
  approxCount,
  approxPlural,
  plural,
  suggestionTieNote,
  tiedLeadingSuggestionCount,
} from './format'
import { lerWords } from '../simulation/score'
import { AsyncNotice } from './Panel'
import {
  CONFIDENCE_LABEL,
  folkloreClaimCount,
  groupRefusals,
  plainWhy,
  PREFERENCE_KINDS,
  REFUSAL_CAUSE_LABEL,
  shownTerms,
  suggestionHeadline,
  TERM_LABEL,
  VERDICT_LABEL,
} from './polyculture'
import { SourceLink } from './SourcesPanel'
import { peoplesOf, practiceOf, TEK_ENDORSEMENT } from './tek'

const TERM_ORDER: readonly CompatibilityTermKind[] = [
  'soil-ph',
  'water-regime',
  'root-stratification',
  'canopy-tier',
  'light-overtopping',
  'shared-pest-or-pathogen',
  'documented-companion',
  'allelopathy',
]

/**
 * The two kinds a chip on the plants step can't say: Must have and Never, both hard constraints
 */
const HARD_KINDS = PREFERENCE_KINDS.filter(
  (entry) => entry.kind === 'require' || entry.kind === 'exclude',
)

const pairId = (pair: PairCompatibility): string =>
  `${pair.cropIds[0] as string}-${pair.cropIds[1] as string}`

const PreferenceRow = ({
  cropId,
  catalog,
  kind,
  onKind,
}: {
  readonly cropId: CropId
  readonly catalog: readonly Crop[]
  readonly kind: PreferenceKind | null
  onKind(next: PreferenceKind | null): void
}): ReactElement => {
  const name = cropName(catalog, cropId)
  return (
    <li
      className="pref-row"
      data-testid={`item-polyculture-preference-${cropId}`}
      data-crop={cropId}
      data-kind={kind ?? 'none'}
    >
      {/* decorative: the crop's name is the next thing in the row. See `CropPicture` */}
      <CropPictureFor catalog={catalog} cropId={cropId} />
      <span className="pref-name">{name}</span>
      <span className="pref-chips">
        {HARD_KINDS.map((entry) => (
          <button
            key={entry.kind}
            type="button"
            className={`pref-chip${kind === entry.kind ? ' pref-chip-active' : ''}`}
            data-testid={`control-polyculture-kind-${cropId}-${entry.kind}`}
            data-kind={entry.kind}
            aria-pressed={kind === entry.kind}
            aria-label={`${entry.label} ${name}`}
            onClick={() => onKind(kind === entry.kind ? null : entry.kind)}
          >
            {entry.label}
          </button>
        ))}
      </span>
    </li>
  )
}

const TermRow = ({
  term,
  id,
}: {
  readonly term: CompatibilityTerm
  readonly id: string
}): ReactElement => (
  <li
    className="term-row"
    data-testid={`item-${id}`}
    data-term={term.kind}
    data-verdict={term.verdict}
    data-scores={term.scores}
  >
    <span className="term-head">
      <strong>{TERM_LABEL[term.kind]}</strong>
      <span className={`badge badge-term-${term.verdict}`} data-testid={`badge-${id}-verdict`}>
        {VERDICT_LABEL[term.verdict]}
      </span>
      {term.grade === null ? (
        <span className="badge" data-testid={`badge-${id}-grade`} data-grade="none">
          Unsourced
        </span>
      ) : (
        <EvidenceBadge grade={term.grade} testId={`badge-${id}-grade`} />
      )}
      <span className={term.scores ? 'term-scored' : 'term-unscored'}>
        {term.scores
          ? `scored, moves this pair by ${term.contribution >= 0 ? '+' : ''}${term.contribution.toFixed(2)}`
          : 'shown for information, it has no effect on the score'}
      </span>
    </span>
    <span>{term.explanation}</span>
    {term.citations.length > 0 ? (
      <span className="term-cites">
        {term.citations.map((id, index) => (
          <Fragment key={id}>
            {index > 0 ? '; ' : null}
            <SourceLink id={id} />
          </Fragment>
        ))}
      </span>
    ) : null}
  </li>
)

const PairBreakdown = ({
  pair,
  prefix,
  catalog,
}: {
  readonly pair: PairCompatibility
  readonly prefix: string
  readonly catalog: readonly Crop[]
}): ReactElement => {
  const terms = [...shownTerms(pair)].sort(
    (left, right) => TERM_ORDER.indexOf(left.kind) - TERM_ORDER.indexOf(right.kind),
  )
  return (
    <div data-testid={`item-${prefix}-pair-${pairId(pair)}`}>
      <h4>
        {cropName(catalog, pair.cropIds[0])} with {cropName(catalog, pair.cropIds[1])}
      </h4>
      <ul className="list" data-testid={`list-${prefix}-terms-${pairId(pair)}`}>
        {terms.map((term) => (
          <TermRow
            key={`${term.kind}-${term.explanation}`}
            term={term}
            id={`${prefix}-term-${pairId(pair)}-${term.kind}`}
          />
        ))}
      </ul>
    </div>
  )
}

/**
 * The count of grade D or E folklore claims about a pair, said plainly: a claim about this
 * pairing exists and was deliberately NOT allowed to move the suggestion. It heads the card's
 * "Why these go together" fold, above the term-by-term case, so whoever opens the case for a
 * pairing meets the claims that were left out of it before the terms that were counted
 */
const FolkloreNotice = ({
  pair,
  prefix,
  catalog,
}: {
  readonly pair: PairCompatibility
  readonly prefix: string
  readonly catalog: readonly Crop[]
}): ReactElement | null => {
  const hidden = folkloreClaimCount(pair)
  if (hidden === 0) return null
  return (
    <p className="term-folklore" data-testid={`readout-${prefix}-folklore-${pairId(pair)}`}>
      {hidden} grade D or E claim(s) exist about {cropName(catalog, pair.cropIds[0])} with{' '}
      {cropName(catalog, pair.cropIds[1])}. They're listed in the Folklore panel on the last step.
      They have no effect on this suggestion
    </p>
  )
}

/**
 * Who a traditional design rule belongs to, said where the rule is used on somebody's garden.
 *
 * Printing `suggestion.tekRuleKeys.join(', ')` would show internal slugs
 * (`vertical-stratification`, `nurse-plants`), and pointing at another step for the attribution
 * would be worse. A rule taken from a named people is being APPLIED to this layout, here, and
 * filing the naming of them under citations, three steps away, would treat it as a bibliography
 * entry. Provenance travels with use: the peoples, whether the practice is living, and the fact
 * that nobody asked them, all sit on the card the rule shaped. The full credit and its sources stay
 * on the sources step, which is where somebody auditing all of them at once would look.
 *
 * `TEK_ENDORSEMENT` is imported directly: it's the one sentence here that must read as a
 * caveat, and two copies of it is two chances for one to soften
 */
const EMPTY_RULES: readonly TekDesignRule[] = []

const TekCredits = ({
  keys,
  index,
}: {
  readonly keys: readonly TekRuleKey[]
  readonly index: number
}): ReactElement | null => {
  const rules = useAppStore((s) => (s.tekRules.status === 'ready' ? s.tekRules.value : EMPTY_RULES))
  if (keys.length === 0) return null
  const applied = keys.map((key) => rules.find((rule) => rule.key === key) ?? key)
  return (
    <div className="suggestion-note" data-testid={`readout-polyculture-tek-${index}`}>
      <p>Traditional design rules this combination follows, and who each one comes from:</p>
      <ul className="list">
        {applied.map((entry) =>
          typeof entry === 'string' ? (
            // the rules are fetched, so a card can be drawn before they land. The key is a poor
            // name and an honest one, and it's never left standing as the whole credit
            <li key={entry} data-testid={`item-polyculture-tek-${index}-${entry}`}>
              {entry}, still loading its attribution
            </li>
          ) : (
            <li key={entry.key} data-testid={`item-polyculture-tek-${index}-${entry.key}`}>
              <strong>{entry.title}</strong>, from the {peoplesOf(entry)} ({practiceOf(entry)}).{' '}
              {TEK_ENDORSEMENT}
            </li>
          ),
        )}
      </ul>
    </div>
  )
}

/**
 * One combination for the selected bed. On its face: what, how many, the confidence word, the
 * press and what the press did. Everything that argues the case (the space accounting, the
 * tiers, the LER, the provenance, the confidence reasons, the folklore count and the term-by-term
 * breakdown) is behind the card's own fold, because a grower deciding between three of these
 * reads three faces and opens one fold
 */
const SuggestionCard = ({
  suggestion,
  index,
  catalog,
}: {
  readonly suggestion: PolycultureSuggestion
  readonly index: number
  readonly catalog: readonly Crop[]
}): ReactElement => {
  const applySuggestion = useAppStore((s) => s.applySuggestion)
  /*
    What the press did, said beside the press. Without it, a card that planted nothing would look
    exactly like one that planted three crops. Read off the plot fresh each time, so it stays true
    when the bed is changed elsewhere
  */
  const bed = useAppStore((s) => s.plot?.beds.find((entry) => entry.id === suggestion.bedId))
  const refusals = useAppStore((s) => s.planRefusals)
  const [pressed, setPressed] = useState(false)
  const planted = (bed?.plantings ?? EMPTY_LIST).filter((planting) =>
    suggestion.cropIds.includes(planting.cropId),
  )
  const refused = refusals.filter(
    (refusal) => refusal.bedId === suggestion.bedId && suggestion.cropIds.includes(refusal.cropId),
  )
  const outcome = !pressed
    ? null
    : planted.length === 0
      ? `Nothing was planted in ${bed?.label ?? 'the bed'}`
      : `Planted in ${bed?.label ?? 'the bed'}: ${planted
          .map(
            (planting) =>
              `${approxCount(planting.plantCount)} ${cropName(catalog, planting.cropId)}`,
          )
          .join(', ')}`
  const prefix = `polyculture-${String(index)}`
  const ler = assertBanded(suggestion.ler.totalLer)
  return (
    <li
      className="suggestion"
      data-testid={`item-polyculture-suggestion-${index}`}
      data-crops={suggestion.cropIds.join('+')}
      data-fits={suggestion.fits}
    >
      <div className="suggestion-head">
        <p className="suggestion-headline" data-testid={`readout-polyculture-headline-${index}`}>
          {suggestionHeadline(catalog, suggestion)}
        </p>
        <span
          className={`badge badge-confidence-${suggestion.confidence.band}`}
          data-testid={`badge-polyculture-confidence-${index}`}
          data-band={suggestion.confidence.band}
        >
          {CONFIDENCE_LABEL[suggestion.confidence.band]}
        </span>
      </div>
      <ul className="list" data-testid={`list-polyculture-plants-${index}`}>
        {suggestion.space.allocations.map((allocation) => (
          <li
            key={allocation.cropId}
            data-testid={`item-polyculture-plant-${index}-${allocation.cropId}`}
            data-crop={allocation.cropId}
            data-count={allocation.plantCount}
          >
            {cropName(catalog, allocation.cropId)}:{' '}
            {approxPlural(allocation.plantCount, 'plant', 'plants')} over{' '}
            {allocation.allocatedAreaM2.toFixed(1)} m² at {allocation.basis} spacing
          </li>
        ))}
      </ul>
      {/* plain: five cards in a stack would be five green buttons, and the fill is reserved for
          the one press a screen wants most */}
      <Action
        testId={`action-polyculture-apply-${index}`}
        disabled={!suggestion.fits}
        onClick={() => {
          applySuggestion(suggestion)
          setPressed(true)
        }}
      >
        {bed !== undefined && bed.plantings.length > 0 && planted.length === 0
          ? `Replace what's in ${bed.label} with this`
          : 'Plant this combination'}
      </Action>
      {outcome === null ? null : (
        <p
          className={`notice notice-${planted.length === 0 ? 'error' : 'ready'}`}
          data-testid={`status-polyculture-applied-${index}`}
          data-planted={planted.length}
        >
          {outcome}
          {refused.length === 0
            ? ''
            : `. Not planted: ${refused
                .map((refusal) => `${cropName(catalog, refusal.cropId)} (${refusal.reason})`)
                .join('; ')}`}
        </p>
      )}
      <details className="wizard-advanced" data-testid={`panel-polyculture-breakdown-${index}`}>
        <summary>Why these go together</summary>
        {/* the plain paragraph first. The evidence it is read off follows */}
        <p className="suggestion-why" data-testid={`readout-polyculture-why-${index}`}>
          {plainWhy(catalog, suggestion)}
        </p>
        <p className="suggestion-note" data-testid={`readout-polyculture-space-${index}`}>
          One plant of each needs {suggestion.space.requiredAreaM2.toFixed(1)} m² of the{' '}
          {suggestion.space.bedAreaM2.toFixed(1)} m² bed
          {suggestion.space.shortfallM2 > 0
            ? `, which is ${suggestion.space.shortfallM2.toFixed(1)} m² more than there is`
            : ', and the surplus is split evenly'}
        </p>
        <p className="suggestion-note" data-testid={`readout-polyculture-tiers-${index}`}>
          {suggestion.tiers.length} canopy tier(s), the height layers these plants fill:{' '}
          {suggestion.tiers.join(', ')}
        </p>
        <TekCredits keys={suggestion.tekRuleKeys} index={index} />
        <div className="readout readout-band" data-kind={ler.intervalKind}>
          <span className="readout-label">Land equivalent ratio (LER)</span>
          <span className="readout-value" data-testid={`readout-polyculture-ler-${index}`}>
            {lerWords(ler)}
          </span>
          <span className="readout-note" data-testid={`readout-polyculture-ler-basis-${index}`}>
            Land equivalent ratio {lerWords(ler)}: a solar farm and a garden side by side would need{' '}
            {lerWords(ler)} times this bed's land to give what this bed gives under its panels.
            Above 1, the two share the ground well. The range is the {bandBasisLabel(ler)}, for
            crops and electricity together
          </span>
        </div>
        <ul className="list" data-testid={`list-polyculture-confidence-${index}`}>
          {suggestion.confidence.reasons.map((reason) => (
            <li key={reason} className="suggestion-note">
              {reason}
            </li>
          ))}
        </ul>
        {suggestion.pairs.map((pair) => (
          <FolkloreNotice key={pairId(pair)} pair={pair} prefix={prefix} catalog={catalog} />
        ))}
        <h4>How each of the {suggestion.pairs.length} pair(s) scored, factor by factor</h4>
        {suggestion.pairs.map((pair) => (
          <PairBreakdown key={pairId(pair)} pair={pair} prefix={prefix} catalog={catalog} />
        ))}
      </details>
    </li>
  )
}

const Refusals = ({
  refused,
  catalog,
}: {
  readonly refused: readonly SuggestionRefusal[]
  readonly catalog: readonly Crop[]
}): ReactElement => {
  const groups = groupRefusals(refused)
  return (
    <details className="wizard-advanced" data-testid="details-plants-refusals">
      <summary>Why the rest were refused</summary>
      <p className="pref-legend" data-testid="readout-polyculture-refusal-count">
        {refused.length} crop(s) were refused for this bed, grouped by what ruled them out. Each
        refusal names the conflict
      </p>
      <div className="list" data-testid="list-polyculture-refusals">
        {groups.map((group) => (
          <div
            key={group.cause}
            data-testid={`item-polyculture-refusal-group-${group.cause}`}
            data-count={group.refusals.length}
          >
            <h4 className="refusal-cause">
              {REFUSAL_CAUSE_LABEL[group.cause]} ({group.refusals.length})
            </h4>
            <ul className="list">
              {group.refusals.map((refusal) => (
                <li
                  key={refusal.cropId}
                  data-testid={`item-polyculture-refusal-${refusal.cropId}`}
                  data-crop={refusal.cropId}
                  data-cause={group.cause}
                >
                  <strong>{cropName(catalog, refusal.cropId)}</strong>
                  {refusal.conflictsWithCropId === null
                    ? ''
                    : ` with ${cropName(catalog, refusal.conflictsWithCropId)}`}
                  : {refusal.reason}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  )
}

/**
 * The deep end of the preferences, folded: the two kinds a chip can't say (a crop every
 * combination must be built around, and one that may never appear), how hard a lean pushes,
 * how many crops a bed may hold, and what compatibility is scored on. `options` is the same
 * shortlist the chips above it show, so a crop is found in one place
 */
export const MoreChoices = ({
  options,
  catalog,
}: {
  readonly options: readonly CropRecommendation[]
  readonly catalog: readonly Crop[]
}): ReactElement => {
  const preferences = useAppStore((s) => s.preferences)
  const weights = useAppStore((s) => s.compatibilityWeights)
  const maxCropsPerBed = useAppStore((s) => s.maxCropsPerBed)
  const setPreference = useAppStore((s) => s.setPreference)
  const setPreferenceWeight = useAppStore((s) => s.setPreferenceWeight)
  const setPreferenceInfluence = useAppStore((s) => s.setPreferenceInfluence)
  const setCompatibilityWeight = useAppStore((s) => s.setCompatibilityWeight)
  const resetCompatibilityWeights = useAppStore((s) => s.resetCompatibilityWeights)
  const setMaxCropsPerBed = useAppStore((s) => s.setMaxCropsPerBed)
  const clearPreferences = useAppStore((s) => s.clearPreferences)
  const kindOf = (cropId: CropId): PreferenceKind | null =>
    preferences.entries.find((entry) => entry.cropId === cropId)?.kind ?? null
  const tunable = preferences.entries.filter(
    (entry) => entry.kind === 'prefer' || entry.kind === 'avoid',
  )

  return (
    <details className="wizard-advanced" data-testid="details-plants-more">
      <summary>More choices: must have, never, and how hard your picks push</summary>
      <p className="pref-legend" data-testid="readout-polyculture-kinds">
        {HARD_KINDS.map((entry) =>
          entry.help === undefined ? entry.label : `${entry.label}: ${entry.help}`,
        ).join('. ')}
      </p>
      <ul className="list" data-testid="list-polyculture-preferences">
        {options.map((item) => (
          <PreferenceRow
            key={item.cropId}
            cropId={item.cropId}
            catalog={catalog}
            kind={kindOf(item.cropId)}
            onKind={(next) => setPreference(item.cropId, next)}
          />
        ))}
      </ul>
      <Action testId="action-polyculture-clear" onClick={clearPreferences}>
        Clear your picks
      </Action>
      <SliderField
        testId="control-polyculture-influence"
        label="How strongly your pick moves the pairing"
        min={0}
        max={1}
        step={0.05}
        value={preferences.influence}
        display={`${Math.round(preferences.influence * 100)}% against the agronomy`}
        onChange={(value) => setPreferenceInfluence(value as Fraction)}
      />
      {tunable.map((entry) => (
        <SliderField
          key={entry.cropId}
          testId={`control-polyculture-strength-${entry.cropId}`}
          label={`How strongly you ${entry.kind} ${cropName(catalog, entry.cropId)}`}
          min={0}
          max={1}
          step={0.05}
          value={entry.weight}
          display={`${Math.round(entry.weight * 100)}%`}
          onChange={(value) => setPreferenceWeight(entry.cropId, value as Fraction)}
        />
      ))}
      <NumberField
        testId="control-polyculture-max-crops"
        label="Most crops to put in one bed"
        min={1}
        max={8}
        step={1}
        value={maxCropsPerBed}
        onChange={setMaxCropsPerBed}
      />
      <h4>Compatibility term weights</h4>
      <p className="pref-legend">
        Each slider multiplies the score of its term. A term with too weak an evidence grade to be
        scored stays at zero whatever you set here
      </p>
      {TERM_ORDER.map((kind) => (
        <SliderField
          key={kind}
          testId={`control-polyculture-weight-${kind}`}
          label={TERM_LABEL[kind]}
          min={0}
          max={1}
          step={0.05}
          value={weights[kind]}
          display={weights[kind].toFixed(2)}
          onChange={(value) => setCompatibilityWeight(kind, value)}
        />
      ))}
      <Action testId="action-polyculture-reset-weights" onClick={resetCompatibilityWeights}>
        Reset weights to the documented defaults
      </Action>
    </details>
  )
}

/**
 * The combinations computed for the selected bed, asked for by an effect and never by a press.
 *
 * A "Suggest what to grow together" button would leave a grower who changed a preference reading
 * the same cards until they found it: a press that had to be remembered after every other press.
 * The effect asks whenever anything the engine reads has moved and the ranking is in, so the cards
 * on screen are always the cards for the bed, the preferences and the ranking on screen. `suggest`
 * is synchronous, so there's no in-flight state to show
 */
export const Combinations = (): ReactElement => {
  const bed = useAppStore(selectedBedOf)
  const bedId = bed?.id ?? null
  const catalog = useAppStore((s) => s.catalog)
  const sets = useAppStore((s) => s.sets)
  const ranking = useAppStore((s) => s.ranking)
  const bedLight = useAppStore((s) => s.bedLight)
  const preferences = useAppStore((s) => s.preferences)
  const weights = useAppStore((s) => s.compatibilityWeights)
  const maxCropsPerBed = useAppStore((s) => s.maxCropsPerBed)
  const ambition = useAppStore((s) => s.answers.ambition)
  // the electricity term lands after the first ask on a plot with panels: see `energyRatioFor`
  const energyStatus = useAppStore((s) => s.energy.status)
  const suggestions = useAppStore((s) => s.suggestions)
  const suggest = useAppStore((s) => s.suggest)
  const ready = bedId !== null && sets.status === 'ready' && !ranking && catalog.status === 'ready'

  // biome-ignore lint/correctness/useExhaustiveDependencies: the inputs `suggest` reads off the store, so a change to any one re-asks
  useEffect(() => {
    if (ready) suggest()
  }, [
    ready,
    suggest,
    bedId,
    sets,
    bedLight,
    preferences,
    weights,
    maxCropsPerBed,
    ambition,
    energyStatus,
  ])

  const crops = catalog.status === 'ready' ? catalog.value : EMPTY_LIST
  // the set on the store can be another bed's for the frame between a selection and the effect
  const set =
    suggestions.status === 'ready' && suggestions.value.bedId === bedId ? suggestions.value : null
  const tiedSuggestionCount = set === null ? 0 : tiedLeadingSuggestionCount(set.suggestions)

  /*
    Behind a fold. "Try another mix" on the bed's card already steps through these one at a time,
    and the full list, three to five cards each a screen tall on a phone, would sit between the beds
    and the step's Next, long enough that a grower happy with what the app planted could give up
    looking for the way forward before reaching it
  */
  return (
    <details className="wizard-advanced" data-testid="details-plants-combinations">
      <summary data-testid="action-plants-combinations">
        All the combinations for {bed?.label ?? 'this bed'}
      </summary>
      {/* the one place the word survives: named once here so it stays learnable, kept out of
          the rest of a step that otherwise says what this does without naming it */}
      <p className="panel-sub" data-testid="readout-polyculture-term">
        Growing several crops together like this has a name:{' '}
        <InfoTip label="polyculture" testId="info-polyculture">
          Polyculture: several kinds of plants growing in one bed at the same time.
        </InfoTip>
      </p>
      <AsyncNotice
        state={suggestions}
        testId="status-polyculture"
        idleLabel="No combinations yet"
      />
      {set === null ? null : (
        <>
          <p className="suggestion-note" data-testid="readout-polyculture-anchors">
            {plural(set.suggestions.length, 'combination', 'combinations')}
            {set.anchorCropIds.length === 0
              ? ' for this bed'
              : ` built around ${set.anchorCropIds.map((id) => cropName(crops, id)).join(', ')}`}
          </p>
          {/* the same alphabetical tie-break `rank.ts` uses shows up here too, in `suggest.ts`'s
              own sort: see `tiedLeadingSuggestionCount` */}
          {tiedSuggestionCount === 0 ? null : (
            <p
              className="notice notice-warn"
              data-testid="readout-polyculture-tied"
              data-tied={tiedSuggestionCount}
            >
              {suggestionTieNote(tiedSuggestionCount)}
            </p>
          )}
          <ul className="list" data-testid="list-plants-combinations">
            {set.suggestions.map((suggestion, index) => (
              <SuggestionCard
                key={suggestion.cropIds.join('+')}
                suggestion={suggestion}
                index={index}
                catalog={crops}
              />
            ))}
          </ul>
          {set.refused.length > 0 ? <Refusals refused={set.refused} catalog={crops} /> : null}
        </>
      )}
    </details>
  )
}
