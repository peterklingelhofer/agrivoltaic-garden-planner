import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import { roughKwh } from '../recommend/design'
import { usStateOf } from '../data/retail-price'
import { OBJECTIVE_PRESETS, presetMatching } from '../state/onboarding'
import type { LengthUnit } from '../state/slices'
import { useAppStore } from '../state/store'
import type { CandidateArchetype, DesignScenario } from '../types/onboarding'
import { Action } from './controls'
import { lerWords } from '../simulation/score'
import { formatDli, formatLength } from './format'
import { useLengthUnit } from './length-units'
import { AsyncNotice, Readout } from './Panel'
import {
  beatenBy,
  beatenSentence,
  clearanceNote,
  CONFIDENCE_CEILING,
  cropSentence,
  groundLightNote,
  lightLeftSentence,
  NOT_A_DETERMINATION,
  PORTFOLIO_LABEL,
  PORTFOLIO_NOTE,
  shadeBudgetNote,
  showsFigures,
  type Experience,
} from './onboarding'

const CONTROL: CandidateArchetype = 'no-array-control'

/**
 * The plain count when every placed bed gets enough light for something on the plant list, "U of
 * N" when fewer do: a bed can sit deep enough in a row's shade to be placed and still grow nothing
 */
const bedsReadout = (scenario: DesignScenario): string => {
  const total = scenario.layout.beds.length
  const adequate = scenario.lightAdequateBeds
  return adequate >= total ? String(total) : `${String(adequate)} of ${String(total)}`
}

/**
 * The tabs, in the order a reader who came for panels wants them: the pick first, then the other
 * layouts with panels, then the space with none, which is here for comparison.
 *
 * The comparison is read against the control, the space with no panels, because what the panels
 * cost is only readable against no panels. Its tab is always there and says what it is
 */
const ordered = (
  scenarios: readonly DesignScenario[],
  recommended: CandidateArchetype,
): readonly DesignScenario[] => {
  const is = (scenario: DesignScenario, archetype: CandidateArchetype): boolean =>
    scenario.candidate.archetype === archetype
  return [
    ...scenarios.filter((scenario) => !is(scenario, CONTROL) && is(scenario, recommended)),
    ...scenarios.filter((scenario) => !is(scenario, CONTROL) && !is(scenario, recommended)),
    ...scenarios.filter((scenario) => is(scenario, CONTROL)),
  ]
}

interface CardProps {
  readonly scenario: DesignScenario
  readonly recommended: boolean
  readonly experience: Experience
  readonly unit: LengthUnit
  /**
   * Whether the site is in Massachusetts, whose SMART programme the two regime flags quote.
   * Anywhere else, a Massachusetts-specific line would read as though the app had the wrong
   * location. Outside the state the flags say nothing; the checks step still lists every regime
   */
  readonly massachusetts: boolean
  /** The sentence for a card another layout beats on both figures, or null */
  readonly beaten: string | null
  onApply(scenario: DesignScenario): void
  onSee(): void
}

/**
 * One layout, as the face of the step: a first line in plain words, three figures, what it costs,
 * what still grows, and the two presses. The first line carries "suggested for you" and the
 * confidence as plain words: in uppercase capsules on top of the card they add clutter, and
 * orange-on-green when the card is selected
 */
const ScenarioCard = ({
  scenario,
  recommended,
  experience,
  unit,
  massachusetts,
  beaten,
  onApply,
  onSee,
}: CardProps): ReactElement => {
  const candidate = scenario.candidate
  const archetype = candidate.archetype
  const baseline = archetype === CONTROL
  const daylightKept = Math.round((1 - scenario.light.meanShadeRatio) * 100)
  return (
    <div
      className={`scenario${recommended ? ' scenario-recommended' : ''}`}
      id={`onboarding-scenario-${archetype}`}
      // a div, because `article` does not allow the tabpanel role (axe `aria-allowed-role`)
      role="tabpanel"
      aria-labelledby={`onboarding-layout-tab-${archetype}`}
      data-testid={`item-onboarding-scenario-${archetype}`}
      data-archetype={archetype}
      data-recommended={String(recommended)}
      data-baseline={String(baseline)}
    >
      <p className="scenario-title">
        <strong>{candidate.label}</strong>
        {recommended ? (
          <span data-testid={`badge-onboarding-recommended-${archetype}`}>
            {' '}
            · suggested for you
          </span>
        ) : null}
        {baseline ? <span data-testid="badge-onboarding-baseline"> · for comparison</span> : null}
        <span data-testid={`badge-onboarding-confidence-${archetype}`}>
          {' '}
          · {scenario.confidence} confidence
        </span>
      </p>

      {/* the three figures a layout is chosen on, in one row: the no-panels layout is the
          control, so its daylight is what every other one is read against */}
      <div
        className="readouts scenario-figures"
        data-testid={`readout-onboarding-key-figures-${archetype}`}
      >
        <Readout
          id={`onboarding-daylight-${archetype}`}
          label="Daylight kept"
          value={`${String(daylightKept)}%`}
        />
        <Readout
          id={`onboarding-energy-${archetype}`}
          label="kWh a year"
          // two figures: more would read as more precise than the bake really is
          value={`about ${roughKwh(scenario.production.annualAcKwh)}`}
        />
        <Readout
          id={`onboarding-beds-${archetype}`}
          label="beds get enough light"
          value={bedsReadout(scenario)}
        />
      </div>

      <p className="scenario-tradeoff" data-testid={`readout-onboarding-tradeoff-${archetype}`}>
        {baseline ? 'The same space with no panels on it. ' : 'What it costs you: '}
        {scenario.tradeoff}
        {/* the one archetype that stands panels on edge, so its shadow moves through the day.
            A tilted row instead sits fixed: worth saying why it costs less light */}
        {archetype === 'vertical-east-west'
          ? ' Upright panels throw a narrow shadow that sweeps across the ground through the day, so the beds keep more of the midday sun.'
          : ''}
      </p>
      {beaten === null ? null : (
        <p className="scenario-light" data-testid={`readout-onboarding-beaten-${archetype}`}>
          {beaten}
        </p>
      )}

      {/* a refusal means this option cannot give the grower a bed at all, which is not a
          detail to make anyone click for: it warns what NOT to expect from the button below,
          so it stays beside the tradeoff. It never sits behind the disclosure with the rest */}
      {scenario.layout.refusals.map((refusal) => (
        <p
          className="notice notice-warn"
          key={refusal}
          data-testid={`readout-onboarding-layout-refusal-${archetype}`}
        >
          {refusal}
        </p>
      ))}

      <p className="scenario-light" data-testid={`readout-onboarding-crops-${archetype}`}>
        {cropSentence(
          scenario.production.cropsAvailable.length,
          scenario.production.cropsLostToShade.length,
          baseline,
        )}
      </p>

      {/* the one flag that is a warning. It is not a plain reading: more shade than the
          requested plants can take is something to know before the press below, so it stays out
          of the fold when it is true and lives with the other flags when it is not */}
      {scenario.flags.shade.withinBudget ? null : (
        <p
          className="notice notice-warn"
          data-testid={`readout-onboarding-shade-warning-${archetype}`}
        >
          {shadeBudgetNote(scenario.flags)}
        </p>
      )}

      {/* one disclosure per card, holding everything that is support for the choice rather than
          the choice itself: the description, the figures `showsFigures` already gated, the
          bed-by-bed reasoning, and the regulation prose. Nothing in it is deleted, only read
          once and then closed */}
      <details className="wizard-advanced" data-testid={`details-onboarding-flags-${archetype}`}>
        <summary>Read more about this layout</summary>
        <p className="scenario-summary" data-testid={`readout-onboarding-summary-${archetype}`}>
          {scenario.plainSummary}
        </p>
        <p className="scenario-light" data-testid={`readout-onboarding-light-${archetype}`}>
          {lightLeftSentence(scenario.light.meanShadeRatio)}
        </p>

        {showsFigures(experience) ? (
          <div className="readouts" data-testid={`readout-onboarding-figures-${archetype}`}>
            <Readout
              id={`onboarding-dli-${archetype}`}
              label="Growing-season light"
              value={formatDli(scenario.light.meanGrowingSeasonDli)}
            />
            <Readout
              id={`onboarding-worst-dli-${archetype}`}
              label="Darkest cell"
              value={formatDli(scenario.light.worstCellDli)}
            />
            <Readout
              id={`onboarding-evenness-${archetype}`}
              label="Evenness of the light"
              value={`${String(Math.round(scenario.light.homogeneity * 100))}%`}
            />
            <Readout
              id={`onboarding-ler-${archetype}`}
              label={PORTFOLIO_LABEL}
              value={lerWords(scenario.production.landEquivalentRatio)}
            />
            <Readout
              id={`onboarding-clearance-${archetype}`}
              label="Room under the panels"
              value={formatLength(candidate.geometry.clearanceHeightM, unit)}
            />
          </div>
        ) : null}

        {showsFigures(experience) ? (
          <p className="scenario-light" data-testid={`readout-onboarding-portfolio-${archetype}`}>
            {PORTFOLIO_NOTE}
          </p>
        ) : null}

        <p className="scenario-light" data-testid={`readout-onboarding-layout-${archetype}`}>
          {scenario.layout.explanation}
        </p>
        {scenario.layout.beds.length === 0 ? null : (
          <ul className="scenario-beds" data-testid={`list-onboarding-beds-${archetype}`}>
            {scenario.layout.beds.map((bed) => (
              <li
                key={bed.bedId}
                data-testid={`item-onboarding-bed-${archetype}-${bed.bedId}`}
                data-zone={bed.zone}
              >
                <strong>{bed.label}</strong>: {bed.reason}
              </li>
            ))}
          </ul>
        )}
        <ul className="scenario-flags" data-testid={`list-onboarding-flags-${archetype}`}>
          {massachusetts ? (
            <>
              <li data-testid={`item-onboarding-flag-clearance-${archetype}`}>
                {clearanceNote(scenario.flags)}
              </li>
              <li data-testid={`item-onboarding-flag-ground-light-${archetype}`}>
                {groundLightNote(scenario.flags)}
              </li>
            </>
          ) : null}
          <li
            className={scenario.flags.shade.withinBudget ? undefined : 'scenario-over-budget'}
            data-testid={`item-onboarding-flag-shade-${archetype}`}
            data-within-budget={String(scenario.flags.shade.withinBudget)}
          >
            {shadeBudgetNote(scenario.flags)}
          </li>
          {scenario.flags.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
          <li className="scenario-caveat">{NOT_A_DETERMINATION}</li>
        </ul>
      </details>

      {/*
        The card's own foot, in flow. The card is short enough that the presses are in view when the
        card is, and a sticky foot would cover the card's last lines on a phone
      */}
      <div className="row scenario-actions">
        {/*
          Switches to the garden, which is already showing this layout: the 3D follows the tab.
          Only on a phone, where the garden is a surface away; on a laptop it is beside the card
          and the stylesheet keeps this out of the way
        */}
        <Action testId={`action-layouts-see-${archetype}`} onClick={onSee}>
          See it in the garden
        </Action>
        {/* primary on every card: one card is on screen at a time and the reader chose it */}
        <Action
          testId={`action-onboarding-apply-${archetype}`}
          tone="primary"
          onClick={() => onApply(scenario)}
        >
          {baseline ? 'Start with no panels and plant it' : 'Use this layout and plant it'}
        </Action>
      </div>
    </div>
  )
}

const TAB_KEY: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowLeft: -1 }

export const ScenarioComparison = (): ReactElement | null => {
  const designs = useAppStore((s) => s.onboarding.designs)
  const unit = useLengthUnit()
  /**
   * Which layout is showing, by name, or null until the visitor picks one.
   *
   * One card at a time: the names are the tab row, so every layout is on screen at once and one
   * press away, and the 3D shows whichever one is open. The preview follows the tab, and "See it in
   * the garden" is the way to look
   */
  const [shownArchetype, setShownArchetype] = useState<CandidateArchetype | null>(null)
  const tabs = useRef(new Map<CandidateArchetype, HTMLButtonElement>())
  const answers = useAppStore((s) => s.answers)
  const applyDesign = useAppStore((s) => s.applyDesign)
  const previewScenario = useAppStore((s) => s.previewScenario)
  const applied = useAppStore((s) => s.onboarding.appliedArchetype)
  const setSurface = useAppStore((s) => s.setSurface)
  const massachusetts = useAppStore(
    (s) => s.site.status === 'ready' && usStateOf(s.site.value.botanicalArea) === 'MA',
  )

  const set = designs.status === 'ready' ? designs.value : null
  const cards = set === null ? [] : ordered(set.scenarios, set.recommendedArchetype)
  /**
   * Where the comparison opens: on the pick when the pick has panels, and otherwise on the best
   * layout that does. The search is allowed to rank the open sky first, and says so on that
   * card's tab and in the line under the tabs; what it must not do is answer ten questions
   * about a solar garden with a screen whose one green button plants no panels
   */
  const opensOn =
    cards.find(
      (scenario) =>
        scenario.candidate.archetype === set?.recommendedArchetype &&
        scenario.candidate.archetype !== CONTROL,
    ) ??
    cards.find((scenario) => scenario.candidate.archetype !== CONTROL) ??
    cards[0]
  // by name and then checked against the set: a search that came back without the layout that
  // was showing must not leave the step blank while an effect catches up
  const shown = cards.find((scenario) => scenario.candidate.archetype === shownArchetype) ?? opensOn
  const shownKey = shown?.candidate.archetype ?? null

  /**
   * The scene draws the layout that is open, and stops when the comparison goes away.
   *
   * Keyed on the name of the open card and on the set, so a new search re-previews its own pick
   * and a tab press swaps the geometry. The store clears the preview itself on apply, and the
   * cleanup here clears it on unmount, so leaving the step never strands a plot that was never
   * committed in the scene. The layout already applied is not previewed: the garden on screen IS
   * that layout, edits and light included, and a preview of it would blank the overlay for a
   * visitor who came back to this step to compare
   */
  useEffect(() => {
    previewScenario(set === null || shownKey === applied ? null : shownKey)
    return () => previewScenario(null)
  }, [set, shownKey, applied, previewScenario])

  if (set === null) {
    // idle is nothing, loading is the search press above saying so; what is left is a failure
    return designs.status === 'error' ? (
      <AsyncNotice state={designs} testId="status-onboarding-designs" idleLabel="" />
    ) : null
  }

  const recommended = cards.find(
    (scenario) => scenario.candidate.archetype === set.recommendedArchetype,
  )
  const preset = presetMatching(answers.objective)
  const presetLabel =
    OBJECTIVE_PRESETS.find((entry) => entry.id === preset)?.label ?? 'your own mix'

  const show = (archetype: CandidateArchetype): void => {
    setShownArchetype(archetype)
    tabs.current.get(archetype)?.focus()
  }

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const move = TAB_KEY[event.key]
    const target =
      move !== undefined
        ? (index + move + cards.length) % cards.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? cards.length - 1
            : null
    if (target === null) return
    event.preventDefault()
    const next = cards[target]
    if (next !== undefined) show(next.candidate.archetype)
  }

  return (
    <div className="scenarios" data-testid="list-onboarding-scenarios">
      {/*
        Every layout, by name, in one row. The names are what a reader compares first, and a row
        of them says how many there are and which one is the pick before any card is read
      */}
      {cards.length > 1 ? (
        <div
          className="scenario-tabs"
          role="tablist"
          aria-label="Layouts to compare"
          data-testid="list-onboarding-layout-tabs"
          data-total={cards.length}
        >
          {cards.map((scenario, index) => {
            const archetype = scenario.candidate.archetype
            const selected = archetype === shownKey
            const isRecommended = archetype === set.recommendedArchetype
            return (
              <button
                key={archetype}
                type="button"
                role="tab"
                id={`onboarding-layout-tab-${archetype}`}
                className="scenario-tab"
                aria-selected={selected}
                aria-controls={`onboarding-scenario-${archetype}`}
                tabIndex={selected ? 0 : -1}
                data-testid={`action-onboarding-show-${archetype}`}
                data-archetype={archetype}
                data-recommended={String(isRecommended)}
                data-baseline={String(archetype === CONTROL)}
                ref={(node) => {
                  if (node) tabs.current.set(archetype, node)
                  else tabs.current.delete(archetype)
                }}
                onClick={() => show(archetype)}
                onKeyDown={(event) => onTabKey(event, index)}
              >
                <span className="scenario-tab-name">{scenario.candidate.label}</span>
                {isRecommended ? <span className="scenario-tab-note">Suggested</span> : null}
                {archetype === CONTROL ? (
                  <span className="scenario-tab-note">For comparison</span>
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}
      {/*
        A note, and short: the full sentence is in the fold below. Two amber boxes here would take
        about 160px before the first card on a phone and read as an error report
      */}
      <p className="notice notice-ready" data-testid="status-onboarding-quality">
        Confidence no higher than moderate
      </p>
      {/* said on the face when it is the answer a grower came for: a grower weighing
          whether panels are worth it could click through all five tabs before finding that the
          search's own pick for their plot was no panels at all */}
      {recommended?.candidate.archetype === CONTROL && shown?.candidate.archetype !== CONTROL ? (
        <p className="notice notice-warn" data-testid="readout-onboarding-pick-is-open-sky">
          For this space and what you asked of it, the search suggests no panels at all. The layout
          below is the best one that has panels, so you can see what they would cost. The "No panels
          at all" tab is the pick.
        </p>
      ) : null}
      {shown === undefined ? null : (
        <ScenarioCard
          key={shown.candidate.archetype}
          scenario={shown}
          recommended={shown.candidate.archetype === set.recommendedArchetype}
          experience={answers.experience}
          unit={unit}
          massachusetts={massachusetts}
          beaten={beatenSentence(
            beatenBy(shown, set.scenarios),
            shown.candidate.archetype === set.recommendedArchetype,
          )}
          onApply={(chosen) => void applyDesign(chosen)}
          onSee={() => setSurface('garden')}
        />
      )}
      {/* the reading behind the comparison, one press away: why the pick is marked, what the
          caveats say in full, and what the search never tried */}
      <details className="wizard-advanced" data-testid="details-onboarding-explainer">
        <summary>How to read these</summary>
        <p className="panel-sub" data-testid="readout-onboarding-why">
          You asked for {presetLabel.toLowerCase()} in {set.plotAreaM2.toFixed(1)} m².{' '}
          {recommended === undefined
            ? 'Nothing that came back matched those answers, so nothing is marked as suggested'
            : `${recommended.candidate.label} is marked because ${recommended.candidate.rationale}`}
          {recommended?.candidate.archetype === CONTROL && shown?.candidate.archetype !== CONTROL
            ? `. It's the space with no panels, so the layout showing is the best one that has some. The comparison is one press away.`
            : ''}
        </p>
        <p className="panel-sub" data-testid="readout-onboarding-baseline-help">
          The row above names every layout the search tried. "No panels at all" is this space with
          nothing on it, and every other layout shows what its panels would cost you against that
          one. Press a name to read its card, any of them can be used.
        </p>
        <p className="panel-sub" data-testid="readout-onboarding-apply-help">
          Using one of these writes the outline you measured, the panels, beds placed where that
          option's own light falls, and a first planting in each bed, replacing the plot that's
          there now. It says what it put where, and one button puts it all back. Everything stays
          editable afterwards.
        </p>
        <p className="panel-sub" data-testid="readout-onboarding-confidence-ceiling">
          {CONFIDENCE_CEILING}
        </p>
        <h4 className="scenario-title">What this left out</h4>
        <ul className="scenario-flags" data-testid="list-onboarding-not-considered">
          {set.notConsidered.map((entry, index) => (
            <li key={entry} data-testid={`item-onboarding-not-considered-${String(index)}`}>
              {entry}
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
