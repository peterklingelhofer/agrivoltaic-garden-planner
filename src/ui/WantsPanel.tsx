import { useMemo, type ReactElement } from 'react'
import {
  normaliseObjective,
  OBJECTIVE_KEYS,
  OBJECTIVE_PRESETS,
  presetMatching,
  withObjectiveWeight,
  type ObjectivePresetId,
} from '../state/onboarding'
import { useAppStore } from '../state/store'
import { ChoiceGroup, SliderField } from './controls'
import { AMBITION_OPTIONS, ANSWER_QUESTIONS, OBJECTIVE_LABELS } from './onboarding'
import { type OptionRowInputs, panelRowsFor, rowsSentence } from './option-rows'
import { Panel, Readout } from './Panel'

/**
 * What the grower wants from the space: what to grow, and whether the sunlight goes mostly to
 * the plants or mostly to the panels. Two questions and nothing else, because both are read by
 * the layout search on the step after this one and neither needs anything computed first.
 * The wildlife switches are on the plants step, where what they change is on screen
 */

const percent = (value: number): string => `${String(Math.round(value * 100))}%`

/** Everything a row figure is computed from, read off the store field by field */
const useOptionRowInputs = (): OptionRowInputs => {
  const answers = useAppStore((s) => s.answers)
  const plot = useAppStore((s) => s.plot)
  const site = useAppStore((s) => (s.site.status === 'ready' ? s.site.value : null))
  const location = useAppStore((s) => s.location)
  const locationLabel = useAppStore((s) => s.locationLabel)
  return useMemo(
    () => ({ answers, plot, site, location, locationLabel }),
    [answers, plot, site, location, locationLabel],
  )
}

/** The option's own help line, then what it does to the panels: "..., and room for 3 rows" */
const withRows = (help: string | undefined, rows: number | null): string | undefined => {
  const sentence = rowsSentence(rows)
  if (sentence === null) return help
  return help === undefined ? sentence : `${help}. ${sentence}`
}

/**
 * Said under the choice. Never as four figures beside it: four numbers up front make it unclear
 * which are the choice and which are the app's default, and with two of the four behind a fold,
 * as much as thirty percent of the shares is nowhere on the face. So the face carries the choice
 * and one sentence about what it does, and the four shares appear together, sliders and
 * readouts, only when the fold is opened
 */
const OBJECTIVE_HELP =
  'Mostly food gives the plants more of the sunlight, mostly electricity gives the panels more.'

export const GrowingStep = (): ReactElement => {
  const ambition = useAppStore((s) => s.answers.ambition)
  const answer = useAppStore((s) => s.answerOnboarding)
  const inputs = useOptionRowInputs()
  const options = useMemo(
    () =>
      AMBITION_OPTIONS.map((option) => ({
        ...option,
        help: withRows(
          option.help,
          panelRowsFor({ field: 'ambition', value: option.value }, inputs),
        ),
      })),
    [inputs],
  )
  return (
    <ChoiceGroup
      testId="control-onboarding-ambition"
      name="onboarding-ambition"
      legend={ANSWER_QUESTIONS.ambition}
      options={options}
      value={ambition}
      onChange={(next) => answer({ ambition: next })}
    />
  )
}

export const ObjectiveStep = (): ReactElement => {
  const objective = useAppStore((s) => s.answers.objective)
  const answer = useAppStore((s) => s.answerOnboarding)
  const preset: ObjectivePresetId | '' = presetMatching(objective) ?? ''
  const presets = OBJECTIVE_PRESETS.map((entry) => ({
    value: entry.id as ObjectivePresetId | '',
    label: entry.label,
    help: entry.help,
  }))
  // the shares the search reads, which is what the four dials come to between them
  const shares = normaliseObjective(objective)
  return (
    <>
      <ChoiceGroup
        testId="control-onboarding-objective"
        name="onboarding-objective"
        legend="What you want most from this space"
        options={presets}
        value={preset}
        onChange={(next) => {
          const chosen = OBJECTIVE_PRESETS.find((entry) => entry.id === next)
          if (chosen) answer({ objective: chosen.weights })
        }}
      />
      <p className="panel-sub" data-testid="readout-onboarding-objective-help">
        {OBJECTIVE_HELP}
      </p>
      {/* the one thing the face says about the split: that none of the three cards is it */}
      {preset === '' ? (
        <p className="panel-sub" data-testid="readout-onboarding-objective-custom">
          A mix of your own, set below
        </p>
      ) : null}
      <details className="wizard-advanced" data-testid="panel-onboarding-weights">
        <summary>Set the mix yourself</summary>
        <p className="panel-sub" data-testid="readout-onboarding-objective-heading">
          {preset === ''
            ? 'How your own mix splits what the layout search weighs:'
            : 'How the choice above splits what the layout search weighs:'}
        </p>
        <div className="readouts" data-testid="readout-onboarding-objective">
          {OBJECTIVE_KEYS.map((key) => (
            <Readout
              key={key}
              id={`onboarding-weight-${key}`}
              label={OBJECTIVE_LABELS[key] ?? key}
              value={percent(shares[key])}
            />
          ))}
        </div>
        {/*
          Four independent dials. If the four were coupled to sum to 100%, pushing "using less
          water" to the top would drop electricity to nothing, as if saving water meant no panels.
          Each says how much that one thing matters, and the shares above are what the search makes
          of the four together
        */}
        <p className="panel-sub">
          Each slider says how much that one thing matters to you. The search weighs the four
          against each other, so the shares above always add up to 100%.
        </p>
        {OBJECTIVE_KEYS.map((key) => (
          <SliderField
            key={key}
            testId={`control-onboarding-weight-${key}`}
            label={OBJECTIVE_LABELS[key] ?? key}
            display={`${String(Math.round(objective[key] * 10))} of 10`}
            value={objective[key]}
            min={0}
            max={1}
            step={0.1}
            onChange={(value) => answer({ objective: withObjectiveWeight(objective, key, value) })}
          />
        ))}
      </details>
    </>
  )
}

export const WantsPanel = (): ReactElement => (
  <Panel id="wants" title="What do you want from it?" titleVisible={false}>
    <GrowingStep />
    <ObjectiveStep />
  </Panel>
)
