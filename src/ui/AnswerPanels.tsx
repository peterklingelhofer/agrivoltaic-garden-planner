import type { ReactElement } from 'react'
import { WCVP_SCOPE_NOTE } from '../data/static-layers'
import type { DesignProgress } from '../recommend/design'
import { useAppStore } from '../state/store'
import { meters } from '../types/units'
import { ChoiceGroup, NumberField, Toggle } from './controls'
import { NATIVE_PREFERENCE_REACH, POLLINATOR_TRAIT_BASIS } from './format'
import { regionNote } from './region'
import {
  ANSWER_QUESTIONS,
  EXPERIENCE_OPTIONS,
  EXPOSURE_HELP,
  EXPOSURE_OPTIONS,
  feetToMeters,
  metersToFeet,
  MOUNTING_OPTIONS,
  roundTenth,
} from './onboarding'

/**
 * The questions, one component each, as the sidebar steps ask them.
 *
 * The ground step asks what stands around the space and whether it can be watered, the panels step
 * asks how the panels may sit, and the plants step carries the two wildlife switches, where their
 * effect is visible. What to grow and what the space is for are asked in `WantsPanel`
 */

const DEFAULT_HEIGHT_LIMIT_M = 3

const percent = (value: number): string => `${String(Math.round(value * 100))}%`

export const SurroundingsStep = (): ReactElement => {
  const exposure = useAppStore((s) => s.answers.exposure)
  const answer = useAppStore((s) => s.answerOnboarding)
  return (
    <>
      <ChoiceGroup
        testId="control-onboarding-exposure"
        name="onboarding-exposure"
        legend={ANSWER_QUESTIONS.exposure}
        options={EXPOSURE_OPTIONS}
        value={exposure}
        onChange={(next) => answer({ exposure: next })}
      />
      <p className="panel-sub" data-testid="readout-onboarding-exposure-help">
        {EXPOSURE_HELP}
      </p>
    </>
  )
}

/**
 * The two wildlife questions, one switch each and nothing else, asked apart because they're two
 * questions. Whether a plant belongs to the place and whether it works with the insects there
 * sound like one preference and are answered from two different sources, so a single switch
 * would have had to average two answers into a claim neither of them makes.
 *
 * Everything under each switch is a limit on what the answer can do, and none of it is behind a
 * disclosure: the rule beside `showsFigures` is that the only thing hidden is detail
 */
export const NativesStep = (): ReactElement => {
  const favorNative = useAppStore((s) => s.wildlife.favorNative)
  const setWildlife = useAppStore((s) => s.setWildlife)
  const site = useAppStore((s) => s.site)
  const region = regionNote(site)
  return (
    <>
      <Toggle
        testId="control-onboarding-natives"
        label="Favor plants native to my area"
        checked={favorNative}
        onChange={(checked) => setWildlife({ favorNative: checked })}
      />
      {/*
        How far saying yes reaches, one press behind the switch it describes. What folds is the
        only part of it that is detail. What does NOT fold is below: a caveat about the data is
        never detail, which is this project's rule and the reason the disclosure stops where it does
      */}
      <details className="wizard-advanced" data-testid="panel-onboarding-natives-reach">
        <summary data-testid="action-onboarding-natives-reach">What saying yes does</summary>
        <p className="panel-sub" data-testid="readout-onboarding-natives-reach">
          {NATIVE_PREFERENCE_REACH}
        </p>
      </details>
      {/* the honest state of the answer, not a warning about the switch: with no region there is
          nothing to be native TO, and a preference that quietly does nothing is indistinguishable
          from one that worked. Shown whichever way the switch is set, because it's as true
          before it's pressed as after */}
      {region === null ? null : (
        <p className="notice notice-warn" data-testid="status-onboarding-natives-region">
          {region}
        </p>
      )}
      <p className="panel-sub" data-testid="readout-onboarding-natives-scope">
        {WCVP_SCOPE_NOTE}
      </p>
    </>
  )
}

export const PollinatorsStep = (): ReactElement => {
  const favorPollinators = useAppStore((s) => s.wildlife.favorPollinators)
  const setWildlife = useAppStore((s) => s.setWildlife)
  return (
    <>
      <Toggle
        testId="control-onboarding-pollinators"
        label="Favor plants that feed bees and other pollinators"
        checked={favorPollinators}
        onChange={(checked) => setWildlife({ favorPollinators: checked })}
      />
      {/* the same fold as the step before it, and for the same reason: this explains what saying
          yes does, which is detail, while the basis below it is a caveat and stays out */}
      <details className="wizard-advanced" data-testid="panel-onboarding-pollinators-help">
        <summary data-testid="action-onboarding-pollinators-help">
          What a plant offers, and what a crop needs
        </summary>
        <p className="panel-sub" data-testid="readout-onboarding-pollinators-help">
          A plant OFFERS the nectar and pollen its flowers put out, and that is what moves it up the
          list. A crop NEEDS an insect when its own harvest depends on a visit. A courgette sets
          almost nothing without one; a lettuce is picked long before it flowers. Both are said
          beside every crop in the ranking, in their own words.
        </p>
      </details>
      <p className="panel-sub" data-testid="readout-onboarding-pollinators-basis">
        {POLLINATOR_TRAIT_BASIS}
      </p>
    </>
  )
}

export const MountingStep = (): ReactElement => {
  const mounting = useAppStore((s) => s.answers.mounting)
  const answer = useAppStore((s) => s.answerOnboarding)
  return (
    <ChoiceGroup
      testId="control-onboarding-mounting"
      name="onboarding-mounting"
      legend={ANSWER_QUESTIONS.mounting}
      options={MOUNTING_OPTIONS}
      value={mounting}
      onChange={(next) => answer({ mounting: next })}
    />
  )
}

export const HeightStep = (): ReactElement => {
  const limit = useAppStore((s) => s.answers.maxHeightM)
  const answer = useAppStore((s) => s.answerOnboarding)
  return (
    <>
      <Toggle
        testId="control-onboarding-height-limit"
        label={ANSWER_QUESTIONS.maxHeightM}
        checked={limit !== null}
        onChange={(checked) =>
          answer({ maxHeightM: checked ? meters(DEFAULT_HEIGHT_LIMIT_M) : null })
        }
      />
      {limit === null ? null : (
        <div className="row">
          <NumberField
            testId="control-onboarding-max-height-m"
            label="Tallest it may be"
            unit="m"
            min={0.5}
            step={0.1}
            value={roundTenth(limit)}
            onChange={(value) => answer({ maxHeightM: meters(Math.max(0.5, value)) })}
          />
          <NumberField
            testId="control-onboarding-max-height-ft"
            label="Tallest it may be"
            unit="ft"
            min={2}
            step={0.5}
            value={roundTenth(metersToFeet(limit))}
            onChange={(value) => answer({ maxHeightM: meters(Math.max(0.5, feetToMeters(value))) })}
          />
        </div>
      )}
    </>
  )
}

export const WaterStep = (): ReactElement => {
  const irrigationAvailable = useAppStore((s) => s.answers.irrigationAvailable)
  const answer = useAppStore((s) => s.answerOnboarding)
  return (
    <>
      <Toggle
        testId="control-onboarding-irrigation"
        label={ANSWER_QUESTIONS.irrigationAvailable}
        checked={irrigationAvailable}
        onChange={(checked) => answer({ irrigationAvailable: checked })}
      />
      <p className="panel-sub" data-testid="readout-onboarding-water-help">
        Answering no moves the layout toward more shade, which keeps the ground damp when nobody is
        watering it.
      </p>
    </>
  )
}

/**
 * How far the design search has got, on the scale the whole run is measured in.
 *
 * Candidates first and the bake inside them, which is what `DesignProgress` is shaped for: a bar
 * drawn off the bake alone would run to full and reset five times, and five stalls isn't what a
 * run of five bakes looks like from the outside. Guarded rather than trusted, because a bar that
 * ran past its own end or went backward would be worse than no bar
 */
const searchFraction = (progress: DesignProgress): number => {
  const total = progress.candidatesTotal
  if (!(total > 0)) return 0
  const bake = progress.bake
  const within = bake !== null && bake.passesTotal > 0 ? bake.passesDone / bake.passesTotal : 0
  return Math.min(1, Math.max(0, (progress.candidatesDone + within) / total))
}

const searchBake = (progress: DesignProgress): number => {
  const bake = progress.bake
  return bake !== null && bake.passesTotal > 0 ? bake.passesDone / bake.passesTotal : 0
}

/**
 * The wait made legible. `ScenarioComparison` already says in words that this is seconds of real
 * work rather than an instant; what it couldn't say was how many seconds are left, so a visitor
 * had no way to tell a long run from a hung one. Nothing here names an archetype: the search
 * order is the engine's business, and "option 3 of 5" is the part of it that is the visitor's
 */
export const SearchProgress = (): ReactElement | null => {
  const progress = useAppStore((s) => s.onboarding.progress)
  if (progress === null) return null
  const done = searchFraction(progress)
  const at = Math.min(progress.candidatesDone + 1, progress.candidatesTotal)
  const position = `Option ${String(at)} of ${String(progress.candidatesTotal)}`
  return (
    <div
      className="search-progress"
      data-testid="status-onboarding-progress"
      data-done={done.toFixed(3)}
    >
      <div
        className="search-progress-track"
        role="progressbar"
        aria-label="Computing the layouts"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(done * 100)}
        aria-valuetext={position}
      >
        <span className="search-progress-fill" style={{ width: percent(done) }} />
      </div>
      {/* polite rather than assertive: this changes several times a second and must never
          interrupt whatever is being read out about the question itself */}
      <p className="panel-sub" aria-live="polite" data-testid="readout-onboarding-progress">
        {position}
        {progress.bake === null
          ? ', being computed'
          : `, running its year of weather: ${percent(searchBake(progress))} done`}
      </p>
    </div>
  )
}

/**
 * How much the answers show, asked where it's answered. It writes the same `experience` every
 * consumer of `showsFigures` reads, and it sits above the comparison cards, where pressing it
 * does something under the pointer right away
 */
export const DetailSwitch = (): ReactElement => {
  const experience = useAppStore((s) => s.answers.experience)
  const answer = useAppStore((s) => s.answerOnboarding)
  return (
    <ChoiceGroup
      testId="control-onboarding-experience"
      name="onboarding-experience"
      legend="How much detail do you want?"
      options={EXPERIENCE_OPTIONS}
      value={experience}
      onChange={(next) => answer({ experience: next })}
    />
  )
}
