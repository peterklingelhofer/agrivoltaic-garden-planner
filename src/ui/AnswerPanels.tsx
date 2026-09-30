import type { ReactElement } from 'react'
import type { DesignProgress } from '../recommend/design'
import { useAppStore } from '../state/store'
import { meters } from '../types/units'
import { ChoiceGroup, NumberField, Toggle } from './controls'
import { lengthStep, showLength, showLimit, toMeters, useLengthUnit } from './length-units'
import {
  ANSWER_QUESTIONS,
  EXPERIENCE_OPTIONS,
  EXPOSURE_HELP,
  EXPOSURE_OPTIONS,
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
const MIN_HEIGHT_LIMIT_M = 0.5

const percent = (value: number): string => `${String(Math.round(value * 100))}%`

export const SurroundingsStep = (): ReactElement => {
  const exposure = useAppStore((s) => s.answers.exposure)
  const answer = useAppStore((s) => s.answerOnboarding)
  // a drawn house or tree answers this question itself (Decision Record 26), so the three answers
  // are grayed out because a geometry already says the same thing
  const houses = useAppStore((s) => s.plot?.obstructions.length ?? 0)
  return (
    <>
      <ChoiceGroup
        testId="control-onboarding-exposure"
        name="onboarding-exposure"
        legend={ANSWER_QUESTIONS.exposure}
        options={EXPOSURE_OPTIONS}
        value={exposure}
        disabled={houses > 0}
        onChange={(next) => answer({ exposure: next })}
      />
      {houses > 0 ? (
        <p className="panel-sub" data-testid="readout-onboarding-exposure-house">
          These answers aren't used while a house or a tree is drawn. The light check shades with
          what you drew.
        </p>
      ) : (
        <p className="panel-sub" data-testid="readout-onboarding-exposure-help">
          {EXPOSURE_HELP}
        </p>
      )}
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
  const unit = useLengthUnit()
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
        <NumberField
          testId={
            unit === 'm' ? 'control-onboarding-max-height-m' : 'control-onboarding-max-height-ft'
          }
          label="Tallest it may be"
          unit={unit}
          min={showLimit(MIN_HEIGHT_LIMIT_M, unit)}
          step={lengthStep(unit, 0.1)}
          value={showLength(limit, unit, roundTenth)}
          onChange={(value) =>
            answer({ maxHeightM: meters(Math.max(MIN_HEIGHT_LIMIT_M, toMeters(value, unit))) })
          }
        />
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
 * run of five bakes looks like from the outside. Clamped, because a bar that ran past its own
 * end or went backward would be worse than no bar
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
 * work. What it can't say is how many seconds are left, and without that a visitor has no way to
 * tell a long run from a hung one. Nothing here names an archetype: the search order is the
 * engine's business, and "option 3 of 5" is the part of it that is the visitor's
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
      {/* set to polite: this changes several times a second and must never
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
