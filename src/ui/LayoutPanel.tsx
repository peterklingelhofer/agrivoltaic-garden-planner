import type { ReactElement } from 'react'
import { useAppStore } from '../state/store'
import { meters } from '../types/units'
import { DetailSwitch, HeightStep, MountingStep, SearchProgress } from './AnswerPanels'
import { ArrayPanel } from './ArrayPanel'
import { Action, SelectField, SliderField } from './controls'
import { EnergyPanel } from './EnergyPanel'
import { roundTenth } from './onboarding'
import { Panel } from './Panel'
import { ScenarioComparison } from './ScenarioComparison'

/**
 * Where the solar panels go: the search first, because the layouts it computes are the answer
 * most visitors came for, then the comparison it lands, then the answers that steer it and the
 * hand editor behind a fold each.
 *
 * While the search runs the press itself says so and is the progress bar's caption, with one text
 * press to stop it
 */
/**
 * The two dials a lesson is built on, on the face of the step. The one path to
 * "change something about the panels and watch the light change" used to run through the
 * by-hand fold, among tilt, azimuth, bifaciality and "single-node chain": a teacher can drive
 * that panel and a class can't. These write the same array the fold edits, through the same
 * action, so the light re-runs by itself and the per-bed figures move with it
 */
const MovePanels = (): ReactElement | null => {
  const array = useAppStore((s) => s.plot?.arrays[0] ?? null)
  const upsertArray = useAppStore((s) => s.upsertArray)
  if (array === null) return null
  const geometry = array.geometry
  return (
    <div className="move-panels" data-testid="panel-move-panels">
      <h3>Move the panels and watch the light</h3>
      <SliderField
        testId="control-panels-headroom"
        label="How high the panels sit"
        min={0.5}
        max={4.5}
        step={0.1}
        value={geometry.clearanceHeightM}
        display={`${roundTenth(geometry.clearanceHeightM).toFixed(1)} m`}
        onChange={(value) =>
          upsertArray({ ...array, geometry: { ...geometry, clearanceHeightM: meters(value) } })
        }
      />
      <SliderField
        testId="control-panels-spacing"
        label="Space between the rows"
        min={2}
        max={16}
        step={0.5}
        value={geometry.pitchM}
        display={`${roundTenth(geometry.pitchM).toFixed(1)} m`}
        onChange={(value) =>
          upsertArray({ ...array, geometry: { ...geometry, pitchM: meters(value) } })
        }
      />
    </div>
  )
}

/** As many as fit, or a household's handful: the plot fits twelve and a gardener wants four */
const BED_CAP_OPTIONS: readonly (readonly [string, string])[] = [
  ['', 'As many as fit'],
  ['2', '2'],
  ['3', '3'],
  ['4', '4'],
  ['6', '6'],
  ['8', '8'],
]

const BedCap = (): ReactElement => {
  const maxBeds = useAppStore((s) => s.answers.maxBeds)
  const answer = useAppStore((s) => s.answerOnboarding)
  return (
    <SelectField
      testId="control-layout-max-beds"
      label="How many beds"
      value={maxBeds === null ? '' : String(maxBeds)}
      options={BED_CAP_OPTIONS}
      onChange={(value) => answer({ maxBeds: value === '' ? null : Number(value) })}
    />
  )
}

export const LayoutPanel = (): ReactElement => {
  const designs = useAppStore((s) => s.onboarding.designs)
  const suggestDesigns = useAppStore((s) => s.suggestDesigns)
  const cancelDesigns = useAppStore((s) => s.cancelDesignSuggestions)
  const searching = designs.status === 'loading'
  const found = designs.status === 'ready'
  return (
    <Panel
      id="layout"
      title="Where should the panels go?"
      titleVisible={false}
      subtitle="Try a few panel layouts on this plot, against a year of local weather, and see what each one costs the beds in light"
    >
      {/* filled until there are layouts to look at, plain once there are: the card's own apply
          press is the primary then, and a filled search above five cards would read as the
          thing still to press */}
      <Action
        testId="action-layouts-search"
        tone={found ? 'ghost' : 'primary'}
        block
        disabled={searching}
        onClick={() => void suggestDesigns()}
      >
        {searching ? 'Computing layouts...' : found ? 'Search again' : 'Show me some layouts'}
      </Action>
      {searching ? (
        <>
          <SearchProgress />
          <button
            type="button"
            className="link"
            data-testid="action-onboarding-cancel"
            onClick={cancelDesigns}
          >
            Stop
          </button>
        </>
      ) : null}
      {designs.status === 'ready' ? <DetailSwitch /> : null}
      <ScenarioComparison />
      <MovePanels />
      <details className="wizard-advanced" data-testid="details-panels-mounting">
        <summary>How the panels may sit</summary>
        <MountingStep />
        <HeightStep />
        {/* with the other answers the search reads, each of which drops a finished run when it
            changes. On the face it would push the search press off a 320px phone's screen.
            Changing it turns the press back into "Show me some layouts" */}
        <BedCap />
      </details>
      <details className="wizard-advanced" data-testid="details-panels-by-hand">
        <summary>Adjust the panels by hand</summary>
        <ArrayPanel />
        <EnergyPanel />
      </details>
    </Panel>
  )
}
