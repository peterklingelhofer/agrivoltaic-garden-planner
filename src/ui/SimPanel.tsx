import type { ReactElement } from 'react'
import { lightIsMissing, lightIsStale } from '../state/light-freshness'
import { useAppStore } from '../state/store'
import type { BackendKind } from '../sim/backend'
import { FINAL_OPTIONS } from '../sim/pipeline'
import { Action, SelectField } from './controls'
import { Panel, Readout } from './Panel'

const BACKENDS: readonly (readonly [BackendKind, string])[] = [
  ['webgl2-shadowmap', 'WebGL2 shadow maps (baseline)'],
  ['webgpu-raycast', 'WebGPU compute ray cast'],
  ['cpu-reference', 'CPU reference'],
]

/**
 * Sky subdivision, substeps and frame budget used to be controls here, each writing to
 * `options` in state through `setOptions`. None of it reached a bake: `runFinal` calls `runBake`
 * with `FINAL_OPTIONS` from `sim/pipeline.ts`, splicing in only `backend` from state, and
 * `runBake` overwrites `options` with that fixed object wholesale. A visitor who moved one of
 * these three sliders was reading a promise the next bake did not keep, which is worse than not
 * offering the choice, so the choice is gone and this sentence, built off the constant every bake
 * actually uses, stands in its place instead.
 *
 * There were two buttons here until 2026-09-09, a quick check and a full one. The quick one is
 * gone. It saved about 540 ms on a real GPU (260 against 799, `the port document` section 5) and
 * cost a different answer: `src/recommend/design.ts` measures the crop share moving by 0.0702 at
 * Bergen between preview and final settings, which is a whole crop appearing or vanishing from a
 * plan. The preview settings stay and are still what the layout search and `useAutoLight` use;
 * what is gone is asking a grower to choose between two answers when only one of them is the one
 * to trust.
 *
 * Since 2026-09-10 `useAutoLight` runs that full check by itself, the first time as well as after
 * every change, so the press below is for a run that failed or an automatic run switched off. The
 * first light on a new garden is a full bake, which is about three times the quick one's work,
 * and the e2e functional job measured that as 15.2 minutes becoming 20.6
 */
const QUALITY_SENTENCE = `The light is read in squares of about ${FINAL_OPTIONS.targetCellSizeM.toFixed(2)} m across the ground, following the sun's path through each day of the year. It runs by itself once the place is looked up, and again whenever the garden changes.`

const SUN_DIRECTION_HELP =
  'A sun direction is one position the sun holds in your sky. The run traces the shadows from each position in turn, then adds the year up from the results. The count says how finely the year was sampled. It says nothing about how long anything was lit.'

/**
 * The unit, defined once on the face in a teacher's words. Every per-bed figure under it is a
 * DLI, and a class that has never met the term needs the bucket and the two landmarks before
 * the numbers mean anything; the fuller gloss stays on the overlay's channel tip
 */
const DLI_SENTENCE =
  'DLI counts the light that lands on a square metre in one day; a woodland floor is about 5, an open field in midsummer about 40.'

export const SimPanel = (): ReactElement => {
  const raster = useAppStore((s) => s.raster)
  const stale = useAppStore(lightIsStale)
  const missing = useAppStore(lightIsMissing)
  // idle with everything in place and a stamp for this very arrangement: a run was cancelled
  // (or the automatic runs are off), and "once the place has been looked up" would be untrue
  const held = useAppStore(
    (s) =>
      s.raster.status === 'idle' &&
      s.site.status === 'ready' &&
      s.plot !== null &&
      s.plot.beds.length > 0 &&
      !lightIsMissing(s),
  )
  const autoRun = useAppStore((s) => s.autoRun)
  const progress = useAppStore((s) => s.progress)
  const options = useAppStore((s) => s.options)
  const setOptions = useAppStore((s) => s.setOptions)
  const runFinal = useAppStore((s) => s.runFinal)
  const cancel = useAppStore((s) => s.cancel)

  const percent = progress
    ? Math.round((progress.passesDone / Math.max(1, progress.passesTotal)) * 100)
    : 0

  /**
   * The press, only where the light will not come by itself: after a failed run, with the
   * automatic runs switched off, or after a cancel, which stamps the arrangement as answered so
   * that `useAutoLight` leaves it alone. While a run is coming or is on screen and fresh, the
   * status row is the whole story and a button beside it would be a second way to the same run
   */
  const offersRun =
    raster.status !== 'loading' &&
    (raster.status === 'error' || !autoRun || (raster.status === 'idle' && !missing))

  return (
    <Panel
      id="simulation"
      title="Light simulation"
      actions={
        <>
          {offersRun ? (
            <Action testId="action-sim-final" tone="primary" onClick={() => void runFinal()}>
              Run the light check now
            </Action>
          ) : null}
          {raster.status === 'loading' ? (
            <Action testId="action-sim-cancel" onClick={cancel}>
              Cancel
            </Action>
          ) : null}
        </>
      }
    >
      <div
        className={`notice notice-${stale ? 'warn' : raster.status}`}
        data-testid="status-simulation"
        data-sim-state={raster.status}
        // read by the editor's own tests and by anything that has to tell "no answer yet" from
        // "an answer about a garden you have since changed", which are different states
        data-sim-stale={stale ? 'true' : undefined}
      >
        {raster.status === 'error'
          ? raster.message
          : raster.status === 'loading'
            ? `Computing the light, ${percent}%`
            : raster.status === 'ready'
              ? stale
                ? autoRun
                  ? 'The light is ready, for the layout before your last change. It is being computed again for the garden as it stands'
                  : 'The light is ready, for the layout before your last change. Run it again to bring the light, the crop ranking and the compliance checks back onto the garden as it stands'
                : 'The light is ready'
              : missing
                ? 'The light is about to be computed'
                : held
                  ? 'The light is not computed for this arrangement. Run the check now, or change the panels or the beds and it runs by itself'
                  : 'The light will be computed once the place has been looked up and there is a bed'}
      </div>
      {raster.status === 'loading' ? (
        <progress data-testid="readout-sim-progress" value={percent} max={100} />
      ) : null}
      <p className="panel-sub" data-testid="readout-sim-dli">
        {DLI_SENTENCE}
      </p>
      {/*
        The machinery, behind one press. Which backend traced the shadows, how big a square of
        ground is, how many sun positions were used and how the run is triggered are all answers
        about the run rather than about the garden, and this step was measured at reading grade 12
        with them in the open. The status row and the unit's definition are what a grower needs
        from this panel
      */}
      <details className="wizard-advanced" data-testid="details-sim-how">
        <summary data-testid="action-sim-how">How the light was computed</summary>
        <p className="readout-note" data-testid="readout-sim-quality">
          {QUALITY_SENTENCE}
        </p>
        <SelectField
          testId="control-sim-backend"
          label="Computed by"
          value={options.backend}
          options={BACKENDS}
          onChange={(backend) => setOptions({ backend })}
        />
        <div className="readouts">
          <Readout
            id="sim-cell-size"
            label="Size of one square of ground"
            value={`${options.targetCellSizeM.toFixed(2)} m`}
          />
          <Readout
            id="sim-passes"
            label="Sun positions done"
            value={progress ? `${progress.passesDone} / ${progress.passesTotal}` : 'idle'}
          />
          {/* own id rather than "sim-quality", now that the sentence above claims that testid
              for the plain-language explanation of what quick and full check mean */}
          <Readout
            id="sim-raster-quality"
            label="Detail of the last light run"
            value={
              raster.status === 'ready'
                ? `${raster.value.quality.subdivision}, ${raster.value.quality.sunDirectionCount} sun directions`
                : 'n/a'
            }
          />
        </div>
        {/* only once there is a raster, because until then the readout says n/a and there is no
            count on screen for this to be explaining */}
        {raster.status === 'ready' ? (
          <p className="readout-note" data-testid="readout-sim-sun-directions-help">
            {SUN_DIRECTION_HELP}
          </p>
        ) : null}
      </details>
    </Panel>
  )
}
